import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BankReconciliationService {
  constructor(private prisma: PrismaService) {}

  async findTransactions(params: {
    bank_account_id: number;
    date_from?: string;
    date_to?: string;
    match_status?: string;
    page?: number;
    limit?: number;
  }) {
    const { bank_account_id, date_from, date_to, match_status, page = 1, limit = 50 } = params;
    const where: Prisma.BankTransactionWhereInput = { bank_account_id };

    if (date_from || date_to) {
      where.date = {};
      if (date_from) where.date.gte = new Date(date_from);
      if (date_to) where.date.lte = new Date(date_to);
    }

    if (match_status) {
      where.match_status = match_status;
    }

    const [items, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    // Enrich matched transactions with their linked payment details
    const enriched = await Promise.all(
      items.map(async (tx) => {
        let matched_record: any = null;
        if (tx.match_status === 'matched' && tx.matched_id) {
          if (tx.matched_type === 'payment_in') {
            matched_record = await this.prisma.paymentIn.findUnique({
              where: { id: tx.matched_id },
              include: {
                project: { select: { id: true, project_name: true, project_no: true } },
                contract: { select: { id: true, contract_no: true, contract_name: true } },
                bank_account: { select: { id: true, bank_name: true, account_no: true } },
              },
            });
          } else if (tx.matched_type === 'payment_out') {
            matched_record = await this.prisma.paymentOut.findUnique({
              where: { id: tx.matched_id },
              include: {
                expense: {
                  select: {
                    id: true,
                    item: true,
                    supplier_name: true,
                    category: { select: { id: true, name: true } },
                  },
                },
                company: { select: { id: true, name: true } },
                bank_account: { select: { id: true, bank_name: true, account_no: true } },
              },
            });
          }
        }
        return { ...tx, matched_record };
      }),
    );

    return { items: enriched, total, page, limit };
  }

  async importTransactions(bankAccountId: number, rows: any[]) {
    const batchId = `import_${Date.now()}`;
    const results = { imported: 0, skipped: 0 };

    for (const row of rows) {
      const amount = new Prisma.Decimal(row.amount);
      const date = new Date(row.date);
      const description = row.description || '';
      const reference_no = row.reference_no || null;

      // Anti-duplicate check: same date, amount, description
      const existing = await this.prisma.bankTransaction.findFirst({
        where: {
          bank_account_id: bankAccountId,
          date,
          amount,
          description,
        },
      });

      if (existing) {
        results.skipped++;
        continue;
      }

      await this.prisma.bankTransaction.create({
        data: {
          bank_account_id: bankAccountId,
          date,
          description,
          amount,
          debit_credit: amount.greaterThanOrEqualTo(0) ? 'credit' : 'debit',
          balance: row.balance ? new Prisma.Decimal(row.balance) : null,
          reference_no,
          import_batch: batchId,
          match_status: 'unmatched',
        },
      });
      results.imported++;
    }

    // Auto-match after import
    if (results.imported > 0) {
      await this.autoMatch(bankAccountId, batchId);
    }

    return results;
  }

  async autoMatch(bankAccountId: number, batchId?: string) {
    const where: Prisma.BankTransactionWhereInput = {
      bank_account_id: bankAccountId,
      match_status: 'unmatched',
    };
    if (batchId) where.import_batch = batchId;

    const unmatched = await this.prisma.bankTransaction.findMany({ where });
    let matchedCount = 0;

    for (const tx of unmatched) {
      const txAmount = tx.amount.abs();
      const isCredit = tx.amount.greaterThanOrEqualTo(0);

      // Rule 1: Exact Reference No Match (限制同銀行帳戶)
      if (tx.reference_no) {
        if (isCredit) {
          const match = await this.prisma.paymentIn.findFirst({
            where: {
              reference_no: tx.reference_no,
              amount: txAmount,
              bank_account_id: bankAccountId,
            },
          });
          if (match) {
            await this.applyMatch(tx.id, 'payment_in', match.id);
            matchedCount++;
            continue;
          }
          const fallback = await this.prisma.paymentIn.findFirst({
            where: { reference_no: tx.reference_no, amount: txAmount },
          });
          if (fallback) {
            await this.applyMatch(tx.id, 'payment_in', fallback.id);
            matchedCount++;
            continue;
          }
        } else {
          const match = await this.prisma.paymentOut.findFirst({
            where: {
              reference_no: tx.reference_no,
              amount: txAmount,
              bank_account_id: bankAccountId,
            },
          });
          if (match) {
            await this.applyMatch(tx.id, 'payment_out', match.id);
            matchedCount++;
            continue;
          }
          const fallback = await this.prisma.paymentOut.findFirst({
            where: { reference_no: tx.reference_no, amount: txAmount },
          });
          if (fallback) {
            await this.applyMatch(tx.id, 'payment_out', fallback.id);
            matchedCount++;
            continue;
          }
        }
      }

      // Rule 2: Amount + Date Range (+/- 3 days)
      const dateFrom = new Date(tx.date);
      dateFrom.setDate(dateFrom.getDate() - 3);
      const dateTo = new Date(tx.date);
      dateTo.setDate(dateTo.getDate() + 3);

      if (isCredit) {
        let matches = await this.prisma.paymentIn.findMany({
          where: {
            amount: txAmount,
            date: { gte: dateFrom, lte: dateTo },
            bank_account_id: bankAccountId,
          },
        });
        if (matches.length === 1) {
          await this.applyMatch(tx.id, 'payment_in', matches[0].id);
          matchedCount++;
          continue;
        }
        if (matches.length === 0) {
          matches = await this.prisma.paymentIn.findMany({
            where: { amount: txAmount, date: { gte: dateFrom, lte: dateTo } },
          });
          if (matches.length === 1) {
            await this.applyMatch(tx.id, 'payment_in', matches[0].id);
            matchedCount++;
          }
        }
      } else {
        let matches = await this.prisma.paymentOut.findMany({
          where: {
            amount: txAmount,
            date: { gte: dateFrom, lte: dateTo },
            bank_account_id: bankAccountId,
          },
        });
        if (matches.length === 1) {
          await this.applyMatch(tx.id, 'payment_out', matches[0].id);
          matchedCount++;
          continue;
        }
        if (matches.length === 0) {
          matches = await this.prisma.paymentOut.findMany({
            where: { amount: txAmount, date: { gte: dateFrom, lte: dateTo } },
          });
          if (matches.length === 1) {
            await this.applyMatch(tx.id, 'payment_out', matches[0].id);
            matchedCount++;
          }
        }
      }
    }

    return { total_unmatched: unmatched.length, matched: matchedCount };
  }

  /** Run auto-match for all unmatched transactions of a bank account */
  async autoMatchAll(bankAccountId: number) {
    return this.autoMatch(bankAccountId);
  }

  async applyMatch(txId: number, type: 'payment_in' | 'payment_out', matchedId: number) {
    return this.prisma.bankTransaction.update({
      where: { id: txId },
      data: {
        match_status: 'matched',
        matched_type: type,
        matched_id: matchedId,
      },
    });
  }

  async unmatch(txId: number) {
    return this.prisma.bankTransaction.update({
      where: { id: txId },
      data: {
        match_status: 'unmatched',
        matched_type: null,
        matched_id: null,
      },
    });
  }

  async exclude(txId: number, remarks?: string) {
    return this.prisma.bankTransaction.update({
      where: { id: txId },
      data: {
        match_status: 'excluded',
        remarks: remarks || 'Excluded by user',
      },
    });
  }

  async getSummary(bankAccountId: number, dateFrom?: string, dateTo?: string) {
    const where: Prisma.BankTransactionWhereInput = { bank_account_id: bankAccountId };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const txs = await this.prisma.bankTransaction.findMany({ where });

    const summary = {
      total_count: txs.length,
      matched_count: txs.filter(t => t.match_status === 'matched').length,
      unmatched_count: txs.filter(t => t.match_status === 'unmatched').length,
      excluded_count: txs.filter(t => t.match_status === 'excluded').length,
      total_withdrawals: txs.filter(t => t.amount.lessThan(0)).reduce((sum, t) => sum.add(t.amount.abs()), new Prisma.Decimal(0)),
      total_deposits: txs.filter(t => t.amount.greaterThanOrEqualTo(0)).reduce((sum, t) => sum.add(t.amount), new Prisma.Decimal(0)),
      matched_amount: txs.filter(t => t.match_status === 'matched').reduce((sum, t) => sum.add(t.amount.abs()), new Prisma.Decimal(0)),
      unmatched_amount: txs.filter(t => t.match_status === 'unmatched').reduce((sum, t) => sum.add(t.amount.abs()), new Prisma.Decimal(0)),
    };

    return summary;
  }

  async findMatchCandidates(txId: number) {
    const tx = await this.prisma.bankTransaction.findUnique({ where: { id: txId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    const amount = tx.amount.abs();
    const isCredit = tx.amount.greaterThanOrEqualTo(0);
    const bankAccountId = tx.bank_account_id;

    const dateFrom = new Date(tx.date);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateTo = new Date(tx.date);
    dateTo.setDate(dateTo.getDate() + 30);

    if (isCredit) {
      return this.prisma.paymentIn.findMany({
        where: {
          date: { gte: dateFrom, lte: dateTo },
          amount: { gte: amount.mul(0.8), lte: amount.mul(1.2) },
          OR: [
            { bank_account_id: bankAccountId },
            { bank_account_id: null },
          ],
        },
        include: {
          project: { select: { id: true, project_name: true, project_no: true } },
          contract: { select: { id: true, contract_no: true, contract_name: true } },
          bank_account: { select: { id: true, bank_name: true, account_no: true } },
        },
        orderBy: [{ date: 'desc' }],
        take: 30,
      });
    } else {
      return this.prisma.paymentOut.findMany({
        where: {
          date: { gte: dateFrom, lte: dateTo },
          amount: { gte: amount.mul(0.8), lte: amount.mul(1.2) },
          OR: [
            { bank_account_id: bankAccountId },
            { bank_account_id: null },
          ],
        },
        include: {
          expense: {
            select: {
              id: true,
              item: true,
              supplier_name: true,
              category: { select: { id: true, name: true } },
            },
          },
          company: { select: { id: true, name: true } },
          bank_account: { select: { id: true, bank_name: true, account_no: true } },
        },
        orderBy: [{ date: 'desc' }],
        take: 30,
      });
    }
  }
}
