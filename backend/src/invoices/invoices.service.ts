import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  // ── helpers ──────────────────────────────────────────────────
  private includeRelations = {
    client: { select: { id: true, name: true, code: true, address: true, contact_person: true, phone: true, fax: true, email: true } },
    project: { select: { id: true, project_no: true, project_name: true } },
    quotation: { select: { id: true, quotation_no: true, project_name: true } },
    company: { select: { id: true, name: true, name_en: true, phone: true, address: true } },
    items: { orderBy: { sort_order: 'asc' as const } },
  };

  /**
   * Generate invoice number: INV-YYYYMM-XXX
   */
  private async generateInvoiceNo(date: Date): Promise<string> {
    const prefix = 'INV';
    const yearMonth = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    const seq = await this.prisma.invoiceSequence.upsert({
      where: { prefix_year_month: { prefix, year_month: yearMonth } },
      update: { last_seq: { increment: 1 } },
      create: { prefix, year_month: yearMonth, last_seq: 1 },
    });

    return `${prefix}-${yearMonth}-${String(seq.last_seq).padStart(3, '0')}`;
  }

  /**
   * Recalculate totals from items
   */
  private calcTotals(items: { quantity: number; unit_price: number }[], taxRate: number) {
    const subtotal = items.reduce((sum, item) => {
      return sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
    }, 0);
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax_amount: Math.round(taxAmount * 100) / 100,
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

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
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

    const where: any = {};
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
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
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

  async create(dto: {
    date: string;
    due_date?: string;
    client_id?: number;
    project_id?: number;
    company_id: number;
    tax_rate?: number;
    payment_terms?: string;
    remarks?: string;
    items?: {
      description?: string;
      quantity: number;
      unit?: string;
      unit_price: number;
      sort_order?: number;
    }[];
  }) {
    const invoiceDate = new Date(dto.date);
    const invoiceNo = await this.generateInvoiceNo(invoiceDate);
    const taxRate = dto.tax_rate || 0;
    const items = dto.items || [];
    const { subtotal, tax_amount, total_amount } = this.calcTotals(items, taxRate);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoice_no: invoiceNo,
        date: invoiceDate,
        due_date: dto.due_date ? new Date(dto.due_date) : null,
        client_id: dto.client_id || null,
        project_id: dto.project_id || null,
        company_id: dto.company_id,
        tax_rate: taxRate,
        subtotal,
        tax_amount,
        total_amount,
        outstanding: total_amount,
        payment_terms: dto.payment_terms || null,
        remarks: dto.remarks || null,
        items: {
          create: items.map((item, idx) => ({
            description: item.description || null,
            quantity: item.quantity || 0,
            unit: item.unit || null,
            unit_price: item.unit_price || 0,
            amount: Math.round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100) / 100,
            sort_order: item.sort_order || idx + 1,
          })),
        },
      },
      include: this.includeRelations,
    });

    return invoice;
  }

  /**
   * Create invoice from quotation
   */
  async createFromQuotation(quotationId: number, dto?: {
    date?: string;
    due_date?: string;
    tax_rate?: number;
    payment_terms?: string;
    remarks?: string;
  }) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { items: { orderBy: { sort_order: 'asc' } }, client: true, company: true },
    });

    if (!quotation) throw new NotFoundException('報價單不存在');

    // Check if already converted
    const existing = await this.prisma.invoice.findFirst({
      where: { quotation_id: quotationId },
    });
    if (existing) {
      throw new BadRequestException(`此報價單已轉為發票 ${existing.invoice_no}`);
    }

    const invoiceDate = dto?.date ? new Date(dto.date) : new Date();
    const invoiceNo = await this.generateInvoiceNo(invoiceDate);
    const taxRate = dto?.tax_rate || 0;

    const items = (quotation.items || []).map((item, idx) => ({
      description: [item.item_name, item.item_description].filter(Boolean).join(' - ') || null,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || null,
      unit_price: Number(item.unit_price) || 0,
      amount: Math.round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100) / 100,
      sort_order: idx + 1,
    }));

    const { subtotal, tax_amount, total_amount } = this.calcTotals(
      items.map(i => ({ quantity: i.quantity, unit_price: i.unit_price })),
      taxRate,
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
        tax_rate: taxRate,
        subtotal,
        tax_amount,
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

    return invoice;
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('發票不存在');

    const data: any = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.due_date !== undefined) data.due_date = dto.due_date ? new Date(dto.due_date) : null;
    if (dto.client_id !== undefined) data.client_id = dto.client_id || null;
    if (dto.project_id !== undefined) data.project_id = dto.project_id || null;
    if (dto.tax_rate !== undefined) data.tax_rate = dto.tax_rate;
    if (dto.payment_terms !== undefined) data.payment_terms = dto.payment_terms;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;

    // Update items if provided
    if (dto.items) {
      // Delete existing items and recreate
      await this.prisma.invoiceItem.deleteMany({ where: { invoice_id: id } });
      const taxRate = dto.tax_rate !== undefined ? dto.tax_rate : Number(existing.tax_rate);
      const { subtotal, tax_amount, total_amount } = this.calcTotals(dto.items, taxRate);
      data.subtotal = subtotal;
      data.tax_amount = tax_amount;
      data.total_amount = total_amount;
      data.outstanding = Math.round((total_amount - Number(existing.paid_amount)) * 100) / 100;
      if (data.outstanding < 0) data.outstanding = 0;

      await this.prisma.invoiceItem.createMany({
        data: dto.items.map((item: any, idx: number) => ({
          invoice_id: id,
          description: item.description || null,
          quantity: item.quantity || 0,
          unit: item.unit || null,
          unit_price: item.unit_price || 0,
          amount: Math.round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100) / 100,
          sort_order: item.sort_order || idx + 1,
        })),
      });
    }

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data,
      include: this.includeRelations,
    });

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
  async recordPayment(invoiceId: number, dto: {
    date: string;
    amount: number;
    bank_account?: string;
    reference_no?: string;
    remarks?: string;
  }) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { project: true },
    });
    if (!invoice) throw new NotFoundException('發票不存在');
    if (invoice.status === 'void') throw new BadRequestException('已作廢的發票無法收款');

    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('收款金額必須大於 0');
    }

    // Create PaymentIn record
    const paymentIn = await this.prisma.paymentIn.create({
      data: {
        date: new Date(dto.date),
        amount: dto.amount,
        source_type: 'invoice',
        source_ref_id: invoiceId,
        project_id: invoice.project_id || null,
        bank_account: dto.bank_account || null,
        reference_no: dto.reference_no || null,
        remarks: dto.remarks || `發票 ${invoice.invoice_no} 收款`,
      },
    });

    // Recalculate paid amounts and status
    await this.recalcPayments(invoiceId);

    // Return updated invoice
    return this.findOne(invoiceId);
  }

  /**
   * Delete a payment record for this invoice
   */
  async deletePayment(invoiceId: number, paymentId: number) {
    const payment = await this.prisma.paymentIn.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('收款記錄不存在');
    if (payment.source_type !== 'invoice' || payment.source_ref_id !== invoiceId) {
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

  async remove(id: number) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('發票不存在');

    // Check if there are payments
    const payments = await this.prisma.paymentIn.count({
      where: { source_type: 'invoice', source_ref_id: id },
    });
    if (payments > 0) {
      throw new BadRequestException('此發票已有收款記錄，無法刪除。請先刪除所有收款記錄或將發票作廢。');
    }

    // If created from quotation, revert quotation status
    if (existing.quotation_id) {
      await this.prisma.quotation.update({
        where: { id: existing.quotation_id },
        data: { status: 'accepted' },
      }).catch(() => {});
    }

    await this.prisma.invoice.delete({ where: { id } });
    return { message: '已刪除' };
  }
}
