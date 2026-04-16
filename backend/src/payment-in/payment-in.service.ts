import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentInDto, UpdatePaymentInDto, UpdatePaymentInStatusDto } from './dto/create-payment-in.dto';

@Injectable()
export class PaymentInService {
  constructor(private prisma: PrismaService) {}

  // ── Shared include for queries ──
  private includeRelations = {
    project: { select: { id: true, project_no: true, project_name: true } },
    contract: { select: { id: true, contract_no: true, contract_name: true } },
    bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
  };

  async findAll(query: {
    page?: number;
    limit?: number;
    source_type?: string;
    source_ref_id?: number;
    project_id?: number;
    contract_id?: number;
    date_from?: string;
    date_to?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.source_type) where.source_type = query.source_type;
    if (query.source_ref_id) where.source_ref_id = query.source_ref_id;
    if (query.project_id) where.project_id = query.project_id;
    if (query.contract_id) where.contract_id = query.contract_id;
    if (query.date_from || query.date_to) {
      const dateFilter: Record<string, Date> = {};
      if (query.date_from) dateFilter.gte = new Date(query.date_from);
      if (query.date_to) dateFilter.lte = new Date(query.date_to);
      where.date = dateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.paymentIn.findMany({
        where,
        include: this.includeRelations,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.paymentIn.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const record = await this.prisma.paymentIn.findUnique({
      where: { id },
      include: this.includeRelations,
    });
    if (!record) throw new NotFoundException('收款記錄不存在');
    return record;
  }

  async create(dto: CreatePaymentInDto) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('金額必須大於 0');
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
        remarks: dto.remarks || null,
        payment_in_status: dto.payment_in_status || 'paid',
      },
      include: this.includeRelations,
    });
    // Auto-recalculate source document
    await this.recalculatePaymentStatus(record.source_type, record.source_ref_id);
    return record;
  }

  async update(id: number, dto: UpdatePaymentInDto) {
    const existing = await this.prisma.paymentIn.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收款記錄不存在');

    const data: Record<string, unknown> = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.amount !== undefined) {
      if (dto.amount <= 0) throw new BadRequestException('金額必須大於 0');
      data.amount = dto.amount;
    }
    if (dto.source_type !== undefined) data.source_type = dto.source_type;
    if (dto.source_ref_id !== undefined) data.source_ref_id = dto.source_ref_id;
    if (dto.project_id !== undefined) data.project_id = dto.project_id || null;
    if (dto.contract_id !== undefined) data.contract_id = dto.contract_id || null;
    if (dto.bank_account_id !== undefined) data.bank_account_id = dto.bank_account_id || null;
    if (dto.reference_no !== undefined) data.reference_no = dto.reference_no;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;
    if (dto.payment_in_status !== undefined) data.payment_in_status = dto.payment_in_status;

    const record = await this.prisma.paymentIn.update({
      where: { id },
      data,
      include: this.includeRelations,
    });
    // Auto-recalculate source document
    await this.recalculatePaymentStatus(record.source_type, record.source_ref_id);
    return record;
  }

  async remove(id: number) {
    const existing = await this.prisma.paymentIn.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收款記錄不存在');
    await this.prisma.paymentIn.delete({ where: { id } });
    // Auto-recalculate source document
    await this.recalculatePaymentStatus(existing.source_type, existing.source_ref_id);
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
      include: this.includeRelations,
    });
    // Auto-recalculate source document
    await this.recalculatePaymentStatus(record.source_type, record.source_ref_id);
    return record;
  }

  // ══════════════════════════════════════════════════════════════
  // Shared: recalculatePaymentStatus
  // ══════════════════════════════════════════════════════════════

  /**
   * Recalculate paid_amount / outstanding / status for the source document
   * (Invoice or IPA) based on all related PaymentIn records with status='paid'.
   */
  async recalculatePaymentStatus(
    sourceType: string,
    sourceRefId: number | null,
  ): Promise<void> {
    if (!sourceRefId) return;

    // Sum only 'paid' payment-in records
    const payments = await this.prisma.paymentIn.findMany({
      where: {
        source_type: sourceType,
        source_ref_id: sourceRefId,
        payment_in_status: 'paid',
      },
    });
    const paidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const roundedPaid = Math.round(paidAmount * 100) / 100;

    // Find latest paid date
    const latestPaidDate = payments.length > 0
      ? payments.reduce((latest, p) => {
          const d = new Date(p.date);
          return d > latest ? d : latest;
        }, new Date(payments[0].date))
      : null;

    if (sourceType === 'INVOICE' || sourceType === 'invoice') {
      await this.recalcInvoice(sourceRefId, roundedPaid);
    } else if (sourceType === 'IPA' || sourceType === 'payment_certificate') {
      await this.recalcIpa(sourceRefId, roundedPaid, latestPaidDate);
    }
  }

  private async recalcInvoice(invoiceId: number, paidAmount: number) {
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
        paid_amount: paidAmount,
        outstanding: outstanding < 0 ? 0 : outstanding,
        status,
      },
    });
  }

  private async recalcIpa(paId: number, paidAmount: number, latestPaidDate: Date | null) {
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
}
