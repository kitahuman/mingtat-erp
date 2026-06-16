import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentInDeductionDto,
  UpdatePaymentInDeductionDto,
} from './dto/payment-in-deduction.dto';

@Injectable()
export class PaymentInDeductionsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly includeRelations = {
    payment_in: {
      select: {
        id: true,
        date: true,
        amount: true,
        reference_no: true,
        payment_in_status: true,
      },
    },
    invoice: {
      select: {
        id: true,
        invoice_no: true,
        invoice_title: true,
        total_amount: true,
        paid_amount: true,
        retention_amount: true,
        outstanding: true,
        status: true,
      },
    },
  } satisfies Prisma.PaymentInDeductionInclude;

  // ── List by PaymentIn ──────────────────────────────────────────

  async listByPaymentIn(paymentInId: number) {
    return this.prisma.paymentInDeduction.findMany({
      where: { payment_in_deduction_payment_in_id: paymentInId },
      include: this.includeRelations,
      orderBy: { id: 'asc' },
    });
  }

  // ── List by Invoice (Retention only) ───────────────────────────

  async listByInvoice(invoiceId: number) {
    return this.prisma.paymentInDeduction.findMany({
      where: {
        payment_in_deduction_invoice_id: invoiceId,
        payment_in_deduction_type: 'retention',
      },
      include: this.includeRelations,
      orderBy: { id: 'asc' },
    });
  }

  // ── Create ─────────────────────────────────────────────────────

  async create(dto: CreatePaymentInDeductionDto) {
    // Validate: retention must have invoice_id
    if (
      dto.payment_in_deduction_type === 'retention' &&
      !dto.payment_in_deduction_invoice_id
    ) {
      throw new BadRequestException(
        'Retention 類型必須關聯發票（payment_in_deduction_invoice_id）',
      );
    }

    // Validate payment_in exists
    const paymentIn = await this.prisma.paymentIn.findUnique({
      where: { id: dto.payment_in_deduction_payment_in_id },
    });
    if (!paymentIn) throw new NotFoundException('收款記錄不存在');

    // Validate invoice exists if provided
    if (dto.payment_in_deduction_invoice_id) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: dto.payment_in_deduction_invoice_id },
      });
      if (!invoice) throw new NotFoundException('發票不存在');
    }

    const created = await this.prisma.paymentInDeduction.create({
      data: {
        payment_in_deduction_payment_in_id:
          dto.payment_in_deduction_payment_in_id,
        payment_in_deduction_invoice_id:
          dto.payment_in_deduction_invoice_id ?? null,
        payment_in_deduction_type: dto.payment_in_deduction_type,
        payment_in_deduction_amount: dto.payment_in_deduction_amount,
        payment_in_deduction_remarks: dto.payment_in_deduction_remarks,
      },
      include: this.includeRelations,
    });

    // Recalculate invoice retention if applicable
    if (
      dto.payment_in_deduction_type === 'retention' &&
      dto.payment_in_deduction_invoice_id
    ) {
      await this.recalculateInvoiceRetention(
        dto.payment_in_deduction_invoice_id,
      );
    }

    return created;
  }

  // ── Update ─────────────────────────────────────────────────────

  async update(id: number, dto: UpdatePaymentInDeductionDto) {
    const existing = await this.prisma.paymentInDeduction.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('扣減記錄不存在');

    const newType =
      dto.payment_in_deduction_type ?? existing.payment_in_deduction_type;
    const newInvoiceId =
      dto.payment_in_deduction_invoice_id !== undefined
        ? dto.payment_in_deduction_invoice_id
        : existing.payment_in_deduction_invoice_id;

    // Validate: retention must have invoice_id
    if (newType === 'retention' && !newInvoiceId) {
      throw new BadRequestException(
        'Retention 類型必須關聯發票（payment_in_deduction_invoice_id）',
      );
    }

    // Validate invoice exists if provided
    if (newInvoiceId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: newInvoiceId },
      });
      if (!invoice) throw new NotFoundException('發票不存在');
    }

    const data: Prisma.PaymentInDeductionUpdateInput = {};
    if (dto.payment_in_deduction_type !== undefined)
      data.payment_in_deduction_type = dto.payment_in_deduction_type;
    if (dto.payment_in_deduction_amount !== undefined)
      data.payment_in_deduction_amount = dto.payment_in_deduction_amount;
    if (dto.payment_in_deduction_remarks !== undefined)
      data.payment_in_deduction_remarks = dto.payment_in_deduction_remarks;
    if (dto.payment_in_deduction_invoice_id !== undefined) {
      if (dto.payment_in_deduction_invoice_id === null) {
        data.invoice = { disconnect: true };
      } else {
        data.invoice = { connect: { id: dto.payment_in_deduction_invoice_id } };
      }
    }

    const updated = await this.prisma.paymentInDeduction.update({
      where: { id },
      data,
      include: this.includeRelations,
    });

    // Recalculate old invoice retention if it was retention type
    if (
      existing.payment_in_deduction_type === 'retention' &&
      existing.payment_in_deduction_invoice_id
    ) {
      await this.recalculateInvoiceRetention(
        existing.payment_in_deduction_invoice_id,
      );
    }

    // Recalculate new invoice retention if applicable
    if (newType === 'retention' && newInvoiceId) {
      await this.recalculateInvoiceRetention(newInvoiceId);
    }

    return updated;
  }

  // ── Delete ─────────────────────────────────────────────────────

  async remove(id: number) {
    const existing = await this.prisma.paymentInDeduction.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('扣減記錄不存在');

    await this.prisma.paymentInDeduction.delete({ where: { id } });

    // Recalculate invoice retention if applicable
    if (
      existing.payment_in_deduction_type === 'retention' &&
      existing.payment_in_deduction_invoice_id
    ) {
      await this.recalculateInvoiceRetention(
        existing.payment_in_deduction_invoice_id,
      );
    }

    return { message: '已刪除' };
  }

  // ══════════════════════════════════════════════════════════════════
  // Recalculate invoice retention_amount and outstanding/status
  // ══════════════════════════════════════════════════════════════════

  async recalculateInvoiceRetention(invoiceId: number): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        total_amount: true,
        paid_amount: true,
        status: true,
      },
    });
    if (!invoice) return;

    // Sum all retention deductions for this invoice
    const result = await this.prisma.paymentInDeduction.aggregate({
      where: {
        payment_in_deduction_invoice_id: invoiceId,
        payment_in_deduction_type: 'retention',
      },
      _sum: { payment_in_deduction_amount: true },
    });

    const retentionAmount =
      Math.round(
        Number(result._sum.payment_in_deduction_amount ?? 0) * 100,
      ) / 100;
    const totalAmount = Number(invoice.total_amount) || 0;
    const paidAmount = Number(invoice.paid_amount) || 0;
    const outstanding =
      Math.round((totalAmount - paidAmount - retentionAmount) * 100) / 100;

    // Determine status
    let status = invoice.status;
    if (status !== 'void' && status !== 'draft') {
      if (paidAmount + retentionAmount >= totalAmount && totalAmount > 0) {
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
        retention_amount: retentionAmount,
        outstanding: outstanding < 0 ? 0 : outstanding,
        status,
      },
    });
  }
}
