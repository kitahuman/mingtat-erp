import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentOutService {
  constructor(private prisma: PrismaService) {}

  // ── Shared include for list queries ──────────────────────────────
  private readonly listInclude = {
    expense: {
      select: {
        id: true,
        item: true,
        total_amount: true,
        supplier_name: true,
        category: { select: { id: true, name: true } },
      },
    },
    payroll: {
      select: {
        id: true,
        period: true,
        employee: { select: { id: true, name_zh: true, name_en: true } },
      },
    },
    subcon_payroll: {
      select: {
        id: true,
        subcon_payroll_month: true,
        subcon_payroll_total_amount: true,
        subcontractor: { select: { id: true, name: true } },
      },
    },
    company: { select: { id: true, name: true, name_en: true } },
    bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
  };

  // ── List / Query ─────────────────────────────────────────────────
  async findAll(query: {
    page?: number;
    limit?: number;
    expense_id?: number;
    subcon_payroll_id?: number;
    company_id?: number;
    payment_out_status?: string;
    date_from?: string;
    date_to?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.expense_id) where.expense_id = query.expense_id;
    if (query.subcon_payroll_id) where.subcon_payroll_id = query.subcon_payroll_id;
    if (query.company_id) where.company_id = query.company_id;
    if (query.payment_out_status) where.payment_out_status = query.payment_out_status;
    if (query.date_from || query.date_to) {
      where.date = {};
      if (query.date_from) where.date.gte = new Date(query.date_from);
      if (query.date_to) where.date.lte = new Date(query.date_to);
    }

    const [data, total] = await Promise.all([
      this.prisma.paymentOut.findMany({
        where,
        include: this.listInclude,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.paymentOut.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ── Find One ─────────────────────────────────────────────────────
  async findOne(id: number) {
    const record = await this.prisma.paymentOut.findUnique({
      where: { id },
      include: {
        expense: {
          select: {
            id: true,
            item: true,
            total_amount: true,
            supplier_name: true,
            is_paid: true,
            date: true,
            remarks: true,
            category: { select: { id: true, name: true } },
            project: { select: { id: true, project_no: true, project_name: true } },
          },
        },
        payroll: {
          select: {
            id: true,
            period: true,
            date_from: true,
            date_to: true,
            net_amount: true,
            employee: { select: { id: true, name_zh: true, name_en: true } },
          },
        },
        subcon_payroll: {
          select: {
            id: true,
            subcon_payroll_month: true,
            subcon_payroll_total_amount: true,
            subcon_payroll_status: true,
            subcontractor: { select: { id: true, name: true } },
          },
        },
        company: { select: { id: true, name: true, name_en: true } },
        bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
        payroll_payments: {
          include: {
            payroll: {
              select: {
                id: true,
                period: true,
                date_from: true,
                date_to: true,
                employee: {
                  select: { id: true, name_zh: true, name_en: true },
                },
              },
            },
          },
          orderBy: { payroll_payment_date: 'desc' },
        },
      },
    });
    if (!record) throw new NotFoundException('付款記錄不存在');

    // Fetch matched bank transactions (月結單配對記錄)
    const matchedBankTransactions = await this.prisma.bankTransaction.findMany({
      where: {
        matched_type: 'payment_out',
        matched_id: id,
      },
      include: {
        bank_account: {
          select: { id: true, account_name: true, bank_name: true, account_no: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    return { ...record, matched_bank_transactions: matchedBankTransactions };
  }

  // ── Create ───────────────────────────────────────────────────────
  async create(dto: {
    date: string;
    amount: number;
    expense_id?: number;
    payroll_id?: number;
    subcon_payroll_id?: number;
    company_id?: number;
    payment_out_description?: string;
    payment_out_status?: string;
    bank_account_id?: number;
    reference_no?: string;
    remarks?: string;
  }) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('金額必須大於 0');
    }

    // Auto-derive company_id from linked expense, payroll, or subcon_payroll if not provided
    let companyId = dto.company_id || null;
    if (!companyId && dto.expense_id) {
      const expense = await this.prisma.expense.findUnique({
        where: { id: dto.expense_id },
        select: { company_id: true },
      });
      companyId = expense?.company_id || null;
    }
    if (!companyId && dto.payroll_id) {
      const payroll = await this.prisma.payroll.findUnique({
        where: { id: dto.payroll_id },
        select: { company_id: true },
      });
      companyId = payroll?.company_id || null;
    }

    const created = await this.prisma.paymentOut.create({
      data: {
        date: new Date(dto.date),
        amount: dto.amount,
        expense_id: dto.expense_id || null,
        payroll_id: dto.payroll_id || null,
        subcon_payroll_id: dto.subcon_payroll_id || null,
        company_id: companyId,
        payment_out_description: dto.payment_out_description || null,
        payment_out_status: dto.payment_out_status || 'unpaid',
        bank_account_id: dto.bank_account_id || null,
        reference_no: dto.reference_no || null,
        remarks: dto.remarks || null,
      },
      include: this.listInclude,
    });

    // Recalculate linked source payment status
    await this.recalculateLinkedStatus(created);

    return created;
  }

  // ── Update ───────────────────────────────────────────────────────
  async update(id: number, dto: any) {
    const existing = await this.prisma.paymentOut.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('付款記錄不存在');

    const data: any = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.amount !== undefined) {
      if (dto.amount <= 0) throw new BadRequestException('金額必須大於 0');
      data.amount = dto.amount;
    }
    if (dto.expense_id !== undefined) data.expense_id = dto.expense_id || null;
    if (dto.payroll_id !== undefined) data.payroll_id = dto.payroll_id || null;
    if (dto.subcon_payroll_id !== undefined) data.subcon_payroll_id = dto.subcon_payroll_id || null;
    if (dto.company_id !== undefined) data.company_id = dto.company_id || null;
    if (dto.payment_out_description !== undefined) data.payment_out_description = dto.payment_out_description;
    if (dto.payment_out_status !== undefined) data.payment_out_status = dto.payment_out_status;
    if (dto.bank_account_id !== undefined) data.bank_account_id = dto.bank_account_id || null;
    if (dto.reference_no !== undefined) data.reference_no = dto.reference_no;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;

    const updated = await this.prisma.paymentOut.update({
      where: { id },
      data,
      include: this.listInclude,
    });

    // Recalculate for old linked sources (if changed)
    await this.recalculateLinkedStatus(existing);
    // Recalculate for new linked sources
    await this.recalculateLinkedStatus(updated);

    return updated;
  }

  // ── Update Status (PATCH) ────────────────────────────────────────
  async updateStatus(id: number, status: string) {
    const existing = await this.prisma.paymentOut.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('付款記錄不存在');

    const updated = await this.prisma.paymentOut.update({
      where: { id },
      data: { payment_out_status: status },
      include: this.listInclude,
    });

    // Recalculate linked source payment status
    await this.recalculateLinkedStatus(updated);

    return updated;
  }

  // ── Delete ───────────────────────────────────────────────────────
  async remove(id: number) {
    const existing = await this.prisma.paymentOut.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('付款記錄不存在');
    await this.prisma.paymentOut.delete({ where: { id } });

    // Recalculate linked source payment status after deletion
    await this.recalculateLinkedStatus(existing);

    return { message: '已刪除' };
  }

  // ══════════════════════════════════════════════════════════════════
  // Shared: Recalculate payment status for linked Expense / SubconPayroll
  // ══════════════════════════════════════════════════════════════════

  /**
   * Given a PaymentOut record (or its snapshot), recalculate the payment status
   * for the linked Expense or SubconPayroll.
   */
  private async recalculateLinkedStatus(record: {
    expense_id?: number | null;
    subcon_payroll_id?: number | null;
  }) {
    if (record.expense_id) {
      await this.recalculateExpensePaymentStatus(record.expense_id);
    }
    if (record.subcon_payroll_id) {
      await this.recalculateSubconPayrollStatus(record.subcon_payroll_id);
    }
  }

  /**
   * Recalculate Expense payment_status and is_paid from its PaymentOut records.
   * - Sum of paid PaymentOut amounts = 0 → unpaid
   * - 0 < sum < total_amount → partially_paid
   * - sum >= total_amount → paid
   */
  async recalculateExpensePaymentStatus(expenseId: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      select: { total_amount: true },
    });
    if (!expense) return;

    const paidPayments = await this.prisma.paymentOut.findMany({
      where: {
        expense_id: expenseId,
        payment_out_status: 'paid',
      },
      select: { amount: true },
    });

    const paidTotal = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalAmount = Number(expense.total_amount) || 0;

    let paymentStatus: string;
    let isPaid: boolean;

    if (paidTotal <= 0) {
      paymentStatus = 'unpaid';
      isPaid = false;
    } else if (paidTotal < totalAmount) {
      paymentStatus = 'partially_paid';
      isPaid = false;
    } else {
      paymentStatus = 'paid';
      isPaid = true;
    }

    await this.prisma.expense.update({
      where: { id: expenseId },
      data: { payment_status: paymentStatus, is_paid: isPaid },
    });
  }

  /**
   * Recalculate SubconPayroll status from its PaymentOut records.
   * Only changes between confirmed/partially_paid/paid based on payment amounts.
   * Does not touch draft or cancelled status.
   */
  async recalculateSubconPayrollStatus(subconPayrollId: number) {
    const payroll = await this.prisma.subconPayroll.findUnique({
      where: { id: subconPayrollId },
      select: { subcon_payroll_total_amount: true, subcon_payroll_status: true },
    });
    if (!payroll) return;

    // Don't recalculate for draft or cancelled
    if (payroll.subcon_payroll_status === 'draft' || payroll.subcon_payroll_status === 'cancelled') {
      return;
    }

    const paidPayments = await this.prisma.paymentOut.findMany({
      where: {
        subcon_payroll_id: subconPayrollId,
        payment_out_status: 'paid',
      },
      select: { amount: true },
    });

    const paidTotal = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalAmount = Number(payroll.subcon_payroll_total_amount) || 0;

    let newStatus: string;

    if (paidTotal <= 0) {
      newStatus = 'confirmed';
    } else if (paidTotal < totalAmount) {
      newStatus = 'partially_paid';
    } else {
      newStatus = 'paid';
    }

    if (newStatus !== payroll.subcon_payroll_status) {
      await this.prisma.subconPayroll.update({
        where: { id: subconPayrollId },
        data: { subcon_payroll_status: newStatus },
      });
    }
  }
}
