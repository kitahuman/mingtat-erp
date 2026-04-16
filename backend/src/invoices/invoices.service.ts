import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhereClause } from '../common/types';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ── helpers ──────────────────────────────────────────────────
  private includeRelations = {
    client: {
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        contact_person: true,
        phone: true,
        fax: true,
        email: true,
      },
    },
    project: { select: { id: true, project_no: true, project_name: true } },
    quotation: { select: { id: true, quotation_no: true, project_name: true } },
    company: {
      select: {
        id: true,
        name: true,
        name_en: true,
        phone: true,
        address: true,
        internal_prefix: true,
      },
    },
    items: { orderBy: { sort_order: 'asc' as const } },
  };

  /**
   * Generate invoice number: {internal_prefix}S{YYYY}{SEQ:03d}
   * e.g. DCLSWH2026001 where internal_prefix=DCLSWH, S=Sale, 2026=year, 001=seq
   */
  private async generateInvoiceNo(
    companyId: number,
    date: Date,
  ): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    const prefix = company?.internal_prefix
      ? `${company.internal_prefix}S`
      : 'INVS';

    const year = String(date.getUTCFullYear());
    const yearMonth = year; // use year only for the sequence key

    return await this.prisma.$transaction(async (tx) => {
      let seq = await tx.invoiceSequence.findFirst({
        where: { prefix, year_month: yearMonth },
      });

      if (!seq) {
        seq = await tx.invoiceSequence.create({
          data: { prefix, year_month: yearMonth, last_seq: 0 },
        });
      }

      const updated = await tx.invoiceSequence.update({
        where: { id: seq.id },
        data: { last_seq: seq.last_seq + 1 },
      });

      return `${prefix}${year}${String(updated.last_seq).padStart(3, '0')}`;
    });
  }

  /**
   * Recalculate totals from items + retention + other_charges
   * total_amount = subtotal - retention_amount + sum(other_charges)
   */
  private calcTotals(
    items: {
      quantity: number | string | { toNumber?: () => number };
      unit_price: number | string | { toNumber?: () => number };
    }[],
    retentionRate: number,
    otherCharges: { name: string; amount: number }[] = [],
  ) {
    const subtotal = items.reduce((sum, item) => {
      return (
        sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
      );
    }, 0);
    const retentionAmount = subtotal * (retentionRate / 100);
    const otherTotal = otherCharges.reduce(
      (sum, c) => sum + (Number(c.amount) || 0),
      0,
    );
    const totalAmount = subtotal - retentionAmount + otherTotal;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      retention_amount: Math.round(retentionAmount * 100) / 100,
      total_amount: Math.round(totalAmount * 100) / 100,
    };
  }

  /**
   * Recalculate paid_amount and outstanding from PaymentIn records
   */
  private async recalcPayments(invoiceId: number) {
    const payments = await this.prisma.paymentIn.findMany({
      where: { source_type: 'invoice', source_ref_id: invoiceId },
    });
    const paidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) return;

    const totalAmount = Number(invoice.total_amount);
    const outstanding = Math.round((totalAmount - paidAmount) * 100) / 100;

    let status = invoice.status;
    if (status !== 'void' && status !== 'draft') {
      if (paidAmount >= totalAmount && totalAmount > 0) {
        status = 'paid';
      } else if (paidAmount > 0) {
        status = 'partially_paid';
      } else {
        status = 'issued';
      }
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paid_amount: Math.round(paidAmount * 100) / 100,
        outstanding: outstanding < 0 ? 0 : outstanding,
        status,
      },
    });
  }

  // ── CRUD ─────────────────────────────────────────────────────

  async findAll(query: {
    page?: number;
    limit?: number;
    status?: string;
    client_id?: number;
    project_id?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const where: WhereClause = { deleted_at: null };
    if (query.status) where.status = query.status;
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.project_id) where.project_id = Number(query.project_id);
    if (query.date_from || query.date_to) {
      where.date = {};
      if (query.date_from) where.date.gte = new Date(query.date_from);
      if (query.date_to) where.date.lte = new Date(query.date_to);
    }
    if (query.search) {
      where.OR = [
        { invoice_no: { contains: query.search, mode: 'insensitive' } },
        { invoice_title: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
        { client_contract_no: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: this.includeRelations,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: this.includeRelations,
    });
    if (!invoice) throw new NotFoundException('發票不存在');
    return invoice;
  }

  async create(
    dto: {
      date: string;
      due_date?: string;
      client_id?: number | string;
      project_id?: number | string;
      quotation_id?: number | string;
      company_id: number | string;
      invoice_title?: string;
      client_contract_no?: string;
      retention_rate?: number | string;
      other_charges?: { name: string; amount: number }[];
      payment_terms?: string;
      remarks?: string;
      items?: {
        item_name?: string;
        description?: string;
        quantity: number;
        unit?: string;
        unit_price: number;
        sort_order?: number;
      }[];
    },
    userId?: number,
    ipAddress?: string,
  ) {
    const companyId = Number(dto.company_id);
    if (!companyId) throw new BadRequestException('請選擇公司');

    const invoiceDate = new Date(dto.date);
    const invoiceNo = await this.generateInvoiceNo(companyId, invoiceDate);
    const retentionRate = Number(dto.retention_rate) || 0;
    const otherCharges: { name: string; amount: number }[] = Array.isArray(
      dto.other_charges,
    )
      ? dto.other_charges
      : [];
    const items = dto.items || [];
    const { subtotal, retention_amount, total_amount } = this.calcTotals(
      items,
      retentionRate,
      otherCharges,
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        invoice_no: invoiceNo,
        invoice_title: dto.invoice_title || null,
        client_contract_no: dto.client_contract_no || null,
        date: invoiceDate,
        due_date: dto.due_date ? new Date(dto.due_date) : null,
        client_id: dto.client_id ? Number(dto.client_id) : null,
        project_id: dto.project_id ? Number(dto.project_id) : null,
        quotation_id: dto.quotation_id ? Number(dto.quotation_id) : null,
        company_id: companyId,
        retention_rate: retentionRate,
        retention_amount,
        other_charges: otherCharges.length > 0 ? (otherCharges as any) : null,
        subtotal,
        tax_rate: 0,
        tax_amount: 0,
        total_amount,
        outstanding: total_amount,
        payment_terms: dto.payment_terms || null,
        remarks: dto.remarks || null,
        items: {
          create: items.map((item, idx) => ({
            item_name: item.item_name || null,
            description: item.description || null,
            quantity: item.quantity || 0,
            unit: item.unit || null,
            unit_price: item.unit_price || 0,
            amount:
              Math.round(
                (Number(item.quantity) || 0) *
                  (Number(item.unit_price) || 0) *
                  100,
              ) / 100,
            sort_order: item.sort_order || idx + 1,
          })),
        },
      },
      include: this.includeRelations,
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'invoices',
          targetId: invoice.id,
          changesAfter: invoice,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return invoice;
  }

  /**
   * Create invoice from quotation
   */
  async createFromQuotation(
    quotationId: number,
    dto?: {
      date?: string;
      due_date?: string;
      retention_rate?: number;
      payment_terms?: string;
      remarks?: string;
    },
    userId?: number,
  ) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        items: { orderBy: { sort_order: 'asc' } },
        client: true,
        company: true,
      },
    });

    if (!quotation) throw new NotFoundException('報價單不存在');

    // Check if already converted
    const existing = await this.prisma.invoice.findFirst({
      where: { quotation_id: quotationId },
    });
    if (existing) {
      throw new BadRequestException(
        `此報價單已轉為發票 ${existing.invoice_no}`,
      );
    }

    const invoiceDate = dto?.date ? new Date(dto.date) : new Date();
    const invoiceNo = await this.generateInvoiceNo(
      quotation.company_id,
      invoiceDate,
    );
    const retentionRate = dto?.retention_rate || 0;

    const items = (quotation.items || []).map((item, idx) => ({
      item_name: item.item_name || null,
      description: item.item_description || null,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || null,
      unit_price: Number(item.unit_price) || 0,
      amount:
        Math.round(
          (Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100,
        ) / 100,
      sort_order: idx + 1,
    }));

    const { subtotal, retention_amount, total_amount } = this.calcTotals(
      items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price })),
      retentionRate,
      [],
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        invoice_no: invoiceNo,
        date: invoiceDate,
        due_date: dto?.due_date ? new Date(dto.due_date) : null,
        client_id: quotation.client_id,
        project_id: quotation.project_id,
        quotation_id: quotationId,
        company_id: quotation.company_id,
        retention_rate: retentionRate,
        retention_amount,
        tax_rate: 0,
        tax_amount: 0,
        subtotal,
        total_amount,
        outstanding: total_amount,
        payment_terms: dto?.payment_terms || quotation.payment_terms || null,
        remarks: dto?.remarks || null,
        items: {
          create: items,
        },
      },
      include: this.includeRelations,
    });

    // Mark quotation as invoiced
    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'invoiced' },
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'invoices',
          targetId: invoice.id,
          changesAfter: invoice,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return invoice;
  }

  async update(id: number, dto: any, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('發票不存在');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.due_date !== undefined)
      data.due_date = dto.due_date ? new Date(dto.due_date) : null;
    if (dto.client_id !== undefined)
      data.client_id = dto.client_id ? Number(dto.client_id) : null;
    if (dto.project_id !== undefined)
      data.project_id = dto.project_id ? Number(dto.project_id) : null;
    if (dto.quotation_id !== undefined)
      data.quotation_id = dto.quotation_id ? Number(dto.quotation_id) : null;
    if (dto.invoice_title !== undefined)
      data.invoice_title = dto.invoice_title || null;
    if (dto.client_contract_no !== undefined)
      data.client_contract_no = dto.client_contract_no || null;
    if (dto.retention_rate !== undefined)
      data.retention_rate = Number(dto.retention_rate) || 0;
    if (dto.payment_terms !== undefined) data.payment_terms = dto.payment_terms;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;

    // Update items if provided
    if (dto.items) {
      await this.prisma.invoiceItem.deleteMany({ where: { invoice_id: id } });
      const retentionRate =
        dto.retention_rate !== undefined
          ? Number(dto.retention_rate)
          : Number(existing.retention_rate);
      const otherCharges: { name: string; amount: number }[] = Array.isArray(
        dto.other_charges,
      )
        ? dto.other_charges
        : [];
      const { subtotal, retention_amount, total_amount } = this.calcTotals(
        dto.items,
        retentionRate,
        otherCharges,
      );
      data.subtotal = subtotal;
      data.retention_amount = retention_amount;
      data.total_amount = total_amount;
      data.outstanding =
        Math.round((total_amount - Number(existing.paid_amount)) * 100) / 100;
      if (data.outstanding < 0) data.outstanding = 0;
      if (dto.other_charges !== undefined)
        data.other_charges = otherCharges.length > 0 ? otherCharges : null;

      await this.prisma.invoiceItem.createMany({
        data: dto.items.map((item: any, idx: number) => ({
          invoice_id: id,
          item_name: item.item_name || null,
          description: item.description || null,
          quantity: item.quantity || 0,
          unit: item.unit || null,
          unit_price: item.unit_price || 0,
          amount:
            Math.round(
              (Number(item.quantity) || 0) *
                (Number(item.unit_price) || 0) *
                100,
            ) / 100,
          sort_order: item.sort_order || idx + 1,
        })),
      });
    } else if (
      dto.other_charges !== undefined ||
      dto.retention_rate !== undefined
    ) {
      // Recalculate totals even if items not changed
      const currentItems = await this.prisma.invoiceItem.findMany({
        where: { invoice_id: id },
      });
      const retentionRate =
        dto.retention_rate !== undefined
          ? Number(dto.retention_rate)
          : Number(existing.retention_rate);
      const otherCharges: { name: string; amount: number }[] = Array.isArray(
        dto.other_charges,
      )
        ? dto.other_charges
        : (existing.other_charges as any) || [];
      const { subtotal, retention_amount, total_amount } = this.calcTotals(
        currentItems,
        retentionRate,
        otherCharges,
      );
      data.subtotal = subtotal;
      data.retention_amount = retention_amount;
      data.total_amount = total_amount;
      data.outstanding =
        Math.round((total_amount - Number(existing.paid_amount)) * 100) / 100;
      if (data.outstanding < 0) data.outstanding = 0;
      if (dto.other_charges !== undefined)
        data.other_charges = otherCharges.length > 0 ? otherCharges : null;
    }

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data,
      include: this.includeRelations,
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'invoices',
          targetId: id,
          changesBefore: existing,
          changesAfter: invoice,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return invoice;
  }

  async updateStatus(id: number, status: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('發票不存在');

    const validStatuses = ['draft', 'issued', 'partially_paid', 'paid', 'void'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`無效狀態: ${status}`);
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status },
      include: this.includeRelations,
    });
  }

  /**
   * Record a payment for this invoice → creates PaymentIn record
   */
  async recordPayment(
    invoiceId: number,
    dto: {
      date: string;
      amount: number;
      bank_account_id?: number | null;
      reference_no?: string;
      remarks?: string;
    },
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { project: true },
    });
    if (!invoice) throw new NotFoundException('發票不存在');
    if (invoice.status === 'void')
      throw new BadRequestException('已作廢的發票無法收款');

    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('收款金額必須大於 0');
    }

    const paymentIn = await this.prisma.paymentIn.create({
      data: {
        date: new Date(dto.date),
        amount: dto.amount,
        source_type: 'invoice',
        source_ref_id: invoiceId,
        project_id: invoice.project_id || null,
        bank_account_id: dto.bank_account_id || null,
        reference_no: dto.reference_no || null,
        remarks: dto.remarks || `發票 ${invoice.invoice_no} 收款`,
      },
    });

    await this.recalcPayments(invoiceId);
    return this.findOne(invoiceId);
  }

  /**
   * Delete a payment record for this invoice
   */
  async deletePayment(invoiceId: number, paymentId: number) {
    const payment = await this.prisma.paymentIn.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('收款記錄不存在');
    if (
      payment.source_type !== 'invoice' ||
      payment.source_ref_id !== invoiceId
    ) {
      throw new BadRequestException('此收款記錄不屬於此發票');
    }

    await this.prisma.paymentIn.delete({ where: { id: paymentId } });
    await this.recalcPayments(invoiceId);

    return this.findOne(invoiceId);
  }

  /**
   * Get all payment records for this invoice
   */
  async getPayments(invoiceId: number) {
    return this.prisma.paymentIn.findMany({
      where: { source_type: 'invoice', source_ref_id: invoiceId },
      orderBy: { date: 'desc' },
    });
  }

  async delete(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('發票不存在');
    if (existing.status === 'paid')
      throw new BadRequestException('已付款的發票無法刪除');

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'invoices',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    await this.prisma.invoice.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId ?? null },
    });
    return { success: true };
  }
}
