import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentInAllocationDto,
  PaymentInAllocationCandidate,
  PaymentInAllocationSearchQueryDto,
  UpdatePaymentInAllocationDto,
} from './dto/payment-in-allocation.dto';

interface AllocationTargetSnapshot {
  invoiceId: number | null;
}

@Injectable()
export class PaymentInAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ─────────────────────────────────────────────────────

  private allocationInclude = {
    payment_in: {
      select: {
        id: true,
        date: true,
        amount: true,
        payment_in_status: true,
        source_type: true,
        reference_no: true,
      },
    },
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
      },
    },
  } satisfies Prisma.PaymentInAllocationInclude;

  private validateExactlyOneTarget(dto: {
    payment_in_allocation_invoice_id?: number | null;
  }): void {
    const targets = [dto.payment_in_allocation_invoice_id].filter(
      (v): v is number => v != null && v > 0,
    );
    if (targets.length !== 1) {
      throw new BadRequestException(
        '必須指定且僅能指定一個關聯單據（invoice）',
      );
    }
  }

  // ── List / Find ─────────────────────────────────────────────────

  async listByPaymentIn(paymentInId: number) {
    return this.prisma.paymentInAllocation.findMany({
      where: { payment_in_allocation_payment_in_id: paymentInId },
      include: this.allocationInclude,
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const record = await this.prisma.paymentInAllocation.findUnique({
      where: { id },
      include: this.allocationInclude,
    });
    if (!record) throw new NotFoundException('收款分配記錄不存在');
    return record;
  }

  // ── Create ──────────────────────────────────────────────────────

  async create(dto: CreatePaymentInAllocationDto) {
    this.validateExactlyOneTarget(dto);

    const paymentIn = await this.prisma.paymentIn.findUnique({
      where: { id: dto.payment_in_allocation_payment_in_id },
      select: { id: true, amount: true },
    });
    if (!paymentIn) throw new NotFoundException('收款記錄不存在');

    // Safety: warn if total allocated would exceed PaymentIn.amount.
    const existing = await this.prisma.paymentInAllocation.aggregate({
      where: {
        payment_in_allocation_payment_in_id:
          dto.payment_in_allocation_payment_in_id,
      },
      _sum: { payment_in_allocation_amount: true },
    });
    const allocatedTotal = Number(
      existing._sum.payment_in_allocation_amount ?? 0,
    );
    const newTotal = allocatedTotal + Number(dto.payment_in_allocation_amount);
    const paymentInAmount = Number(paymentIn.amount);
    if (newTotal > paymentInAmount + 0.0001) {
      throw new BadRequestException(
        `分配金額總和 (${newTotal.toFixed(2)}) 超過收款金額 (${paymentInAmount.toFixed(
          2,
        )})`,
      );
    }

    const created = await this.prisma.paymentInAllocation.create({
      data: {
        payment_in_allocation_payment_in_id:
          dto.payment_in_allocation_payment_in_id,
        payment_in_allocation_invoice_id:
          dto.payment_in_allocation_invoice_id ?? null,
        payment_in_allocation_amount: dto.payment_in_allocation_amount,
        payment_in_allocation_remarks:
          dto.payment_in_allocation_remarks ?? null,
      },
      include: this.allocationInclude,
    });

    await this.recalculateForTarget({
      invoiceId: created.payment_in_allocation_invoice_id,
    });

    return created;
  }

  // ── Update ──────────────────────────────────────────────────────

  async update(id: number, dto: UpdatePaymentInAllocationDto) {
    const existing = await this.prisma.paymentInAllocation.findUnique({
      where: { id },
      select: {
        id: true,
        payment_in_allocation_payment_in_id: true,
        payment_in_allocation_invoice_id: true,
        payment_in_allocation_amount: true,
      },
    });
    if (!existing) throw new NotFoundException('收款分配記錄不存在');

    if (dto.payment_in_allocation_amount !== undefined) {
      const paymentIn = await this.prisma.paymentIn.findUnique({
        where: { id: existing.payment_in_allocation_payment_in_id },
        select: { amount: true },
      });
      if (!paymentIn) throw new NotFoundException('收款記錄不存在');

      const others = await this.prisma.paymentInAllocation.aggregate({
        where: {
          payment_in_allocation_payment_in_id:
            existing.payment_in_allocation_payment_in_id,
          NOT: { id },
        },
        _sum: { payment_in_allocation_amount: true },
      });
      const otherTotal = Number(others._sum.payment_in_allocation_amount ?? 0);
      const newTotal = otherTotal + Number(dto.payment_in_allocation_amount);
      const paymentInAmount = Number(paymentIn.amount);
      if (newTotal > paymentInAmount + 0.0001) {
        throw new BadRequestException(
          `分配金額總和 (${newTotal.toFixed(
            2,
          )}) 超過收款金額 (${paymentInAmount.toFixed(2)})`,
        );
      }
    }

    const updated = await this.prisma.paymentInAllocation.update({
      where: { id },
      data: {
        ...(dto.payment_in_allocation_amount !== undefined && {
          payment_in_allocation_amount: dto.payment_in_allocation_amount,
        }),
        ...(dto.payment_in_allocation_remarks !== undefined && {
          payment_in_allocation_remarks:
            dto.payment_in_allocation_remarks ?? null,
        }),
      },
      include: this.allocationInclude,
    });

    await this.recalculateForTarget({
      invoiceId: updated.payment_in_allocation_invoice_id,
    });

    return updated;
  }

  // ── Delete ──────────────────────────────────────────────────────

  async remove(id: number) {
    const existing = await this.prisma.paymentInAllocation.findUnique({
      where: { id },
      select: {
        id: true,
        payment_in_allocation_invoice_id: true,
      },
    });
    if (!existing) throw new NotFoundException('收款分配記錄不存在');

    await this.prisma.paymentInAllocation.delete({ where: { id } });

    await this.recalculateForTarget({
      invoiceId: existing.payment_in_allocation_invoice_id,
    });

    return { message: '已刪除' };
  }

  // ══════════════════════════════════════════════════════════════════
  // Status recomputation (allocation-aware).
  //
  // For backward compatibility we keep counting legacy polymorphic rows
  // (PaymentIn.source_type='invoice' + source_ref_id=invoiceId) when no
  // allocation row exists for that PaymentIn against the same invoice.
  // This way old data without allocations still works.
  // ══════════════════════════════════════════════════════════════════

  async recalculateForTarget(target: AllocationTargetSnapshot): Promise<void> {
    if (target.invoiceId) await this.recalculateInvoice(target.invoiceId);
  }

  /**
   * Compute the total paid amount for an Invoice.
   * Counts:
   *   - allocations whose PaymentIn is `paid`
   *   - PLUS legacy direct PaymentIn where source_type='invoice'
   *     (case-insensitive) and source_ref_id=invoiceId, provided that
   *     PaymentIn has NO allocation row pointing back at the same
   *     invoice (so we don't double-count after migration).
   */
  async computeInvoicePaidTotal(invoiceId: number): Promise<{
    paidAmount: number;
    latestPaidDate: Date | null;
  }> {
    // 1) Sum allocations where parent PaymentIn is paid.
    const allocs = await this.prisma.paymentInAllocation.findMany({
      where: {
        payment_in_allocation_invoice_id: invoiceId,
        payment_in: { payment_in_status: 'paid' },
      },
      select: {
        payment_in_allocation_amount: true,
        payment_in_allocation_payment_in_id: true,
        payment_in: { select: { date: true } },
      },
    });
    const allocSum = allocs.reduce(
      (s, a) => s + Number(a.payment_in_allocation_amount),
      0,
    );
    const paymentInIdsWithAllocation = new Set<number>(
      allocs.map((a) => a.payment_in_allocation_payment_in_id),
    );

    // 2) Plus legacy PaymentIn rows polymorphically pointing at this invoice
    //    but lacking an allocation row (avoid double-counting).
    const legacyPayments = await this.prisma.paymentIn.findMany({
      where: {
        source_ref_id: invoiceId,
        payment_in_status: 'paid',
        OR: [{ source_type: 'invoice' }, { source_type: 'INVOICE' }],
      },
      select: { id: true, amount: true, date: true },
    });

    const legacyEffective = legacyPayments.filter(
      (p) => !paymentInIdsWithAllocation.has(p.id),
    );
    const legacySum = legacyEffective.reduce(
      (s, p) => s + Number(p.amount),
      0,
    );

    const paidAmount = Math.round((allocSum + legacySum) * 100) / 100;

    // Determine latest paid date across both sources
    const dates: Date[] = [];
    for (const a of allocs) {
      if (a.payment_in?.date) dates.push(new Date(a.payment_in.date));
    }
    for (const p of legacyEffective) {
      if (p.date) dates.push(new Date(p.date));
    }
    const latestPaidDate =
      dates.length > 0
        ? dates.reduce((latest, d) => (d > latest ? d : latest), dates[0])
        : null;

    return { paidAmount, latestPaidDate };
  }

  async recalculateInvoice(invoiceId: number): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, total_amount: true, status: true },
    });
    if (!invoice) return;

    const { paidAmount } = await this.computeInvoicePaidTotal(invoiceId);
    const totalAmount = Number(invoice.total_amount) || 0;
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

  // ══════════════════════════════════════════════════════════════════
  // Allocation candidate search (powers the frontend picker)
  // Currently supports `invoice` only.
  // ══════════════════════════════════════════════════════════════════

  async searchCandidates(
    query: PaymentInAllocationSearchQueryDto,
  ): Promise<PaymentInAllocationCandidate[]> {
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 30;
    const q = query.q?.trim() || '';
    const unpaidOnly = query.unpaid_only !== 'false'; // default true
    const kind = query.kind || 'invoice';

    if (kind !== 'invoice') {
      throw new BadRequestException('未知的搜尋類型');
    }

    const whereClause: Prisma.InvoiceWhereInput = {
      deleted_at: null,
      status: { notIn: ['draft', 'void'] },
      ...(q
        ? {
            OR: [
              { invoice_no: { contains: q, mode: 'insensitive' } },
              { invoice_title: { contains: q, mode: 'insensitive' } },
              { client_contract_no: { contains: q, mode: 'insensitive' } },
              {
                client: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const invoices = await this.prisma.invoice.findMany({
      where: whereClause,
      select: {
        id: true,
        invoice_no: true,
        invoice_title: true,
        total_amount: true,
        date: true,
        client: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit * 4, // over-fetch, filter by outstanding
    });

    const result: PaymentInAllocationCandidate[] = [];
    for (const inv of invoices) {
      const { paidAmount } = await this.computeInvoicePaidTotal(inv.id);
      const total = Number(inv.total_amount) || 0;
      const outstanding = total - paidAmount;
      if (unpaidOnly && outstanding <= 0.0001) continue;
      result.push({
        kind: 'invoice',
        id: inv.id,
        doc_no: inv.invoice_no,
        description: [inv.invoice_title, inv.client?.name]
          .filter(Boolean)
          .join(' / ') || `發票 ${inv.invoice_no}`,
        total_amount: total,
        allocated_amount: paidAmount,
        outstanding_amount: outstanding,
        date: inv.date ? inv.date.toISOString().slice(0, 10) : null,
      });
      if (result.length >= limit) break;
    }

    return result;
  }
}
