import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentInDto,
  UpdatePaymentInDto,
  UpdatePaymentInStatusDto,
} from './dto/create-payment-in.dto';
import { PaymentInAllocationService } from './payment-in-allocation.service';

interface FindAllQuery {
  page?: number;
  limit?: number;
  source_type?: string;
  source_ref_id?: number;
  project_id?: number;
  contract_id?: number;
  payment_in_status?: string;
  date_from?: string;
  date_to?: string;
  sortBy?: string;
  sortOrder?: string;
  // column filters (filter_*)
  filter_payment_in_status?: string;
  filter_source_type?: string;
  filter_company?: string;
  filter_payment_method?: string;
  filter_bank_account_id?: string;
  filter_reference_no?: string;
  filter_remarks?: string;
  filter_amount_min?: string;
  filter_amount_max?: string;
}

@Injectable()
export class PaymentInService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PaymentInAllocationService))
    private allocationService: PaymentInAllocationService,
  ) {}

  // ── Shared include for list queries ──
  private readonly listInclude = {
    project: { select: { id: true, project_no: true, project_name: true, client: { select: { id: true, name: true, code: true } } } },
    payer_partner: { select: { id: true, name: true, code: true } },
    contract: {
      select: { id: true, contract_no: true, contract_name: true },
    },
    bank_account: {
      select: {
        id: true,
        account_name: true,
        bank_name: true,
        account_no: true,
        company: { select: { id: true, name: true, internal_prefix: true } },
      },
    },
    allocations: {
      include: {
        invoice: {
          select: {
            id: true,
            invoice_no: true,
            invoice_title: true,
            total_amount: true,
            paid_amount: true,
            outstanding: true,
            status: true,
            date: true,
            client: { select: { id: true, name: true } },
            company: { select: { id: true, name: true, internal_prefix: true } },
          },
        },
      },
      orderBy: { id: 'asc' as const },
    },
    deductions: {
      include: {
        invoice: {
          select: {
            id: true,
            invoice_no: true,
            invoice_title: true,
          },
        },
      },
      orderBy: { id: 'asc' as const },
    },
  } satisfies Prisma.PaymentInInclude;

  async findAll(query: FindAllQuery) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const allowedSortFields = ['id', 'date', 'amount', 'source_type', 'payment_in_status', 'reference_no', 'created_at'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'date';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const orderBy: any = { [sortBy]: sortOrder };

    const where: Prisma.PaymentInWhereInput = {};
    if (query.source_type) where.source_type = query.source_type;
    if (query.source_ref_id) where.source_ref_id = query.source_ref_id;
    if (query.project_id) where.project_id = query.project_id;
    if (query.contract_id) where.contract_id = query.contract_id;
    if (query.payment_in_status) where.payment_in_status = query.payment_in_status;
    // Column filters from the customizer panel
    if (query.filter_payment_in_status) {
      const vals = query.filter_payment_in_status.split(',').filter(Boolean);
      const STATUS_REVERSE: Record<string, string> = { '未收款': 'unpaid', '部分收款': 'partially_paid', '已收款': 'paid', '取消': 'cancelled' };
      const dbVals = vals.map(v => STATUS_REVERSE[v] || v);
      if (dbVals.length) where.payment_in_status = { in: dbVals };
    }
    if (query.filter_source_type) {
      // Build reverse map dynamically: label → code
      const SOURCE_REVERSE: Record<string, string> = { 'Payment Certificate': 'payment_certificate', '發票': 'invoice', '扣留金釋放': 'retention_release', '其他收入': 'other' };
      // Also try to match by code directly
      const vals = query.filter_source_type.split(',').filter(Boolean);
      const dbVals = vals.map(v => SOURCE_REVERSE[v] || v);
      if (dbVals.length) where.source_type = { in: dbVals };
    }
    if (query.filter_payment_method) {
      const vals = query.filter_payment_method.split(',').filter(Boolean);
      if (vals.length) where.payment_method = { in: vals };
    }
    if (query.filter_company) {
      const vals = query.filter_company.split(',').filter(Boolean);
      if (vals.length) {
        where.bank_account = {
          company: { OR: [{ internal_prefix: { in: vals } }, { name: { in: vals } }] },
        };
      }
    }
    if (query.filter_bank_account_id) {
      const vals = query.filter_bank_account_id.split(',').filter(Boolean);
      if (vals.length) {
        // vals are display strings like "HSBC - 123456"
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
      if (query.date_to) dateFilter.lte = new Date(query.date_to);
      where.date = dateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.paymentIn.findMany({
        where,
        include: this.listInclude,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.paymentIn.count({ where }),
    ]);

    // Enrich with reconciliation status from both junction table (new) and legacy matched_id (old)
    const ids = data.map((d) => d.id);
    const [matchEntries, legacyMatches] = ids.length
      ? await Promise.all([
          this.prisma.bankTransactionMatch.findMany({
            where: { matched_type: 'payment_in', matched_id: { in: ids } },
            select: { matched_id: true },
          }),
          this.prisma.bankTransaction.findMany({
            where: { matched_type: 'payment_in', matched_id: { in: ids }, match_status: 'matched' },
            select: { matched_id: true },
          }),
        ])
      : [[], []];
    const reconciledIds = new Set([
      ...matchEntries.map((m) => m.matched_id),
      ...legacyMatches.map((m) => m.matched_id!),
    ]);
    const enriched = data.map((d) => ({
      ...d,
      is_reconciled: reconciledIds.has(d.id),
    }));

    return { data: enriched, total, page, limit };
  }

  async findOne(id: number) {
    const record = await this.prisma.paymentIn.findUnique({
      where: { id },
      include: this.listInclude,
    });
    if (!record) throw new NotFoundException('收款記錄不存在');
    return record;
  }

  async create(dto: CreatePaymentInDto) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('金額必須大於 0');
    }
    // Auto-populate payer from source document if applicable
    let payerPartnerId = dto.payer_partner_id || null;
    let payerName = dto.payer_name || null;
    if (
      !payerPartnerId &&
      (dto.source_type === 'invoice' || dto.source_type === 'payment_certificate') &&
      dto.source_ref_id
    ) {
      payerPartnerId = await this.resolvePayerFromSource(dto.source_type, dto.source_ref_id);
    }

    const record = await this.prisma.paymentIn.create({
      data: {
        date: new Date(dto.date),
        amount: dto.amount,
        source_type: dto.source_type,
        source_ref_id: dto.source_ref_id || null,
        project_id: dto.project_id || null,
        contract_id: dto.contract_id || null,
        bank_account_id: dto.bank_account_id || null,
        reference_no: dto.reference_no || null,
        payment_method: dto.payment_method || null,
        remarks: dto.remarks || null,
        payment_in_status: dto.payment_in_status || 'paid',
        payer_partner_id: payerPartnerId,
        payer_name: payerName,
      },
      include: this.listInclude,
    });
    // Auto-recalculate source document (legacy path + allocations)
    await this.recalculatePaymentStatus(record.source_type, record.source_ref_id);
    await this.recalculateAllocationTargets(record.id);
    return record;
  }

  async update(id: number, dto: UpdatePaymentInDto) {
    const existing = await this.prisma.paymentIn.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收款記錄不存在');

    const data: Prisma.PaymentInUpdateInput = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.amount !== undefined) {
      if (dto.amount <= 0) throw new BadRequestException('金額必須大於 0');
      data.amount = dto.amount;
    }
    if (dto.source_type !== undefined) data.source_type = dto.source_type;
    if (dto.source_ref_id !== undefined) data.source_ref_id = dto.source_ref_id;
    if (dto.project_id !== undefined) {
      data.project = dto.project_id
        ? { connect: { id: dto.project_id } }
        : { disconnect: true };
    }
    if (dto.contract_id !== undefined) {
      data.contract = dto.contract_id
        ? { connect: { id: dto.contract_id } }
        : { disconnect: true };
    }
    if (dto.bank_account_id !== undefined) {
      data.bank_account = dto.bank_account_id
        ? { connect: { id: dto.bank_account_id } }
        : { disconnect: true };
    }
    if (dto.reference_no !== undefined) data.reference_no = dto.reference_no;
    if (dto.payment_method !== undefined) data.payment_method = dto.payment_method;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;
    if (dto.payment_in_status !== undefined)
      data.payment_in_status = dto.payment_in_status;
    if (dto.payer_partner_id !== undefined) {
      data.payer_partner = dto.payer_partner_id
        ? { connect: { id: dto.payer_partner_id } }
        : { disconnect: true };
    }
    if (dto.payer_name !== undefined) data.payer_name = dto.payer_name || null;

    const record = await this.prisma.paymentIn.update({
      where: { id },
      data,
      include: this.listInclude,
    });
    // Recalculate both legacy source (old + new) and any allocation targets.
    if (
      existing.source_type !== record.source_type ||
      existing.source_ref_id !== record.source_ref_id
    ) {
      await this.recalculatePaymentStatus(
        existing.source_type,
        existing.source_ref_id,
      );
    }
    await this.recalculatePaymentStatus(record.source_type, record.source_ref_id);
    await this.recalculateAllocationTargets(record.id);
    return record;
  }

  async remove(id: number) {
    const existing = await this.prisma.paymentIn.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收款記錄不存在');

    // Snapshot allocation targets before cascading delete wipes them.
    const allocs = await this.prisma.paymentInAllocation.findMany({
      where: { payment_in_allocation_payment_in_id: id },
      select: { payment_in_allocation_invoice_id: true },
    });

    await this.prisma.paymentIn.delete({ where: { id } });

    // Legacy recompute
    await this.recalculatePaymentStatus(
      existing.source_type,
      existing.source_ref_id,
    );
    // Allocation targets recompute
    for (const a of allocs) {
      if (a.payment_in_allocation_invoice_id) {
        await this.allocationService.recalculateInvoice(
          a.payment_in_allocation_invoice_id,
        );
      }
    }
    return { message: '已刪除' };
  }

  /**
   * Update payment_in_status (paid / unpaid)
   */
  async updateStatus(id: number, dto: UpdatePaymentInStatusDto) {
    const existing = await this.prisma.paymentIn.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收款記錄不存在');

    const record = await this.prisma.paymentIn.update({
      where: { id },
      data: { payment_in_status: dto.payment_in_status },
      include: this.listInclude,
    });
    // Auto-recalculate source document + allocation targets
    await this.recalculatePaymentStatus(record.source_type, record.source_ref_id);
    await this.recalculateAllocationTargets(record.id);
    return record;
  }

  // ── Filter Options ──────────────────────────────────────────
  async getFilterOptions(column: string): Promise<string[]> {
    const STATUS_LABELS: Record<string, string> = {
      unpaid: '未收款',
      partially_paid: '部分收款',
      paid: '已收款',
      cancelled: '取消',
    };
    const SOURCE_TYPE_LABELS: Record<string, string> = {
      payment_certificate: 'Payment Certificate',
      invoice: '發票',
      retention_release: '扣留金釋放',
      other: '其他收入',
    };
    if (column === 'payment_in_status') {
      const records = await this.prisma.paymentIn.findMany({
        select: { payment_in_status: true },
        distinct: ['payment_in_status'],
      });
      return records.map(r => STATUS_LABELS[r.payment_in_status] || r.payment_in_status || '-');
    }
    if (column === 'source_type') {
      // Fetch dynamic labels from source type table
      const sourceTypes = await this.prisma.paymentInSourceType.findMany({
        where: { is_active: true },
        orderBy: { sort_order: 'asc' },
      });
      const labelMap: Record<string, string> = {};
      sourceTypes.forEach(st => { labelMap[st.code] = st.label; });
      const records = await this.prisma.paymentIn.findMany({
        select: { source_type: true },
        distinct: ['source_type'],
      });
      return records.map(r => labelMap[r.source_type] || SOURCE_TYPE_LABELS[r.source_type] || r.source_type || '-');
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
      const records = await this.prisma.paymentIn.findMany({
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
      const records = await this.prisma.paymentIn.findMany({
        select: { reference_no: true },
        distinct: ['reference_no'],
        where: { reference_no: { not: null } },
        orderBy: { reference_no: 'asc' },
      });
      return records.map(r => r.reference_no!).filter(Boolean).sort();
    }
    if (column === 'remarks') {
      const records = await this.prisma.paymentIn.findMany({
        select: { remarks: true },
        distinct: ['remarks'],
        where: { remarks: { not: null } },
        orderBy: { remarks: 'asc' },
      });
      return records.map(r => r.remarks!).filter(Boolean).sort();
    }
    return [];
  }

  // ════════════════════════════════════════════════════════════
  // Shared: recalculatePaymentStatus
  // ══════════════════════════════════════════════════════════════

  /**
   * Recalculate paid_amount / outstanding / status for the source document
   * (Invoice or IPA) based on all related PaymentIn records with status='paid'.
   *
   * For Invoice we now delegate to the allocation-aware path so legacy
   * polymorphic rows and new allocation rows are combined without
   * double-counting.
   */
  async recalculatePaymentStatus(
    sourceType: string,
    sourceRefId: number | null,
  ): Promise<void> {
    if (!sourceRefId) return;

    if (sourceType === 'INVOICE' || sourceType === 'invoice') {
      await this.allocationService.recalculateInvoice(sourceRefId);
      return;
    }

    if (sourceType === 'IPA' || sourceType === 'payment_certificate') {
      // Sum only 'paid' payment-in records for the IPA case
      const payments = await this.prisma.paymentIn.findMany({
        where: {
          source_type: sourceType,
          source_ref_id: sourceRefId,
          payment_in_status: 'paid',
        },
      });
      const paidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const roundedPaid = Math.round(paidAmount * 100) / 100;
      const latestPaidDate =
        payments.length > 0
          ? payments.reduce(
              (latest, p) => {
                const d = new Date(p.date);
                return d > latest ? d : latest;
              },
              new Date(payments[0].date),
            )
          : null;
      await this.recalcIpa(sourceRefId, roundedPaid, latestPaidDate);
    }
  }

  /**
   * When a PaymentIn changes, also recompute every invoice target attached
   * via allocations.
   */
  private async recalculateAllocationTargets(paymentInId: number) {
    const allocs = await this.prisma.paymentInAllocation.findMany({
      where: { payment_in_allocation_payment_in_id: paymentInId },
      select: { payment_in_allocation_invoice_id: true },
    });
    for (const a of allocs) {
      if (a.payment_in_allocation_invoice_id) {
        await this.allocationService.recalculateInvoice(
          a.payment_in_allocation_invoice_id,
        );
      }
    }
  }

  // ── Find PaymentIn records by Invoice ID (via allocations) ─────────
  async findByInvoiceId(invoiceId: number) {
    const allocations = await this.prisma.paymentInAllocation.findMany({
      where: { payment_in_allocation_invoice_id: invoiceId },
      include: {
        payment_in: {
          include: {
            bank_account: {
              include: {
                company: { select: { id: true, name: true, internal_prefix: true } },
              },
            },
            deductions: true,
          },
        },
      },
      orderBy: { payment_in: { date: 'desc' } },
    });
    return allocations.map((a) => ({
      allocation_id: a.id,
      allocation_amount: a.payment_in_allocation_amount,
      allocation_remarks: a.payment_in_allocation_remarks,
      ...a.payment_in,
    }));
  }

  private async recalcIpa(
    paId: number,
    paidAmount: number,
    latestPaidDate: Date | null,
  ) {
    const pa = await this.prisma.paymentApplication.findUnique({
      where: { id: paId },
    });
    if (!pa) return;

    const totalAmount = Number(pa.client_current_due ?? pa.current_due);

    let status = pa.status;
    if (status !== 'void' && status !== 'draft' && status !== 'submitted') {
      if (paidAmount >= totalAmount && totalAmount > 0) {
        status = 'paid';
      } else if (paidAmount > 0) {
        status = 'partially_paid';
      } else {
        status = 'certified';
      }
    }

    await this.prisma.paymentApplication.update({
      where: { id: paId },
      data: {
        paid_amount: paidAmount,
        paid_date: latestPaidDate,
        status,
      },
    });
  }

  /**
   * Resolve payer_partner_id from source document (invoice or payment certificate).
   * Returns the client partner ID if found, otherwise null.
   */
  private async resolvePayerFromSource(
    sourceType: string,
    sourceRefId: number,
  ): Promise<number | null> {
    if (sourceType === 'invoice' || sourceType === 'INVOICE') {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: sourceRefId },
        select: { client_id: true },
      });
      return invoice?.client_id ?? null;
    }
    if (sourceType === 'payment_certificate' || sourceType === 'IPA') {
      const pa = await this.prisma.paymentApplication.findUnique({
        where: { id: sourceRefId },
        select: { project: { select: { client_id: true } } },
      });
      return pa?.project?.client_id ?? null;
    }
    return null;
  }
}
