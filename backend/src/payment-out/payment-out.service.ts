import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentOutAllocationService } from './payment-out-allocation.service';

interface FindAllQuery {
  page?: number;
  limit?: number;
  expense_id?: number;
  subcon_payroll_id?: number;
  company_id?: number;
  payment_out_status?: string;
  date_from?: string;
  date_to?: string;
  created_from?: string;
  created_to?: string;
  sortBy?: string;
  sortOrder?: string;
  // column filters
  filter_payment_out_status?: string;
  filter_company?: string;
  filter_payment_method?: string;
  filter_bank_account_id?: string;
  filter_reference_no?: string;
  filter_remarks?: string;
  filter_amount_min?: string;
  filter_amount_max?: string;
}

interface CreatePaymentOutInput {
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
  payment_method?: string;
  remarks?: string;
}

interface UpdatePaymentOutInput extends Partial<CreatePaymentOutInput> {}

@Injectable()
export class PaymentOutService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PaymentOutAllocationService))
    private allocationService: PaymentOutAllocationService,
  ) {}

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
    company: { select: { id: true, name: true, name_en: true, internal_prefix: true } },
    bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
    allocations: {
      include: {
        expense: {
          select: { id: true, item: true, total_amount: true, supplier_name: true },
        },
        payroll: {
          select: {
            id: true,
            period: true,
            net_amount: true,
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
      },
      orderBy: { id: 'asc' as const },
    },
  } satisfies Prisma.PaymentOutInclude;

  // ── List / Query ──────────────────────────────────
  async findAll(query: FindAllQuery) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const allowedSortFields = ['id', 'date', 'amount', 'payment_out_status', 'reference_no', 'created_at'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'date';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const orderBy: any = { [sortBy]: sortOrder };

    const where: Prisma.PaymentOutWhereInput = {};
    if (query.expense_id) where.expense_id = query.expense_id;
    if (query.subcon_payroll_id) where.subcon_payroll_id = query.subcon_payroll_id;
    if (query.company_id) where.company_id = query.company_id;
    if (query.payment_out_status) where.payment_out_status = query.payment_out_status;
    // Column filters
    if (query.filter_payment_out_status) {
      const vals = query.filter_payment_out_status.split(',').filter(Boolean);
      const STATUS_REVERSE: Record<string, string> = { '未付款': 'unpaid', '部分付款': 'partially_paid', '已付款': 'paid', '取消': 'cancelled' };
      const dbVals = vals.map(v => STATUS_REVERSE[v] || v);
      if (dbVals.length) where.payment_out_status = { in: dbVals };
    }
    if (query.filter_payment_method) {
      const vals = query.filter_payment_method.split(',').filter(Boolean);
      if (vals.length) where.payment_method = { in: vals };
    }
    if (query.filter_company) {
      const vals = query.filter_company.split(',').filter(Boolean);
      if (vals.length) {
        const companies = await this.prisma.company.findMany({
          where: { OR: [{ internal_prefix: { in: vals } }, { name: { in: vals } }] },
          select: { id: true },
        });
        const companyIds = companies.map(c => c.id);
        if (companyIds.length) where.company_id = { in: companyIds };
      }
    }
    if (query.filter_bank_account_id) {
      const vals = query.filter_bank_account_id.split(',').filter(Boolean);
      if (vals.length) {
        const bankAccounts = await this.prisma.bankAccount.findMany({
          select: { id: true, bank_name: true, account_no: true },
        });
        const matchedIds = bankAccounts
          .filter(a => vals.some(v => v === `${a.bank_name} - ${a.account_no}`))
          .map(a => a.id);
        if (matchedIds.length) where.bank_account_id = { in: matchedIds };
      }
    }
    if (query.filter_reference_no) {
      const vals = query.filter_reference_no.split(',').filter(Boolean);
      if (vals.length) where.reference_no = { in: vals };
    }
    if (query.filter_remarks) {
      const vals = query.filter_remarks.split(',').filter(Boolean);
      if (vals.length) where.remarks = { in: vals };
    }
    if (query.filter_amount_min || query.filter_amount_max) {
      const amtFilter: Prisma.DecimalFilter = {};
      if (query.filter_amount_min) amtFilter.gte = parseFloat(query.filter_amount_min);
      if (query.filter_amount_max) amtFilter.lte = parseFloat(query.filter_amount_max);
      where.amount = amtFilter;
    }
    if (query.date_from || query.date_to) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.date_from) dateFilter.gte = new Date(query.date_from);
      if (query.date_to) dateFilter.lte = new Date(`${query.date_to}T23:59:59.999Z`);
      where.date = dateFilter;
    }
    if (query.created_from || query.created_to) {
      const createdFilter: Prisma.DateTimeFilter = {};
      if (query.created_from) createdFilter.gte = new Date(query.created_from);
      if (query.created_to) createdFilter.lte = new Date(`${query.created_to}T23:59:59.999Z`);
      where.created_at = createdFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.paymentOut.findMany({
        where,
        include: this.listInclude,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.paymentOut.count({ where }),
    ]);

    // Enrich with reconciliation status from junction table
    const ids = data.map((d) => d.id);
    const matchEntries = ids.length
      ? await this.prisma.bankTransactionMatch.findMany({
          where: { matched_type: 'payment_out', matched_id: { in: ids } },
          select: { matched_id: true },
        })
      : [];
    const reconciledIds = new Set(matchEntries.map((m) => m.matched_id));
    const enriched = data.map((d) => ({
      ...d,
      is_reconciled: reconciledIds.has(d.id),
    }));

    return { data: enriched, total, page, limit };
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
        allocations: {
          include: {
            expense: {
              select: {
                id: true,
                item: true,
                total_amount: true,
                supplier_name: true,
                date: true,
              },
            },
            payroll: {
              select: {
                id: true,
                period: true,
                net_amount: true,
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
          },
          orderBy: { id: 'asc' },
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

  //    // ── Create ────────────────────────────────────────────────
  async create(dto: CreatePaymentOutInput) {
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
        payment_method: dto.payment_method || null,
        remarks: dto.remarks || null,
      },
      include: this.listInclude,
    });

    // Recalculate linked source payment status
    await this.recalculateLinkedStatus(created);

    return created;
  }

  //   // ── Update ────────────────────────────────────────────────
  async update(id: number, dto: UpdatePaymentOutInput) {
    const existing = await this.prisma.paymentOut.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('付款記錄不存在');

    const data: Prisma.PaymentOutUpdateInput = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.amount !== undefined) {
      if (dto.amount <= 0) throw new BadRequestException('金額必須大於 0');
      data.amount = dto.amount;
    }
    if (dto.expense_id !== undefined) {
      data.expense = dto.expense_id
        ? { connect: { id: dto.expense_id } }
        : { disconnect: true };
    }
    if (dto.payroll_id !== undefined) {
      data.payroll = dto.payroll_id
        ? { connect: { id: dto.payroll_id } }
        : { disconnect: true };
    }
    if (dto.subcon_payroll_id !== undefined) {
      data.subcon_payroll = dto.subcon_payroll_id
        ? { connect: { id: dto.subcon_payroll_id } }
        : { disconnect: true };
    }
    if (dto.company_id !== undefined) {
      data.company = dto.company_id
        ? { connect: { id: dto.company_id } }
        : { disconnect: true };
    }
    if (dto.payment_out_description !== undefined) data.payment_out_description = dto.payment_out_description;
    if (dto.payment_out_status !== undefined) data.payment_out_status = dto.payment_out_status;
    if (dto.bank_account_id !== undefined) {
      data.bank_account = dto.bank_account_id
        ? { connect: { id: dto.bank_account_id } }
        : { disconnect: true };
    }
    if (dto.reference_no !== undefined) data.reference_no = dto.reference_no;
    if (dto.payment_method !== undefined) data.payment_method = dto.payment_method;
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

    // ── Delete ────────────────────────────────────────────
  async remove(id: number) {
    const existing = await this.prisma.paymentOut.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('付款記錄不存在');

    // Capture allocation targets before cascading delete wipes them.
    const allocs = await this.prisma.paymentOutAllocation.findMany({
      where: { payment_out_allocation_payment_out_id: id },
      select: {
        payment_out_allocation_expense_id: true,
        payment_out_allocation_payroll_id: true,
        payment_out_allocation_subcon_payroll_id: true,
      },
    });

    await this.prisma.paymentOut.delete({ where: { id } });

    // Recalculate legacy direct-fk targets first
    await this.recalculateLinkedStatus({
      expense_id: existing.expense_id,
      payroll_id: existing.payroll_id,
      subcon_payroll_id: existing.subcon_payroll_id,
    });
    // Recalculate allocation targets that were attached to this PaymentOut
    for (const a of allocs) {
      if (a.payment_out_allocation_expense_id) {
        await this.allocationService.recalculateExpense(
          a.payment_out_allocation_expense_id,
        );
      }
      if (a.payment_out_allocation_payroll_id) {
        await this.allocationService.recalculatePayroll(
          a.payment_out_allocation_payroll_id,
        );
      }
      if (a.payment_out_allocation_subcon_payroll_id) {
        await this.allocationService.recalculateSubconPayroll(
          a.payment_out_allocation_subcon_payroll_id,
        );
      }
    }

    return { message: '已刪除' };
  }

  // ══════════════════════════════════════════════════════════════════
  // Shared: Recalculate payment status for linked Expense / SubconPayroll
  // ══════════════════════════════════════════════════════════════════

  /**
   * Given a PaymentOut record (or its snapshot), recalculate the payment status
   * for every linked target (legacy direct fk + every allocation).
   */
  private async recalculateLinkedStatus(record: {
    id?: number;
    expense_id?: number | null;
    payroll_id?: number | null;
    subcon_payroll_id?: number | null;
  }) {
    // 1) legacy direct foreign-key targets
    if (record.expense_id) {
      await this.allocationService.recalculateExpense(record.expense_id);
    }
    if (record.payroll_id) {
      await this.allocationService.recalculatePayroll(record.payroll_id);
    }
    if (record.subcon_payroll_id) {
      await this.allocationService.recalculateSubconPayroll(record.subcon_payroll_id);
    }

    // 2) allocation targets attached to this PaymentOut (if any)
    if (record.id) {
      const allocs = await this.prisma.paymentOutAllocation.findMany({
        where: { payment_out_allocation_payment_out_id: record.id },
        select: {
          payment_out_allocation_expense_id: true,
          payment_out_allocation_payroll_id: true,
          payment_out_allocation_subcon_payroll_id: true,
        },
      });
      for (const a of allocs) {
        if (a.payment_out_allocation_expense_id) {
          await this.allocationService.recalculateExpense(
            a.payment_out_allocation_expense_id,
          );
        }
        if (a.payment_out_allocation_payroll_id) {
          await this.allocationService.recalculatePayroll(
            a.payment_out_allocation_payroll_id,
          );
        }
        if (a.payment_out_allocation_subcon_payroll_id) {
          await this.allocationService.recalculateSubconPayroll(
            a.payment_out_allocation_subcon_payroll_id,
          );
        }
      }
    }
  }

  /**
   * Backward-compatible thin wrappers that delegate to the new
   * allocation-aware logic in PaymentOutAllocationService.
   * Existing callers (e.g. other services) keep working.
   */
  async recalculateExpensePaymentStatus(expenseId: number): Promise<void> {
    await this.allocationService.recalculateExpense(expenseId);
  }

  async recalculateSubconPayrollStatus(subconPayrollId: number): Promise<void> {
    await this.allocationService.recalculateSubconPayroll(subconPayrollId);
  }

  // ── Filter Options ─────────────────────────────────────────────────────────
  async getFilterOptions(column: string): Promise<string[]> {
    const STATUS_LABELS: Record<string, string> = {
      unpaid: '未付款',
      partially_paid: '部分付款',
      paid: '已付款',
      cancelled: '取消',
    };
    if (column === 'payment_out_status') {
      const records = await this.prisma.paymentOut.findMany({
        select: { payment_out_status: true },
        distinct: ['payment_out_status'],
      });
      return records.map(r => STATUS_LABELS[r.payment_out_status] || r.payment_out_status || '-');
    }
    if (column === 'company') {
      const companies = await this.prisma.company.findMany({
        where: { status: 'active', company_type: { not: 'external' } },
        select: { internal_prefix: true, name: true },
        orderBy: { id: 'asc' },
      });
      return companies.map(c => c.internal_prefix || c.name);
    }
    if (column === 'payment_method') {
      const records = await this.prisma.paymentOut.findMany({
        select: { payment_method: true },
        distinct: ['payment_method'],
        where: { payment_method: { not: null } },
      });
      return records.map(r => r.payment_method!).filter(Boolean).sort();
    }
    if (column === 'bank_account_id') {
      const accounts = await this.prisma.bankAccount.findMany({
        select: { bank_name: true, account_no: true },
        orderBy: { bank_name: 'asc' },
      });
      return accounts.map(a => `${a.bank_name} - ${a.account_no}`);
    }
    if (column === 'reference_no') {
      const records = await this.prisma.paymentOut.findMany({
        select: { reference_no: true },
        distinct: ['reference_no'],
        where: { reference_no: { not: null } },
        orderBy: { reference_no: 'asc' },
      });
      return records.map(r => r.reference_no!).filter(Boolean).sort();
    }
    if (column === 'remarks') {
      const records = await this.prisma.paymentOut.findMany({
        select: { remarks: true },
        distinct: ['remarks'],
        where: { remarks: { not: null } },
        orderBy: { remarks: 'asc' },
      });
      return records.map(r => r.remarks!).filter(Boolean).sort();
    }
    return [];
  }
}
