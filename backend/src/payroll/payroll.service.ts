import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { PricingService } from '../common/pricing.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { StatutoryHolidaysService } from '../statutory-holidays/statutory-holidays.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FleetRateCardsService } from '../fleet-rate-cards/fleet-rate-cards.service';
import { PettyCashService } from '../petty-cash/petty-cash.service';
import { PaymentOutAllocationService } from '../payment-out/payment-out-allocation.service';
import { PayrollQuery } from '../common/types';

/** 將 Date 或字串轉換為 YYYY-MM-DD 格式 */
function toDateStr(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  // 如果已經是 YYYY-MM-DD 格式，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // 嘗試解析為 Date
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
    private readonly pricingService: PricingService,
    private readonly statutoryHolidaysService: StatutoryHolidaysService,
    private readonly auditLogsService: AuditLogsService,
    private readonly calcService: PayrollCalculationService,
    private readonly fleetRateCardsService: FleetRateCardsService,
    private readonly pettyCashService: PettyCashService,
    @Inject(forwardRef(() => PaymentOutAllocationService))
    private readonly paymentOutAllocationService: PaymentOutAllocationService,
  ) {}

  // ── 列表 ──────────────────────────────────────────────────────
  async findAll(query: PayrollQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const payrollWhere: Prisma.PayrollWhereInput = {};
    if (query.period) payrollWhere.period = String(query.period);
    if (query.company_profile_id)
      payrollWhere.company_profile_id = Number(query.company_profile_id);
    if (query.company_id) payrollWhere.company_id = Number(query.company_id);
    if (query.employee_id) payrollWhere.employee_id = Number(query.employee_id);
    if (query.status) {
      payrollWhere.status = String(query.status);
    }
    // preparing 狀態也顯示在列表中（作為草稿）
    if (query.search) {
      payrollWhere.employee = {
        OR: [
          { name_zh: { contains: query.search, mode: 'insensitive' } },
          { name_en: { contains: query.search, mode: 'insensitive' } },
          { emp_code: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const sortBy = query.sortBy || 'id';
    const sortOrder =
      (query.sortOrder || 'DESC').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const allowedSort = ['id', 'period', 'net_amount', 'status', 'created_at'];
    const orderBy = allowedSort.includes(sortBy)
      ? { [sortBy]: sortOrder }
      : { id: 'desc' as const };

    const aiSessionWhere: Prisma.AiPayrollSessionWhereInput = {
      payrolls: { none: {} },
      session_status: { not: 'cancelled' },
    };
    if (query.period) aiSessionWhere.session_period = String(query.period);
    if (query.company_id) aiSessionWhere.session_company_id = Number(query.company_id);

    const [payrolls, aiSessions, aggregate] = await Promise.all([
      this.prisma.payroll.findMany({
        where: payrollWhere,
        include: {
          employee: { include: { company: true } },
          company_profile: true,
          company: true,
          created_by_user: {
            select: { id: true, username: true, displayName: true },
          },
          items: {
            where: { item_type: 'mpf_deduction' },
            select: { quantity: true },
            take: 1,
          },
        },
        orderBy,
      }),
      this.prisma.aiPayrollSession.findMany({
        where: aiSessionWhere,
        include: {
          company: true,
        },
        orderBy: { session_created_at: 'desc' },
      }),
      this.prisma.payroll.aggregate({
        where: payrollWhere,
        _sum: {
          base_amount: true,
          allowance_total: true,
          ot_total: true,
          commission_total: true,
          mpf_deduction: true,
          mpf_employer: true,
          adjustment_total: true,
          net_amount: true,
        },
      }),
    ]);

    const employeeIds = [
      ...new Set(
        aiSessions.flatMap((session) => this.getAiSessionEmployeeIds(session.session_employee_ids)),
      ),
    ];
    const employees = employeeIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          include: { company: true },
        })
      : [];
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

    const normalizedSearch = String(query.search || '').trim().toLowerCase();
    const requestedEmployeeId = query.employee_id ? Number(query.employee_id) : null;
    const includeAiDrafts = !query.status || query.status === 'draft';

    const payrollRows = payrolls.map((payroll: any) => ({
      ...payroll,
      record_type: 'payroll',
      row_id: `payroll-${payroll.id}`,
      publisher_name: payroll.payroll_ai_generated
        ? 'AI'
        : this.formatUserDisplayName(payroll.created_by_user),
      mpf_days: payroll.items?.[0]?.quantity ?? null,
    }));

    const aiRows = includeAiDrafts
      ? aiSessions
          .map((session) => {
            const sessionEmployeeIds = this.getAiSessionEmployeeIds(
              session.session_employee_ids,
            );
            const sessionEmployees = sessionEmployeeIds
              .map((employeeId) => employeeById.get(employeeId))
              .filter(Boolean) as any[];
            return this.buildAiSessionPayrollRecordRow(
              session,
              sessionEmployees,
              sessionEmployeeIds,
            );
          })
          .filter((row) => {
            if (
              requestedEmployeeId !== null &&
              !row.ai_session_employee_ids.includes(requestedEmployeeId)
            ) {
              return false;
            }
            if (!normalizedSearch) return true;
            const searchableText = [
              row.employee?.name_zh,
              row.employee?.name_en,
              row.employee?.emp_code,
              row.company?.name,
              row.company?.internal_prefix,
              row.ai_session_id,
            ]
              .filter((value) => value !== null && value !== undefined)
              .join(' ')
              .toLowerCase();
            return searchableText.includes(normalizedSearch);
          })
      : [];

    const combined = [...payrollRows, ...aiRows].sort((a: any, b: any) => {
      const direction = sortOrder === 'asc' ? 1 : -1;
      const av = this.getPayrollRecordSortValue(a, sortBy);
      const bv = this.getPayrollRecordSortValue(b, sortBy);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return av > bv ? direction : -direction;
    });

    const data = combined.slice(skip, skip + limit);

    return {
      data,
      total: combined.length,
      page,
      limit,
      sum_base_amount: Number(aggregate._sum.base_amount) || 0,
      sum_allowance_total: Number(aggregate._sum.allowance_total) || 0,
      sum_ot_total: Number(aggregate._sum.ot_total) || 0,
      sum_commission_total: Number(aggregate._sum.commission_total) || 0,
      sum_mpf_deduction: Number(aggregate._sum.mpf_deduction) || 0,
      sum_mpf_employer: Number(aggregate._sum.mpf_employer) || 0,
      sum_adjustment_total: Number(aggregate._sum.adjustment_total) || 0,
      sum_net_amount: Number(aggregate._sum.net_amount) || 0,
    };
  }

  private getAiSessionEmployeeIds(value: Prisma.JsonValue): number[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  private formatUserDisplayName(user?: {
    displayName?: string | null;
    username?: string | null;
  } | null): string {
    if (!user) return '-';
    return user.displayName?.trim() || user.username?.trim() || '-';
  }

  private buildAiSessionPayrollRecordRow(
    session: any,
    employees: any[],
    sessionEmployeeIds: number[],
  ) {
    const employeeLabel =
      employees.length === 1
        ? employees[0].name_zh || employees[0].name_en || `員工 #${employees[0].id}`
        : `AI 計糧會話 #${session.id}`;
    const employeeSubLabel =
      employees.length === 1
        ? employees[0].emp_code || `Session #${session.id}`
        : `${sessionEmployeeIds.length} 位員工`;

    return {
      id: `ai-session-${session.id}`,
      record_type: 'ai_session',
      row_id: `ai-session-${session.id}`,
      ai_session_id: session.id,
      ai_session_status: session.session_status,
      ai_session_employee_ids: sessionEmployeeIds,
      period: session.session_period,
      date_from: session.session_date_from,
      date_to: session.session_date_to,
      employee_id: employees.length === 1 ? employees[0].id : null,
      employee: {
        id: employees.length === 1 ? employees[0].id : null,
        name_zh: employeeLabel,
        name_en: employees.length === 1 ? employees[0].name_en : null,
        emp_code: employeeSubLabel,
        mpf_plan: employees.length === 1 ? employees[0].mpf_plan : null,
        company: session.company,
      },
      company_id: session.session_company_id,
      company: session.company,
      company_profile: null,
      salary_type: 'daily',
      base_amount: 0,
      allowance_total: 0,
      ot_total: 0,
      commission_total: 0,
      mpf_deduction: 0,
      mpf_employer: 0,
      adjustment_total: 0,
      net_amount: 0,
      status: 'draft',
      payment_date: null,
      cheque_number: null,
      notes: session.session_error_message,
      created_at: session.session_created_at,
      updated_at: session.session_updated_at,
      payroll_ai_session_id: session.id,
      payroll_ai_generated: true,
      publisher_name: 'AI',
    };
  }

  private getPayrollRecordSortValue(row: any, sortBy: string) {
    if (sortBy === 'created_at') {
      return row.created_at ? new Date(row.created_at).getTime() : 0;
    }
    if (sortBy === 'net_amount') return Number(row.net_amount || 0);
    if (sortBy === 'id') {
      if (row.record_type === 'ai_session') {
        return row.created_at ? new Date(row.created_at).getTime() : 0;
      }
      return Number(row.id) || 0;
    }
    return row[sortBy] ?? null;
  }

  // ── 詳情（含工作記錄、調整項、每日津貼）──────────────────────────────
  async findOne(id: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: { include: { company: true } },
        company_profile: true,
        company: true,
        items: { orderBy: { sort_order: 'asc' } },
        adjustments: { orderBy: { sort_order: 'asc' } },
        daily_allowances: true,
        payroll_payments: {
          include: { payment_out: true },
          orderBy: { payroll_payment_created_at: 'asc' },
        },
        payroll_expenses: {
          include: {
            expense: {
              include: {
                category: { include: { parent: true } },
                employee: true,
              },
            },
          },
          orderBy: { payroll_expense_created_at: 'asc' },
        },
      },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');

    // Load payroll work logs
    let pwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: id },
      orderBy: [{ scheduled_date: 'asc' }, { id: 'asc' }],
    });

    // ── 自動回填：如果 payroll_work_logs 為空（舊糧單），從 work_logs 表查詢並回填 ──
    if (
      pwls.length === 0 &&
      payroll.date_from &&
      payroll.date_to &&
      payroll.employee_id
    ) {
      pwls = await this.backfillPayrollWorkLogs(payroll as any);
    }

    // Build grouped settlement
    const activePwls = pwls.filter((p) => !p.is_excluded);
    const groupedRaw = this.calcService.buildGroupedSettlement(activePwls);
    // Apply user's grouped amount selections
    const selections = (payroll as any).grouped_amount_selections as Record<string, string> | null;
    const grouped = groupedRaw.map((g: any) => {
      const sel = selections?.[g.group_key];
      if (sel && g.has_rounding_difference) {
        g.grouped_amount_selected = sel;
        g.total_amount = sel === 'theoretical' ? g.grouped_amount_theoretical : g.grouped_amount_actual;
      } else {
        g.grouped_amount_selected = g.has_rounding_difference ? 'actual' : null;
      }
      return g;
    });

    // Get salary setting for daily calculation
    const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
      where: {
        employee_id: payroll.employee_id,
        effective_date: {
          lte: payroll.date_to || new Date(payroll.period + '-28'),
        },
      },
      orderBy: { effective_date: 'desc' },
    });

    // Get holidays and leaves for daily calculation display
    const holidayDates = await this.statutoryHolidaysService.findByDateRange(
      toDateStr(payroll.date_from),
      toDateStr(payroll.date_to),
    );
    const leaves = await this.prisma.employeeLeave.findMany({
      where: {
        employee_id: payroll.employee_id,
        status: 'approved',
        date_from: { lte: payroll.date_to || undefined },
        date_to: { gte: payroll.date_from || undefined },
      },
    });

    // Build daily calculation
    const dailyAllowances = payroll.daily_allowances || [];
    const manualDayQuantityMap = await this.loadManualDayQuantityMap(id);
    const dailyCalc = this.calcService.buildDailyCalculation(
      activePwls,
      salarySetting,
      dailyAllowances,
      {
        dateFrom: toDateStr(payroll.date_from),
        dateTo: toDateStr(payroll.date_to),
        holidayDates: holidayDates.map((h) => ({ date: h.date, name: h.name })),
        leaves,
        employeeJoinDate: payroll.employee?.join_date ? toDateStr(payroll.employee.join_date) : null,
        employeeTerminationDate: payroll.employee?.termination_date ? toDateStr(payroll.employee.termination_date) : null,
        manualDayQuantityMap,
      },
    );

    const workDayCount = dailyCalc.reduce((sum: number, day: any) => {
      const logs = day.work_logs || [];
      if (logs.length === 0) return sum;
      // 統一使用 effective_day_quantity（有手動值用手動值，否則自動計算值）
      if (day.effective_day_quantity != null) {
        return sum + Number(day.effective_day_quantity);
      }
      const dayQ = day.day_quantity != null ? Number(day.day_quantity) : 0;
      const nightQ = day.night_quantity != null ? Number(day.night_quantity) : 0;
      return sum + Math.min(dayQ + nightQ, 1);
    }, 0);

    // Build available allowance options from salary setting
    const allowanceOptions =
      this.calcService.buildAllowanceOptions(salarySetting);

    // Calculate gross_amount (sum of positive items) and deduction_total (sum of negative items)
    const items = payroll.items || [];
    const activeItems = items.filter((item: any) => !item.payroll_item_excluded);
    const grossAmount = activeItems.reduce((sum: number, item: any) => {
      const amt = Number(item.amount);
      return sum + (amt > 0 ? amt : 0);
    }, 0);
    const deductionTotal = activeItems.reduce((sum: number, item: any) => {
      const amt = Number(item.amount);
      return sum + (amt < 0 ? amt : 0);
    }, 0);

    // Calculate payment summary
    const payments = payroll.payroll_payments || [];
    const paidAmount = payments.reduce(
      (sum: number, p: any) => sum + Number(p.payroll_payment_amount),
      0,
    );
    const outstandingAmount = Number(payroll.net_amount) - paidAmount;

    return {
      ...payroll,
      gross_amount: grossAmount,
      deduction_total: deductionTotal,
      payroll_work_logs: pwls,
      grouped_settlement: grouped,
      daily_calculation: dailyCalc,
      work_day_count: workDayCount,
      allowance_options: allowanceOptions,
      salary_setting: salarySetting,
      paid_amount: paidAmount,
      outstanding_amount: outstandingAmount,
      reimbursement_total: (payroll.payroll_expenses || []).reduce(
        (sum: number, pe: { expense: { total_amount: any } }) => sum + Number(pe.expense.total_amount || 0),
        0,
      ),
    };
  }

  // ── 載入手動覆蓋天數 map（calc_date → 手動值），供逐日計算使用 ──
  private async loadManualDayQuantityMap(
    payrollId: number,
  ): Promise<
    Map<string, { id?: number; manual_day_quantity: number | null; manual_day_shift_quantity: number | null; manual_night_shift_quantity: number | null; is_manual_day_quantity: boolean }>
  > {
    const records = await this.prisma.payrollDailyCalc.findMany({
      where: { payroll_id: payrollId },
    });
    const map = new Map<
      string,
      { id?: number; manual_day_quantity: number | null; manual_day_shift_quantity: number | null; manual_night_shift_quantity: number | null; is_manual_day_quantity: boolean }
    >();
    for (const r of records) {
      // 優先讀 manual_day_shift_quantity/manual_night_shift_quantity
      // 如果為 null 則 fallback 到 manual_day_quantity（舊資料兼容：全部算日班）
      const hasNewFields = r.manual_day_shift_quantity != null || r.manual_night_shift_quantity != null;
      const manualDayShift = hasNewFields
        ? (r.manual_day_shift_quantity != null ? Number(r.manual_day_shift_quantity) : 0)
        : (r.manual_day_quantity != null ? Number(r.manual_day_quantity) : null);
      const manualNightShift = hasNewFields
        ? (r.manual_night_shift_quantity != null ? Number(r.manual_night_shift_quantity) : 0)
        : 0;
      const manualDayQuantity = r.manual_day_quantity != null ? Number(r.manual_day_quantity) : null;
      map.set(toDateStr(r.calc_date), {
        id: r.id,
        manual_day_quantity: manualDayQuantity,
        manual_day_shift_quantity: manualDayShift,
        manual_night_shift_quantity: manualNightShift,
        is_manual_day_quantity: r.is_manual_day_quantity,
      });
    }
    return map;
  }

  // ── 更新某天的手動覆蓋天數（PATCH endpoint 使用）──
  // dayKey 可為 calc_date(YYYY-MM-DD) 字串或 PayrollDailyCalc.id
  async updateDayQuantity(
    payrollId: number,
    dayKey: string,
    values: { dayQuantity: number; nightQuantity: number },
  ) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const dayVal = Number(values.dayQuantity);
    const nightVal = Number(values.nightQuantity);
    if (isNaN(dayVal) || dayVal < 0 || isNaN(nightVal) || nightVal < 0) {
      throw new BadRequestException('天數必須為大於等於 0 的數值');
    }

    // 向後兼容：manual_day_quantity = min(dayQuantity + nightQuantity, 1)
    const compatValue = Math.min(dayVal + nightVal, 1);

    // 解析 dayKey：純數字且非日期格式 → 視為記錄 id；否則視為日期字串
    let calcDate: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      calcDate = dayKey;
    } else if (/^\d+$/.test(dayKey)) {
      const existing = await this.prisma.payrollDailyCalc.findFirst({
        where: { id: Number(dayKey), payroll_id: payrollId },
      });
      if (!existing) throw new NotFoundException('PayrollDailyCalc not found');
      calcDate = toDateStr(existing.calc_date);
    } else {
      throw new BadRequestException('無效的日期識別');
    }

    // upsert（payroll_id + calc_date 唯一鍵）：設定手動值並標記 is_manual_day_quantity = true
    await this.prisma.payrollDailyCalc.upsert({
      where: {
        payroll_id_calc_date: {
          payroll_id: payrollId,
          calc_date: new Date(calcDate),
        },
      },
      update: {
        manual_day_shift_quantity: dayVal,
        manual_night_shift_quantity: nightVal,
        manual_day_quantity: compatValue,
        is_manual_day_quantity: true,
      },
      create: {
        payroll_id: payrollId,
        calc_date: new Date(calcDate),
        manual_day_shift_quantity: dayVal,
        manual_night_shift_quantity: nightVal,
        manual_day_quantity: compatValue,
        is_manual_day_quantity: true,
      },
    });

    // 存值後觸發 recalculate（保護手動值）
    await this.recalculate(payrollId, false);
    return this.findOne(payrollId);
  }

  // ── 清除某天的手動覆蓋天數（還原為自動計算）──
  async resetDayQuantity(payrollId: number, dayKey: string) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    let calcDate: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      calcDate = dayKey;
    } else if (/^\d+$/.test(dayKey)) {
      const existing = await this.prisma.payrollDailyCalc.findFirst({
        where: { id: Number(dayKey), payroll_id: payrollId },
      });
      if (existing) calcDate = toDateStr(existing.calc_date);
    }
    if (calcDate) {
      await this.prisma.payrollDailyCalc.updateMany({
        where: { payroll_id: payrollId, calc_date: new Date(calcDate) },
        data: { is_manual_day_quantity: false, manual_day_quantity: null, manual_day_shift_quantity: null, manual_night_shift_quantity: null },
      });
    }
    await this.recalculate(payrollId, false);
    return this.findOne(payrollId);
  }


  private buildPayrollItemSignature(item: any): string {
    return [item.item_type || '', item.item_name || '', item.sort_order ?? ''].join('|');
  }

  private async rebuildPayrollTotalsFromItems(payrollId: number) {
    const [items, adjustments] = await Promise.all([
      this.prisma.payrollItem.findMany({ where: { payroll_id: payrollId } }),
      this.prisma.payrollAdjustment.findMany({ where: { payroll_id: payrollId } }),
    ]);
    const activeItems = items.filter((item: any) => !item.payroll_item_excluded);
    const sumByType = (type: string) => activeItems
      .filter((item: any) => item.item_type === type)
      .reduce((sum: number, item: any) => sum + Number(item.amount), 0);
    const baseAmount = sumByType('base_salary');
    const allowanceTotal = sumByType('allowance');
    const otTotal = sumByType('ot');
    const commissionTotal = sumByType('commission');
    const mpfDeduction = Math.abs(sumByType('mpf_deduction'));
    const adjustmentTotal = adjustments.reduce(
      (sum: number, adj: any) => sum + Number(adj.amount),
      0,
    );
    const netAmount = activeItems.reduce(
      (sum: number, item: any) => sum + Number(item.amount),
      0,
    ) + adjustmentTotal;

    await this.prisma.payroll.update({
      where: { id: payrollId },
      data: {
        base_amount: baseAmount,
        allowance_total: allowanceTotal,
        ot_total: otTotal,
        commission_total: commissionTotal,
        mpf_deduction: mpfDeduction,
        adjustment_total: adjustmentTotal,
        net_amount: netAmount,
      },
    });
  }

  /**
   * 自動回填 payroll_work_logs（針對舊糧單，從 work_logs 表查詢對應工作記錄並保存副本）
   */
  private async backfillPayrollWorkLogs(payroll: any): Promise<any[]> {
    try {
      const wlWhere: any = {
        employee_id: payroll.employee_id,
        scheduled_date: {
          gte: new Date(payroll.date_from),
          lte: new Date(payroll.date_to),
        },
        OR: [
        { service_type: { not: '請假/休息' } },
        { service_type: null },
      ],
        deleted_at: null,
      };
      if (payroll.company_id) {
        wlWhere.company_id = payroll.company_id;
      } else if (payroll.company_profile_id) {
        wlWhere.company_profile_id = payroll.company_profile_id;
      }

      const workLogs = await this.prisma.workLog.findMany({
        where: wlWhere,
        include: {
          company_profile: true,
          company: true,
          client: true,
          quotation: true,
        },
        orderBy: { scheduled_date: 'asc' },
      });

      if (workLogs.length === 0) return [];

      // Enrich with price info
      const enrichedWorkLogs =
        await this.calcService.enrichWorkLogsWithPrice(workLogs);

      // Save as payroll_work_logs
      const savedPwls: any[] = [];
      for (const wl of enrichedWorkLogs) {
        // Calculate total line amount including OT and mid-shift
        const baseAmt = wl._line_amount ?? 0;
        const otAmt = wl._ot_line_amount ?? 0;
        const midShiftAmt = wl._mid_shift_line_amount ?? 0;
        const totalLineAmount = baseAmt + otAmt + midShiftAmt;

        const saved = await this.prisma.payrollWorkLog.create({
          data: {
            payroll_id: payroll.id,
            work_log_id: wl.id,
            service_type: wl.service_type,
            scheduled_date: wl.scheduled_date,
            day_night: wl.day_night,
            start_location: wl.start_location,
            end_location: wl.end_location,
            machine_type: wl.machine_type,
            tonnage: wl.tonnage,
            equipment_number: wl.equipment_number,
            quantity: wl.quantity,
            unit: wl.unit,
            ot_quantity: wl.ot_quantity,
            ot_unit: wl.ot_unit,
            is_mid_shift: wl.is_mid_shift ?? false,
            remarks: wl.remarks,
            matched_rate_card_id:
              wl._matched_rate_card_id ?? wl.matched_rate_card_id ?? null,
            matched_rate: wl._matched_rate ?? wl.matched_rate ?? null,
            matched_unit: wl._matched_unit ?? wl.matched_unit ?? null,
            matched_ot_rate: wl._matched_ot_rate ?? wl.matched_ot_rate ?? null,
            matched_mid_shift_rate:
              wl._matched_mid_shift_rate ?? wl.matched_mid_shift_rate ?? null,
            price_match_status:
              wl._price_match_status ?? wl.price_match_status ?? null,
            price_match_note:
              wl._price_match_note ?? wl.price_match_note ?? null,
            line_amount: totalLineAmount,
            ot_line_amount: otAmt,
            mid_shift_line_amount: midShiftAmt,
            group_key: wl._group_key ?? '',
            client_id: wl.client_id ?? null,
            client_name: wl.client?.name ?? wl.client_name ?? null,
            company_profile_id: wl.company_profile_id ?? null,
            company_profile_name:
              wl.company_profile?.chinese_name ??
              wl.company_profile_name ??
              null,
            company_id: wl.company_id ?? null,
            company_name: wl.company?.name ?? null,
            quotation_id: wl.quotation_id ?? null,
            client_contract_no:
              wl.quotation?.quotation_no ?? wl.client_contract_no ?? null,
            payroll_work_log_product_name: wl.work_log_product_name ?? null,
            payroll_work_log_product_unit: wl.work_log_product_unit ?? null,
            payroll_work_log_product_quantity: wl.goods_quantity ?? null,
            is_modified: false,
            is_excluded: false,
          },
        });
        savedPwls.push(saved);
      }

      return savedPwls;
    } catch (err) {
      console.error('Failed to backfill payroll work logs:', err);
      return [];
    }
  }

  // ── 預覽計糧（不儲存，返回計算結果、工作記錄明細、歸組結算、逐日計算）──
  async preview(body: {
    employee_id: number;
    date_from: string;
    date_to: string;
    company_profile_id?: number;
    company_id?: number;
  }) {
    const { employee_id, date_from, date_to, company_profile_id, company_id } =
      body;

    if (!employee_id) throw new BadRequestException('請選擇員工');
    if (!date_from || !date_to) throw new BadRequestException('請選擇日期範圍');
    if (date_from > date_to)
      throw new BadRequestException('開始日期不能晚於結束日期');

    const emp = await this.prisma.employee.findUnique({
      where: { id: employee_id },
      include: { company: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // Get salary setting
    const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
      where: {
        employee_id: emp.id,
        effective_date: { lte: new Date(date_to) },
      },
      orderBy: { effective_date: 'desc' },
    });

    // Get work logs
    const wlWhere: any = {
      employee_id: emp.id,
      scheduled_date: { gte: new Date(date_from), lte: new Date(date_to) },
      OR: [
        { service_type: { not: '請假/休息' } },
        { service_type: null },
      ],
      deleted_at: null,
    };

    const workLogs = await this.prisma.workLog.findMany({
      where: wlWhere,
      include: {
        company_profile: true,
        company: true,
        client: true,
        quotation: true,
      },
      orderBy: { scheduled_date: 'asc' },
    });

    // Enrich work logs with price info from rate cards
    const enrichedWorkLogs =
      await this.calcService.enrichWorkLogsWithPrice(workLogs);

    // Build grouped settlement for preview
    const grouped =
      this.calcService.buildGroupedSettlementFromWorkLogs(enrichedWorkLogs);

    // Get holidays and leaves for preview daily calculation display
    const holidayDates = await this.statutoryHolidaysService.findByDateRange(
      date_from,
      date_to,
    );
    const leaves = await this.prisma.employeeLeave.findMany({
      where: {
        employee_id: emp.id,
        status: 'approved',
        date_from: { lte: new Date(date_to) },
        date_to: { gte: new Date(date_from) },
      },
    });

    // Build daily calculation for preview
    // preview 為未儲存糧單，無持久化手動覆蓋天數，故用空 map
    const dailyCalc = this.calcService.buildDailyCalculationFromWorkLogs(
      enrichedWorkLogs,
      salarySetting,
      [],
      {
        dateFrom: date_from,
        dateTo: date_to,
        holidayDates: holidayDates.map((h) => ({ date: h.date, name: h.name })),
        leaves,
        employeeJoinDate: emp.join_date ? toDateStr(emp.join_date) : null,
        employeeTerminationDate: emp.termination_date ? toDateStr(emp.termination_date) : null,
      },
    );

    const workDayCount = dailyCalc.reduce((sum: number, day: any) => {
      const logs = day.work_logs || [];
      if (logs.length === 0) return sum;
      // 統一使用 effective_day_quantity（有手動值用手動值，否則自動計算值）
      if (day.effective_day_quantity != null) {
        return sum + Number(day.effective_day_quantity);
      }
      const dayQ = day.day_quantity != null ? Number(day.day_quantity) : 0;
      const nightQ = day.night_quantity != null ? Number(day.night_quantity) : 0;
      return sum + Math.min(dayQ + nightQ, 1);
    }, 0);

    // Build available allowance options
    const allowanceOptions =
      this.calcService.buildAllowanceOptions(salarySetting);

    // 查出法定假日，傳給 calculatePayroll
    let previewHolidayDates: { date: Date; name: string }[] = [];
    if (salarySetting) {
      const previewHolidays =
        await this.statutoryHolidaysService.findByDateRange(
          date_from,
          date_to,
        );
      previewHolidayDates = previewHolidays.map((h: any) => ({
        date: h.date,
        name: h.name,
      }));
    }

    // Calculate preview
    const calculation = salarySetting
      ? await this.calcService.calculatePayroll(
          emp,
          salarySetting,
          workLogs,
          date_from,
          date_to,
          company_id ?? company_profile_id ?? null,
          undefined,
          previewHolidayDates,
        )
      : null;

    return {
      employee: emp,
      salary_setting: salarySetting,
      work_logs: enrichedWorkLogs,
      grouped_settlement: grouped,
      daily_calculation: dailyCalc,
      work_day_count: workDayCount,
      allowance_options: allowanceOptions,
      calculation,
      date_from,
      date_to,
    };
  }

  // ── 準備糧單（建立草稿 + 複製工作記錄到糧單工作記錄）────────────
  async prepare(
    body: {
      employee_id: number;
      date_from: string;
      date_to: string;
      company_id?: number;
      period?: string;
    },
    userId?: number,
  ) {
    const { employee_id, date_from, date_to, company_id } = body;

    if (!employee_id) throw new BadRequestException('請選擇員工');
    if (!date_from || !date_to) throw new BadRequestException('請選擇日期範圍');
    if (date_from > date_to)
      throw new BadRequestException('開始日期不能晚於結束日期');

    const period = body.period || date_from.substring(0, 7);

    const emp = await this.prisma.employee.findUnique({
      where: { id: employee_id },
      include: { company: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const requestedCompanyId = company_id ? Number(company_id) : null;

    // Check for existing payroll in same date range
    const existingWhere: Prisma.PayrollWhereInput = {
      employee_id: emp.id,
      date_from: new Date(date_from),
      date_to: new Date(date_to),
    };
    if (requestedCompanyId) {
      existingWhere.company_id = requestedCompanyId;
    }
    const existing = await this.prisma.payroll.findFirst({
      where: existingWhere,
    });
    if (existing) {
      // 如果已存在舊的 preparing 狀態糧單，立即完成計算並轉為 draft。
      if (existing.status === 'preparing') {
        return this.finalizePreparation(existing.id, userId);
      }
      // 其他狀態的糧單則報錯
      throw new BadRequestException(
        `此員工在 ${date_from} 至 ${date_to} 的糧單已存在（ID: ${existing.id}）`,
      );
    }

    // Get work logs
    const wlWhere: Prisma.WorkLogWhereInput = {
      employee_id: emp.id,
      scheduled_date: { gte: new Date(date_from), lte: new Date(date_to) },
      OR: [
        { service_type: { not: '請假/休息' } },
        { service_type: null },
      ],
      deleted_at: null,
    };
    // Do not filter work logs by requested company_id here. The requestedCompanyId
    // is used for the payroll record company_id only; work logs may belong to a
    // related company/profile and should match resetAndRefetch behavior.
    const workLogs = await this.prisma.workLog.findMany({
      where: wlWhere,
      include: {
        company_profile: true,
        company: true,
        client: true,
        quotation: true,
      },
      orderBy: { scheduled_date: 'asc' },
    });

    // Determine company info
    let actualCompanyId = requestedCompanyId ?? null;
    let actualCpId = null as number | null;
    if (!actualCompanyId && workLogs.length > 0) {
      actualCompanyId = workLogs[0].company_id;
    }
    if (!actualCompanyId) {
      actualCompanyId = emp.company_id ?? null;
    }
    if (workLogs.length > 0) {
      actualCpId = workLogs[0].company_profile_id;
    }

    // Create payroll record in transient 'preparing' status; it will be finalized to draft before returning.
    const saved = await this.prisma.payroll.create({
      data: {
        period,
        date_from: new Date(date_from),
        date_to: new Date(date_to),
        employee_id: emp.id,
        company_profile_id: actualCpId ?? undefined,
        company_id: actualCompanyId ?? undefined,
        salary_type: 'daily',
        base_rate: 0,
        work_days: 0,
        work_nights: 0,
        base_amount: 0,
        allowance_total: 0,
        ot_total: 0,
        commission_total: 0,
        mpf_deduction: 0,
        adjustment_total: 0,
        net_amount: 0,
        status: 'preparing',
        payroll_created_by: userId || undefined,
      },
    });

    // Enrich work logs with price info and save as payroll_work_logs
    const enrichedWorkLogs =
      await this.calcService.enrichWorkLogsWithPrice(workLogs);
    for (const wl of enrichedWorkLogs) {
      const baseAmt = wl._line_amount ?? 0;
      const otAmt = wl._ot_line_amount ?? 0;
      const midShiftAmt = wl._mid_shift_line_amount ?? 0;
      const totalLineAmount = baseAmt + otAmt + midShiftAmt;

      await this.prisma.payrollWorkLog.create({
        data: {
          payroll_id: saved.id,
          work_log_id: wl.id,
          service_type: wl.service_type,
          scheduled_date: wl.scheduled_date,
          day_night: wl.day_night,
          start_location: wl.start_location,
          end_location: wl.end_location,
          machine_type: wl.machine_type,
          tonnage: wl.tonnage,
          equipment_number: wl.equipment_number,
          quantity: wl.quantity,
          unit: wl.unit,
          ot_quantity: wl.ot_quantity,
          ot_unit: wl.ot_unit,
          is_mid_shift: wl.is_mid_shift || false,
          remarks: wl.remarks,
          matched_rate_card_id:
            wl._matched_rate_card_id ?? wl.matched_rate_card_id ?? null,
          matched_rate: wl._matched_rate ?? wl.matched_rate ?? null,
          matched_unit: wl._matched_unit ?? wl.matched_unit ?? null,
          matched_ot_rate: wl._matched_ot_rate ?? wl.matched_ot_rate ?? null,
          matched_mid_shift_rate:
            wl._matched_mid_shift_rate ?? wl.matched_mid_shift_rate ?? null,
          price_match_status:
            wl._price_match_status ?? wl.price_match_status ?? null,
          price_match_note: wl._price_match_note ?? wl.price_match_note ?? null,
          line_amount: totalLineAmount,
          ot_line_amount: otAmt,
          mid_shift_line_amount: midShiftAmt,
          group_key: wl._group_key ?? '',
          client_id: wl.client_id ?? null,
          client_name: wl.client?.name ?? wl.client_name ?? null,
          company_profile_id: wl.company_profile_id ?? null,
          company_profile_name:
            wl.company_profile?.chinese_name ?? wl.company_profile_name ?? null,
          company_id: wl.company_id ?? null,
          company_name: wl.company?.name ?? null,
          quotation_id: wl.quotation_id ?? null,
          client_contract_no:
            wl.quotation?.quotation_no ?? wl.client_contract_no ?? null,
          payroll_work_log_product_name: wl.work_log_product_name ?? null,
          payroll_work_log_product_unit: wl.work_log_product_unit ?? null,
          payroll_work_log_product_quantity: wl.payroll_work_log_product_quantity ?? wl.work_log_product_quantity ?? wl.goods_quantity ?? wl.product_quantity ?? null,
          billing_quantity_type: wl.billing_quantity_type ?? 'quantity',
          is_modified: false,
          is_excluded: false,
        },
      });
    }

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'payrolls',
          targetId: saved.id,
          changesAfter: { ...saved, status: 'preparing' },
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return this.finalizePreparation(saved.id, userId);
  }

  // ── 確定糧單工作記錄並計算糧單（從 preparing 狀態計算並轉為 draft）────
  async finalizePreparation(id: number, userId?: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: { include: { company: true } },
        adjustments: true,
        items: true,
      },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'preparing') {
      throw new BadRequestException('只能對準備中的糧單執行此操作');
    }

    const emp = payroll.employee;
    const dateFrom = toDateStr(payroll.date_from) || `${payroll.period}-01`;
    const dateTo =
      toDateStr(payroll.date_to) ||
      (() => {
        const [y, m] = payroll.period.split('-');
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        return `${payroll.period}-${String(lastDay).padStart(2, '0')}`;
      })();

    const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
      where: {
        employee_id: emp.id,
        effective_date: { lte: new Date(dateTo) },
      },
      orderBy: { effective_date: 'desc' },
    });

    if (!salarySetting) {
      throw new BadRequestException('此員工沒有薪酬配置，無法生成糧單');
    }

    // Get active payroll work logs
    const pwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: id, is_excluded: false },
      orderBy: { scheduled_date: 'asc' },
    });

    // Convert PayrollWorkLog to WorkLog-like objects for calculation
    const workLogLike = pwls.map((pwl) => ({
      id: pwl.work_log_id,
      scheduled_date: pwl.scheduled_date,
      service_type: pwl.service_type,
      day_night: pwl.day_night,
      start_location: pwl.start_location,
      end_location: pwl.end_location,
      machine_type: pwl.machine_type,
      tonnage: pwl.tonnage,
      equipment_number: pwl.equipment_number,
      quantity: pwl.quantity,
      unit: pwl.unit,
      ot_quantity: pwl.ot_quantity,
      ot_unit: pwl.ot_unit,
      remarks: pwl.remarks,
      company_profile_id: pwl.company_profile_id,
      company_id: pwl.company_id,
      client_id: pwl.client_id,
      quotation_id: pwl.quotation_id,
      matched_rate_card_id: pwl.matched_rate_card_id,
      matched_rate: pwl.matched_rate,
      matched_unit: pwl.matched_unit,
      matched_ot_rate: pwl.matched_ot_rate,
      matched_mid_shift_rate: pwl.matched_mid_shift_rate,
      price_match_status: pwl.price_match_status,
      price_match_note: pwl.price_match_note,
      is_mid_shift: pwl.is_mid_shift,
      line_amount: pwl.line_amount,
      ot_line_amount: pwl.ot_line_amount,
      mid_shift_line_amount: pwl.mid_shift_line_amount,
      payroll_work_log_product_quantity: pwl.payroll_work_log_product_quantity,
      billing_quantity_type: pwl.billing_quantity_type,
    }));

    // 查出法定假日，傳給 calculatePayroll（日薪用於假日津貼，月薪用於計糧天數）
    let holidayDatesForCalc: { date: Date; name: string }[] = [];
    {
      const holidays = await this.statutoryHolidaysService.findByDateRange(
        dateFrom,
        dateTo,
      );
      holidayDatesForCalc = holidays.map((h: any) => ({
        date: h.date,
        name: h.name,
      }));
    }

     // Reset and generate auto daily allowances before payroll item calculation.
    await this.prisma.payrollDailyAllowance.deleteMany({
      where: { payroll_id: id, is_auto: true },
    });
    await this.generateAllAutoDailyAllowances(
      id,
      salarySetting,
      pwls as any,
      dateFrom,
      dateTo,
    );

     const calculationDailyAllowancesFinalize = await this.getCalculationDailyAllowances(id);
    const calc = await this.calcService.calculatePayroll(
      emp,
      salarySetting,
      workLogLike,
      dateFrom,
      dateTo,
      payroll.company_id ?? payroll.company_profile_id ?? null,
      undefined,
      holidayDatesForCalc,
      new Set<string>(),
      calculationDailyAllowancesFinalize,
    );
    // Update payroll items; preserve manually excluded items by stable item signature.
    const previouslyExcludedItemKeys = new Set(
      ((payroll as any).items || [])
        .filter((item: any) => item.payroll_item_excluded)
        .map((item: any) => this.buildPayrollItemSignature(item)),
    );

    // Preserve manual amount items: record their amounts before deletion
    const manualAmountItemsFinalize = new Map<string, { amount: number }>();
    for (const item of ((payroll as any).items || [])) {
      if (item.payroll_item_is_manual_amount) {
        const key = `${item.item_type || ''}|${item.item_name || ''}`;
        manualAmountItemsFinalize.set(key, { amount: Number(item.amount) });
      }
    }

    await this.prisma.payrollItem.deleteMany({ where: { payroll_id: id } });
    for (const item of calc.items) {
      const signature = this.buildPayrollItemSignature(item);
      const manualKey = `${item.item_type || ''}|${item.item_name || ''}`;
      const manualEntry = manualAmountItemsFinalize.get(manualKey);
      await this.prisma.payrollItem.create({
        data: {
          ...item,
          payroll_id: id,
          payroll_item_excluded: Boolean(item.payroll_item_excluded) || previouslyExcludedItemKeys.has(signature),
          ...(manualEntry ? { amount: manualEntry.amount, payroll_item_is_manual_amount: true } : {}),
        },
      });
    }

    // Update payroll totals and change status to draft
    await this.prisma.payroll.update({
      where: { id },
      data: {
        salary_type: calc.salary_type,
        base_rate: calc.base_rate,
        work_days: calc.work_days,
        work_nights: calc.work_nights || 0,
        base_amount: calc.base_amount,
        allowance_total: calc.allowance_total,
        ot_total: calc.ot_total,
        commission_total: calc.commission_total,
        mpf_deduction: calc.mpf_deduction,
        mpf_plan: calc.mpf_plan,
        mpf_employer: calc.mpf_employer,
        mpf_relevant_income: calc.mpf_relevant_income,
        adjustment_total: 0,
        net_amount: calc.net_amount,
        status: 'draft',
      },
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'payrolls',
          targetId: id,
          changesAfter: { status: 'draft', net_amount: calc.net_amount },
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return this.findOne(id);
  }

  // ── 生成計糧（單一員工，日期範圍）────────────────────────────
  async generate(
    body: {
      employee_id: number;
      date_from: string;
      date_to: string;
      company_profile_id?: number;
      company_id?: number;
      period?: string;
    },
    userId?: number,
    ipAddress?: string,
  ) {
    const { employee_id, date_from, date_to, company_profile_id, company_id } =
      body;

    if (!employee_id) throw new BadRequestException('請選擇員工');
    if (!date_from || !date_to) throw new BadRequestException('請選擇日期範圍');
    if (date_from > date_to)
      throw new BadRequestException('開始日期不能晚於結束日期');

    const period = body.period || date_from.substring(0, 7);

    const emp = await this.prisma.employee.findUnique({
      where: { id: employee_id },
      include: { company: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // Check for existing payroll
    const existingWhere: any = {
      employee_id: emp.id,
      date_from: new Date(date_from),
      date_to: new Date(date_to),
    };
    if (company_id) {
      existingWhere.company_id = Number(company_id);
    } else if (company_profile_id) {
      existingWhere.company_profile_id = Number(company_profile_id);
    }
    const existing = await this.prisma.payroll.findFirst({
      where: existingWhere,
    });
    if (existing) {
      throw new BadRequestException(
        `此員工在 ${date_from} 至 ${date_to} 的糧單已存在（ID: ${existing.id}）`,
      );
    }

    const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
      where: {
        employee_id: emp.id,
        effective_date: { lte: new Date(date_to) },
      },
      orderBy: { effective_date: 'desc' },
    });

    if (!salarySetting) {
      throw new BadRequestException('此員工沒有薪酬配置，無法生成糧單');
    }

    const wlWhere: any = {
      employee_id: emp.id,
      scheduled_date: { gte: new Date(date_from), lte: new Date(date_to) },
      OR: [
        { service_type: { not: '請假/休息' } },
        { service_type: null },
      ],
      deleted_at: null,
    };

    const workLogs = await this.prisma.workLog.findMany({
      where: wlWhere,
      include: {
        company_profile: true,
        company: true,
        client: true,
        quotation: true,
      },
      orderBy: { scheduled_date: 'asc' },
    });

    // 查出法定假日，傳給 calculatePayroll（日薪用於假日津貼，月薪用於計糧天數）
    let holidayDatesForGenerate: { date: Date; name: string }[] = [];
    {
      const genHolidays = await this.statutoryHolidaysService.findByDateRange(
        date_from,
        date_to,
      );
      holidayDatesForGenerate = genHolidays.map((h: any) => ({
        date: h.date,
        name: h.name,
      }));
    }

    const calc = await this.calcService.calculatePayroll(
      emp,
      salarySetting,
      workLogs,
      date_from,
      date_to,
      company_id ?? company_profile_id ?? null,
      undefined,
      holidayDatesForGenerate,
    );

    let actualCpId = company_profile_id ?? null;
    if (!actualCpId && workLogs.length > 0) {
      actualCpId = workLogs[0].company_profile_id;
    }
    let actualCompanyId = company_id ?? null;
    if (!actualCompanyId && workLogs.length > 0) {
      actualCompanyId = workLogs[0].company_id;
    }

    // Create payroll record
    const saved = await this.prisma.payroll.create({
      data: {
        period,
        date_from: new Date(date_from),
        date_to: new Date(date_to),
        employee_id: emp.id,
        company_profile_id: actualCpId ?? undefined,
        company_id: actualCompanyId ?? undefined,
        salary_type: calc.salary_type,
        base_rate: calc.base_rate,
        work_days: calc.work_days,
        work_nights: calc.work_nights || 0,
        base_amount: calc.base_amount,
        allowance_total: calc.allowance_total,
        ot_total: calc.ot_total,
        commission_total: calc.commission_total,
        mpf_deduction: calc.mpf_deduction,
        mpf_plan: calc.mpf_plan,
        mpf_employer: calc.mpf_employer,
        mpf_relevant_income: calc.mpf_relevant_income,
        adjustment_total: 0,
        net_amount: calc.net_amount,
        status: 'draft',
        payroll_created_by: userId || undefined,
      },
    });

    // Save payroll items
    for (const item of calc.items) {
      await this.prisma.payrollItem.create({
        data: {
          ...item,
          payroll_id: saved.id,
        },
      });
    }

    // Save payroll work logs with price info
    const enrichedWorkLogs =
      await this.calcService.enrichWorkLogsWithPrice(workLogs);
    for (const wl of enrichedWorkLogs) {
      await this.prisma.payrollWorkLog.create({
        data: {
          payroll_id: saved.id,
          work_log_id: wl.id,
          service_type: wl.service_type,
          scheduled_date: wl.scheduled_date,
          day_night: wl.day_night,
          start_location: wl.start_location,
          end_location: wl.end_location,
          machine_type: wl.machine_type,
          tonnage: wl.tonnage,
          equipment_number: wl.equipment_number,
          quantity: wl.quantity,
          unit: wl.unit,
          ot_quantity: wl.ot_quantity,
          ot_unit: wl.ot_unit,
          is_mid_shift: wl.is_mid_shift || false,
          remarks: wl.remarks,
          matched_rate_card_id:
            wl._matched_rate_card_id ?? wl.matched_rate_card_id ?? null,
          matched_rate: wl._matched_rate ?? wl.matched_rate ?? null,
          matched_unit: wl._matched_unit ?? wl.matched_unit ?? null,
          matched_ot_rate: wl._matched_ot_rate ?? wl.matched_ot_rate ?? null,
          matched_mid_shift_rate:
            wl._matched_mid_shift_rate ?? wl.matched_mid_shift_rate ?? null,
          price_match_status:
            wl._price_match_status ?? wl.price_match_status ?? null,
          price_match_note: wl._price_match_note ?? wl.price_match_note ?? null,
          line_amount:
            (wl._line_amount ?? 0) +
            (wl._ot_line_amount ?? 0) +
            (wl._mid_shift_line_amount ?? 0),
          ot_line_amount: wl._ot_line_amount ?? 0,
          mid_shift_line_amount: wl._mid_shift_line_amount ?? 0,
          group_key: wl._group_key ?? '',
          client_id: wl.client_id ?? null,
          client_name: wl.client?.name ?? wl.client_name ?? null,
          company_profile_id: wl.company_profile_id ?? null,
          company_profile_name:
            wl.company_profile?.chinese_name ?? wl.company_profile_name ?? null,
          company_id: wl.company_id ?? null,
          company_name: wl.company?.name ?? null,
          quotation_id: wl.quotation_id ?? null,
          client_contract_no:
            wl.quotation?.quotation_no ?? wl.client_contract_no ?? null,
          payroll_work_log_product_name: wl.work_log_product_name ?? null,
          payroll_work_log_product_unit: wl.work_log_product_unit ?? null,
          is_modified: false,
          is_excluded: false,
        },
      });
    }

    // 生成所有自動逐日津貼，然後以 PayrollDailyAllowance 作為 source of truth 重新計算 items。
    const savedPwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: saved.id, is_excluded: false },
      orderBy: { scheduled_date: 'asc' },
    });
    await this.generateAllAutoDailyAllowances(
      saved.id,
      salarySetting,
      savedPwls as any,
      date_from,
      date_to,
    );
    const calculationDailyAllowancesGenerate = await this.getCalculationDailyAllowances(saved.id);
    const finalCalc = await this.calcService.calculatePayroll(
      emp,
      salarySetting,
      savedPwls as any,
      date_from,
      date_to,
      actualCompanyId ?? actualCpId,
      undefined,
      holidayDatesForGenerate,
      new Set<string>(),
      calculationDailyAllowancesGenerate,
    );

    await this.prisma.payrollItem.deleteMany({ where: { payroll_id: saved.id } });
    for (const item of finalCalc.items) {
      await this.prisma.payrollItem.create({
        data: {
          ...item,
          payroll_id: saved.id,
        },
      });
    }
    await this.prisma.payroll.update({
      where: { id: saved.id },
      data: {
        salary_type: finalCalc.salary_type,
        base_rate: finalCalc.base_rate,
        work_days: finalCalc.work_days,
        work_nights: finalCalc.work_nights || 0,
        base_amount: finalCalc.base_amount,
        allowance_total: finalCalc.allowance_total,
        ot_total: finalCalc.ot_total,
        commission_total: finalCalc.commission_total,
        mpf_deduction: finalCalc.mpf_deduction,
        mpf_plan: finalCalc.mpf_plan,
        mpf_employer: finalCalc.mpf_employer,
        mpf_relevant_income: finalCalc.mpf_relevant_income,
        adjustment_total: 0,
        net_amount: finalCalc.net_amount,
        status: 'draft',
      },
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'payrolls',
          targetId: saved.id,
          changesAfter: saved,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    return this.findOne(saved.id);
  }

  // ── 更新糧單 ──────────────────────────────────────────────────
  async update(id: number, body: any, userId?: number, ipAddress?: string) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');

    const updateData: any = {};
    if (body.payment_date !== undefined)
      updateData.payment_date = body.payment_date
        ? new Date(body.payment_date)
        : null;
    if (body.cheque_number !== undefined)
      updateData.cheque_number = body.cheque_number;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.mpf_relevant_income !== undefined)
      updateData.mpf_relevant_income =
        body.mpf_relevant_income !== null && body.mpf_relevant_income !== ''
          ? Number(body.mpf_relevant_income)
          : null;
    if (body.mpf_employer !== undefined)
      updateData.mpf_employer =
        body.mpf_employer !== null && body.mpf_employer !== ''
          ? Number(body.mpf_employer)
          : 0;

    const updated = await this.prisma.payroll.update({
      where: { id },
      data: updateData,
    });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'payrolls',
          targetId: id,
          changesBefore: payroll,
          changesAfter: updated,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    return updated;
  }

  // ── 確認單筆糧單（finalize）────────────────────────────────────────
  async finalize(id: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: true,
        payroll_work_logs: { where: { is_excluded: false } },
      },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能確認草稿狀態的糧單');
    }

    // Check if expenses already exist for this payroll
    const alreadyExists = await this.expensesService.existsBySourceRef(
      'PAYROLL',
      id,
    );
    if (alreadyExists) {
      throw new BadRequestException('此糧單已產生過支出記錄，不能重複產生');
    }

    // Update status to confirmed
    await this.prisma.payroll.update({
      where: { id },
      data: { status: 'confirmed' },
    });

    // Auto-generate expenses
    const expenseCount = await this.generateExpensesFromPayroll(payroll);

    // Re-link existing payment_outs that were created before expense generation
    await this.relinkPaymentOutsToExpenses(id);

    // Mark attached reimbursement expenses as settled
    await this.settlePayrollExpenses(id);

    // Petty cash settlement is an additional backward-compatible step.
    const pettyCashSettlement = await this.pettyCashService.settleForPayroll(id);

    return { confirmed: true, expenses_generated: expenseCount, petty_cash_settlement: pettyCashSettlement };
  }

  // ── 撤銷確認（回到草稿）────────────────────────────────────────
  async unconfirm(id: number) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'confirmed') {
      throw new BadRequestException('只能撤銷已確認狀態的糧單');
    }

    // Delete auto-generated expenses
    const deletedCount = await this.expensesService.deleteBySourceRef(
      'PAYROLL',
      id,
    );

    // Unsettle attached reimbursement expenses
    await this.unsettlePayrollExpenses(id);

    // Revert status to draft
    await this.prisma.payroll.update({
      where: { id },
      data: { status: 'draft' },
    });

    // Petty cash rollback is an additional backward-compatible step.
    const pettyCashRollback = await this.pettyCashService.rollbackForPayroll(id);

    return { unconfirmed: true, expenses_deleted: deletedCount, petty_cash_rollback: pettyCashRollback };
  }

  // ── 批量確認 ──────────────────────────────────────────────────
  async bulkConfirm(ids: number[]) {
    let totalExpenses = 0;
    for (const id of ids) {
      try {
        const result = await this.finalize(id);
        totalExpenses += result.expenses_generated;
      } catch {
        // Skip payrolls that can't be confirmed (already confirmed, etc.)
      }
    }
    return { updated: ids.length, expenses_generated: totalExpenses };
  }

  // ── 批量標記已付款 ────────────────────────────────────────────
  async bulkMarkPaid(
    ids: number[],
    paymentDate?: string,
    chequeNumber?: string,
  ) {
    const updateData: any = { status: 'paid' };
    if (paymentDate) updateData.payment_date = new Date(paymentDate);
    if (chequeNumber) updateData.cheque_number = chequeNumber;

    await this.prisma.payroll.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });
    return { updated: ids.length };
  }

  // ── 刪除糧單 ──────────────────────────────────────────────────
  async remove(id: number, userId?: number, ipAddress?: string) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能刪除草稿或準備中狀態的糧單');
    }

    // Delete any auto-generated expenses (safety check)
    await this.expensesService.deleteBySourceRef('PAYROLL', id);

    await this.prisma.payrollWorkLog.deleteMany({ where: { payroll_id: id } });
    await this.prisma.payrollAdjustment.deleteMany({
      where: { payroll_id: id },
    });
    await this.prisma.payrollDailyAllowance.deleteMany({
      where: { payroll_id: id },
    });
    await this.prisma.payrollItem.deleteMany({ where: { payroll_id: id } });
    await this.prisma.payrollPayment.deleteMany({ where: { payroll_payment_payroll_id: id } });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'payrolls',
          targetId: id,
          changesBefore: payroll,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    await this.prisma.payroll.delete({ where: { id } });
    return { deleted: true };
  }


  async bulkDelete(ids: number[], userId?: number, ipAddress?: string) {
    const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
    let deleted = 0;
    const skippedIds: number[] = [];

    for (const id of uniqueIds) {
      const payroll = await this.prisma.payroll.findUnique({ where: { id } });
      if (!payroll || (payroll.status !== 'draft' && payroll.status !== 'preparing')) {
        skippedIds.push(id);
        continue;
      }

      await this.expensesService.deleteBySourceRef('PAYROLL', id);
      await this.prisma.payrollWorkLog.deleteMany({ where: { payroll_id: id } });
      await this.prisma.payrollAdjustment.deleteMany({ where: { payroll_id: id } });
      await this.prisma.payrollDailyAllowance.deleteMany({ where: { payroll_id: id } });
      await this.prisma.payrollItem.deleteMany({ where: { payroll_id: id } });
      await this.prisma.payrollPayment.deleteMany({ where: { payroll_payment_payroll_id: id } });

      if (userId) {
        try {
          await this.auditLogsService.log({
            userId,
            action: 'delete',
            targetTable: 'payrolls',
            targetId: id,
            changesBefore: payroll,
            ipAddress,
          });
        } catch (e) {
          console.error('Audit log error:', e);
        }
      }

      await this.prisma.payroll.delete({ where: { id } });
      deleted += 1;
    }

    return { deleted, skipped: skippedIds.length, skippedIds };
  }

  // ── 批量生成強積金僱主供款支出 ──────────────────────────────────
  async generateMpfEmployerExpense(ids: number[]) {
    const uniqueIds = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('請先選擇糧單');
    }

    const payrolls = await this.prisma.payroll.findMany({
      where: { id: { in: uniqueIds } },
      include: {
        employee: true,
      },
      orderBy: { id: 'asc' },
    });

    if (payrolls.length !== uniqueIds.length) {
      throw new BadRequestException('部分糧單不存在，請重新選擇');
    }

    const getMonthKey = (payroll: any) => {
      const source = payroll.date_from || payroll.date_to;
      if (source) {
        const date = new Date(source);
        if (!Number.isNaN(date.getTime())) {
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
      }
      const period = String(payroll.period || '');
      const match = period.match(/(\d{4})[-年/](\d{1,2})/);
      if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
      return period;
    };

    const monthKeys = new Set(payrolls.map(getMonthKey));
    if (monthKeys.size !== 1) {
      throw new BadRequestException('所選糧單包含不同月份，請只選同一月份的糧單');
    }

    const companyIds = new Set(payrolls.map((payroll) => payroll.company_id ?? null));
    if (companyIds.size !== 1) {
      throw new BadRequestException('所選糧單包含不同公司，請只選同一公司的糧單');
    }

    const plans = new Set(payrolls.map((payroll) => payroll.mpf_plan || ''));
    if (payrolls.some((payroll) => payroll.mpf_plan === 'exempt_age65')) {
      throw new BadRequestException('所選糧單包含免供強積金的員工，請移除後再試');
    }
    if (plans.size !== 1) {
      throw new BadRequestException('所選糧單包含不同強積金計劃（宏利、AIA），請只選同一計劃的糧單');
    }

    const first = payrolls[0];
    const monthKey = getMonthKey(first);
    const [yearText, monthText] = monthKey.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const periodLabel = year && month ? `${year}年${month}月` : String(first.period || monthKey);
    const plan = first.mpf_plan || '';
    const planLabelMap: Record<string, string> = {
      aia: 'AIA',
      manulife: '宏利',
      industry: '行業計劃',
      bea_mpf: '東亞',
      other: '其他',
    };
    const planLabel = planLabelMap[plan] || plan || '未設定';
    const totalAmount = payrolls.reduce((sum, payroll) => sum + Number(payroll.mpf_employer || 0), 0);
    const title = `${periodLabel}份-${planLabel}強積金僱主供款（${payrolls.length}人）`;

    const expense = await this.prisma.expense.create({
      data: {
        date: new Date(),
        company_id: first.company_id,
        category_id: 40,
        item: title,
        total_amount: totalAmount,
        source: 'PAYROLL',
        expense_payment_method: 'COMPANY_PAID',
        remarks: `由 ${payrolls.length} 張糧單批量生成`,
      },
    });

    await this.prisma.expenseItem.createMany({
      data: payrolls.map((payroll, index) => {
        const employeeName = payroll.employee?.name_zh || payroll.employee?.name_en || payroll.employee?.emp_code || `員工 #${payroll.employee_id}`;
        const amount = Number(payroll.mpf_employer || 0);
        return {
          expense_id: expense.id,
          description: employeeName,
          quantity: 1,
          unit: periodLabel,
          unit_price: amount,
          amount,
          sort_order: index,
        };
      }),
    });

    return {
      expense_id: expense.id,
      expense,
      total_amount: totalAmount,
      item_count: payrolls.length,
    };
  }


  // ── 重新抓取原始工作記錄並重建糧單工作記錄快照（維持草稿流程）─────
  async resetAndRefetch(id: number, userId?: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: { include: { company: true } },
        adjustments: true,
        items: true,
      },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (!['draft', 'preparing'].includes(payroll.status)) {
      throw new BadRequestException('只能對草稿或準備中的糧單重新抓取資料');
    }

    const emp = payroll.employee;
    const dateFrom = toDateStr(payroll.date_from) || `${payroll.period}-01`;
    const dateTo =
      toDateStr(payroll.date_to) ||
      (() => {
        const [y, m] = payroll.period.split('-');
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        return `${payroll.period}-${String(lastDay).padStart(2, '0')}`;
      })();

    const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
      where: {
        employee_id: emp.id,
        effective_date: { lte: new Date(dateTo) },
      },
      orderBy: { effective_date: 'desc' },
    });

    if (!salarySetting) {
      throw new BadRequestException('此員工沒有薪酬配置，無法重新計算糧單');
    }

    const wlWhere: any = {
      employee_id: emp.id,
      scheduled_date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
      OR: [
        { service_type: { not: '請假/休息' } },
        { service_type: null },
      ],
      deleted_at: null,
    };

    const workLogs = await this.prisma.workLog.findMany({
      where: wlWhere,
      include: {
        company_profile: true,
        company: true,
        client: true,
        quotation: true,
      },
      orderBy: { scheduled_date: 'asc' },
    });

    const enrichedWorkLogs =
      await this.calcService.enrichWorkLogsWithPrice(workLogs);

    const payrollWorkLogData = enrichedWorkLogs.map((wl: any) => {
      const baseAmt = wl._line_amount ?? 0;
      const otAmt = wl._ot_line_amount ?? 0;
      const midShiftAmt = wl._mid_shift_line_amount ?? 0;
      const totalLineAmount = baseAmt + otAmt + midShiftAmt;

      return {
        payroll_id: id,
        work_log_id: wl.id,
        service_type: wl.service_type,
        scheduled_date: wl.scheduled_date,
        day_night: wl.day_night,
        start_location: wl.start_location,
        end_location: wl.end_location,
        machine_type: wl.machine_type,
        tonnage: wl.tonnage,
        equipment_number: wl.equipment_number,
        quantity: wl.quantity,
        unit: wl.unit,
        ot_quantity: wl.ot_quantity,
        ot_unit: wl.ot_unit,
        is_mid_shift: wl.is_mid_shift ?? false,
        remarks: wl.remarks,
        matched_rate_card_id:
          wl._matched_rate_card_id ?? wl.matched_rate_card_id ?? null,
        matched_rate: wl._matched_rate ?? wl.matched_rate ?? null,
        matched_unit: wl._matched_unit ?? wl.matched_unit ?? null,
        matched_ot_rate: wl._matched_ot_rate ?? wl.matched_ot_rate ?? null,
        matched_mid_shift_rate:
          wl._matched_mid_shift_rate ?? wl.matched_mid_shift_rate ?? null,
        price_match_status:
          wl._price_match_status ?? wl.price_match_status ?? null,
        price_match_note: wl._price_match_note ?? wl.price_match_note ?? null,
        line_amount: totalLineAmount,
        ot_line_amount: otAmt,
        mid_shift_line_amount: midShiftAmt,
        group_key: wl._group_key ?? '',
        client_id: wl.client_id ?? null,
        client_name: wl.client?.name ?? wl.client_name ?? null,
        company_profile_id: wl.company_profile_id ?? null,
        company_profile_name:
          wl.company_profile?.chinese_name ?? wl.company_profile_name ?? null,
        company_id: wl.company_id ?? null,
        company_name: wl.company?.name ?? null,
        quotation_id: wl.quotation_id ?? null,
        client_contract_no:
          wl.quotation?.quotation_no ?? wl.client_contract_no ?? null,
        payroll_work_log_product_name: wl.work_log_product_name ?? null,
        payroll_work_log_product_unit: wl.work_log_product_unit ?? null,
        payroll_work_log_product_quantity: wl.goods_quantity ?? null,
        is_modified: false,
        is_excluded: false,
      };
    });

    // Phase 2: Collect linked allowance keys for this payroll to support priority rules
    const autoAllowances = await this.prisma.payrollDailyAllowance.findMany({
      where: { payroll_id: id, is_auto: true },
      select: { allowance_key: true },
    });
    const linkedAllowanceKeys = [...new Set(autoAllowances.map(a => a.allowance_key))];

    const workLogLike = payrollWorkLogData.map((pwl: any) => ({
      id: pwl.work_log_id,
      scheduled_date: pwl.scheduled_date,
      service_type: pwl.service_type,
      day_night: pwl.day_night,
      start_location: pwl.start_location,
      end_location: pwl.end_location,
      machine_type: pwl.machine_type,
      tonnage: pwl.tonnage,
      equipment_number: pwl.equipment_number,
      quantity: pwl.quantity,
      unit: pwl.unit,
      ot_quantity: pwl.ot_quantity,
      ot_unit: pwl.ot_unit,
      remarks: pwl.remarks,
      company_profile_id: pwl.company_profile_id,
      company_id: pwl.company_id,
      client_id: pwl.client_id,
      quotation_id: pwl.quotation_id,
      matched_rate_card_id: pwl.matched_rate_card_id,
      matched_rate: pwl.matched_rate,
      matched_unit: pwl.matched_unit,
      matched_ot_rate: pwl.matched_ot_rate,
      matched_mid_shift_rate: pwl.matched_mid_shift_rate,
      price_match_status: pwl.price_match_status,
      price_match_note: pwl.price_match_note,
      is_mid_shift: pwl.is_mid_shift,
      line_amount: pwl.line_amount,
      ot_line_amount: pwl.ot_line_amount,
      mid_shift_line_amount: pwl.mid_shift_line_amount,
      _linked_allowance_keys: linkedAllowanceKeys,
    }));

    let holidayDatesForCalc: { date: Date; name: string }[] = [];
    {
      const holidays = await this.statutoryHolidaysService.findByDateRange(
        dateFrom,
        dateTo,
      );
      holidayDatesForCalc = holidays.map((h: any) => ({
        date: h.date,
        name: h.name,
      }));
    }

    const adjustmentTotal = (payroll.adjustments || []).reduce(
      (sum: number, adj: any) => sum + (Number(adj.amount) || 0),
      0,
    );
    const storedMpfRelevantIncome =
      payroll.mpf_relevant_income !== null && payroll.mpf_relevant_income !== undefined
        ? Number(payroll.mpf_relevant_income)
        : undefined;
    const previousGrossAmount =
      (Number(payroll.base_amount) || 0) +
      (Number(payroll.allowance_total) || 0) +
      (Number(payroll.ot_total) || 0) +
      (Number(payroll.commission_total) || 0);
    const previousMpfItem = (payroll.items || []).find(
      (item: any) => item.item_type === 'mpf_deduction',
    );
    const previousMpfDays = Math.max(0, Number(previousMpfItem?.quantity) || 0);
    const previousAutoMpfBaseCandidates = payroll.mpf_plan === 'industry'
      ? [
          previousGrossAmount,
          previousGrossAmount + adjustmentTotal,
          previousMpfDays > 0 ? previousGrossAmount / previousMpfDays : 0,
          previousMpfDays > 0 ? (previousGrossAmount + adjustmentTotal) / previousMpfDays : 0,
        ]
      : [previousGrossAmount, previousGrossAmount + adjustmentTotal];
    const existingMpfRelevantIncome =
      storedMpfRelevantIncome !== undefined &&
      previousAutoMpfBaseCandidates.every(
        (candidate) => Math.abs(storedMpfRelevantIncome - candidate) >= 0.01,
      )
        ? storedMpfRelevantIncome
        : undefined;

    const calculationDailyAllowancesResetPre = await this.getCalculationDailyAllowances(id);
    const calc = await this.calcService.calculatePayroll(
      emp,
      salarySetting,
      workLogLike,
      dateFrom,
      dateTo,
      payroll.company_id ?? payroll.company_profile_id ?? null,
      existingMpfRelevantIncome,
      holidayDatesForCalc,
      new Set<string>(),
      calculationDailyAllowancesResetPre,
      adjustmentTotal,
    );

    const actualCompanyId =
      payroll.company_id ??
      (payrollWorkLogData.length > 0 ? payrollWorkLogData[0].company_id : null);
    const actualCpId =
      payroll.company_profile_id ??
      (payrollWorkLogData.length > 0
        ? payrollWorkLogData[0].company_profile_id
        : null);

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollWorkLog.deleteMany({ where: { payroll_id: id } });
      await tx.payrollItem.deleteMany({ where: { payroll_id: id } });

      if (payrollWorkLogData.length > 0) {
        await tx.payrollWorkLog.createMany({ data: payrollWorkLogData });
      }

      if (calc.items.length > 0) {
        await tx.payrollItem.createMany({
          data: calc.items.map((item: any) => ({
            ...item,
            payroll_id: id,
          })),
        });
      }

      await tx.payroll.update({
        where: { id },
        data: {
          company_profile_id: actualCpId ?? undefined,
          company_id: actualCompanyId ?? undefined,
          salary_type: calc.salary_type,
          base_rate: calc.base_rate,
          work_days: calc.work_days,
          work_nights: calc.work_nights || 0,
          base_amount: calc.base_amount,
          allowance_total: calc.allowance_total,
          ot_total: calc.ot_total,
          commission_total: calc.commission_total,
          mpf_deduction: calc.mpf_deduction,
          mpf_plan: calc.mpf_plan,
          mpf_employer: calc.mpf_employer,
          mpf_relevant_income: calc.mpf_relevant_income,
          adjustment_total: adjustmentTotal,
          net_amount: calc.net_amount + adjustmentTotal,
          status: 'draft',
        },
      });

      // Reset auto daily allowances
      await tx.payrollDailyAllowance.deleteMany({
        where: { payroll_id: id, is_auto: true },
      });
    });

    // Re-generate auto daily allowances, then recalculate from PayrollDailyAllowance as source of truth.
    await this.generateAllAutoDailyAllowances(
      id,
      salarySetting,
      payrollWorkLogData,
      dateFrom,
      dateTo,
    );
    const calculationDailyAllowancesReset = await this.getCalculationDailyAllowances(id);
    const finalResetCalc = await this.calcService.calculatePayroll(
      emp,
      salarySetting,
      workLogLike,
      dateFrom,
      dateTo,
      payroll.company_id ?? payroll.company_profile_id ?? null,
      existingMpfRelevantIncome,
      holidayDatesForCalc,
      new Set<string>(),
      calculationDailyAllowancesReset,
      adjustmentTotal,
    );
    await this.prisma.payrollItem.deleteMany({ where: { payroll_id: id } });
    if (finalResetCalc.items.length > 0) {
      await this.prisma.payrollItem.createMany({
        data: finalResetCalc.items.map((item: any) => ({
          ...item,
          payroll_id: id,
        })),
      });
    }
    await this.prisma.payroll.update({
      where: { id },
      data: {
        salary_type: finalResetCalc.salary_type,
        base_rate: finalResetCalc.base_rate,
        work_days: finalResetCalc.work_days,
        work_nights: finalResetCalc.work_nights || 0,
        base_amount: finalResetCalc.base_amount,
        allowance_total: finalResetCalc.allowance_total,
        ot_total: finalResetCalc.ot_total,
        commission_total: finalResetCalc.commission_total,
        mpf_deduction: finalResetCalc.mpf_deduction,
        mpf_plan: finalResetCalc.mpf_plan,
        mpf_employer: finalResetCalc.mpf_employer,
        mpf_relevant_income: finalResetCalc.mpf_relevant_income,
        adjustment_total: adjustmentTotal,
        net_amount: finalResetCalc.net_amount + adjustmentTotal,
        status: 'draft',
      },
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'payrolls',
          targetId: id,
          changesAfter: {
            status: 'draft',
            work_log_count: payrollWorkLogData.length,
            net_amount: finalResetCalc.net_amount + adjustmentTotal,
          },
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return this.findOne(id);
  }

  // ── 重新計算糧單 ──────────────────────────────────────────────
  async recalculate(id: number, overrideManualRates?: boolean) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: { include: { company: true } },
        adjustments: true,
        items: true,
      },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能重新計算草稿或準備中狀態的糧單');
    }

    const empId = payroll.employee_id;
    const dateFrom = toDateStr(payroll.date_from) || `${payroll.period}-01`;
    const dateTo =
      toDateStr(payroll.date_to) ||
      (() => {
        const [y, m] = payroll.period.split('-');
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        return `${payroll.period}-${String(lastDay).padStart(2, '0')}`;
      })();
    const cpId = payroll.company_profile_id;
    const companyId = payroll.company_id;

    const emp = await this.prisma.employee.findUnique({
      where: { id: empId },
      include: { company: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
      where: {
        employee_id: emp.id,
        effective_date: { lte: new Date(dateTo) },
      },
      orderBy: { effective_date: 'desc' },
    });

    if (!salarySetting) {
      throw new BadRequestException('此員工沒有薪酬配置，無法重新計算');
    }

    // Get active payroll work logs (use snapshot data, not original work logs)
    const pwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: id, is_excluded: false },
      orderBy: { scheduled_date: 'asc' },
    });

    // Re-match prices for each work log, respecting manual rates
    const manualRateConflicts: { pwl_id: number; group_key: string; old_rate: number; new_rate: number }[] = [];

    for (const pwl of pwls) {
      // 跳過用戶主動取消匹配的記錄
      if (pwl.price_match_status === 'manual_unmatched') {
        continue;
      }
      const priceInfo = await this.calcService.rematchPayrollWorkLogPrice(pwl);
      const systemMatched = priceInfo.price_match_status === 'matched';
      const hasManualRate = pwl.is_manual_rate === true;

      if (hasManualRate && systemMatched) {
        // Conflict: manual rate exists but system also found a match
        if (overrideManualRates === true) {
          // Override manual rate with system match
          const updateData: any = {
            ...priceInfo,
            is_manual_rate: false,
          };
          const finalPwl = { ...pwl, ...updateData };
          updateData.line_amount = this.calcService.calculateLineAmount(finalPwl);
          await this.prisma.payrollWorkLog.update({
            where: { id: pwl.id },
            data: updateData,
          });
        } else if (overrideManualRates === undefined) {
          // First pass: detect conflicts, don't update manual rates
          manualRateConflicts.push({
            pwl_id: pwl.id,
            group_key: pwl.group_key || '',
            old_rate: Number(pwl.matched_rate) || 0,
            new_rate: Number(priceInfo.matched_rate) || 0,
          });
          // Keep manual rate, don't update this pwl's price fields
        } else {
          // overrideManualRates === false: keep manual rate
          // Don't update price fields for this pwl
        }
      } else if (!hasManualRate) {
        // No manual rate: always use system match result
        const updateData: any = { ...priceInfo };
        const finalPwl = { ...pwl, ...updateData };
        updateData.line_amount = this.calcService.calculateLineAmount(finalPwl);
        await this.prisma.payrollWorkLog.update({
          where: { id: pwl.id },
          data: updateData,
        });
      }
      // If hasManualRate && !systemMatched, keep manual rate as is
    }

    // If there are conflicts and this is the first pass, return conflicts
    if (manualRateConflicts.length > 0 && overrideManualRates === undefined) {
      return {
        has_manual_rate_conflicts: true,
        conflicts: manualRateConflicts,
        message: '系統已配對到新單價，但部分記錄已有手動設定的單價。是否要覆蓋？',
      };
    }

    // Re-read updated pwls for payroll calculation
    const updatedPwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: id, is_excluded: false },
      orderBy: { scheduled_date: 'asc' },
    });

    // Convert PayrollWorkLog to WorkLog-like objects for calculation
    const workLogLike = updatedPwls.map((pwl) => ({
      id: pwl.work_log_id,
      scheduled_date: pwl.scheduled_date,
      service_type: pwl.service_type,
      day_night: pwl.day_night,
      start_location: pwl.start_location,
      end_location: pwl.end_location,
      machine_type: pwl.machine_type,
      tonnage: pwl.tonnage,
      equipment_number: pwl.equipment_number,
      quantity: pwl.quantity,
      unit: pwl.unit,
      ot_quantity: pwl.ot_quantity,
      ot_unit: pwl.ot_unit,
      remarks: pwl.remarks,
      company_profile_id: pwl.company_profile_id,
      company_id: pwl.company_id,
      client_id: pwl.client_id,
      quotation_id: pwl.quotation_id,
      matched_rate_card_id: pwl.matched_rate_card_id,
      matched_rate: pwl.matched_rate,
      matched_unit: pwl.matched_unit,
      matched_ot_rate: pwl.matched_ot_rate,
      matched_mid_shift_rate: pwl.matched_mid_shift_rate,
      price_match_status: pwl.price_match_status,
      price_match_note: pwl.price_match_note,
      is_mid_shift: pwl.is_mid_shift || false,
      line_amount: pwl.line_amount,
      ot_line_amount: pwl.ot_line_amount,
      mid_shift_line_amount: pwl.mid_shift_line_amount,
      payroll_work_log_product_quantity: pwl.payroll_work_log_product_quantity,
      billing_quantity_type: pwl.billing_quantity_type,
    }));

    // Preserve manual mpf_relevant_income if set; otherwise refresh the automatic default base.
    const adjustments = payroll.adjustments || [];
    const adjustmentTotal = adjustments.reduce(
      (sum: number, adj: any) => sum + (Number(adj.amount) || 0),
      0,
    );
    const storedMpfRelevantIncome =
      payroll.mpf_relevant_income !== null &&
      payroll.mpf_relevant_income !== undefined
        ? Number(payroll.mpf_relevant_income)
        : undefined;
    const previousGrossAmount =
      (Number(payroll.base_amount) || 0) +
      (Number(payroll.allowance_total) || 0) +
      (Number(payroll.ot_total) || 0) +
      (Number(payroll.commission_total) || 0);
    const previousMpfItem = (payroll.items || []).find(
      (item: any) => item.item_type === 'mpf_deduction',
    );
    const previousMpfDays = Math.max(0, Number(previousMpfItem?.quantity) || 0);
    const previousAutoMpfBaseCandidates = payroll.mpf_plan === 'industry'
      ? [
          previousGrossAmount,
          previousGrossAmount + adjustmentTotal,
          previousMpfDays > 0 ? previousGrossAmount / previousMpfDays : 0,
          previousMpfDays > 0 ? (previousGrossAmount + adjustmentTotal) / previousMpfDays : 0,
        ]
      : [previousGrossAmount, previousGrossAmount + adjustmentTotal];
    const existingMpfRelevantIncome =
      storedMpfRelevantIncome !== undefined &&
      previousAutoMpfBaseCandidates.every(
        (candidate) => Math.abs(storedMpfRelevantIncome - candidate) >= 0.01,
      )
        ? storedMpfRelevantIncome
        : undefined;

    // 查出法定假日，傳給 calculatePayroll（日薪用於假日津貼，月薪用於計糧天數）
    let recalcHolidayDates: { date: Date; name: string }[] = [];
    {
      const recalcHolidays =
        await this.statutoryHolidaysService.findByDateRange(dateFrom, dateTo);
      recalcHolidayDates = recalcHolidays.map((h: any) => ({
        date: h.date,
        name: h.name,
      }));
    }

    await this.prisma.payrollDailyAllowance.deleteMany({
      where: { payroll_id: id, is_auto: true },
    });
    await this.generateAllAutoDailyAllowances(
      id,
      salarySetting,
      updatedPwls as any,
      dateFrom,
      dateTo,
    );
    const calculationDailyAllowances = await this.getCalculationDailyAllowances(id);

    // 載入手動覆蓋天數 map（recalculate 時保護 is_manual_day_quantity = true 的天）
    const manualDayQuantityMap = await this.loadManualDayQuantityMap(id);

    const calc = await this.calcService.calculatePayroll(
      emp,
      salarySetting,
      workLogLike,
      dateFrom,
      dateTo,
      companyId ?? cpId,
      existingMpfRelevantIncome,
      recalcHolidayDates,
      new Set<string>(),
      calculationDailyAllowances,
      adjustmentTotal,
      manualDayQuantityMap,
    );

    // Update payroll items; preserve manually excluded items by stable item signature.
    const previouslyExcludedItemKeys = new Set(
      ((payroll as any).items || [])
        .filter((item: any) => item.payroll_item_excluded)
        .map((item: any) => this.buildPayrollItemSignature(item)),
    );

    // Preserve manual amount items: record their amounts before deletion
    const manualAmountItems = new Map<string, { amount: number }>();
    for (const item of ((payroll as any).items || [])) {
      if (item.payroll_item_is_manual_amount) {
        const key = `${item.item_type || ''}|${item.item_name || ''}`;
        manualAmountItems.set(key, { amount: Number(item.amount) });
      }
    }

    await this.prisma.payrollItem.deleteMany({ where: { payroll_id: id } });
    for (const item of calc.items) {
      const signature = this.buildPayrollItemSignature(item);
      const manualKey = `${item.item_type || ''}|${item.item_name || ''}`;
      const manualEntry = manualAmountItems.get(manualKey);
      await this.prisma.payrollItem.create({
        data: {
          ...item,
          payroll_id: id,
          payroll_item_excluded: Boolean(item.payroll_item_excluded) || previouslyExcludedItemKeys.has(signature),
          ...(manualEntry ? { amount: manualEntry.amount, payroll_item_is_manual_amount: true } : {}),
        },
      });
    }

    // Update payroll totals (preserve mpf_relevant_income)
    await this.prisma.payroll.update({
      where: { id },
      data: {
        salary_type: calc.salary_type,
        base_rate: calc.base_rate,
        work_days: calc.work_days,
        work_nights: calc.work_nights || 0,
        base_amount: calc.base_amount,
        allowance_total: calc.allowance_total,
        ot_total: calc.ot_total,
        commission_total: calc.commission_total,
        mpf_deduction: calc.mpf_deduction,
        mpf_plan: calc.mpf_plan,
        mpf_employer: calc.mpf_employer,
        adjustment_total: adjustmentTotal,
        net_amount: calc.net_amount + adjustmentTotal,
      },
    });
    await this.rebuildPayrollTotalsFromItems(id);

    return this.findOne(id);
  }


  async updatePayrollItem(payrollId: number, itemId: number, body: { payroll_item_excluded?: boolean; amount?: number; reset_manual_amount?: boolean }) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單項目');
    }

    const item = await this.prisma.payrollItem.findFirst({
      where: { id: itemId, payroll_id: payrollId },
    });
    if (!item) throw new NotFoundException('Payroll item not found');

    // Handle reset_manual_amount: clear flag and trigger recalculate to restore system amount
    if (body.reset_manual_amount === true) {
      await this.prisma.payrollItem.update({
        where: { id: itemId },
        data: { payroll_item_is_manual_amount: false },
      });
      // Recalculate to restore system-computed amount for this item
      await this.recalculate(payrollId, false);
      return this.findOne(payrollId);
    }

    const updateData: { payroll_item_excluded?: boolean; amount?: number; payroll_item_is_manual_amount?: boolean } = {};

    // Handle excluded toggle
    if (body.payroll_item_excluded !== undefined) {
      updateData.payroll_item_excluded = Boolean(body.payroll_item_excluded);
    }

    // Handle manual amount update
    if (body.amount !== undefined && Number(body.amount) !== Number(item.amount)) {
      updateData.amount = Number(body.amount);
      updateData.payroll_item_is_manual_amount = true;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.payrollItem.update({
        where: { id: itemId },
        data: updateData,
      });
    }

    await this.rebuildPayrollTotalsFromItems(payrollId);
    return this.findOne(payrollId);
  }

  // ── 編輯糧單工作記錄（只改糧單記錄）──────────────────────────
  async updatePayrollWorkLog(payrollId: number, pwlId: number, body: any) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const pwl = await this.prisma.payrollWorkLog.findFirst({
      where: { id: pwlId, payroll_id: payrollId },
    });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    // Check if this is a manual rate override
    const isManualRateSet = body.matched_rate !== undefined;
    const isManualOtRateSet = body.matched_ot_rate !== undefined;

    // Update snapshot fields
    const editableFields = [
      'service_type',
      'scheduled_date',
      'day_night',
      'start_location',
      'end_location',
      'machine_type',
      'tonnage',
      'equipment_number',
      'quantity',
      'unit',
      'ot_quantity',
      'ot_unit',
      'is_mid_shift',
      'remarks',
      'client_name',
      'client_contract_no',
      'payroll_work_log_product_name',
      'payroll_work_log_product_quantity',
      'payroll_work_log_product_unit',
      'billing_quantity_type',
    ];

    const updateData: any = { is_modified: true };
    for (const field of editableFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (isManualRateSet || isManualOtRateSet) {
      // Manual rate override: set the rate directly
      if (isManualRateSet) {
        const manualRate = body.matched_rate === null ? null : Number(body.matched_rate);
        updateData.matched_rate = manualRate;
        updateData.is_manual_rate = manualRate !== null;
        if (manualRate !== null) {
          updateData.price_match_status = 'matched';
          updateData.price_match_note = '手動設定';
        } else {
          updateData.price_match_status = 'unmatched';
          updateData.price_match_note = '未設定';
          updateData.is_manual_rate = false;
        }
      }
      if (isManualOtRateSet) {
        updateData.matched_ot_rate = body.matched_ot_rate === null ? null : Number(body.matched_ot_rate);
        updateData.is_manual_rate = true;
      }
    } else {
      // Re-match price if relevant fields changed
      const priceRelatedFields = [
        'client_id',
        'company_profile_id',
        'company_id',
        'machine_type',
        'tonnage',
        'day_night',
        'start_location',
        'end_location',
        'is_mid_shift',
      ];
      const hasPriceChange = priceRelatedFields.some(
        (f) => body[f] !== undefined,
      );

      // Merge current data with updates for price matching
      const mergedPwl = { ...pwl, ...updateData };

      if (hasPriceChange) {
        const priceInfo =
          await this.calcService.rematchPayrollWorkLogPrice(mergedPwl);
        Object.assign(updateData, priceInfo);
      }
    }

    // Recalculate line amount
    const finalPwl = { ...pwl, ...updateData };
    updateData.line_amount = this.calcService.calculateLineAmount(finalPwl);

    // Recalculate group_key if grouping fields changed
    const groupKeyFields = [
      'client_name',
      'client_contract_no',
      'service_type',
      'day_night',
      'start_location',
      'end_location',
      'machine_type',
      'tonnage',
    ];
    const hasGroupKeyChange = groupKeyFields.some((f) => body[f] !== undefined);
    if (hasGroupKeyChange) {
      updateData.group_key = this.calcService.buildGroupKeyFromPwl(finalPwl);
    }

    await this.prisma.payrollWorkLog.update({
      where: { id: pwlId },
      data: updateData,
    });

    return this.prisma.payrollWorkLog.findUnique({ where: { id: pwlId } });
  }

  // ── 批量刪除糧單工作記錄（只刪除糧單快照，不刪除原始大數據）────────────────
  async batchDeletePayrollWorkLogs(payrollId: number, ids: number[]) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const safeIds = Array.isArray(ids)
      ? ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (safeIds.length === 0) {
      return { success: true, deleted: 0 };
    }

    const result = await this.prisma.payrollWorkLog.deleteMany({
      where: {
        payroll_id: payrollId,
        id: { in: safeIds },
      },
    });

    return { success: true, deleted: result.count };
  }

  // ── 編輯原始工作記錄（編輯大數據）──────────────────────────
  async updateOriginalWorkLog(payrollId: number, pwlId: number, body: any) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const pwl = await this.prisma.payrollWorkLog.findFirst({
      where: { id: pwlId, payroll_id: payrollId },
    });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    // Update original work log
    const editableFields = [
      'service_type',
      'scheduled_date',
      'day_night',
      'start_location',
      'end_location',
      'machine_type',
      'tonnage',
      'equipment_number',
      'quantity',
      'unit',
      'ot_quantity',
      'ot_unit',
      'remarks',
    ];

    const wlUpdateData: any = {};
    for (const field of editableFields) {
      if (body[field] !== undefined) {
        wlUpdateData[field] = body[field];
      }
    }

    if (Object.keys(wlUpdateData).length > 0 && pwl.work_log_id) {
      await this.prisma.workLog.update({
        where: { id: pwl.work_log_id },
        data: wlUpdateData,
      });
    }

    // Also update the snapshot in payroll_work_logs
    const pwlUpdateData: any = {};
    for (const field of editableFields) {
      if (body[field] !== undefined) {
        pwlUpdateData[field] = body[field];
      }
    }

    // Re-match price
    const mergedPwl = { ...pwl, ...pwlUpdateData };
    const priceInfo =
      await this.calcService.rematchPayrollWorkLogPrice(mergedPwl);
    Object.assign(pwlUpdateData, priceInfo);
    pwlUpdateData.line_amount = this.calcService.calculateLineAmount({
      ...mergedPwl,
      ...priceInfo,
    });

    await this.prisma.payrollWorkLog.update({
      where: { id: pwlId },
      data: pwlUpdateData,
    });

    return this.prisma.payrollWorkLog.findUnique({ where: { id: pwlId } });
  }

  // ── 從糧單移除工作記錄 ──────────────────────────────────────
  async excludePayrollWorkLog(payrollId: number, pwlId: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const pwl = await this.prisma.payrollWorkLog.findFirst({
      where: { id: pwlId, payroll_id: payrollId },
    });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    await this.prisma.payrollWorkLog.update({
      where: { id: pwlId },
      data: { is_excluded: true },
    });

    return { success: true };
  }

  // ── 恢復已移除的工作記錄 ──────────────────────────────────────
  async restorePayrollWorkLog(payrollId: number, pwlId: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const pwl = await this.prisma.payrollWorkLog.findFirst({
      where: { id: pwlId, payroll_id: payrollId },
    });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    await this.prisma.payrollWorkLog.update({
      where: { id: pwlId },
      data: { is_excluded: false },
    });

    return { success: true };
  }

  // ── 新增自定義調整項 ──────────────────────────────────────────
  async addAdjustment(
    payrollId: number,
    body: { item_name: string; amount: number; remarks?: string; date?: string },
  ) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const maxSortResult = await this.prisma.payrollAdjustment.aggregate({
      where: { payroll_id: payrollId },
      _max: { sort_order: true },
    });

    const saved = await this.prisma.payrollAdjustment.create({
      data: {
        payroll_id: payrollId,
        item_name: body.item_name,
        amount: body.amount,
        adjustment_date: body.date ? new Date(body.date) : undefined,
        remarks: body.remarks || undefined,
        sort_order: (maxSortResult._max.sort_order || 0) + 1,
      },
    });

    // Recalculate adjustment total and net amount
    await this.recalcAdjustmentTotal(payrollId);

    return saved;
  }

  // ── 刪除自定義調整項 ──────────────────────────────────────────
  async removeAdjustment(payrollId: number, adjId: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const adj = await this.prisma.payrollAdjustment.findFirst({
      where: { id: adjId, payroll_id: payrollId },
    });
    if (!adj) throw new NotFoundException('Adjustment not found');

    await this.prisma.payrollAdjustment.delete({ where: { id: adjId } });

    // Recalculate
    await this.recalcAdjustmentTotal(payrollId);

    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 每日津貼管理 ──────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  // 新增每日津貼
  async addDailyAllowance(
    payrollId: number,
    body: {
      date: string;
      allowance_key: string;
      allowance_name: string;
      amount: number;
      remarks?: string;
    },
  ) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    // Check if same allowance already exists for this date
    const existing = await this.prisma.payrollDailyAllowance.findFirst({
      where: {
        payroll_id: payrollId,
        date: new Date(body.date),
        allowance_key: body.allowance_key,
      },
    });
    if (existing) {
      if (body.allowance_key === 'base_top_up_override') {
        return this.prisma.payrollDailyAllowance.update({
          where: { id: existing.id },
          data: {
            allowance_name: body.allowance_name,
            amount: body.amount,
            remarks: body.remarks || undefined,
          },
        });
      }
      throw new BadRequestException(`此日期已有「${body.allowance_name}」津貼`);
    }

    const saved = await this.prisma.payrollDailyAllowance.create({
      data: {
        payroll_id: payrollId,
        date: new Date(body.date),
        allowance_key: body.allowance_key,
        allowance_name: body.allowance_name,
        amount: body.amount,
        remarks: body.remarks || undefined,
        is_auto: false, // Manually added
      },
    });

    return saved;
  }

  // 刪除每日津貼
  async removeDailyAllowance(payrollId: number, daId: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const da = await this.prisma.payrollDailyAllowance.findFirst({
      where: { id: daId, payroll_id: payrollId },
    });
    if (!da) throw new NotFoundException('Daily allowance not found');
    await this.prisma.payrollDailyAllowance.delete({ where: { id: daId } });
    // 刪除任何自動生成的逐日津貼時，建立日期級 excluded_ 記錄，避免重算後被加回。
    if (da.is_auto === true && da.date && !da.allowance_key.startsWith('excluded_')) {
      const dateStr = toDateStr(da.date);
      const excludedKey = `excluded_${da.allowance_key}_${dateStr}`;
      const existing = await this.prisma.payrollDailyAllowance.findFirst({
        where: { payroll_id: payrollId, allowance_key: excludedKey },
      });
      if (!existing) {
        await this.prisma.payrollDailyAllowance.create({
          data: {
            payroll_id: payrollId,
            date: da.date,
            allowance_key: excludedKey,
            allowance_name: `排除${da.allowance_name || da.allowance_key} (${dateStr})`,
            amount: 0,
            is_auto: false,
          },
        });
      }
    }
    return { success: true };
  }

  // 批量設定某日的津貼
  async setDailyAllowances(
    payrollId: number,
    body: {
      date: string;
      allowances: {
        allowance_key: string;
        allowance_name: string;
        amount: number;
        remarks?: string;
      }[];
    },
  ) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    // Delete existing display allowances for this date, but preserve manual base top-up override records
    await this.prisma.payrollDailyAllowance.deleteMany({
      where: {
        payroll_id: payrollId,
        date: new Date(body.date),
        allowance_key: { not: 'base_top_up_override' },
      },
    });

    // Create new ones
    const saved: any[] = [];
    for (const a of body.allowances) {
      const da = await this.prisma.payrollDailyAllowance.create({
        data: {
          payroll_id: payrollId,
          date: new Date(body.date),
          allowance_key: a.allowance_key,
          allowance_name: a.allowance_name,
          amount: a.amount,
          remarks: a.remarks || undefined,
          is_auto: false, // Batch set is manual
        },
      });
      saved.push(da);
    }

    return saved;
  }

  // 取得員工可用的津貼選項
  async getAllowanceOptions(employeeId: number, dateTo: string) {
    const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
      where: {
        employee_id: employeeId,
        effective_date: { lte: new Date(dateTo) },
      },
      orderBy: { effective_date: 'desc' },
    });

    return this.calcService.buildAllowanceOptions(salarySetting);
  }

  async excludeBadge(id: number, date: string, badgeKey: string) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');

    const excludedKey = `excluded_${badgeKey}`;
    const excludedDate = new Date(date);
    const existing = await this.prisma.payrollDailyAllowance.findFirst({
      where: {
        payroll_id: id,
        date: excludedDate,
        allowance_key: excludedKey,
      },
    });

    if (!existing) {
      await this.prisma.payrollDailyAllowance.create({
        data: {
          payroll_id: id,
          date: excludedDate,
          allowance_key: excludedKey,
          allowance_name: `已移除的津貼: ${badgeKey}`,
          amount: 0,
          is_auto: false,
        },
      });
    }

    return { success: true };
  }

  async restoreBadge(id: number, date: string, badgeKey: string) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');

    const excludedDate = new Date(date);
    const excludedKey = `excluded_${badgeKey}`;

    await this.prisma.payrollDailyAllowance.deleteMany({
      where: {
        payroll_id: id,
        date: excludedDate,
        allowance_key: excludedKey,
      },
    });

    if (badgeKey.startsWith('statutory_holiday_')) {
      const existingHolidayAllowance = await this.prisma.payrollDailyAllowance.findFirst({
        where: {
          payroll_id: id,
          date: excludedDate,
          allowance_key: 'statutory_holiday',
        },
      });

      if (!existingHolidayAllowance && payroll.employee_id) {
        const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
          where: {
            employee_id: payroll.employee_id,
            effective_date: { lte: payroll.date_to || excludedDate },
          },
          orderBy: { effective_date: 'desc' },
        });
        const baseSalaryForHoliday = Number(salarySetting?.base_salary) || 0;
        const [holiday] = await this.statutoryHolidaysService.findByDateRange(
          date,
          date,
        );

        if (baseSalaryForHoliday > 0) {
          await this.prisma.payrollDailyAllowance.create({
            data: {
              payroll_id: id,
              date: excludedDate,
              allowance_key: 'statutory_holiday',
              allowance_name: `法定假期 - ${holiday?.name || date}`,
              amount: baseSalaryForHoliday,
              is_auto: true,
            },
          });
        }
      }
    }

    return { success: true };
  }

  // ── 統計摘要 ──────────────────────────────────────────────────
  async getSummary(query: PayrollQuery) {
    const where: any = {};
    if (query.period) where.period = query.period;
    if (query.company_profile_id)
      where.company_profile_id = Number(query.company_profile_id);
    if (query.company_id) where.company_id = Number(query.company_id);

    const result = await this.prisma.payroll.aggregate({
      where,
      _count: true,
      _sum: {
        base_amount: true,
        allowance_total: true,
        ot_total: true,
        commission_total: true,
        mpf_deduction: true,
        net_amount: true,
      },
    });

    return {
      count: result._count || 0,
      total_base: Number(result._sum.base_amount) || 0,
      total_allowance: Number(result._sum.allowance_total) || 0,
      total_ot: Number(result._sum.ot_total) || 0,
      total_commission: Number(result._sum.commission_total) || 0,
      total_mpf: Number(result._sum.mpf_deduction) || 0,
      total_net: Number(result._sum.net_amount) || 0,
    };
  }

  private async recalcAdjustmentTotal(payrollId: number): Promise<void> {
    const adjustments = await this.prisma.payrollAdjustment.findMany({
      where: { payroll_id: payrollId },
    });
    const adjustmentTotal = adjustments.reduce(
      (sum, adj) => sum + Number(adj.amount),
      0,
    );

    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) return;

    const grossIncome =
      Number(payroll.base_amount) +
      Number(payroll.allowance_total) +
      Number(payroll.ot_total) +
      Number(payroll.commission_total);
    const mpfDeduction = Number(payroll.mpf_deduction);

    await this.prisma.payroll.update({
      where: { id: payrollId },
      data: {
        adjustment_total: adjustmentTotal,
        net_amount: grossIncome - mpfDeduction + adjustmentTotal,
      },
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 員工報銷管理 (Payroll Reimbursement)
  // ══════════════════════════════════════════════════════════════

  /**
   * 取得該員工未結算的 SELF_PAID 報銷項目
   * 排除已附加到當前糧單的項目
   */
  async getUnsettledExpenses(payrollId: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
      include: { payroll_expenses: true },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');

    // Get expense IDs already attached to this payroll
    const attachedIds = payroll.payroll_expenses.map(
      (pe) => pe.payroll_expense_expense_id,
    );

    const expenses = await this.prisma.expense.findMany({
      where: {
        employee_id: payroll.employee_id,
        expense_payment_method: 'SELF_PAID',
        expense_settled_payroll_id: null,
        deleted_at: null,
        id: attachedIds.length > 0 ? { notIn: attachedIds } : undefined,
      },
      include: {
        category: { include: { parent: true } },
      },
      orderBy: { date: 'desc' },
    });

    return expenses;
  }

  /**
   * 將報銷項目附加到糧單
   */
  async attachExpenses(payrollId: number, expenseIds: number[]) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能在草稿或準備中狀態的糧單新增報銷');
    }

    // Validate expenses belong to the same employee and are SELF_PAID + unsettled
    const expenses = await this.prisma.expense.findMany({
      where: {
        id: { in: expenseIds },
        employee_id: payroll.employee_id,
        expense_payment_method: 'SELF_PAID',
        expense_settled_payroll_id: null,
        deleted_at: null,
      },
    });

    if (expenses.length === 0) {
      throw new BadRequestException('沒有可附加的報銷項目');
    }

    const validIds = expenses.map((e) => e.id);

    // Create payroll_expenses records (skip duplicates)
    for (const expenseId of validIds) {
      await this.prisma.payrollExpense.upsert({
        where: {
          payroll_expense_payroll_id_payroll_expense_expense_id: {
            payroll_expense_payroll_id: payrollId,
            payroll_expense_expense_id: expenseId,
          },
        },
        create: {
          payroll_expense_payroll_id: payrollId,
          payroll_expense_expense_id: expenseId,
        },
        update: {},
      });
    }

    return { success: true, attached_count: validIds.length };
  }

  /**
   * 從糧單移除報銷項目
   */
  async detachExpense(payrollId: number, expenseId: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能在草稿或準備中狀態的糧單移除報銷');
    }

    const pe = await this.prisma.payrollExpense.findFirst({
      where: {
        payroll_expense_payroll_id: payrollId,
        payroll_expense_expense_id: expenseId,
      },
    });
    if (!pe) throw new NotFoundException('報銷項目未附加到此糧單');

    await this.prisma.payrollExpense.delete({ where: { id: pe.id } });

    return { success: true };
  }

  /**
   * 糧單確認時，標記附加的報銷為已結算
   */
  private async settlePayrollExpenses(payrollId: number): Promise<void> {
    const payrollExpenses = await this.prisma.payrollExpense.findMany({
      where: { payroll_expense_payroll_id: payrollId },
    });

    if (payrollExpenses.length === 0) return;

    const expenseIds = payrollExpenses.map(
      (pe) => pe.payroll_expense_expense_id,
    );

    await this.prisma.expense.updateMany({
      where: { id: { in: expenseIds } },
      data: { expense_settled_payroll_id: payrollId },
    });
  }

  /**
   * 糧單撤銷確認時，清除報銷的已結算標記
   */
  private async unsettlePayrollExpenses(payrollId: number): Promise<void> {
    await this.prisma.expense.updateMany({
      where: { expense_settled_payroll_id: payrollId },
      data: { expense_settled_payroll_id: null },
    });
  }

  // ══════════════════════════════════════════════════════════════
  // Phase 8: Auto-generate expenses from payroll
  // ══════════════════════════════════════════════════════════════

  /**
   * 計糧確認後自動產生 Expense 記錄
   * - 按出勤分攤到工程（project_id）
   * - 如果員工當月只在一個工程工作 → 100% 歸入該工程
   * - 如果員工當月在多個工程工作 → 按出勤天數比例分攤
   * - 無法確定工程的 → project_id 留空（公司營運開支）
   */
  private async generateExpensesFromPayroll(payroll: any): Promise<number> {
    const employee = payroll.employee;
    const pwls = payroll.payroll_work_logs || [];
    const netAmount = Number(payroll.net_amount) || 0;
    const grossIncome =
      Number(payroll.base_amount) +
      Number(payroll.allowance_total) +
      Number(payroll.ot_total) +
      Number(payroll.commission_total);

    if (netAmount <= 0 && grossIncome <= 0) return 0;

    // Use net_amount (淨薪金) as the expense amount.
    // net_amount = grossIncome - mpf_deduction (employee MPF) + adjustment_total
    // This matches the actual payment amount the company pays to the employee.
    const expenseAmount = netAmount;

    // Find the salary expense category
    const salaryCategory = await this.findSalaryCategoryId();

    // Determine the expense date (use payroll period end date or last day of period)
    const expenseDate = payroll.date_to
      ? new Date(payroll.date_to)
      : (() => {
          const [y, m] = payroll.period.split('-');
          return new Date(Number(y), Number(m), 0); // last day of month
        })();

    // Get project distribution from work logs
    const projectDistribution = await this.calculateProjectDistribution(pwls);

    const expenses: any[] = [];

    if (projectDistribution.length === 0) {
      // No work logs or no project info → single expense with no project
      expenses.push({
        date: expenseDate,
        company_id: employee.company_id || null,
        employee_id: employee.id,
        category_id: salaryCategory,
        item: `${payroll.period} 薪資 - ${employee.name_zh || employee.name_en || ''}`,
        total_amount: expenseAmount,
        source: 'PAYROLL',
        source_ref_id: payroll.id,
        project_id: null,
        expense_payment_method: 'COMPANY_PAID',
        remarks: `自動產生：糧單 #${payroll.id}，期間 ${payroll.period}`,
      });
    } else if (projectDistribution.length === 1) {
      // Single project → 100% allocation
      const dist = projectDistribution[0];
      expenses.push({
        date: expenseDate,
        company_id: employee.company_id || null,
        employee_id: employee.id,
        category_id: salaryCategory,
        item: `${payroll.period} 薪資 - ${employee.name_zh || employee.name_en || ''}`,
        total_amount: expenseAmount,
        source: 'PAYROLL',
        source_ref_id: payroll.id,
        project_id: dist.project_id,
        expense_payment_method: 'COMPANY_PAID',
        remarks: `自動產生：糧單 #${payroll.id}，期間 ${payroll.period}，出勤 ${dist.days} 天`,
      });
    } else {
      // Multiple projects → proportional allocation
      const totalDays = projectDistribution.reduce((sum, d) => sum + d.days, 0);
      let allocated = 0;

      for (let i = 0; i < projectDistribution.length; i++) {
        const dist = projectDistribution[i];
        const ratio = dist.days / totalDays;
        // Last item gets the remainder to avoid rounding issues
        const amount =
          i === projectDistribution.length - 1
            ? Math.round((expenseAmount - allocated) * 100) / 100
            : Math.round(expenseAmount * ratio * 100) / 100;
        allocated += amount;

        expenses.push({
          date: expenseDate,
          company_id: employee.company_id || null,
          employee_id: employee.id,
          category_id: salaryCategory,
          item: `${payroll.period} 薪資 - ${employee.name_zh || employee.name_en || ''}`,
          total_amount: amount,
          source: 'PAYROLL',
          source_ref_id: payroll.id,
          project_id: dist.project_id,
          expense_payment_method: 'COMPANY_PAID',
          remarks: `自動產生：糧單 #${payroll.id}，期間 ${payroll.period}，出勤 ${dist.days}/${totalDays} 天 (${(ratio * 100).toFixed(1)}%)`,
        });
      }
    }

    // Bulk create expenses
    await this.expensesService.bulkCreate(expenses);
    return expenses.length;
  }

  /**
   * 計算工作記錄中各工程的出勤天數分佈
   * 從原始 WorkLog 查找 project_id，因為 PayrollWorkLog 沒有直接存儲 project_id
   */
  private async calculateProjectDistribution(
    pwls: any[],
  ): Promise<{ project_id: number | null; days: number }[]> {
    const projectDaysMap = new Map<number | null, Set<string>>();

    // Collect work_log_ids to batch-query project_id
    const workLogIds = pwls
      .filter((p) => p.work_log_id)
      .map((p) => p.work_log_id);

    // Batch fetch original work logs to get project_id
    const workLogProjectMap = new Map<number, number | null>();
    if (workLogIds.length > 0) {
      const workLogs = await this.prisma.workLog.findMany({
        where: { id: { in: workLogIds } },
        select: { id: true, project_id: true },
      });
      for (const wl of workLogs) {
        workLogProjectMap.set(wl.id, wl.project_id);
      }
    }

    for (const pwl of pwls) {
      if (!pwl.scheduled_date) continue;
      const dateStr = new Date(pwl.scheduled_date).toISOString().slice(0, 10);
      const projectId = pwl.work_log_id
        ? (workLogProjectMap.get(pwl.work_log_id) ?? null)
        : null;

      if (!projectDaysMap.has(projectId)) {
        projectDaysMap.set(projectId, new Set());
      }
      projectDaysMap.get(projectId)!.add(dateStr);
    }

    const result: { project_id: number | null; days: number }[] = [];
    for (const [projectId, dates] of projectDaysMap) {
      result.push({ project_id: projectId, days: dates.size });
    }

    return result;
  }

  /**
   * 查找「薪資」支出類別 ID
   */
  private async findSalaryCategoryId(): Promise<number | null> {
    // Try to find the '員工薪酬' sub-category under '人事費用' first,
    // then fall back to other salary-related names for backward compatibility
    const salaryNames = ['員工薪酬', '人事費用', '出糧支出', '薪資', '薪金', '工資'];
    for (const name of salaryNames) {
      const cat = await this.prisma.expenseCategory.findFirst({
        where: { name: { contains: name }, is_active: true },
        orderBy: { parent_id: 'desc' }, // prefer child categories (sub-categories have higher parent_id)
      });
      if (cat) return cat.id;
    }
    return null;
  }

  // ── 設定歸組單價（批量更新同組工作記錄的單價）──────────────────
  async setGroupRate(payrollId: number, groupKey: string, rate: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    // Find all work logs in this group
    const pwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: payrollId, is_excluded: false },
    });

    const matchingPwls = pwls.filter(
      (pwl) => {
        const baseKey = this.calcService.buildGroupKeyFromPwl(pwl);
        const fullKey = `${baseKey}|${pwl.price_match_status || 'unmatched'}`;
        return fullKey === groupKey || baseKey === groupKey;
      },
    );

    if (matchingPwls.length === 0) {
      throw new NotFoundException('找不到對應的工作記錄組');
    }

    // Update each work log in the group
    for (const pwl of matchingPwls) {
      const updateData: any = {
        matched_rate: rate,
        is_manual_rate: true,
        price_match_status: 'manual',
        price_match_note: '手動設定',
      };
      const finalPwl = { ...pwl, ...updateData };
      updateData.line_amount = this.calcService.calculateLineAmount(finalPwl);
      await this.prisma.payrollWorkLog.update({
        where: { id: pwl.id },
        data: updateData,
      });
    }

    return { success: true, updated_count: matchingPwls.length };
  }

  // ── 設定歸組 OT 價（批量更新同組工作記錄的 OT 價）──────────────────
  async setGroupOtRate(payrollId: number, groupKey: string, otRate: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const pwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: payrollId, is_excluded: false },
    });

    const matchingPwls = pwls.filter(
      (pwl) => {
        const baseKey = this.calcService.buildGroupKeyFromPwl(pwl);
        const fullKey = `${baseKey}|${pwl.price_match_status || 'unmatched'}`;
        return fullKey === groupKey || baseKey === groupKey;
      },
    );

    if (matchingPwls.length === 0) {
      throw new NotFoundException('找不到對應的工作記錄組');
    }

    for (const pwl of matchingPwls) {
      const updateData: any = {
        matched_ot_rate: otRate,
        is_manual_rate: true,
        price_match_status: 'manual',
        price_match_note: '手動設定',
        ot_line_amount: otRate * (Number(pwl.ot_quantity) || 0),
      };
      const finalPwl = { ...pwl, ...updateData };
      updateData.line_amount = this.calcService.calculateLineAmount(finalPwl);
      await this.prisma.payrollWorkLog.update({
        where: { id: pwl.id },
        data: updateData,
      });
    }

    return { success: true, updated_count: matchingPwls.length };
  }

  // ── 設定歸組中直價（批量更新同組工作記錄的中直價）──────────────────
  async setGroupMidShiftRate(payrollId: number, groupKey: string, midShiftRate: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const pwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: payrollId, is_excluded: false },
    });

    const matchingPwls = pwls.filter(
      (pwl) => {
        const baseKey = this.calcService.buildGroupKeyFromPwl(pwl);
        const fullKey = `${baseKey}|${pwl.price_match_status || 'unmatched'}`;
        return fullKey === groupKey || baseKey === groupKey;
      },
    );

    if (matchingPwls.length === 0) {
      throw new NotFoundException('找不到對應的工作記錄組');
    }

    for (const pwl of matchingPwls) {
      const updateData: any = {
        matched_mid_shift_rate: midShiftRate,
        is_manual_rate: true,
        price_match_status: 'manual',
        price_match_note: '手動設定',
        mid_shift_line_amount: pwl.is_mid_shift === true ? midShiftRate : 0,
      };
      const finalPwl = { ...pwl, ...updateData };
      updateData.line_amount = this.calcService.calculateLineAmount(finalPwl);
      await this.prisma.payrollWorkLog.update({
        where: { id: pwl.id },
        data: updateData,
      });
    }

    return { success: true, updated_count: matchingPwls.length };
  }

  // ── 將手動設定的單價加入價目表 ──────────────────────────
  // ── 更新歸組金額選擇（理論值 vs 實際值）──
  async updateGroupedAmountSelection(payrollId: number, groupKey: string, selected: 'theoretical' | 'actual') {
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    const currentSelections = (payroll as any).grouped_amount_selections as Record<string, string> || {};
    const updatedSelections = { ...currentSelections, [groupKey]: selected };
    await this.prisma.payroll.update({
      where: { id: payrollId },
      data: { grouped_amount_selections: updatedSelections },
    });
    return { success: true, grouped_amount_selections: updatedSelections };
  }

  async addToRateCard(payrollId: number, formData: {
    client_id?: number;
    company_id?: number;
    client_contract_no?: string;
    service_type?: string;
    day_night?: string;
    tonnage?: string;
    machine_type?: string;
    origin?: string;
    destination?: string;
    rate: number;
    unit?: string;
    ot_rate?: number;
    mid_shift_rate?: number;
    effective_date?: string;
    remarks?: string;
  }) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');

    // Check for duplicate: same client, contract, day/night, origin, destination, tonnage, machine_type, service_type
    const duplicateWhere: any = { status: 'active' };
    if (formData.client_id) duplicateWhere.client_id = formData.client_id;
    if (formData.client_contract_no) duplicateWhere.client_contract_no = formData.client_contract_no;
    if (formData.day_night) duplicateWhere.day_night = formData.day_night;
    if (formData.origin) duplicateWhere.origin = formData.origin;
    if (formData.destination) duplicateWhere.destination = formData.destination;
    if (formData.tonnage) duplicateWhere.tonnage = formData.tonnage;
    if (formData.machine_type) duplicateWhere.machine_type = formData.machine_type;
    if (formData.service_type) duplicateWhere.service_type = formData.service_type;
    if (formData.company_id) duplicateWhere.company_id = formData.company_id;

    const existing = await this.prisma.fleetRateCard.findFirst({
      where: duplicateWhere,
    });

    if (existing) {
      throw new BadRequestException('此價格組合已存在於價目表中');
    }

    // Create new fleet rate card using prisma directly to avoid DTO whitelist issues
    const createData: any = {
      rate: formData.rate,
      status: formData.effective_date ? 'active' : 'active',
      effective_date: formData.effective_date ? new Date(formData.effective_date) : new Date(),
      remarks: formData.remarks || `由糧單 #${payrollId} 手動設定後加入`,
    };
    if (formData.client_id) createData.client_id = formData.client_id;
    if (formData.company_id) createData.company_id = formData.company_id;
    if (formData.client_contract_no) createData.client_contract_no = formData.client_contract_no;
    if (formData.service_type) createData.service_type = formData.service_type;
    if (formData.day_night) createData.day_night = formData.day_night;
    if (formData.tonnage) createData.tonnage = formData.tonnage;
    if (formData.machine_type) createData.machine_type = formData.machine_type;
    if (formData.origin) createData.origin = formData.origin;
    if (formData.destination) createData.destination = formData.destination;
    if (formData.unit) createData.unit = formData.unit;
    if (formData.ot_rate !== undefined && formData.ot_rate !== null) createData.ot_rate = formData.ot_rate;
    if (formData.mid_shift_rate !== undefined && formData.mid_shift_rate !== null) createData.mid_shift_rate = formData.mid_shift_rate;

    const newCard = await this.prisma.fleetRateCard.create({ data: createData });
    return newCard;
  }

  // ── 手動匹配：將指定的 fleet_rate_card 套用到該歸組所有工作記錄 ──────────
  async matchGroupRateCard(
    payrollId: number,
    groupKey: string,
    rateCardId: number,
  ) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const card = await this.prisma.fleetRateCard.findUnique({
      where: { id: rateCardId },
    });
    if (!card) throw new NotFoundException('找不到對應的價目表');

    const pwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: payrollId, is_excluded: false },
    });
    const matchingPwls = pwls.filter(
      (pwl) => {
        const baseKey = this.calcService.buildGroupKeyFromPwl(pwl);
        const fullKey = `${baseKey}|${pwl.price_match_status || 'unmatched'}`;
        return fullKey === groupKey || baseKey === groupKey;
      },
    );
    if (matchingPwls.length === 0) {
      throw new NotFoundException('找不到對應的工作記錄組');
    }

    const otRate = Number(card.ot_rate) || 0;
    const midShiftRate = Number(card.mid_shift_rate) || 0;

    for (const pwl of matchingPwls) {
      // 依各筆記錄的日/夜取對應基本費率（向後兼容舊版 day_rate/night_rate）
      const resolved = this.pricingService.resolveRate(card, pwl.day_night);
      const otQty = Number(pwl.ot_quantity) || 0;
      const isMidShift = pwl.is_mid_shift === true;
      const updateData: any = {
        matched_rate_card_id: card.id,
        matched_rate: resolved.rate,
        matched_ot_rate: otRate,
        matched_mid_shift_rate: midShiftRate,
        matched_unit: resolved.unit || card.unit || null,
        is_manual_rate: false,
        price_match_status: 'matched',
        price_match_note: `手動匹配：${card.client_contract_no || `FleetRC#${card.id}`} (${card.day_night || '日'})`,
        ot_line_amount: otRate * otQty,
        mid_shift_line_amount: isMidShift ? midShiftRate * 1 : 0,
      };
      const finalPwl = { ...pwl, ...updateData };
      updateData.line_amount = this.calcService.calculateLineAmount(finalPwl);
      await this.prisma.payrollWorkLog.update({
        where: { id: pwl.id },
        data: updateData,
      });
    }

    return { success: true, updated_count: matchingPwls.length };
  }

  // ── 取消匹配：清除該歸組所有工作記錄的匹配資料 ──────────────────────────
  async unmatchGroupRateCard(payrollId: number, groupKey: string) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft' && payroll.status !== 'preparing') {
      throw new BadRequestException('只能編輯草稿或準備中狀態的糧單');
    }

    const pwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: payrollId, is_excluded: false },
    });
    const matchingPwls = pwls.filter(
      (pwl) => {
        const baseKey = this.calcService.buildGroupKeyFromPwl(pwl);
        const fullKey = `${baseKey}|${pwl.price_match_status || 'unmatched'}`;
        return fullKey === groupKey || baseKey === groupKey;
      },
    );
    if (matchingPwls.length === 0) {
      throw new NotFoundException('找不到對應的工作記錄組');
    }

    for (const pwl of matchingPwls) {
      const updateData: any = {
        matched_rate_card_id: null,
        matched_rate: null,
        matched_ot_rate: null,
        matched_mid_shift_rate: null,
        matched_unit: null,
        is_manual_rate: false,
        price_match_status: 'manual_unmatched',
        price_match_note: '用戶取消匹配',
        line_amount: 0,
        ot_line_amount: 0,
        mid_shift_line_amount: 0,
      };
      await this.prisma.payrollWorkLog.update({
        where: { id: pwl.id },
        data: updateData,
      });
    }

    return { success: true, updated_count: matchingPwls.length };
  }

  // ── 取消付款（從 paid 回到 confirmed）──────────────────────────────────
  async cancelPayment(id: number) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'paid') {
      throw new BadRequestException('只能取消已付款狀態的糧單');
    }

    await this.prisma.payroll.update({
      where: { id },
      data: { status: 'confirmed' },
    });

    return { success: true, message: '已取消付款，糧單已恢復為已確認狀態' };
  }

  // ── 新增糧單付款記錄 ──────────────────────────────────────
  async addPayrollPayment(
    payrollId: number,
    body: {
      payroll_payment_date: string;
      payroll_payment_amount: number;
      payroll_payment_reference_no?: string;
      payroll_payment_method?: string;
      payroll_payment_bank_account?: string | number | null;
      payroll_payment_remarks?: string;
      payroll_payment_payment_out_id?: number;
      company_id?: number;
    },
  ) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
      include: { employee: { select: { name_zh: true, name_en: true } } },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');

    if (body.payroll_payment_amount <= 0) {
      throw new BadRequestException('付款金額必須大於 0');
    }

    // Format period "2026-04" -> "2026年4月"
    const formatPeriod = (period: string): string => {
      const [y, m] = period.split('-');
      if (!y || !m) return period;
      return `${y}年${parseInt(m, 10)}月`;
    };

    // Find the payroll-generated expenses to link the payment
    const payrollExpenses = await this.prisma.expense.findMany({
      where: {
        source: 'PAYROLL',
        source_ref_id: payrollId,
        deleted_at: null,
      },
      select: { id: true, total_amount: true },
    });

    // Use a transaction to ensure both records are created atomically
    const saved = await this.prisma.$transaction(async (tx) => {
      // 1. Create the PaymentOut record so it appears in the payment-out list
      const employeeName = payroll.employee?.name_zh || payroll.employee?.name_en || '';
      const periodLabel = formatPeriod(payroll.period);
      const baseRemarks = `${periodLabel} ${employeeName}的糧單`;
      const rawBankAccount = body.payroll_payment_bank_account;
      const bankAccountId =
        typeof rawBankAccount === 'number'
          ? rawBankAccount
          : typeof rawBankAccount === 'string' && /^\d+$/.test(rawBankAccount.trim())
            ? Number(rawBankAccount.trim())
            : null;

      const paymentOut = await tx.paymentOut.create({
        data: {
          date: new Date(body.payroll_payment_date),
          amount: body.payroll_payment_amount,
          bank_account_id: bankAccountId,
          reference_no: body.payroll_payment_reference_no || null,
          payment_method: body.payroll_payment_method || null,
          payment_out_description: baseRemarks,
          payment_out_status: 'paid',
          remarks: body.payroll_payment_remarks || null,
          payroll_id: payrollId,
          company_id: body.company_id || payroll.company_id || null,
        },
      });

      // 3. Create PaymentOutAllocation records to link payment to expenses
      if (payrollExpenses.length > 0) {
        const totalExpenseAmount = payrollExpenses.reduce(
          (sum, e) => sum + Number(e.total_amount),
          0,
        );
        let allocatedAmount = 0;

        for (let i = 0; i < payrollExpenses.length; i++) {
          const expense = payrollExpenses[i];
          // Proportionally allocate the payment amount across expenses
          const allocationAmount =
            i === payrollExpenses.length - 1
              ? Math.round((body.payroll_payment_amount - allocatedAmount) * 100) / 100
              : Math.round(
                  (body.payroll_payment_amount * Number(expense.total_amount)) /
                    totalExpenseAmount *
                    100,
                ) / 100;
          allocatedAmount += allocationAmount;

          await tx.paymentOutAllocation.create({
            data: {
              payment_out_allocation_payment_out_id: paymentOut.id,
              payment_out_allocation_expense_id: expense.id,
              payment_out_allocation_amount: allocationAmount,
            },
          });
        }
      }

      // 4. Create the PayrollPayment record linked to the PaymentOut
      const payrollPayment = await tx.payrollPayment.create({
        data: {
          payroll_payment_payroll_id: payrollId,
          payroll_payment_date: new Date(body.payroll_payment_date),
          payroll_payment_amount: body.payroll_payment_amount,
          payroll_payment_reference_no: body.payroll_payment_reference_no || null,
          payroll_payment_method: body.payroll_payment_method || null,
          payroll_payment_bank_account: body.payroll_payment_bank_account ? String(body.payroll_payment_bank_account) : null,
          payroll_payment_remarks: body.payroll_payment_remarks || null,
          payroll_payment_payment_out_id: paymentOut.id,
        },
      });

      return payrollPayment;
    });

    // 5. After transaction: recalculate expense payment status
    for (const expense of payrollExpenses) {
      await this.paymentOutAllocationService.recalculateExpense(expense.id);
    }

    return saved;
  }

  // ── 刪除糧單付款記錄 ──────────────────────────────────────
  async removePayrollPayment(payrollId: number, paymentId: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');

    const payment = await this.prisma.payrollPayment.findFirst({
      where: { id: paymentId, payroll_payment_payroll_id: payrollId },
    });
    if (!payment) throw new NotFoundException('Payment record not found');

    // Collect expense IDs linked via allocations before deleting
    let linkedExpenseIds: number[] = [];
    if (payment.payroll_payment_payment_out_id) {
      const allocations = await this.prisma.paymentOutAllocation.findMany({
        where: {
          payment_out_allocation_payment_out_id: payment.payroll_payment_payment_out_id,
          payment_out_allocation_expense_id: { not: null },
        },
        select: { payment_out_allocation_expense_id: true },
      });
      linkedExpenseIds = allocations
        .map((a) => a.payment_out_allocation_expense_id)
        .filter((id): id is number => id !== null);
    }

    // Use a transaction to delete both records atomically
    await this.prisma.$transaction(async (tx) => {
      // 1. Delete the PayrollPayment first (it references PaymentOut)
      await tx.payrollPayment.delete({ where: { id: paymentId } });

      // 2. Delete the linked PaymentOut record if it exists
      //    (PaymentOutAllocation records are cascade-deleted automatically)
      if (payment.payroll_payment_payment_out_id) {
        await tx.paymentOut.delete({
          where: { id: payment.payroll_payment_payment_out_id },
        }).catch(() => {
          // PaymentOut may have been deleted independently; ignore
        });
      }
    });

    // After transaction: recalculate expense payment status
    for (const expenseId of linkedExpenseIds) {
      await this.paymentOutAllocationService.recalculateExpense(expenseId);
    }

    return { success: true };
  }


  private getAutoFixedAllowanceDefinitions(): {
    field: string;
    label: string;
    condition?: (wl: any) => boolean;
  }[] {
    return [
      {
        field: 'allowance_night',
        label: '夜班津貼',
        condition: (wl) => wl.day_night === '夜',
      },
      {
        field: 'allowance_rent',
        label: '租車津貼',
        condition: (wl) => wl.unit === '天',
      },
      { field: 'allowance_3runway', label: '三跑津貼' },
      { field: 'allowance_well', label: '落井津貼' },
      { field: 'allowance_machine', label: '揸機津貼' },
      { field: 'allowance_roller', label: '火轆津貼' },
      { field: 'allowance_crane', label: '吊/挾車津貼' },
      { field: 'allowance_move_machine', label: '搬機津貼' },
      {
        field: 'allowance_kwh_night',
        label: '嘉華-夜間津貼',
        condition: (wl) => wl.day_night === '夜',
      },
      {
        field: 'allowance_mid_shift',
        label: '中直津貼',
        condition: (wl) => wl.is_mid_shift === true,
      },
    ];
  }

  private async getCalculationDailyAllowances(payrollId: number) {
    return this.prisma.payrollDailyAllowance.findMany({
      where: {
        payroll_id: payrollId,
        NOT: { allowance_key: { startsWith: 'excluded_' } },
      },
      select: {
        allowance_key: true,
        allowance_name: true,
        date: true,
        amount: true,
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
  }

  private async getExcludedDailyAllowanceRecords(payrollId: number) {
    return this.prisma.payrollDailyAllowance.findMany({
      where: {
        payroll_id: payrollId,
        allowance_key: { startsWith: 'excluded_' },
      },
      select: { allowance_key: true, date: true },
    });
  }

  private async getExistingDailyAllowanceKeySet(payrollId: number) {
    const records = await this.prisma.payrollDailyAllowance.findMany({
      where: {
        payroll_id: payrollId,
        NOT: { allowance_key: { startsWith: 'excluded_' } },
      },
      select: { allowance_key: true, date: true },
    });
    return new Set(records.map((r) => `${toDateStr(r.date)}:${r.allowance_key}`));
  }

  private isDailyAllowanceExcluded(
    excludedRecords: { allowance_key: string; date: Date | null }[],
    allowanceKey: string,
    dateStr: string,
  ): boolean {
    return excludedRecords.some((record) => {
      const excludedDate = toDateStr(record.date);
      return (
        record.allowance_key === `excluded_${allowanceKey}_${dateStr}` ||
        (record.allowance_key === `excluded_${allowanceKey}` && excludedDate === dateStr)
      );
    });
  }

  private async generateStatutoryHolidayDailyAllowances(
    payrollId: number,
    salarySetting: any,
    dateFrom: string,
    dateTo: string,
  ) {
    if ((salarySetting.salary_type || 'daily') !== 'daily') return;

    const holidays = await this.statutoryHolidaysService.findByDateRange(
      dateFrom,
      dateTo,
    );
    const baseSalaryForHoliday = Number(salarySetting.base_salary) || 0;
    if (holidays.length === 0 || baseSalaryForHoliday <= 0) return;

    const excludedRecords = await this.getExcludedDailyAllowanceRecords(payrollId);
    const existingKeys = await this.getExistingDailyAllowanceKeySet(payrollId);

    for (const holiday of holidays) {
      const dateStr = toDateStr(holiday.date);
      const allowanceKey = 'statutory_holiday';
      const dailyKey = `${dateStr}:${allowanceKey}`;
      if (existingKeys.has(dailyKey)) continue;
      if (this.isDailyAllowanceExcluded(excludedRecords, allowanceKey, dateStr)) {
        continue;
      }

      await this.prisma.payrollDailyAllowance.create({
        data: {
          payroll_id: payrollId,
          date: holiday.date,
          allowance_key: allowanceKey,
          allowance_name: `法定假期 - ${holiday.name}`,
          amount: baseSalaryForHoliday,
          remarks: '自動生成',
          is_auto: true,
        },
      });
      existingKeys.add(dailyKey);
    }
  }

  private async generateFixedDailyAllowances(
    payrollId: number,
    salarySetting: any,
    workLogs: any[],
  ) {
    const definitions = this.getAutoFixedAllowanceDefinitions();
    const activeDefinitions = definitions
      .map((definition) => ({
        ...definition,
        amount: Number((salarySetting as any)[definition.field]) || 0,
      }))
      .filter((definition) => definition.amount > 0);
    if (activeDefinitions.length === 0 || workLogs.length === 0) return;

    const logsByDate = new Map<string, any[]>();
    for (const wl of workLogs) {
      const dateStr = toDateStr(wl.scheduled_date);
      if (!dateStr) continue;
      if (!logsByDate.has(dateStr)) logsByDate.set(dateStr, []);
      logsByDate.get(dateStr)!.push(wl);
    }
    if (logsByDate.size === 0) return;

    const excludedRecords = await this.getExcludedDailyAllowanceRecords(payrollId);
    const existingKeys = await this.getExistingDailyAllowanceKeySet(payrollId);

    for (const [dateStr, dayLogs] of logsByDate.entries()) {
      for (const definition of activeDefinitions) {
        const shouldGenerate = definition.condition
          ? dayLogs.some(definition.condition)
          : dayLogs.length > 0;
        if (!shouldGenerate) continue;

        // 計算當天實質天數（半天 = 0.5），中直津貼不按比例
        let dailyAmount = definition.amount;
        if (definition.field !== 'allowance_mid_shift') {
          const dayQuantity = Math.min(
            dayLogs.reduce((sum, wl) => sum + (Number(wl.quantity) || 1), 0),
            1
          );
          dailyAmount = definition.amount * dayQuantity;
        }

        const dailyKey = `${dateStr}:${definition.field}`;
        if (existingKeys.has(dailyKey)) continue;
        if (this.isDailyAllowanceExcluded(excludedRecords, definition.field, dateStr)) {
          continue;
        }

        await this.prisma.payrollDailyAllowance.create({
          data: {
            payroll_id: payrollId,
            date: new Date(dateStr),
            allowance_key: definition.field,
            allowance_name: definition.label,
            amount: dailyAmount,
            remarks: '自動生成',
            is_auto: true,
          },
        });
        existingKeys.add(dailyKey);
      }
    }
  }

  private async generateAllAutoDailyAllowances(
    payrollId: number,
    salarySetting: any,
    workLogs: any[],
    dateFrom: string,
    dateTo: string,
  ) {
    await this.generateStatutoryHolidayDailyAllowances(
      payrollId,
      salarySetting,
      dateFrom,
      dateTo,
    );
    await this.generateLinkedAllowances(payrollId, workLogs);
    await this.generateFixedDailyAllowances(payrollId, salarySetting, workLogs);
  }

  /**
   * 根據工作記錄匹配到的價目表，自動生成連結津貼
   */
  private async generateLinkedAllowances(payrollId: number, enrichedWorkLogs: any[]) {
    // 1. 找出所有匹配到價目表的工作記錄
    const matchedLogs = enrichedWorkLogs.filter(wl => wl.matched_rate_card_id);
    if (matchedLogs.length === 0) return;

    const excludedRecords = await this.getExcludedDailyAllowanceRecords(payrollId);
    const existingKeys = await this.getExistingDailyAllowanceKeySet(payrollId);

    // 2. 獲取所有相關的 FleetRateCard 資料
    const cardIds = [...new Set(matchedLogs.map(wl => wl.matched_rate_card_id as number))];
    const cards = await this.prisma.fleetRateCard.findMany({
      where: { id: { in: cardIds } },
    });

    const cardMap = new Map(cards.map(c => [c.id, c]));

    // 3. 按日期和津貼 key 進行分組計算
    // date -> allowance_key -> { name, amount, count, mode }
    const dailyMap = new Map<string, Map<string, { name: string; amount: number; count: number; mode: string }>>();

    for (const wl of matchedLogs) {
      const card = cardMap.get(wl.matched_rate_card_id);
      if (!card || !card.linked_allowances) continue;

      const linked = card.linked_allowances as any[];
      if (!Array.isArray(linked)) continue;

      const dateStr = toDateStr(wl.scheduled_date);
      if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, new Map());
      const allowanceMap = dailyMap.get(dateStr)!;

      for (const item of linked) {
        if (!item.allowance_key) continue;
        
        if (!allowanceMap.has(item.allowance_key)) {
          allowanceMap.set(item.allowance_key, {
            name: item.allowance_name || item.allowance_key,
            amount: Number(item.amount) || 0,
            count: 1,
            mode: item.mode || 'per_day',
          });
        } else {
          const existing = allowanceMap.get(item.allowance_key)!;
          existing.count += 1;
        }
      }
    }

    // 4. 寫入資料庫
    for (const [date, allowanceMap] of dailyMap.entries()) {
      for (const [key, data] of allowanceMap.entries()) {
        const finalAmount = data.mode === 'per_trip' ? data.amount * data.count : data.amount;
        if (finalAmount === 0) continue;

        const dailyKey = `${date}:${key}`;
        if (existingKeys.has(dailyKey)) continue;
        if (this.isDailyAllowanceExcluded(excludedRecords, key, date)) continue;

        await this.prisma.payrollDailyAllowance.create({
          data: {
            payroll_id: payrollId,
            date: new Date(date),
            allowance_key: key,
            allowance_name: data.name,
            amount: finalAmount,
            is_auto: true,
            remarks: data.mode === 'per_trip' ? `自動生成 (可多次: ${data.count}次)` : '自動生成 (每日一次)',
          },
        });
        existingKeys.add(dailyKey);
      }
    }
  }

  // ── 糧單休假統計 ──────────────────────────────────────────────
  /**
   * 統計某員工所有糧單中的「休假」天數（自動，不可手動修改）。
   * 「休假」定義：糧單期間內的某天
   *   - 沒有工作記錄（payrollWorkLogs 中沒有該天的記錄）
   *   - 不是法定假期
   *   - 不是休息日（星期日）
   *   - 不是已批准的請假（病假/年假）
   * 直接重用 calcService.buildDailyCalculation 的逐日結果：
   *   work_logs.length === 0 且 is_holiday === false 且 special_label === '' 即為休假。
   * 回傳按月分組的休假天數、年度小計與入職以來總計。
   */
  async getLeaveSummary(employeeId: number) {
    // 取出該員工所有具完整期間的糧單
    const payrolls = await this.prisma.payroll.findMany({
      where: {
        employee_id: employeeId,
        date_from: { not: null },
        date_to: { not: null },
      },
      orderBy: [{ date_from: 'asc' }, { id: 'asc' }],
    });

    // 以日期字串去重，避免同一天在多張糧單重複計算
    const restDays = new Set<string>();

    for (const payroll of payrolls) {
      if (!payroll.date_from || !payroll.date_to) continue;

      // 載入該糧單的工作記錄（含舊糧單回填）
      let pwls = await this.prisma.payrollWorkLog.findMany({
        where: { payroll_id: payroll.id },
        orderBy: [{ scheduled_date: 'asc' }, { id: 'asc' }],
      });
      if (pwls.length === 0) {
        pwls = await this.backfillPayrollWorkLogs(payroll as any);
      }
      const activePwls = pwls.filter((p) => !p.is_excluded);

      // 取該糧單適用的薪資設定
      const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
        where: {
          employee_id: employeeId,
          effective_date: {
            lte: payroll.date_to || new Date(payroll.period + '-28'),
          },
        },
        orderBy: { effective_date: 'desc' },
      });

      // 取該期間的法定假期
      const holidayDates = await this.statutoryHolidaysService.findByDateRange(
        toDateStr(payroll.date_from),
        toDateStr(payroll.date_to),
      );

      // 取該員工已批准、與期間重疊的請假
      const leaves = await this.prisma.employeeLeave.findMany({
        where: {
          employee_id: employeeId,
          status: 'approved',
          date_from: { lte: payroll.date_to || undefined },
          date_to: { gte: payroll.date_from || undefined },
        },
      });

      // 取該糧單的逐日津貼（buildDailyCalculation 需要）
      const dailyAllowances = await this.prisma.payrollDailyAllowance.findMany({
        where: { payroll_id: payroll.id },
      });

      // 取員工入職/離職日期給月薪計算用
      const empForLeave = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { join_date: true, termination_date: true } });
      const dailyCalc = this.calcService.buildDailyCalculation(
        activePwls,
        salarySetting,
        dailyAllowances,
        {
          dateFrom: toDateStr(payroll.date_from),
          dateTo: toDateStr(payroll.date_to),
          holidayDates: holidayDates.map((h) => ({ date: h.date, name: h.name })),
          leaves,
          employeeJoinDate: empForLeave?.join_date ? toDateStr(empForLeave.join_date) : null,
          employeeTerminationDate: empForLeave?.termination_date ? toDateStr(empForLeave.termination_date) : null,
        },
      );

      const periodStart = toDateStr(payroll.date_from);
      const periodEnd = toDateStr(payroll.date_to);

      for (const day of dailyCalc) {
        const dateStr = toDateStr(day.date);
        if (!dateStr) continue;
        // 僅統計確實落在糧單期間內的天
        if (dateStr < periodStart || dateStr > periodEnd) continue;
        const hasWork = (day.work_logs || []).length > 0;
        const isHoliday = day.is_holiday === true;
        const hasSpecialLabel = !!(day.special_label && String(day.special_label).trim());
        // 休假：無工作、非假期、無特殊標籤（星期日/請假皆會有 special_label）
        if (!hasWork && !isHoliday && !hasSpecialLabel) {
          restDays.add(dateStr);
        }
      }
    }

    // 按月份分組
    const monthlyMap = new Map<string, number>();
    for (const dateStr of restDays) {
      const ym = dateStr.slice(0, 7); // YYYY-MM
      monthlyMap.set(ym, (monthlyMap.get(ym) || 0) + 1);
    }

    const monthly = Array.from(monthlyMap.entries())
      .map(([month, rest_days]) => ({ month, rest_days }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 按年度小計
    const yearlyMap = new Map<string, number>();
    for (const m of monthly) {
      const year = m.month.slice(0, 4);
      yearlyMap.set(year, (yearlyMap.get(year) || 0) + m.rest_days);
    }
    const yearly = Array.from(yearlyMap.entries())
      .map(([year, rest_days]) => ({ year, rest_days }))
      .sort((a, b) => a.year.localeCompare(b.year));

    const total = monthly.reduce((sum, m) => sum + m.rest_days, 0);

        return { monthly, yearly, total };
  }

  /**
   * 重新連結已存在的 payment_outs 到新建的 expenses
   * 
   * 場景：payment_outs 可能在 expense 建立前就已存在（透過 payroll_id 連結）
   * 此方法在 generateExpensesFromPayroll 完成後，將這些 payment_outs 連結到新建的 expenses
   * 
   * 邏輯：
   * 1. 查詢所有 payroll_id = 該粧單 ID 且沒有任何 expense allocation 的 payment_outs
   * 2. 查詢剛建立的 expenses（source='PAYROLL', source_ref_id=payrollId, deleted_at=null）
   * 3. 如果只有一個 expense：為每個 payment_out 建立 payment_out_allocation 記錄
   * 4. 如果有多個 expenses（按工程分拆）：按比例建立 allocation 記錄分配到各 expense
   * 5. 呼叫 recalculateExpense 更新每個 expense 的 payment_status
   */
  private async relinkPaymentOutsToExpenses(payrollId: number): Promise<void> {
    // 1. 查詢所有 payroll_id = 該粧單 ID 且沒有任何 expense allocation 的 payment_outs
    const orphanedPaymentOuts = await this.prisma.paymentOut.findMany({
      where: {
        payroll_id: payrollId,
        allocations: {
          none: { payment_out_allocation_expense_id: { not: null } },
        },
      },
    });

    if (orphanedPaymentOuts.length === 0) {
      return; // 沒有孤立的 payment_outs，無需處理
    }

    // 2. 查詢剛建立的 expenses（source='PAYROLL', source_ref_id=payrollId, deleted_at=null）
    const newExpenses = await this.prisma.expense.findMany({
      where: {
        source: 'PAYROLL',
        source_ref_id: payrollId,
        deleted_at: null,
      },
      orderBy: { total_amount: 'desc' }, // 按金額降序排列，便於選擇最大的
    });

    if (newExpenses.length === 0) {
      return; // 沒有新建的 expenses，無需處理
    }

    // 3. 根據 expense 數量決定連結策略
    if (newExpenses.length === 1) {
      // 只有一個 expense：直接連結所有 payment_outs
      const expenseId = newExpenses[0].id;

      // 為每個 payment_out 建立 allocation 記錄
      for (const paymentOut of orphanedPaymentOuts) {
        const paymentOutAmount = Number(paymentOut.amount) || 0;
        await this.prisma.paymentOutAllocation.create({
          data: {
            payment_out_allocation_payment_out_id: paymentOut.id,
            payment_out_allocation_expense_id: expenseId,
            payment_out_allocation_amount: paymentOutAmount,
          },
        });
      }

      // 更新 expense 的 payment_status
      await this.paymentOutAllocationService.recalculateExpense(expenseId);
    } else {
      // 多個 expenses（按工程分拆）：按比例分配
      const primaryExpenseId = newExpenses[0].id; // 金額最大的 expense

      // 計算總金額用於比例分配
      const totalExpenseAmount = newExpenses.reduce(
        (sum, exp) => sum + (Number(exp.total_amount) || 0),
        0,
      );
      const totalPaymentAmount = orphanedPaymentOuts.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0,
      );

      // 為每個 payment_out 按比例建立 allocation 記錄
      for (const paymentOut of orphanedPaymentOuts) {
        const paymentOutAmount = Number(paymentOut.amount) || 0;

        // 按 expense 的比例分配 payment_out 金額
        let allocatedTotal = 0;
        for (let i = 0; i < newExpenses.length; i++) {
          const expense = newExpenses[i];
          const expenseAmount = Number(expense.total_amount) || 0;
          const ratio = totalExpenseAmount > 0 ? expenseAmount / totalExpenseAmount : 0;

          // 最後一個 allocation 獲得餘額，避免舍入誤差
          const allocAmount =
            i === newExpenses.length - 1
              ? Math.round((paymentOutAmount - allocatedTotal) * 100) / 100
              : Math.round(paymentOutAmount * ratio * 100) / 100;

          allocatedTotal += allocAmount;

          await this.prisma.paymentOutAllocation.create({
            data: {
              payment_out_allocation_payment_out_id: paymentOut.id,
              payment_out_allocation_expense_id: expense.id,
              payment_out_allocation_amount: allocAmount,
            },
          });
        }
      }

      // 更新所有 expenses 的 payment_status
      for (const expense of newExpenses) {
        await this.paymentOutAllocationService.recalculateExpense(expense.id);
      }
    }
  }
}
