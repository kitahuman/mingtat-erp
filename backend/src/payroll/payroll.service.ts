import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { PricingService } from '../common/pricing.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { StatutoryHolidaysService } from '../statutory-holidays/statutory-holidays.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FleetRateCardsService } from '../fleet-rate-cards/fleet-rate-cards.service';
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
  ) {}

  // ── 列表 ──────────────────────────────────────────────────────
  async findAll(query: PayrollQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.period) where.period = query.period;
    if (query.company_profile_id)
      where.company_profile_id = Number(query.company_profile_id);
    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.employee_id) where.employee_id = Number(query.employee_id);
    if (query.status) {
      where.status = query.status;
    }
    // preparing 狀態也顯示在列表中（作為草稿）
    if (query.search) {
      where.employee = {
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

    const [data, total] = await Promise.all([
      this.prisma.payroll.findMany({
        where,
        include: {
          employee: { include: { company: true } },
          company_profile: true,
          company: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.payroll.count({ where }),
    ]);

    return { data, total, page, limit };
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
    const grouped = this.calcService.buildGroupedSettlement(activePwls);

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

    // Build daily calculation
    const dailyAllowances = payroll.daily_allowances || [];
    const dailyCalc = this.calcService.buildDailyCalculation(
      activePwls,
      salarySetting,
      dailyAllowances,
    );

    // Build available allowance options from salary setting
    const allowanceOptions =
      this.calcService.buildAllowanceOptions(salarySetting);

    // Calculate gross_amount (sum of positive items) and deduction_total (sum of negative items)
    const items = payroll.items || [];
    const grossAmount = items.reduce((sum: number, item: any) => {
      const amt = Number(item.amount);
      return sum + (amt > 0 ? amt : 0);
    }, 0);
    const deductionTotal = items.reduce((sum: number, item: any) => {
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
      allowance_options: allowanceOptions,
      salary_setting: salarySetting,
      paid_amount: paidAmount,
      outstanding_amount: outstandingAmount,
    };
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
        service_type: { not: '請假/休息' },
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
      service_type: { not: '請假/休息' },
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

    // Build daily calculation for preview
    const dailyCalc = this.calcService.buildDailyCalculationFromWorkLogs(
      enrichedWorkLogs,
      salarySetting,
      [],
    );

    // Build available allowance options
    const allowanceOptions =
      this.calcService.buildAllowanceOptions(salarySetting);

    // Calculate preview
    const calculation = salarySetting
      ? await this.calcService.calculatePayroll(
          emp,
          salarySetting,
          workLogs,
          date_from,
          date_to,
          company_id ?? company_profile_id ?? null,
        )
      : null;

    return {
      employee: emp,
      salary_setting: salarySetting,
      work_logs: enrichedWorkLogs,
      grouped_settlement: grouped,
      daily_calculation: dailyCalc,
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

    // Check for existing payroll in same date range
    const existingWhere: any = {
      employee_id: emp.id,
      date_from: new Date(date_from),
      date_to: new Date(date_to),
    };
    if (company_id) {
      existingWhere.company_id = Number(company_id);
    }
    const existing = await this.prisma.payroll.findFirst({
      where: existingWhere,
    });
    if (existing) {
      // 如果已存在 preparing 狀態的糧單，直接返回該糧單（讓前端跳轉繼續編輯）
      if (existing.status === 'preparing') {
        return this.findOne(existing.id);
      }
      // 其他狀態的糧單則報錯
      throw new BadRequestException(
        `此員工在 ${date_from} 至 ${date_to} 的糧單已存在（ID: ${existing.id}）`,
      );
    }

    // Get work logs
    const wlWhere: any = {
      employee_id: emp.id,
      scheduled_date: { gte: new Date(date_from), lte: new Date(date_to) },
      service_type: { not: '請假/休息' },
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

    // Determine company info
    let actualCompanyId = company_id ?? null;
    let actualCpId = null as number | null;
    if (!actualCompanyId && workLogs.length > 0) {
      actualCompanyId = workLogs[0].company_id;
    }
    if (workLogs.length > 0) {
      actualCpId = workLogs[0].company_profile_id;
    }

    // Create payroll record with status 'preparing'
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
        base_amount: 0,
        allowance_total: 0,
        ot_total: 0,
        commission_total: 0,
        mpf_deduction: 0,
        adjustment_total: 0,
        net_amount: 0,
        status: 'preparing',
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

    return this.findOne(saved.id);
  }

  // ── 確定糧單工作記錄並計算糧單（從 preparing 狀態計算並轉為 draft）────
  async finalizePreparation(id: number, userId?: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: { include: { company: true } },
        adjustments: true,
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
      price_match_status: pwl.price_match_status,
      price_match_note: pwl.price_match_note,
      is_mid_shift: pwl.is_mid_shift,
      line_amount: pwl.line_amount,
      ot_line_amount: pwl.ot_line_amount,
      mid_shift_line_amount: pwl.mid_shift_line_amount,
    }));

    const calc = await this.calcService.calculatePayroll(
      emp,
      salarySetting,
      workLogLike,
      dateFrom,
      dateTo,
      payroll.company_id ?? payroll.company_profile_id ?? null,
    );

    // Update payroll items
    await this.prisma.payrollItem.deleteMany({ where: { payroll_id: id } });
    for (const item of calc.items) {
      await this.prisma.payrollItem.create({
        data: {
          ...item,
          payroll_id: id,
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

    // Auto-generate statutory holiday daily allowances for daily-salary employees
    if (calc.salary_type === 'daily') {
      const holidays = await this.statutoryHolidaysService.findByDateRange(
        dateFrom,
        dateTo,
      );
      const baseSalaryForHoliday = Number(salarySetting.base_salary) || 0;
      if (holidays.length > 0 && baseSalaryForHoliday > 0) {
        for (const holiday of holidays) {
          await this.prisma.payrollDailyAllowance.create({
            data: {
              payroll_id: id,
              date: holiday.date,
              allowance_key: 'statutory_holiday',
              allowance_name: `法定假期 - ${holiday.name}`,
              amount: baseSalaryForHoliday,
              remarks: '自動生成',
            },
          });
        }
      }
    }

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
      service_type: { not: '請假/休息' },
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

    const calc = await this.calcService.calculatePayroll(
      emp,
      salarySetting,
      workLogs,
      date_from,
      date_to,
      company_id ?? company_profile_id ?? null,
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

    // ── Auto-generate statutory holiday daily allowances for daily-salary employees ──
    if (calc.salary_type === 'daily') {
      const holidays = await this.statutoryHolidaysService.findByDateRange(
        date_from,
        date_to,
      );
      const baseSalaryForHoliday = Number(salarySetting.base_salary) || 0;
      if (holidays.length > 0 && baseSalaryForHoliday > 0) {
        for (const holiday of holidays) {
          await this.prisma.payrollDailyAllowance.create({
            data: {
              payroll_id: saved.id,
              date: holiday.date,
              allowance_key: 'statutory_holiday',
              allowance_name: `法定假期 - ${holiday.name}`,
              amount: baseSalaryForHoliday,
              remarks: '自動生成',
            },
          });
        }
      }
    }

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

    return { confirmed: true, expenses_generated: expenseCount };
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

    // Revert status to draft
    await this.prisma.payroll.update({
      where: { id },
      data: { status: 'draft' },
    });

    return { unconfirmed: true, expenses_deleted: deletedCount };
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

  // ── 重新計算糧單 ──────────────────────────────────────────────
  async recalculate(id: number, overrideManualRates?: boolean) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: { include: { company: true } },
        adjustments: true,
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
      price_match_status: pwl.price_match_status,
      price_match_note: pwl.price_match_note,
    }));

    // Preserve manual mpf_relevant_income if set
    const existingMpfRelevantIncome =
      payroll.mpf_relevant_income !== null &&
      payroll.mpf_relevant_income !== undefined
        ? Number(payroll.mpf_relevant_income)
        : null;

    const calc = await this.calcService.calculatePayroll(
      emp,
      salarySetting,
      workLogLike,
      dateFrom,
      dateTo,
      companyId ?? cpId,
      existingMpfRelevantIncome,
    );

    // Calculate adjustment total
    const adjustments = payroll.adjustments || [];
    const adjustmentTotal = adjustments.reduce(
      (sum, adj) => sum + Number(adj.amount),
      0,
    );

    // Update payroll items
    await this.prisma.payrollItem.deleteMany({ where: { payroll_id: id } });
    for (const item of calc.items) {
      await this.prisma.payrollItem.create({
        data: {
          ...item,
          payroll_id: id,
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

    return this.findOne(id);
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
      'payroll_work_log_product_unit',
    ];

    const updateData: any = { is_modified: true };
    for (const field of editableFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (isManualRateSet) {
      // Manual rate override: set the rate directly
      const manualRate = body.matched_rate === null ? null : Number(body.matched_rate);
      updateData.matched_rate = manualRate;
      updateData.is_manual_rate = true;
      if (manualRate !== null) {
        updateData.price_match_status = 'matched';
        updateData.price_match_note = '手動設定';
      } else {
        updateData.price_match_status = 'unmatched';
        updateData.price_match_note = '未設定';
        updateData.is_manual_rate = false;
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
    body: { item_name: string; amount: number; remarks?: string },
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

    // Delete existing allowances for this date
    await this.prisma.payrollDailyAllowance.deleteMany({
      where: { payroll_id: payrollId, date: new Date(body.date) },
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
        total_amount: grossIncome,
        source: 'PAYROLL',
        source_ref_id: payroll.id,
        project_id: null,
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
        total_amount: grossIncome,
        source: 'PAYROLL',
        source_ref_id: payroll.id,
        project_id: dist.project_id,
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
            ? Math.round((grossIncome - allocated) * 100) / 100
            : Math.round(grossIncome * ratio * 100) / 100;
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
    // Try to find a category matching salary-related names
    const salaryNames = ['出糧支出', '薪資', '薪金', '工資'];
    for (const name of salaryNames) {
      const cat = await this.prisma.expenseCategory.findFirst({
        where: { name: { contains: name }, is_active: true },
        orderBy: { parent_id: 'asc' }, // prefer parent categories
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
      (pwl) => this.calcService.buildGroupKeyFromPwl(pwl) === groupKey,
    );

    if (matchingPwls.length === 0) {
      throw new NotFoundException('找不到對應的工作記錄組');
    }

    // Update each work log in the group
    for (const pwl of matchingPwls) {
      const updateData: any = {
        matched_rate: rate,
        is_manual_rate: true,
        price_match_status: 'matched',
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

  // ── 將手動設定的單價加入價目表 ──────────────────────────
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
      payroll_payment_bank_account?: string;
      payroll_payment_remarks?: string;
      payroll_payment_payment_out_id?: number;
    },
  ) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');

    if (body.payroll_payment_amount <= 0) {
      throw new BadRequestException('付款金額必須大於 0');
    }

    const saved = await this.prisma.payrollPayment.create({
      data: {
        payroll_payment_payroll_id: payrollId,
        payroll_payment_date: new Date(body.payroll_payment_date),
        payroll_payment_amount: body.payroll_payment_amount,
        payroll_payment_reference_no: body.payroll_payment_reference_no || null,
        payroll_payment_bank_account: body.payroll_payment_bank_account || null,
        payroll_payment_remarks: body.payroll_payment_remarks || null,
        payroll_payment_payment_out_id: body.payroll_payment_payment_out_id || null,
      },
    });

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

    await this.prisma.payrollPayment.delete({ where: { id: paymentId } });

    return { success: true };
  }
}
