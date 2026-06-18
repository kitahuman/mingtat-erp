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
        retention_amount: true,
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

  // ── Retention summary for an invoice ────────────────────────────

  /**
   * Returns the total retention_release amount already recorded for an invoice
   * (sum of PaymentInDeduction where type='retention_release' for that invoice).
   * Used by the frontend to show the default amount when allocating a retention_release PaymentIn.
   */
  async getInvoiceRetentionReleaseSummary(invoiceId: number): Promise<{
    total_retention_release: number;
    deductions: { id: number; amount: number; payment_in_id: number; remarks: string | null }[];
  }> {
    const deductions = await this.prisma.paymentInDeduction.findMany({
      where: {
        payment_in_deduction_invoice_id: invoiceId,
        payment_in_deduction_type: 'retention_release',
      },
      select: {
        id: true,
        payment_in_deduction_amount: true,
        payment_in_deduction_payment_in_id: true,
        payment_in_deduction_remarks: true,
      },
    });
    const total = deductions.reduce(
      (s, d) => s + Math.abs(Number(d.payment_in_deduction_amount)),
      0,
    );
    return {
      total_retention_release: Math.round(total * 100) / 100,
      deductions: deductions.map((d) => ({
        id: d.id,
        amount: Math.abs(Number(d.payment_in_deduction_amount)),
        payment_in_id: d.payment_in_deduction_payment_in_id,
        remarks: d.payment_in_deduction_remarks,
      })),
    };
  }

  // ── Create ──────────────────────────────────────────────────────

  async create(dto: CreatePaymentInAllocationDto) {
    this.validateExactlyOneTarget(dto);

    const paymentIn = await this.prisma.paymentIn.findUnique({
      where: { id: dto.payment_in_allocation_payment_in_id },
      select: { id: true, amount: true, source_type: true },
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

    const isRetentionRelease = paymentIn.source_type === 'retention_release';
    const invoiceId = created.payment_in_allocation_invoice_id;

    // Retention deduction taken at allocation time (standard invoice mode only):
    // increase the invoice's retention_amount by the deducted amount. No separate
    // deduction record is created — the allocation amount is already net.
    const retentionDeduction = Number(dto.retention_deduction_amount ?? 0);
    if (!isRetentionRelease && invoiceId && retentionDeduction > 0) {
      const inv = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { retention_amount: true },
      });
      if (inv) {
        const newRetention =
          Math.round(
            (Number(inv.retention_amount ?? 0) + retentionDeduction) * 100,
          ) / 100;
        await this.prisma.invoice.update({
          where: { id: invoiceId },
          data: { retention_amount: newRetention },
        });
      }
    }

    // Other deduction: create a PaymentInDeduction record with type='Other'.
    // Does NOT update invoice.retention_amount.
    const otherDeduction = Number(dto.other_deduction_amount ?? 0);
    if (!isRetentionRelease && invoiceId && otherDeduction > 0) {
      await this.prisma.paymentInDeduction.create({
        data: {
          payment_in_deduction_payment_in_id:
            dto.payment_in_allocation_payment_in_id,
          payment_in_deduction_invoice_id: invoiceId,
          payment_in_deduction_type: 'Other',
          payment_in_deduction_amount: otherDeduction,
          payment_in_deduction_remarks:
            dto.other_deduction_remarks || 'Other deduction',
        },
      });
    }

    if (isRetentionRelease && invoiceId) {
      // Write a PaymentInDeduction record (negative amount = retention release)
      await this.prisma.paymentInDeduction.create({
        data: {
          payment_in_deduction_payment_in_id:
            dto.payment_in_allocation_payment_in_id,
          payment_in_deduction_invoice_id: invoiceId,
          payment_in_deduction_type: 'retention_release',
          // Store as negative to indicate a release (reducing the retained amount)
          payment_in_deduction_amount: -Math.abs(
            Number(dto.payment_in_allocation_amount),
          ),
          payment_in_deduction_remarks:
            dto.payment_in_allocation_remarks || '扣留金釋放',
        },
      });
      // Do NOT recalculate invoice outstanding — retention_release doesn't affect paid_amount
    } else {
      // Standard invoice allocation: recalculate invoice paid_amount / outstanding / status
      await this.recalculateForTarget({
        invoiceId: created.payment_in_allocation_invoice_id,
      });
    }

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

    const paymentIn = await this.prisma.paymentIn.findUnique({
      where: { id: existing.payment_in_allocation_payment_in_id },
      select: { amount: true, source_type: true },
    });
    if (!paymentIn) throw new NotFoundException('收款記錄不存在');

    if (dto.payment_in_allocation_amount !== undefined) {
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

    const isRetentionRelease = paymentIn.source_type === 'retention_release';
    const invoiceId = updated.payment_in_allocation_invoice_id;

    if (isRetentionRelease && invoiceId && dto.payment_in_allocation_amount !== undefined) {
      // Update the linked PaymentInDeduction record
      const deduction = await this.prisma.paymentInDeduction.findFirst({
        where: {
          payment_in_deduction_payment_in_id:
            existing.payment_in_allocation_payment_in_id,
          payment_in_deduction_invoice_id: invoiceId,
          payment_in_deduction_type: 'retention_release',
        },
      });
      if (deduction) {
        await this.prisma.paymentInDeduction.update({
          where: { id: deduction.id },
          data: {
            payment_in_deduction_amount: -Math.abs(
              Number(dto.payment_in_allocation_amount),
            ),
            ...(dto.payment_in_allocation_remarks !== undefined && {
              payment_in_deduction_remarks:
                dto.payment_in_allocation_remarks || '扣留金釋放',
            }),
          },
        });
      }
      // Do NOT recalculate invoice outstanding
    } else if (!isRetentionRelease) {
      await this.recalculateForTarget({
        invoiceId: updated.payment_in_allocation_invoice_id,
      });
    }

    return updated;
  }

  // ── Delete ──────────────────────────────────────────────────────

  async remove(id: number) {
    const existing = await this.prisma.paymentInAllocation.findUnique({
      where: { id },
      select: {
        id: true,
        payment_in_allocation_invoice_id: true,
        payment_in_allocation_payment_in_id: true,
        payment_in_allocation_amount: true,
      },
    });
    if (!existing) throw new NotFoundException('收款分配記錄不存在');

    const paymentIn = await this.prisma.paymentIn.findUnique({
      where: { id: existing.payment_in_allocation_payment_in_id },
      select: { source_type: true },
    });

    const isRetentionRelease = paymentIn?.source_type === 'retention_release';
    const invoiceId = existing.payment_in_allocation_invoice_id;

    if (isRetentionRelease && invoiceId) {
      // Delete the linked PaymentInDeduction record
      await this.prisma.paymentInDeduction.deleteMany({
        where: {
          payment_in_deduction_payment_in_id:
            existing.payment_in_allocation_payment_in_id,
          payment_in_deduction_invoice_id: invoiceId,
          payment_in_deduction_type: 'retention_release',
        },
      });
    }

    await this.prisma.paymentInAllocation.delete({ where: { id } });

    if (!isRetentionRelease) {
      await this.recalculateForTarget({ invoiceId });
    }

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
   *   - allocations whose PaymentIn is `paid` AND source_type is NOT retention_release
   *   - PLUS legacy direct PaymentIn where source_type='invoice'
   *     (case-insensitive) and source_ref_id=invoiceId, provided that
   *     PaymentIn has NO allocation row pointing back at the same
   *     invoice (so we don't double-count after migration).
   */
  async computeInvoicePaidTotal(invoiceId: number): Promise<{
    paidAmount: number;
    latestPaidDate: Date | null;
  }> {
    // 1) Sum allocations where parent PaymentIn is paid AND NOT retention_release.
    const allocs = await this.prisma.paymentInAllocation.findMany({
      where: {
        payment_in_allocation_invoice_id: invoiceId,
        payment_in: {
          payment_in_status: 'paid',
          NOT: { source_type: 'retention_release' },
        },
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
      select: { id: true, total_amount: true, retention_amount: true, status: true },
    });
    if (!invoice) return;

    const { paidAmount } = await this.computeInvoicePaidTotal(invoiceId);
    const totalAmount = Number(invoice.total_amount) || 0;
    const retentionAmount = Number(invoice.retention_amount) || 0;
    const outstanding = Math.round((totalAmount - paidAmount - retentionAmount) * 100) / 100;

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
        retention_amount: true,
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
      const retentionAmount = Number(inv.retention_amount) || 0;
      const outstanding = total - paidAmount - retentionAmount;
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
        retention_amount: retentionAmount,
        date: inv.date ? inv.date.toISOString().slice(0, 10) : null,
      });
      if (result.length >= limit) break;
    }

    return result;
  }

  /**
   * Search candidates for retention_release mode:
   * returns invoices that have retention_amount > 0
   * (i.e. there is still retention to be released).
   */
  async searchRetentionCandidates(
    query: PaymentInAllocationSearchQueryDto,
  ): Promise<PaymentInAllocationCandidate[]> {
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 30;
    const q = query.q?.trim() || '';

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
      retention_amount: { gt: 0 },
    };

    const invoices = await this.prisma.invoice.findMany({
      where: whereClause,
      select: {
        id: true,
        invoice_no: true,
        invoice_title: true,
        total_amount: true,
        retention_amount: true,
        date: true,
        client: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit * 2,
    });

    const result: PaymentInAllocationCandidate[] = [];
    for (const inv of invoices) {
      const retentionAmount = Number(inv.retention_amount) || 0;
      // Get already-released retention for this invoice
      const releaseSum = await this.prisma.paymentInDeduction.aggregate({
        where: {
          payment_in_deduction_invoice_id: inv.id,
          payment_in_deduction_type: 'retention_release',
        },
        _sum: { payment_in_deduction_amount: true },
      });
      // Deduction amounts are stored as negative, so negate to get released total
      const alreadyReleased = Math.abs(
        Number(releaseSum._sum.payment_in_deduction_amount ?? 0),
      );
      const outstandingRetention = Math.max(0, retentionAmount - alreadyReleased);
      if (outstandingRetention <= 0.0001) continue;
      result.push({
        kind: 'invoice',
        id: inv.id,
        doc_no: inv.invoice_no,
        description: [inv.invoice_title, inv.client?.name]
          .filter(Boolean)
          .join(' / ') || `發票 ${inv.invoice_no}`,
        total_amount: Number(inv.total_amount) || 0,
        allocated_amount: alreadyReleased,
        outstanding_amount: outstandingRetention,
        retention_amount: retentionAmount,
        date: inv.date ? inv.date.toISOString().slice(0, 10) : null,
      });
      if (result.length >= limit) break;
    }

    return result;
  }
}
