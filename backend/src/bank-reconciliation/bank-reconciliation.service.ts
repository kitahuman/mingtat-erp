import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BankReconciliationService {
  constructor(
    private prisma: PrismaService,
    private systemSettings: SystemSettingsService,
  ) {}

  async findTransactions(params: {
    bank_account_id: number;
    date_from?: string;
    date_to?: string;
    match_status?: string;
    page?: number;
    limit?: number;
    sort_order?: string;
  }) {
    const { bank_account_id, date_from, date_to, match_status, page = 1, limit = 50 } = params;
    const sortOrder: Prisma.SortOrder = params.sort_order === 'asc' ? 'asc' : 'desc';
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
        orderBy: [{ date: sortOrder }, { id: sortOrder }],
        skip: (page - 1) * limit,
        take: limit,
        include: { matches: true },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    // Enrich matched transactions with their linked payment details
    const enriched = await Promise.all(
      items.map(async (tx) => {
        let matched_record: any = null;
        let matched_records: any[] = [];

        if (tx.match_status === 'matched') {
          // Use junction table (supports both single and multi-match)
          if (tx.matches && tx.matches.length > 0) {
            for (const m of tx.matches) {
              let record: any = null;
              if (m.matched_type === 'payment_in') {
                record = await this.prisma.paymentIn.findUnique({
                  where: { id: m.matched_id },
                  include: {
                    project: { select: { id: true, project_name: true, project_no: true } },
                    contract: { select: { id: true, contract_no: true, contract_name: true } },
                    bank_account: { select: { id: true, bank_name: true, account_no: true } },
                  },
                });
              } else if (m.matched_type === 'payment_out') {
                record = await this.prisma.paymentOut.findUnique({
                  where: { id: m.matched_id },
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
              if (record) {
                matched_records.push({ ...record, _matched_type: m.matched_type });
              }
            }
            // For backward compat: set matched_record to first if single
            if (matched_records.length === 1) {
              matched_record = matched_records[0];
            }
          } else if (tx.matched_id) {
            // Fallback: legacy single match without junction table entry
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
            if (matched_record) {
              matched_records = [{ ...matched_record, _matched_type: tx.matched_type }];
            }
          }
        }
        return { ...tx, matched_record, matched_records };
      }),
    );

    return { items: enriched, total, page, limit };
  }

  // ── Single Transaction CRUD ──

  /** Create a manual transaction */
  async createTransaction(data: {
    bank_account_id: number;
    date: string;
    description: string;
    amount: number;
    reference_no?: string;
    balance?: number;
    bank_txn_remark?: string;
  }) {
    const amount = new Prisma.Decimal(data.amount);
    const tx = await this.prisma.bankTransaction.create({
      data: {
        bank_account_id: data.bank_account_id,
        date: new Date(data.date),
        description: data.description,
        amount,
        debit_credit: amount.greaterThanOrEqualTo(0) ? 'credit' : 'debit',
        balance: data.balance != null ? new Prisma.Decimal(data.balance) : null,
        reference_no: data.reference_no || null,
        bank_txn_source: 'manual',
        bank_txn_remark: data.bank_txn_remark || null,
        match_status: 'unmatched',
      },
    });
    await this.syncBalances(data.bank_account_id);
    return tx;
  }

  /** Update a transaction */
  async updateTransaction(
    id: number,
    data: {
      date?: string;
      description?: string;
      amount?: number;
      reference_no?: string;
      balance?: number;
      bank_txn_remark?: string;
    },
  ) {
    const tx = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException('交易記錄不存在');

    const updateData: any = {};
    if (data.date !== undefined) updateData.date = new Date(data.date);
    if (data.description !== undefined) updateData.description = data.description;
    if (data.amount !== undefined) {
      const amount = new Prisma.Decimal(data.amount);
      updateData.amount = amount;
      updateData.debit_credit = amount.greaterThanOrEqualTo(0) ? 'credit' : 'debit';
    }
    if (data.reference_no !== undefined) updateData.reference_no = data.reference_no || null;
    if (data.balance !== undefined) updateData.balance = data.balance != null ? new Prisma.Decimal(data.balance) : null;
    if (data.bank_txn_remark !== undefined) updateData.bank_txn_remark = data.bank_txn_remark || null;

    const updatedTx = await this.prisma.bankTransaction.update({
      where: { id },
      data: updateData,
    });

    // After updating an amount or date, we should ideally trigger a balance recalculation for all subsequent transactions.
    // However, since balances are often provided by the bank statement itself, we only auto-recalculate if the user
    // hasn't provided a specific balance, or we can implement a "sync balances" method.
    // For this requirement, we will implement a helper to update all subsequent balances in the database.
    if (data.amount !== undefined || data.date !== undefined) {
      await this.syncBalances(updatedTx.bank_account_id);
    }

    return updatedTx;
  }

  /**
   * Recalculate and sync all balances for a bank account based on chronological order.
   * This ensures that any change in amount or date is reflected in all subsequent balances.
   */
  async syncBalances(bankAccountId: number, tx?: any) {
    const prisma = tx || this.prisma;
    
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      select: { id: true, opening_balance: true },
    });
    if (!bankAccount) throw new NotFoundException('銀行帳戶不存在');

    // Get all transactions for this account, sorted chronologically
    const txs = await prisma.bankTransaction.findMany({
      where: { bank_account_id: bankAccountId },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    let currentBalance = bankAccount.opening_balance ?? new Prisma.Decimal(0);
    const startBalance = currentBalance;

    for (const tx_item of txs) {
      currentBalance = currentBalance.add(tx_item.amount);
      await prisma.bankTransaction.update({
        where: { id: tx_item.id },
        data: { balance: currentBalance },
      });
    }

    return {
      updated: txs.length,
      openingBalance: startBalance.toNumber(),
      endingBalance: currentBalance.toNumber(),
    };
  }

  /** Delete a single transaction */
  async deleteTransaction(id: number) {
    const tx = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException('交易記錄不存在');
    const result = await this.prisma.bankTransaction.delete({ where: { id } });
    await this.syncBalances(tx.bank_account_id);
    return result;
  }

  /** Update remark for a transaction */
  async updateRemark(id: number, remark: string | null) {
    const tx = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException('交易記錄不存在');
    return this.prisma.bankTransaction.update({
      where: { id },
      data: { bank_txn_remark: remark || null },
    });
  }

  // ── Batch Operations ──

  /** Delete multiple transactions */
  async batchDelete(ids: number[]) {
    if (!ids || ids.length === 0) throw new BadRequestException('請選擇至少一筆交易');
    
    // Get account ID from one of the transactions before deleting
    const firstTx = await this.prisma.bankTransaction.findFirst({
      where: { id: { in: ids } },
      select: { bank_account_id: true },
    });

    const result = await this.prisma.bankTransaction.deleteMany({
      where: { id: { in: ids } },
    });

    if (firstTx) {
      await this.syncBalances(firstTx.bank_account_id);
    }

    return { deleted: result.count };
  }

  /** Move multiple transactions to a different bank account */
  async batchMove(ids: number[], targetBankAccountId: number) {
    if (!ids || ids.length === 0) throw new BadRequestException('請選擇至少一筆交易');
    // Verify target bank account exists
    const account = await this.prisma.bankAccount.findUnique({ where: { id: targetBankAccountId } });
    if (!account) throw new NotFoundException('目標銀行帳戶不存在');

    // Get source account ID before moving
    const firstTx = await this.prisma.bankTransaction.findFirst({
      where: { id: { in: ids } },
      select: { bank_account_id: true },
    });

    // Unmatch all moved transactions (since they are changing accounts)
    const result = await this.prisma.bankTransaction.updateMany({
      where: { id: { in: ids } },
      data: {
        bank_account_id: targetBankAccountId,
        match_status: 'unmatched',
        matched_type: null,
        matched_id: null,
      },
    });

    // Sync balances for both source and target accounts
    if (firstTx) {
      await this.syncBalances(firstTx.bank_account_id);
    }
    await this.syncBalances(targetBankAccountId);

    return { moved: result.count };
  }

  // ── Import ──

  async importTransactions(
    bankAccountId: number,
    rows: any[],
    source: string = 'csv',
    options: { opening_balance?: number | string | null; confirm_balance_mismatch?: boolean } = {},
  ) {
    // Generate unique batch ID with random suffix to avoid collisions
    const batchId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const results = { imported: 0, skipped: 0, balanceMismatch: false };

    if (!rows || rows.length === 0) {
      throw new BadRequestException('沒有可匯入的交易記錄');
    }

    const bankAccount = await this.prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      select: { id: true, opening_balance: true },
    });
    if (!bankAccount) throw new NotFoundException('銀行帳戶不存在');

    let parsedOpeningBalance: Prisma.Decimal | null = null;
    if (options.opening_balance !== undefined && options.opening_balance !== null && options.opening_balance !== '') {
      parsedOpeningBalance = new Prisma.Decimal(options.opening_balance);

      const lastExistingTx = await this.prisma.bankTransaction.findFirst({
        where: { bank_account_id: bankAccountId },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        select: { balance: true },
      });

      if (lastExistingTx?.balance != null) {
        const expectedBalance = new Prisma.Decimal(lastExistingTx.balance);
        if (expectedBalance.minus(parsedOpeningBalance).abs().greaterThan(new Prisma.Decimal('0.01')) && !options.confirm_balance_mismatch) {
          return {
            ...results,
            balanceMismatch: true,
            expectedBalance: expectedBalance.toNumber(),
            actualBalance: parsedOpeningBalance.toNumber(),
          };
        }
      } else {
        await this.prisma.bankAccount.update({
          where: { id: bankAccountId },
          data: { opening_balance: parsedOpeningBalance },
        });
      }
    }

    // Use Prisma transaction to ensure all-or-nothing import
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const row of rows) {
          const amount = new Prisma.Decimal(row.amount);
          const date = new Date(row.date);
          const description = row.description || '';
          const reference_no = row.reference_no || null;

          // Anti-duplicate check: same date, amount, description, and reference_no (if provided)
          // If reference_no is provided (e.g., cheque number), use it as part of the unique identifier
          // This ensures transactions with the same amount but different cheque numbers are not treated as duplicates
          const where: any = {
            bank_account_id: bankAccountId,
            date,
            amount,
            description,
          };
          
          // If reference_no is provided, include it in the duplicate check
          // If not provided, check for duplicates without reference_no
          if (reference_no) {
            where.reference_no = reference_no;
          } else {
            where.reference_no = null;
          }
          
          const existing = await tx.bankTransaction.findFirst({
            where,
          });

          if (existing) {
            // Only skip if it's a true duplicate (same reference_no or both have no reference_no)
            // If reference_no differs, it's a different transaction
            if ((reference_no && existing.reference_no === reference_no) || (!reference_no && !existing.reference_no)) {
              results.skipped++;
              continue;
            }
          }

          await tx.bankTransaction.create({
            data: {
              bank_account_id: bankAccountId,
              date,
              description,
              amount,
              debit_credit: amount.greaterThanOrEqualTo(0) ? 'credit' : 'debit',
              balance: row.balance != null ? new Prisma.Decimal(row.balance) : null,
              reference_no,
              import_batch: batchId,
              match_status: 'unmatched',
              bank_txn_source: source,
            },
          });
          results.imported++;
        }

        // Auto-match after import (within transaction)
        if (results.imported > 0) {
          await this.syncBalances(bankAccountId, tx);
          await this.autoMatch(bankAccountId, batchId, tx);
        }
      });
    } catch (error) {
      // Transaction will be automatically rolled back by Prisma
      throw new InternalServerErrorException(
        `匯入失敗：${error.message || '未知錯誤'}。請檢查數據格式並重試。`,
      );
    }

    return results;
  }

  /**
   * Auto-match logic:
   *
   * REQUIRED conditions: company (via BankAccount.company_id) + date range (+/- 3 days) + amount
   * OPTIONAL conditions (boost confidence): reference_no / cheque_no
   *
   * Priority order:
   * 1. Same bank account + reference_no + amount + date range  (highest confidence)
   * 2. Same company + reference_no + amount + date range
   * 3. Same bank account + amount + date range (no ref no, unique match only)
   * 4. Same company + amount + date range (no ref no, unique match only)
   */
  async autoMatch(bankAccountId: number, batchId?: string, tx?: any) {
    const prisma = tx || this.prisma;
    
    // Get the bank account to find its company_id
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      select: { id: true, company_id: true },
    });
    const companyId = bankAccount?.company_id ?? null;

    const where: Prisma.BankTransactionWhereInput = {
      bank_account_id: bankAccountId,
      match_status: 'unmatched',
    };
    if (batchId) where.import_batch = batchId;

    const unmatched = await prisma.bankTransaction.findMany({ where });
    let matchedCount = 0;

    for (const tx of unmatched) {
      const txAmount = tx.amount.abs();
      const isCredit = tx.amount.greaterThanOrEqualTo(0);

      // Date range: +/- N days (configurable via system settings, default 3)
      const toleranceDays = await this.systemSettings.getNumber('bank_reconciliation_date_tolerance', 3);
      const dateFrom = new Date(tx.date);
      dateFrom.setDate(dateFrom.getDate() - toleranceDays);
      const dateTo = new Date(tx.date);
      dateTo.setDate(dateTo.getDate() + toleranceDays);

      let matched = false;

      if (isCredit) {
        // === PaymentIn matching ===
        if (!matched && tx.reference_no) {
          const m = await this.prisma.paymentIn.findFirst({
            where: {
              bank_account_id: bankAccountId,
              reference_no: tx.reference_no,
              amount: txAmount,
              date: { gte: dateFrom, lte: dateTo },
            },
          });
          if (m) {
            await this.applyMatch(tx.id, 'payment_in', m.id);
            matchedCount++;
            matched = true;
          }
        }

        if (!matched && tx.reference_no && companyId) {
          const m = await this.prisma.paymentIn.findFirst({
            where: {
              reference_no: tx.reference_no,
              amount: txAmount,
              date: { gte: dateFrom, lte: dateTo },
              project: { company_id: companyId },
            },
          });
          if (m) {
            await this.applyMatch(tx.id, 'payment_in', m.id);
            matchedCount++;
            matched = true;
          }
        }

        if (!matched) {
          const candidates = await this.prisma.paymentIn.findMany({
            where: {
              bank_account_id: bankAccountId,
              amount: txAmount,
              date: { gte: dateFrom, lte: dateTo },
            },
          });
          if (candidates.length === 1) {
            await this.applyMatch(tx.id, 'payment_in', candidates[0].id);
            matchedCount++;
            matched = true;
          }
        }

        if (!matched && companyId) {
          const candidates = await this.prisma.paymentIn.findMany({
            where: {
              amount: txAmount,
              date: { gte: dateFrom, lte: dateTo },
              project: { company_id: companyId },
            },
          });
          if (candidates.length === 1) {
            await this.applyMatch(tx.id, 'payment_in', candidates[0].id);
            matchedCount++;
            matched = true;
          }
        }

        // === Multi-match: same ref_no + same date, sum of amounts = bank amount ===
        if (!matched && tx.reference_no) {
          const multiCandidates = await this.prisma.paymentIn.findMany({
            where: {
              bank_account_id: bankAccountId,
              reference_no: tx.reference_no,
              date: tx.date,
            },
          });
          if (multiCandidates.length > 1) {
            const sum = multiCandidates.reduce(
              (s, c) => s.add(c.amount),
              new Prisma.Decimal(0),
            );
            if (sum.equals(txAmount)) {
              await this.applyMultiMatch(
                tx.id,
                multiCandidates.map((c) => ({ type: 'payment_in' as const, id: c.id })),
              );
              matchedCount++;
              matched = true;
            }
          }
        }
      } else {
        // === PaymentOut matching ===
        if (!matched && tx.reference_no) {
          const m = await this.prisma.paymentOut.findFirst({
            where: {
              bank_account_id: bankAccountId,
              reference_no: tx.reference_no,
              amount: txAmount,
              date: { gte: dateFrom, lte: dateTo },
            },
          });
          if (m) {
            await this.applyMatch(tx.id, 'payment_out', m.id);
            matchedCount++;
            matched = true;
          }
        }

        if (!matched && tx.reference_no && companyId) {
          const m = await this.prisma.paymentOut.findFirst({
            where: {
              company_id: companyId,
              reference_no: tx.reference_no,
              amount: txAmount,
              date: { gte: dateFrom, lte: dateTo },
            },
          });
          if (m) {
            await this.applyMatch(tx.id, 'payment_out', m.id);
            matchedCount++;
            matched = true;
          }
        }

        if (!matched) {
          const candidates = await this.prisma.paymentOut.findMany({
            where: {
              bank_account_id: bankAccountId,
              amount: txAmount,
              date: { gte: dateFrom, lte: dateTo },
            },
          });
          if (candidates.length === 1) {
            await this.applyMatch(tx.id, 'payment_out', candidates[0].id);
            matchedCount++;
            matched = true;
          }
        }

        if (!matched && companyId) {
          const candidates = await this.prisma.paymentOut.findMany({
            where: {
              company_id: companyId,
              amount: txAmount,
              date: { gte: dateFrom, lte: dateTo },
            },
          });
          if (candidates.length === 1) {
            await this.applyMatch(tx.id, 'payment_out', candidates[0].id);
            matchedCount++;
            matched = true;
          }
        }

        // === Multi-match: same ref_no + same date, sum of amounts = bank amount ===
        if (!matched && tx.reference_no) {
          const multiCandidates = await this.prisma.paymentOut.findMany({
            where: {
              bank_account_id: bankAccountId,
              reference_no: tx.reference_no,
              date: tx.date,
            },
          });
          if (multiCandidates.length > 1) {
            const sum = multiCandidates.reduce(
              (s, c) => s.add(c.amount),
              new Prisma.Decimal(0),
            );
            if (sum.equals(txAmount)) {
              await this.applyMultiMatch(
                tx.id,
                multiCandidates.map((c) => ({ type: 'payment_out' as const, id: c.id })),
              );
              matchedCount++;
              matched = true;
            }
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
    // Write to both legacy fields AND the new junction table
    await this.prisma.$transaction(async (prisma) => {
      await prisma.bankTransaction.update({
        where: { id: txId },
        data: {
          match_status: 'matched',
          matched_type: type,
          matched_id: matchedId,
        },
      });
      // Upsert into junction table (avoid duplicates)
      const existing = await prisma.bankTransactionMatch.findFirst({
        where: { bank_transaction_id: txId, matched_type: type, matched_id: matchedId },
      });
      if (!existing) {
        await prisma.bankTransactionMatch.create({
          data: { bank_transaction_id: txId, matched_type: type, matched_id: matchedId },
        });
      }
    });
    return this.prisma.bankTransaction.findUnique({ where: { id: txId } });
  }

  /**
   * Multi-match: link multiple PaymentIn/PaymentOut records to a single BankTransaction.
   * Used when the bank shows one lump-sum but the system has multiple split records.
   */
  async applyMultiMatch(
    txId: number,
    matches: { type: 'payment_in' | 'payment_out'; id: number }[],
  ) {
    if (!matches || matches.length === 0) {
      throw new BadRequestException('至少需要一筆配對記錄');
    }

    await this.prisma.$transaction(async (prisma) => {
      // Clear any existing matches for this transaction
      await prisma.bankTransactionMatch.deleteMany({
        where: { bank_transaction_id: txId },
      });

      // Insert new matches
      await prisma.bankTransactionMatch.createMany({
        data: matches.map((m) => ({
          bank_transaction_id: txId,
          matched_type: m.type,
          matched_id: m.id,
        })),
      });

      // Update the BankTransaction status
      // For multi-match, set matched_type/matched_id to null (use junction table)
      const isSingle = matches.length === 1;
      await prisma.bankTransaction.update({
        where: { id: txId },
        data: {
          match_status: 'matched',
          matched_type: isSingle ? matches[0].type : null,
          matched_id: isSingle ? matches[0].id : null,
        },
      });
    });

    return this.prisma.bankTransaction.findUnique({
      where: { id: txId },
      include: { matches: true },
    });
  }

  async unmatch(txId: number) {
    await this.prisma.$transaction(async (prisma) => {
      // Clear junction table entries
      await prisma.bankTransactionMatch.deleteMany({
        where: { bank_transaction_id: txId },
      });
      // Clear legacy fields
      await prisma.bankTransaction.update({
        where: { id: txId },
        data: {
          match_status: 'unmatched',
          matched_type: null,
          matched_id: null,
        },
      });
    });
    return this.prisma.bankTransaction.findUnique({ where: { id: txId } });
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
    const bankAccount = await this.prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      select: { id: true, opening_balance: true },
    });
    if (!bankAccount) throw new NotFoundException('銀行帳戶不存在');

    const where: Prisma.BankTransactionWhereInput = { bank_account_id: bankAccountId };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const txs = await this.prisma.bankTransaction.findMany({ where });

    // Calculate B/F (Balance Forward) and C/D (Closing Date)
    let bf_balance = bankAccount.opening_balance ?? new Prisma.Decimal(0);
    let cd_balance = bf_balance;

    if (dateFrom || dateTo) {
      // If date filter is applied, find B/F from last transaction before dateFrom
      const dateFromObj = dateFrom ? new Date(dateFrom) : null;
      if (dateFromObj) {
        const lastBefore = await this.prisma.bankTransaction.findFirst({
          where: {
            bank_account_id: bankAccountId,
            date: { lt: dateFromObj },
          },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          select: { balance: true },
        });
        bf_balance = lastBefore?.balance ?? bankAccount.opening_balance ?? new Prisma.Decimal(0);
      }
      // C/D is the balance of the last transaction in the filtered range
      if (txs.length > 0) {
        const lastInRange = txs.reduce((latest, current) => {
          const latestDate = new Date(latest.date);
          const currentDate = new Date(current.date);
          return currentDate > latestDate || (currentDate.getTime() === latestDate.getTime() && current.id > latest.id)
            ? current
            : latest;
        });
        cd_balance = lastInRange.balance ?? bf_balance;
      }
    } else {
      // No date filter: B/F is opening_balance, C/D is last transaction balance
      if (txs.length > 0) {
        const lastTx = txs.reduce((latest, current) => {
          const latestDate = new Date(latest.date);
          const currentDate = new Date(current.date);
          return currentDate > latestDate || (currentDate.getTime() === latestDate.getTime() && current.id > latest.id)
            ? current
            : latest;
        });
        cd_balance = lastTx.balance ?? bf_balance;
      }
    }

    const summary = {
      total_count: txs.length,
      matched_count: txs.filter(t => t.match_status === 'matched').length,
      unmatched_count: txs.filter(t => t.match_status === 'unmatched').length,
      excluded_count: txs.filter(t => t.match_status === 'excluded').length,
      total_withdrawals: txs
        .filter(t => t.amount.lessThan(0))
        .reduce((sum, t) => sum.add(t.amount.abs()), new Prisma.Decimal(0)),
      total_deposits: txs
        .filter(t => t.amount.greaterThanOrEqualTo(0))
        .reduce((sum, t) => sum.add(t.amount), new Prisma.Decimal(0)),
      matched_amount: txs
        .filter(t => t.match_status === 'matched')
        .reduce((sum, t) => sum.add(t.amount.abs()), new Prisma.Decimal(0)),
      unmatched_amount: txs
        .filter(t => t.match_status === 'unmatched')
        .reduce((sum, t) => sum.add(t.amount.abs()), new Prisma.Decimal(0)),
      bf_balance: bf_balance.toNumber(),
      cd_balance: cd_balance.toNumber(),
    };

    return summary;
  }

  async findMatchCandidates(txId: number) {
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: txId },
      include: {
        bank_account: { select: { id: true, company_id: true } },
      },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const amount = tx.amount.abs();
    const isCredit = tx.amount.greaterThanOrEqualTo(0);
    const bankAccountId = tx.bank_account_id;
    const companyId = (tx as any).bank_account?.company_id ?? null;

    // Date range: +/- 30 days for manual matching
    const dateFrom = new Date(tx.date);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateTo = new Date(tx.date);
    dateTo.setDate(dateTo.getDate() + 30);

    if (isCredit) {
      const orConditions: any[] = [{ bank_account_id: bankAccountId }];
      if (companyId) {
        orConditions.push({ project: { company_id: companyId } });
      }
      orConditions.push({ bank_account_id: null });

      const candidates = await this.prisma.paymentIn.findMany({
        where: {
          date: { gte: dateFrom, lte: dateTo },
          amount: { gte: amount.mul(0.8), lte: amount.mul(1.2) },
          OR: orConditions,
        },
        include: {
          project: { select: { id: true, project_name: true, project_no: true, company_id: true } },
          contract: { select: { id: true, contract_no: true, contract_name: true } },
          bank_account: { select: { id: true, bank_name: true, account_no: true } },
        },
        orderBy: [{ date: 'desc' }],
        take: 30,
      });

      return candidates.sort((a, b) => {
        const aScore = (a.bank_account_id === bankAccountId ? 2 : 0) +
          (companyId && (a.project as any)?.company_id === companyId ? 1 : 0);
        const bScore = (b.bank_account_id === bankAccountId ? 2 : 0) +
          (companyId && (b.project as any)?.company_id === companyId ? 1 : 0);
        return bScore - aScore;
      });
    } else {
      const orConditions: any[] = [{ bank_account_id: bankAccountId }];
      if (companyId) {
        orConditions.push({ company_id: companyId });
      }
      orConditions.push({ bank_account_id: null });

      const candidates = await this.prisma.paymentOut.findMany({
        where: {
          date: { gte: dateFrom, lte: dateTo },
          amount: { gte: amount.mul(0.8), lte: amount.mul(1.2) },
          OR: orConditions,
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

      return candidates.sort((a, b) => {
        const aScore = (a.bank_account_id === bankAccountId ? 2 : 0) +
          (companyId && a.company_id === companyId ? 1 : 0);
        const bScore = (b.bank_account_id === bankAccountId ? 2 : 0) +
          (companyId && b.company_id === companyId ? 1 : 0);
        return bScore - aScore;
      });
    }
  }
}
