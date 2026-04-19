import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AllocationCandidate,
  AllocationSearchQueryDto,
  CreatePaymentOutAllocationDto,
  UpdatePaymentOutAllocationDto,
} from './dto/payment-out-allocation.dto';

type AllocationKind = 'expense' | 'payroll' | 'subcon_payroll';

interface AllocationTargetSnapshot {
  expenseId: number | null;
  payrollId: number | null;
  subconPayrollId: number | null;
}

@Injectable()
export class PaymentOutAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ─────────────────────────────────────────────────────

  private allocationInclude = {
    payment_out: {
      select: {
        id: true,
        date: true,
        amount: true,
        payment_out_status: true,
        payment_out_description: true,
      },
    },
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
  } satisfies Prisma.PaymentOutAllocationInclude;

  private validateExactlyOneTarget(dto: {
    payment_out_allocation_expense_id?: number | null;
    payment_out_allocation_payroll_id?: number | null;
    payment_out_allocation_subcon_payroll_id?: number | null;
  }): void {
    const targets = [
      dto.payment_out_allocation_expense_id,
      dto.payment_out_allocation_payroll_id,
      dto.payment_out_allocation_subcon_payroll_id,
    ].filter((v): v is number => v != null && v > 0);
    if (targets.length !== 1) {
      throw new BadRequestException(
        '必須指定且僅能指定一個關聯單據（expense / payroll / subcon_payroll）',
      );
    }
  }

  // ── List / Find ─────────────────────────────────────────────────

  async listByPaymentOut(paymentOutId: number) {
    return this.prisma.paymentOutAllocation.findMany({
      where: { payment_out_allocation_payment_out_id: paymentOutId },
      include: this.allocationInclude,
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const record = await this.prisma.paymentOutAllocation.findUnique({
      where: { id },
      include: this.allocationInclude,
    });
    if (!record) throw new NotFoundException('付款分配記錄不存在');
    return record;
  }

  // ── Create ──────────────────────────────────────────────────────

  async create(dto: CreatePaymentOutAllocationDto) {
    this.validateExactlyOneTarget(dto);

    const paymentOut = await this.prisma.paymentOut.findUnique({
      where: { id: dto.payment_out_allocation_payment_out_id },
      select: { id: true, amount: true },
    });
    if (!paymentOut) throw new NotFoundException('付款記錄不存在');

    // Optional safety: warn if total allocated would exceed PaymentOut.amount.
    const existing = await this.prisma.paymentOutAllocation.aggregate({
      where: {
        payment_out_allocation_payment_out_id:
          dto.payment_out_allocation_payment_out_id,
      },
      _sum: { payment_out_allocation_amount: true },
    });
    const allocatedTotal = Number(
      existing._sum.payment_out_allocation_amount ?? 0,
    );
    const newTotal = allocatedTotal + Number(dto.payment_out_allocation_amount);
    const paymentOutAmount = Number(paymentOut.amount);
    if (newTotal > paymentOutAmount + 0.0001) {
      throw new BadRequestException(
        `分配金額總和 (${newTotal.toFixed(2)}) 超過付款金額 (${paymentOutAmount.toFixed(
          2,
        )})`,
      );
    }

    const created = await this.prisma.paymentOutAllocation.create({
      data: {
        payment_out_allocation_payment_out_id:
          dto.payment_out_allocation_payment_out_id,
        payment_out_allocation_expense_id:
          dto.payment_out_allocation_expense_id ?? null,
        payment_out_allocation_payroll_id:
          dto.payment_out_allocation_payroll_id ?? null,
        payment_out_allocation_subcon_payroll_id:
          dto.payment_out_allocation_subcon_payroll_id ?? null,
        payment_out_allocation_amount: dto.payment_out_allocation_amount,
        payment_out_allocation_remarks:
          dto.payment_out_allocation_remarks ?? null,
      },
      include: this.allocationInclude,
    });

    await this.recalculateForTarget({
      expenseId: created.payment_out_allocation_expense_id,
      payrollId: created.payment_out_allocation_payroll_id,
      subconPayrollId: created.payment_out_allocation_subcon_payroll_id,
    });

    return created;
  }

  // ── Update ──────────────────────────────────────────────────────

  async update(id: number, dto: UpdatePaymentOutAllocationDto) {
    const existing = await this.prisma.paymentOutAllocation.findUnique({
      where: { id },
      select: {
        id: true,
        payment_out_allocation_payment_out_id: true,
        payment_out_allocation_expense_id: true,
        payment_out_allocation_payroll_id: true,
        payment_out_allocation_subcon_payroll_id: true,
        payment_out_allocation_amount: true,
      },
    });
    if (!existing) throw new NotFoundException('付款分配記錄不存在');

    if (dto.payment_out_allocation_amount !== undefined) {
      const paymentOut = await this.prisma.paymentOut.findUnique({
        where: { id: existing.payment_out_allocation_payment_out_id },
        select: { amount: true },
      });
      if (!paymentOut) throw new NotFoundException('付款記錄不存在');

      const others = await this.prisma.paymentOutAllocation.aggregate({
        where: {
          payment_out_allocation_payment_out_id:
            existing.payment_out_allocation_payment_out_id,
          NOT: { id },
        },
        _sum: { payment_out_allocation_amount: true },
      });
      const otherTotal = Number(others._sum.payment_out_allocation_amount ?? 0);
      const newTotal = otherTotal + Number(dto.payment_out_allocation_amount);
      const paymentOutAmount = Number(paymentOut.amount);
      if (newTotal > paymentOutAmount + 0.0001) {
        throw new BadRequestException(
          `分配金額總和 (${newTotal.toFixed(
            2,
          )}) 超過付款金額 (${paymentOutAmount.toFixed(2)})`,
        );
      }
    }

    const updated = await this.prisma.paymentOutAllocation.update({
      where: { id },
      data: {
        ...(dto.payment_out_allocation_amount !== undefined && {
          payment_out_allocation_amount: dto.payment_out_allocation_amount,
        }),
        ...(dto.payment_out_allocation_remarks !== undefined && {
          payment_out_allocation_remarks:
            dto.payment_out_allocation_remarks ?? null,
        }),
      },
      include: this.allocationInclude,
    });

    await this.recalculateForTarget({
      expenseId: updated.payment_out_allocation_expense_id,
      payrollId: updated.payment_out_allocation_payroll_id,
      subconPayrollId: updated.payment_out_allocation_subcon_payroll_id,
    });

    return updated;
  }

  // ── Delete ──────────────────────────────────────────────────────

  async remove(id: number) {
    const existing = await this.prisma.paymentOutAllocation.findUnique({
      where: { id },
      select: {
        id: true,
        payment_out_allocation_expense_id: true,
        payment_out_allocation_payroll_id: true,
        payment_out_allocation_subcon_payroll_id: true,
      },
    });
    if (!existing) throw new NotFoundException('付款分配記錄不存在');

    await this.prisma.paymentOutAllocation.delete({ where: { id } });

    await this.recalculateForTarget({
      expenseId: existing.payment_out_allocation_expense_id,
      payrollId: existing.payment_out_allocation_payroll_id,
      subconPayrollId: existing.payment_out_allocation_subcon_payroll_id,
    });

    return { message: '已刪除' };
  }

  // ══════════════════════════════════════════════════════════════════
  // Status recomputation (allocation-aware).
  //
  // For backward compatibility we keep counting legacy direct foreign
  // keys (PaymentOut.expense_id / payroll_id / subcon_payroll_id)
  // when no allocation exists for that PaymentOut against the same
  // target. This way old data without allocations still works.
  // ══════════════════════════════════════════════════════════════════

  async recalculateForTarget(target: AllocationTargetSnapshot): Promise<void> {
    if (target.expenseId) await this.recalculateExpense(target.expenseId);
    if (target.payrollId) await this.recalculatePayroll(target.payrollId);
    if (target.subconPayrollId)
      await this.recalculateSubconPayroll(target.subconPayrollId);
  }

  /**
   * Compute the total paid amount for a target document.
   * Counts:
   *   - allocations whose PaymentOut is `paid`
   *   - PLUS legacy direct PaymentOut.<fk>=targetId where the PaymentOut
   *     has NO allocation row pointing back at this target
   *     (so we don't double-count after migration)
   */
  async computePaidTotal(
    kind: AllocationKind,
    targetId: number,
  ): Promise<number> {
    const allocColumn =
      kind === 'expense'
        ? 'payment_out_allocation_expense_id'
        : kind === 'payroll'
          ? 'payment_out_allocation_payroll_id'
          : 'payment_out_allocation_subcon_payroll_id';

    // 1) Sum allocations where parent PaymentOut is paid.
    const allocs = await this.prisma.paymentOutAllocation.findMany({
      where: {
        [allocColumn]: targetId,
        payment_out: { payment_out_status: 'paid' },
      },
      select: {
        payment_out_allocation_amount: true,
        payment_out_allocation_payment_out_id: true,
      },
    });
    const allocSum = allocs.reduce(
      (s, a) => s + Number(a.payment_out_allocation_amount),
      0,
    );
    const paymentOutIdsWithAllocation = new Set<number>(
      allocs.map((a) => a.payment_out_allocation_payment_out_id),
    );

    // 2) Plus legacy PaymentOuts that point directly at this target but
    //    have no allocation row to that same target (avoid double count).
    const legacyWhere: Prisma.PaymentOutWhereInput =
      kind === 'expense'
        ? { expense_id: targetId, payment_out_status: 'paid' }
        : kind === 'payroll'
          ? { payroll_id: targetId, payment_out_status: 'paid' }
          : { subcon_payroll_id: targetId, payment_out_status: 'paid' };

    const legacyPayments = await this.prisma.paymentOut.findMany({
      where: legacyWhere,
      select: { id: true, amount: true },
    });

    const legacySum = legacyPayments
      .filter((p) => !paymentOutIdsWithAllocation.has(p.id))
      .reduce((s, p) => s + Number(p.amount), 0);

    return allocSum + legacySum;
  }

  async recalculateExpense(expenseId: number): Promise<void> {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      select: { total_amount: true },
    });
    if (!expense) return;

    const paidTotal = await this.computePaidTotal('expense', expenseId);
    const totalAmount = Number(expense.total_amount) || 0;

    let paymentStatus: string;
    let isPaid: boolean;
    if (paidTotal <= 0) {
      paymentStatus = 'unpaid';
      isPaid = false;
    } else if (paidTotal + 0.0001 < totalAmount) {
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

  async recalculatePayroll(payrollId: number): Promise<void> {
    // Payroll model doesn't have a single payment_status column, but it
    // has its own `status` (draft|preparing|confirmed|paid|...). To be
    // safe we only flip the high-level status when fully paid, mirroring
    // the existing app conventions and avoiding over-stepping.
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
      select: { net_amount: true, status: true },
    });
    if (!payroll) return;
    if (payroll.status === 'draft' || payroll.status === 'preparing')
      return;

    const paidTotal = await this.computePaidTotal('payroll', payrollId);
    const netAmount = Number(payroll.net_amount) || 0;

    let newStatus: string | null = null;
    if (paidTotal <= 0) {
      newStatus = 'confirmed';
    } else if (paidTotal + 0.0001 < netAmount) {
      newStatus = 'partially_paid';
    } else {
      newStatus = 'paid';
    }

    if (newStatus && newStatus !== payroll.status) {
      await this.prisma.payroll.update({
        where: { id: payrollId },
        data: { status: newStatus },
      });
    }
  }

  async recalculateSubconPayroll(subconPayrollId: number): Promise<void> {
    const payroll = await this.prisma.subconPayroll.findUnique({
      where: { id: subconPayrollId },
      select: {
        subcon_payroll_total_amount: true,
        subcon_payroll_status: true,
      },
    });
    if (!payroll) return;
    if (
      payroll.subcon_payroll_status === 'draft' ||
      payroll.subcon_payroll_status === 'cancelled'
    )
      return;

    const paidTotal = await this.computePaidTotal(
      'subcon_payroll',
      subconPayrollId,
    );
    const totalAmount = Number(payroll.subcon_payroll_total_amount) || 0;

    let newStatus: string;
    if (paidTotal <= 0) {
      newStatus = 'confirmed';
    } else if (paidTotal + 0.0001 < totalAmount) {
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

  // ══════════════════════════════════════════════════════════════════
  // Allocation candidate search (powers the frontend picker)
  // ══════════════════════════════════════════════════════════════════

  async searchCandidates(
    query: AllocationSearchQueryDto,
  ): Promise<AllocationCandidate[]> {
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 30;
    const q = query.q?.trim() || '';
    const unpaidOnly = query.unpaid_only !== 'false'; // default true

    if (query.kind === 'expense') {
      const expenses = await this.prisma.expense.findMany({
        where: {
          deleted_at: null,
          ...(q
            ? {
                OR: [
                  { item: { contains: q, mode: 'insensitive' } },
                  { supplier_name: { contains: q, mode: 'insensitive' } },
                  { remarks: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          item: true,
          supplier_name: true,
          total_amount: true,
          payment_status: true,
          date: true,
        },
        orderBy: { date: 'desc' },
        take: limit * 4, // over-fetch then filter by outstanding
      });
      const result: AllocationCandidate[] = [];
      for (const e of expenses) {
        const paid = await this.computePaidTotal('expense', e.id);
        const total = Number(e.total_amount) || 0;
        const outstanding = total - paid;
        if (unpaidOnly && outstanding <= 0.0001) continue;
        result.push({
          kind: 'expense',
          id: e.id,
          doc_no: `EXP-${e.id}`,
          description: [e.item, e.supplier_name].filter(Boolean).join(' / ') || `支出 #${e.id}`,
          total_amount: total,
          allocated_amount: paid,
          outstanding_amount: outstanding,
          date: e.date ? e.date.toISOString().slice(0, 10) : null,
        });
        if (result.length >= limit) break;
      }
      return result;
    }

    if (query.kind === 'payroll') {
      const payrolls = await this.prisma.payroll.findMany({
        where: {
          status: { notIn: ['draft', 'preparing', 'cancelled'] },
          ...(q
            ? {
                OR: [
                  { period: { contains: q, mode: 'insensitive' } },
                  {
                    employee: {
                      OR: [
                        { name_zh: { contains: q, mode: 'insensitive' } },
                        { name_en: { contains: q, mode: 'insensitive' } },
                      ],
                    },
                  },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          period: true,
          net_amount: true,
          status: true,
          employee: { select: { name_zh: true, name_en: true } },
        },
        orderBy: { id: 'desc' },
        take: limit * 4,
      });
      const result: AllocationCandidate[] = [];
      for (const p of payrolls) {
        const paid = await this.computePaidTotal('payroll', p.id);
        const total = Number(p.net_amount) || 0;
        const outstanding = total - paid;
        if (unpaidOnly && outstanding <= 0.0001) continue;
        result.push({
          kind: 'payroll',
          id: p.id,
          doc_no: `PAY-${p.id}`,
          description: `${p.period} ${p.employee?.name_zh || p.employee?.name_en || ''}`.trim(),
          total_amount: total,
          allocated_amount: paid,
          outstanding_amount: outstanding,
          date: null,
        });
        if (result.length >= limit) break;
      }
      return result;
    }

    if (query.kind === 'subcon_payroll') {
      const payrolls = await this.prisma.subconPayroll.findMany({
        where: {
          subcon_payroll_status: {
            notIn: ['draft', 'cancelled'],
          },
          ...(q
            ? {
                subcontractor: {
                  name: { contains: q, mode: 'insensitive' },
                },
              }
            : {}),
        },
        select: {
          id: true,
          subcon_payroll_month: true,
          subcon_payroll_total_amount: true,
          subcontractor: { select: { name: true } },
        },
        orderBy: { id: 'desc' },
        take: limit * 4,
      });
      const result: AllocationCandidate[] = [];
      for (const sp of payrolls) {
        const paid = await this.computePaidTotal('subcon_payroll', sp.id);
        const total = Number(sp.subcon_payroll_total_amount) || 0;
        const outstanding = total - paid;
        if (unpaidOnly && outstanding <= 0.0001) continue;
        result.push({
          kind: 'subcon_payroll',
          id: sp.id,
          doc_no: `SUBPAY-${sp.id}`,
          description: `${sp.subcon_payroll_month?.toISOString().slice(0, 7) || ''} ${sp.subcontractor?.name || ''}`.trim(),
          total_amount: total,
          allocated_amount: paid,
          outstanding_amount: outstanding,
          date: sp.subcon_payroll_month
            ? sp.subcon_payroll_month.toISOString().slice(0, 10)
            : null,
        });
        if (result.length >= limit) break;
      }
      return result;
    }

    throw new BadRequestException('未知的搜尋類型');
  }
}
