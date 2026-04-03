import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { PricingService } from '../common/pricing.service';

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
  ) {}

  // ── 列表 ──────────────────────────────────────────────────────
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.period) where.period = query.period;
    if (query.company_profile_id) where.company_profile_id = Number(query.company_profile_id);
    if (query.employee_id) where.employee_id = Number(query.employee_id);
    if (query.status) where.status = query.status;
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
    const sortOrder = (query.sortOrder || 'DESC').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const allowedSort = ['id', 'period', 'net_amount', 'status', 'created_at'];
    const orderBy = allowedSort.includes(sortBy) ? { [sortBy]: sortOrder } : { id: 'desc' as const };

    const [data, total] = await Promise.all([
      this.prisma.payroll.findMany({
        where,
        include: {
          employee: { include: { company: true } },
          company_profile: true,
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
        items: { orderBy: { sort_order: 'asc' } },
        adjustments: { orderBy: { sort_order: 'asc' } },
        daily_allowances: true,
      },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');

    // Load payroll work logs
    let pwls = await this.prisma.payrollWorkLog.findMany({
      where: { payroll_id: id },
      orderBy: [{ scheduled_date: 'asc' }, { id: 'asc' }],
    });

    // ── 自動回填：如果 payroll_work_logs 為空（舊糧單），從 work_logs 表查詢並回填 ──
    if (pwls.length === 0 && payroll.date_from && payroll.date_to && payroll.employee_id) {
      pwls = await this.backfillPayrollWorkLogs(payroll as any);
    }

    // Build grouped settlement
    const activePwls = pwls.filter(p => !p.is_excluded);
    const grouped = this.buildGroupedSettlement(activePwls);

    // Get salary setting for daily calculation
    const salarySetting = await this.prisma.employeeSalarySetting.findFirst({
      where: {
        employee_id: payroll.employee_id,
        effective_date: { lte: payroll.date_to || new Date(payroll.period + '-28') },
      },
      orderBy: { effective_date: 'desc' },
    });

    // Build daily calculation
    const dailyAllowances = payroll.daily_allowances || [];
    const dailyCalc = this.buildDailyCalculation(activePwls, salarySetting, dailyAllowances);

    // Build available allowance options from salary setting
    const allowanceOptions = this.buildAllowanceOptions(salarySetting);

    return {
      ...payroll,
      payroll_work_logs: pwls,
      grouped_settlement: grouped,
      daily_calculation: dailyCalc,
      allowance_options: allowanceOptions,
      salary_setting: salarySetting,
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
      if (payroll.company_profile_id) {
        wlWhere.company_profile_id = payroll.company_profile_id;
      }

      const workLogs = await this.prisma.workLog.findMany({
        where: wlWhere,
        include: { company_profile: true, client: true, quotation: true },
        orderBy: { scheduled_date: 'asc' },
      });

      if (workLogs.length === 0) return [];

      // Enrich with price info
      const enrichedWorkLogs = await this.enrichWorkLogsWithPrice(workLogs);

      // Save as payroll_work_logs
      const savedPwls: any[] = [];
      for (const wl of enrichedWorkLogs) {
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
            remarks: wl.remarks,
            matched_rate_card_id: wl._matched_rate_card_id ?? wl.matched_rate_card_id ?? null,
            matched_rate: wl._matched_rate ?? wl.matched_rate ?? null,
            matched_unit: wl._matched_unit ?? wl.matched_unit ?? null,
            matched_ot_rate: wl._matched_ot_rate ?? wl.matched_ot_rate ?? null,
            price_match_status: wl._price_match_status ?? wl.price_match_status ?? null,
            price_match_note: wl._price_match_note ?? wl.price_match_note ?? null,
            line_amount: wl._line_amount ?? 0,
            group_key: wl._group_key ?? '',
            client_id: wl.client_id ?? null,
            client_name: wl.client?.name ?? wl.client_name ?? null,
            company_profile_id: wl.company_profile_id ?? null,
            company_profile_name: wl.company_profile?.chinese_name ?? wl.company_profile_name ?? null,
            quotation_id: wl.quotation_id ?? null,
            contract_no: wl.quotation?.quotation_no ?? wl.contract_no ?? null,
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
  }) {
    const { employee_id, date_from, date_to, company_profile_id } = body;

    if (!employee_id) throw new BadRequestException('請選擇員工');
    if (!date_from || !date_to) throw new BadRequestException('請選擇日期範圍');
    if (date_from > date_to) throw new BadRequestException('開始日期不能晚於結束日期');

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
      include: { company_profile: true, client: true, quotation: true },
      orderBy: { scheduled_date: 'asc' },
    });

    // Enrich work logs with price info from rate cards
    const enrichedWorkLogs = await this.enrichWorkLogsWithPrice(workLogs);

    // Build grouped settlement for preview
    const grouped = this.buildGroupedSettlementFromWorkLogs(enrichedWorkLogs);

    // Build daily calculation for preview
    const dailyCalc = this.buildDailyCalculationFromWorkLogs(enrichedWorkLogs, salarySetting, []);

    // Build available allowance options
    const allowanceOptions = this.buildAllowanceOptions(salarySetting);

    // Calculate preview
    const calculation = salarySetting
      ? await this.calculatePayroll(emp, salarySetting, workLogs, date_from, date_to, company_profile_id ?? null)
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

  // ── 生成計糧（單一員工，日期範圍）────────────────────────────
  async generate(body: {
    employee_id: number;
    date_from: string;
    date_to: string;
    company_profile_id?: number;
    period?: string;
  }) {
    const { employee_id, date_from, date_to, company_profile_id } = body;

    if (!employee_id) throw new BadRequestException('請選擇員工');
    if (!date_from || !date_to) throw new BadRequestException('請選擇日期範圍');
    if (date_from > date_to) throw new BadRequestException('開始日期不能晚於結束日期');

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
    if (company_profile_id) {
      existingWhere.company_profile_id = Number(company_profile_id);
    }
    const existing = await this.prisma.payroll.findFirst({ where: existingWhere });
    if (existing) {
      throw new BadRequestException(`此員工在 ${date_from} 至 ${date_to} 的糧單已存在（ID: ${existing.id}）`);
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
      include: { company_profile: true, client: true, quotation: true },
      orderBy: { scheduled_date: 'asc' },
    });

    const calc = await this.calculatePayroll(emp, salarySetting, workLogs, date_from, date_to, company_profile_id ?? null);

    let actualCpId = company_profile_id ?? null;
    if (!actualCpId && workLogs.length > 0) {
      actualCpId = workLogs[0].company_profile_id;
    }

    // Create payroll record
    const saved = await this.prisma.payroll.create({
      data: {
        period,
        date_from: new Date(date_from),
        date_to: new Date(date_to),
        employee_id: emp.id,
        company_profile_id: actualCpId ?? undefined,
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
    const enrichedWorkLogs = await this.enrichWorkLogsWithPrice(workLogs);
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
          matched_rate_card_id: wl._matched_rate_card_id ?? wl.matched_rate_card_id ?? null,
          matched_rate: wl._matched_rate ?? wl.matched_rate ?? null,
          matched_unit: wl._matched_unit ?? wl.matched_unit ?? null,
          matched_ot_rate: wl._matched_ot_rate ?? wl.matched_ot_rate ?? null,
          matched_mid_shift_rate: wl._matched_mid_shift_rate ?? wl.matched_mid_shift_rate ?? null,
          price_match_status: wl._price_match_status ?? wl.price_match_status ?? null,
          price_match_note: wl._price_match_note ?? wl.price_match_note ?? null,
          line_amount: wl._line_amount ?? 0,
          ot_line_amount: wl._ot_line_amount ?? 0,
          mid_shift_line_amount: wl._mid_shift_line_amount ?? 0,
          group_key: wl._group_key ?? '',
          client_id: wl.client_id ?? null,
          client_name: wl.client?.name ?? wl.client_name ?? null,
          company_profile_id: wl.company_profile_id ?? null,
          company_profile_name: wl.company_profile?.chinese_name ?? wl.company_profile_name ?? null,
          quotation_id: wl.quotation_id ?? null,
          contract_no: wl.quotation?.quotation_no ?? wl.contract_no ?? null,
          is_modified: false,
          is_excluded: false,
        },
      });
    }

    return this.findOne(saved.id);
  }

  // ── 核心計算邏輯（可被 preview 和 generate 共用）────────────
  private async calculatePayroll(
    emp: any,
    salarySetting: any,
    workLogs: any[],
    dateFrom: string,
    dateTo: string,
    companyProfileId: number | null,
  ) {
    const items: any[] = [];
    let sortOrder = 1;

    const baseSalary = Number(salarySetting.base_salary) || 0;
    const salaryType = salarySetting.salary_type || 'daily';

    // ── (1) 底薪計算 ──
    let baseAmount = 0;
    let workDays = 0;

    if (salaryType === 'daily') {
      const workDates = new Set(workLogs.map(wl => toDateStr(wl.scheduled_date)));
      workDays = workDates.size;
      baseAmount = baseSalary * workDays;

      items.push({
        item_type: 'base_salary',
        item_name: '日薪',
        unit_price: baseSalary,
        quantity: workDays,
        amount: baseAmount,
        sort_order: sortOrder++,
      });
    } else {
      workDays = 1;
      baseAmount = baseSalary;

      items.push({
        item_type: 'base_salary',
        item_name: '月薪',
        unit_price: baseSalary,
        quantity: 1,
        amount: baseAmount,
        sort_order: sortOrder++,
      });
    }

    // ── (2) 津貼計算 ──
    let allowanceTotal = 0;

    const allowanceFields: { field: string; label: string; condition?: (wl: any) => boolean }[] = [
      { field: 'allowance_night', label: '夜班津貼', condition: (wl) => wl.day_night === '夜' },
      { field: 'allowance_rent', label: '租車津貼' },
      { field: 'allowance_3runway', label: '三跑津貼' },
      { field: 'allowance_well', label: '落井津貼' },
      { field: 'allowance_machine', label: '揸機津貼' },
      { field: 'allowance_roller', label: '火轆津貼' },
      { field: 'allowance_crane', label: '吊/挾車津貼' },
      { field: 'allowance_move_machine', label: '搬機津貼' },
      { field: 'allowance_kwh_night', label: '嘉華-夜間津貼', condition: (wl) => wl.day_night === '夜' },
      { field: 'allowance_mid_shift', label: '中直津貼', condition: (wl) => wl.is_mid_shift === true },
    ];

    for (const af of allowanceFields) {
      const rate = Number((salarySetting as any)[af.field]) || 0;
      if (rate === 0) continue;

      let days = 0;
      if (af.condition) {
        const matchDates = new Set(workLogs.filter(af.condition).map(wl => toDateStr(wl.scheduled_date)));
        days = matchDates.size;
      } else {
        const workDates = new Set(workLogs.map(wl => toDateStr(wl.scheduled_date)));
        days = workDates.size;
      }

      if (days === 0) continue;

      const amount = rate * days;
      allowanceTotal += amount;

      items.push({
        item_type: 'allowance',
        item_name: af.label,
        unit_price: rate,
        quantity: days,
        amount,
        sort_order: sortOrder++,
      });
    }

    // Custom allowances
    if (salarySetting.custom_allowances && Array.isArray(salarySetting.custom_allowances)) {
      for (const ca of salarySetting.custom_allowances as any[]) {
        if (!ca.amount || ca.amount === 0) continue;
        const workDatesSet = new Set(workLogs.map(wl => toDateStr(wl.scheduled_date)));
        const days = workDatesSet.size;
        if (days === 0) continue;

        const amount = Number(ca.amount) * days;
        allowanceTotal += amount;

        items.push({
          item_type: 'allowance',
          item_name: ca.name || '自定義津貼',
          unit_price: Number(ca.amount),
          quantity: days,
          amount,
          sort_order: sortOrder++,
        });
      }
    }

    // ── (3) OT 計算 ──
    let otTotal = 0;
    const otRate = Number(salarySetting.ot_rate_standard) || 0;

    let totalOtHours = 0;
    for (const wl of workLogs) {
      if (wl.ot_quantity && Number(wl.ot_quantity) > 0) {
        totalOtHours += Number(wl.ot_quantity);
      }
    }

    if (otRate > 0 && totalOtHours > 0) {
      otTotal = otRate * totalOtHours;
      items.push({
        item_type: 'ot',
        item_name: 'OT 加班費',
        unit_price: otRate,
        quantity: totalOtHours,
        amount: otTotal,
        sort_order: sortOrder++,
      });
    }

    const otSlots: { field: string; label: string; condition?: (wl: any) => boolean }[] = [
      { field: 'ot_1800_1900', label: 'OT 18:00-19:00' },
      { field: 'ot_1900_2000', label: 'OT 19:00-20:00' },
      { field: 'ot_0600_0700', label: 'OT 06:00-07:00' },
      { field: 'ot_0700_0800', label: 'OT 07:00-08:00' },
      { field: 'ot_mid_shift', label: '中直OT津貼', condition: (wl) => wl.is_mid_shift === true },
    ];

    for (const os of otSlots) {
      const rate = Number((salarySetting as any)[os.field]) || 0;
      if (rate === 0) continue;

      const filteredLogs = workLogs.filter(wl => {
        if (!(wl.ot_quantity && Number(wl.ot_quantity) > 0)) return false;
        if (os.condition) return os.condition(wl);
        return true;
      });
      const otDays = new Set(filteredLogs.map(wl => toDateStr(wl.scheduled_date))).size;

      if (otDays === 0) continue;

      const amount = rate * otDays;
      otTotal += amount;

      items.push({
        item_type: 'ot',
        item_name: os.label,
        unit_price: rate,
        quantity: otDays,
        amount,
        sort_order: sortOrder++,
      });
    }

    // ── (4) 分傭計算 ──
    let commissionTotal = 0;

    if (salarySetting.is_piece_rate && salarySetting.fleet_rate_card_id) {
      const fleetRateCard = await this.prisma.fleetRateCard.findUnique({
        where: { id: salarySetting.fleet_rate_card_id },
      });

      if (fleetRateCard) {
        for (const wl of workLogs) {
          const resolved = this.resolveRate(fleetRateCard, wl.day_night);
          const rate = resolved.rate;

          const qty = Number(wl.quantity) || 1;
          commissionTotal += rate * qty;
        }

        if (commissionTotal > 0) {
          items.push({
            item_type: 'commission',
            item_name: '司機分傭',
            unit_price: 0,
            quantity: workLogs.length,
            amount: commissionTotal,
            remarks: `租賃價目表 #${fleetRateCard.id}`,
            sort_order: sortOrder++,
          });
        }
      }
    }

    // ── (5) 強積金計算 ──
    const mpfPlan = emp.mpf_plan || 'industry';
    let mpfDeduction = 0;
    let mpfEmployer = 0;

    const grossIncome = baseAmount + allowanceTotal + otTotal + commissionTotal;

    if (mpfPlan === 'industry') {
      const workDatesForMpf = new Set(workLogs.map(wl => toDateStr(wl.scheduled_date)));
      const mpfDays = workDatesForMpf.size;
      mpfDeduction = 50 * mpfDays;
      mpfEmployer = 50 * mpfDays;

      items.push({
        item_type: 'mpf_deduction',
        item_name: '強積金（行業計劃）',
        unit_price: 50,
        quantity: mpfDays,
        amount: -mpfDeduction,
        sort_order: sortOrder++,
      });
    } else {
      mpfDeduction = Math.min(grossIncome * 0.05, 1500);
      mpfEmployer = Math.min(grossIncome * 0.05, 1500);
      mpfDeduction = Math.round(mpfDeduction * 100) / 100;
      mpfEmployer = Math.round(mpfEmployer * 100) / 100;

      const planLabel = mpfPlan === 'manulife' ? 'Manulife' : mpfPlan === 'aia' ? 'AIA' : '一般計劃';

      items.push({
        item_type: 'mpf_deduction',
        item_name: `強積金（${planLabel}）`,
        unit_price: grossIncome,
        quantity: 0.05,
        amount: -mpfDeduction,
        remarks: `月入 5%，上限 $1,500`,
        sort_order: sortOrder++,
      });
    }

    const netAmount = grossIncome - mpfDeduction;

    return {
      salary_type: salaryType,
      base_rate: baseSalary,
      work_days: workDays,
      base_amount: baseAmount,
      allowance_total: allowanceTotal,
      ot_total: otTotal,
      commission_total: commissionTotal,
      mpf_deduction: mpfDeduction,
      mpf_plan: mpfPlan,
      mpf_employer: mpfEmployer,
      gross_income: grossIncome,
      net_amount: netAmount,
      items,
    };
  }

  // ── 更新糧單 ──────────────────────────────────────────────────
  async update(id: number, body: any) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');

    const updateData: any = {};
    if (body.payment_date !== undefined) updateData.payment_date = body.payment_date ? new Date(body.payment_date) : null;
    if (body.cheque_number !== undefined) updateData.cheque_number = body.cheque_number;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;

    return this.prisma.payroll.update({ where: { id }, data: updateData });
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
    const alreadyExists = await this.expensesService.existsBySourceRef('PAYROLL', id);
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
    const deletedCount = await this.expensesService.deleteBySourceRef('PAYROLL', id);

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
  async bulkMarkPaid(ids: number[], paymentDate?: string, chequeNumber?: string) {
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
  async remove(id: number) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能刪除草稿狀態的糧單');
    }

    // Delete any auto-generated expenses (safety check)
    await this.expensesService.deleteBySourceRef('PAYROLL', id);

    await this.prisma.payrollWorkLog.deleteMany({ where: { payroll_id: id } });
    await this.prisma.payrollAdjustment.deleteMany({ where: { payroll_id: id } });
    await this.prisma.payrollDailyAllowance.deleteMany({ where: { payroll_id: id } });
    await this.prisma.payrollItem.deleteMany({ where: { payroll_id: id } });
    await this.prisma.payroll.delete({ where: { id } });
    return { deleted: true };
  }

  // ── 重新計算糧單 ──────────────────────────────────────────────
  async recalculate(id: number) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: { include: { company: true } },
        adjustments: true,
      },
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能重新計算草稿狀態的糧單');
    }

    const empId = payroll.employee_id;
    const dateFrom = toDateStr(payroll.date_from) || `${payroll.period}-01`;
    const dateTo = toDateStr(payroll.date_to) || (() => {
      const [y, m] = payroll.period.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      return `${payroll.period}-${String(lastDay).padStart(2, '0')}`;
    })();
    const cpId = payroll.company_profile_id;

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

    // Convert PayrollWorkLog to WorkLog-like objects for calculation
    const workLogLike = pwls.map(pwl => ({
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
      client_id: pwl.client_id,
      quotation_id: pwl.quotation_id,
      matched_rate_card_id: pwl.matched_rate_card_id,
      matched_rate: pwl.matched_rate,
      matched_unit: pwl.matched_unit,
      matched_ot_rate: pwl.matched_ot_rate,
      price_match_status: pwl.price_match_status,
      price_match_note: pwl.price_match_note,
    }));

    const calc = await this.calculatePayroll(emp, salarySetting, workLogLike, dateFrom, dateTo, cpId);

    // Calculate adjustment total
    const adjustments = payroll.adjustments || [];
    const adjustmentTotal = adjustments.reduce((sum, adj) => sum + Number(adj.amount), 0);

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

    // Update payroll totals
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
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    const pwl = await this.prisma.payrollWorkLog.findFirst({
      where: { id: pwlId, payroll_id: payrollId },
    });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    // Update snapshot fields
    const editableFields = [
      'service_type', 'scheduled_date', 'day_night', 'start_location', 'end_location',
      'machine_type', 'tonnage', 'equipment_number', 'quantity', 'unit',
      'ot_quantity', 'ot_unit', 'is_mid_shift', 'remarks', 'client_name', 'contract_no',
    ];

    const updateData: any = { is_modified: true };
    for (const field of editableFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Re-match price if relevant fields changed
    const priceRelatedFields = ['client_id', 'company_profile_id', 'machine_type', 'tonnage', 'day_night', 'start_location', 'end_location', 'is_mid_shift'];
    const hasPriceChange = priceRelatedFields.some(f => body[f] !== undefined);

    // Merge current data with updates for price matching
    const mergedPwl = { ...pwl, ...updateData };

    if (hasPriceChange) {
      const priceInfo = await this.rematchPayrollWorkLogPrice(mergedPwl);
      Object.assign(updateData, priceInfo);
    }

    // Recalculate line amount
    const finalPwl = { ...pwl, ...updateData };
    updateData.line_amount = this.calculateLineAmount(finalPwl);

    await this.prisma.payrollWorkLog.update({
      where: { id: pwlId },
      data: updateData,
    });

    return this.prisma.payrollWorkLog.findUnique({ where: { id: pwlId } });
  }

  // ── 編輯原始工作記錄（編輯大數據）──────────────────────────
  async updateOriginalWorkLog(payrollId: number, pwlId: number, body: any) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    const pwl = await this.prisma.payrollWorkLog.findFirst({
      where: { id: pwlId, payroll_id: payrollId },
    });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    // Update original work log
    const editableFields = [
      'service_type', 'scheduled_date', 'day_night', 'start_location', 'end_location',
      'machine_type', 'tonnage', 'equipment_number', 'quantity', 'unit',
      'ot_quantity', 'ot_unit', 'remarks',
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
    const priceInfo = await this.rematchPayrollWorkLogPrice(mergedPwl);
    Object.assign(pwlUpdateData, priceInfo);
    pwlUpdateData.line_amount = this.calculateLineAmount({ ...mergedPwl, ...priceInfo });

    await this.prisma.payrollWorkLog.update({
      where: { id: pwlId },
      data: pwlUpdateData,
    });

    return this.prisma.payrollWorkLog.findUnique({ where: { id: pwlId } });
  }

  // ── 從糧單移除工作記錄 ──────────────────────────────────────
  async excludePayrollWorkLog(payrollId: number, pwlId: number) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
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
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
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
  async addAdjustment(payrollId: number, body: { item_name: string; amount: number; remarks?: string }) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
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
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
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
  async addDailyAllowance(payrollId: number, body: {
    date: string;
    allowance_key: string;
    allowance_name: string;
    amount: number;
    remarks?: string;
  }) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    // Check if same allowance already exists for this date
    const existing = await this.prisma.payrollDailyAllowance.findFirst({
      where: { payroll_id: payrollId, date: new Date(body.date), allowance_key: body.allowance_key },
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
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    const da = await this.prisma.payrollDailyAllowance.findFirst({
      where: { id: daId, payroll_id: payrollId },
    });
    if (!da) throw new NotFoundException('Daily allowance not found');

    await this.prisma.payrollDailyAllowance.delete({ where: { id: daId } });

    return { success: true };
  }

  // 批量設定某日的津貼
  async setDailyAllowances(payrollId: number, body: {
    date: string;
    allowances: { allowance_key: string; allowance_name: string; amount: number; remarks?: string }[];
  }) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
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

    return this.buildAllowanceOptions(salarySetting);
  }

  // ── 統計摘要 ──────────────────────────────────────────────────
  async getSummary(query: any) {
    const where: any = {};
    if (query.period) where.period = query.period;
    if (query.company_profile_id) where.company_profile_id = Number(query.company_profile_id);

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

  // ══════════════════════════════════════════════════════════════
  // ── 逐日計算邏輯 ──────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  private buildDailyCalculation(
    pwls: any[],
    salarySetting: any | null,
    dailyAllowances: any[],
  ): any[] {
    const baseSalary = salarySetting ? Number(salarySetting.base_salary) || 0 : 0;

    const dateMap = new Map<string, any[]>();
    for (const pwl of pwls) {
      const date = toDateStr(pwl.scheduled_date);
      if (!dateMap.has(date)) dateMap.set(date, []);
      dateMap.get(date)!.push(pwl);
    }

    const daMap = new Map<string, any[]>();
    for (const da of dailyAllowances) {
      const date = toDateStr(da.date);
      if (!daMap.has(date)) daMap.set(date, []);
      daMap.get(date)!.push(da);
    }

    const sortedDates = Array.from(dateMap.keys()).sort();

    return sortedDates.map(date => {
      const dayPwls = dateMap.get(date) || [];
      const dayAllowances = daMap.get(date) || [];

      const workIncome = dayPwls.reduce((sum: number, pwl: any) => sum + (Number(pwl.line_amount) || 0), 0);
      const needsTopUp = baseSalary > 0 && workIncome < baseSalary;
      const topUpAmount = needsTopUp ? baseSalary - workIncome : 0;
      const effectiveIncome = baseSalary > 0 ? Math.max(workIncome, baseSalary) : workIncome;
      const dailyAllowanceTotal = dayAllowances.reduce((sum: number, da: any) => sum + (Number(da.amount) || 0), 0);
      const dayTotal = effectiveIncome + dailyAllowanceTotal;

      return {
        date,
        work_logs: dayPwls.map((pwl: any) => ({
          id: pwl.id,
          service_type: pwl.service_type,
          day_night: pwl.day_night,
          start_location: pwl.start_location,
          end_location: pwl.end_location,
          client_name: pwl.client_name,
          contract_no: pwl.contract_no,
          quantity: Number(pwl.quantity) || 1,
          matched_rate: pwl.matched_rate ? Number(pwl.matched_rate) : null,
          line_amount: Number(pwl.line_amount) || 0,
          price_match_status: pwl.price_match_status,
        })),
        work_income: workIncome,
        base_salary: baseSalary,
        needs_top_up: needsTopUp,
        top_up_amount: topUpAmount,
        effective_income: effectiveIncome,
        daily_allowances: dayAllowances.map((da: any) => ({
          id: da.id,
          allowance_key: da.allowance_key,
          allowance_name: da.allowance_name,
          amount: Number(da.amount),
          remarks: da.remarks,
        })),
        daily_allowance_total: dailyAllowanceTotal,
        day_total: dayTotal,
      };
    });
  }

  private buildDailyCalculationFromWorkLogs(
    workLogs: any[],
    salarySetting: any | null,
    dailyAllowances: any[],
  ): any[] {
    const baseSalary = salarySetting ? Number(salarySetting.base_salary) || 0 : 0;

    const dateMap = new Map<string, any[]>();
    for (const wl of workLogs) {
      const date = toDateStr(wl.scheduled_date);
      if (!dateMap.has(date)) dateMap.set(date, []);
      dateMap.get(date)!.push(wl);
    }

    const daMap = new Map<string, any[]>();
    for (const da of dailyAllowances) {
      const date = toDateStr(da.date);
      if (!daMap.has(date)) daMap.set(date, []);
      daMap.get(date)!.push(da);
    }

    const sortedDates = Array.from(dateMap.keys()).sort();

    return sortedDates.map(date => {
      const dayWls = dateMap.get(date) || [];
      const dayAllowances = daMap.get(date) || [];

      const workIncome = dayWls.reduce((sum: number, wl: any) => sum + (Number(wl._line_amount) || 0), 0);
      const needsTopUp = baseSalary > 0 && workIncome < baseSalary;
      const topUpAmount = needsTopUp ? baseSalary - workIncome : 0;
      const effectiveIncome = baseSalary > 0 ? Math.max(workIncome, baseSalary) : workIncome;
      const dailyAllowanceTotal = dayAllowances.reduce((sum: number, da: any) => sum + (Number(da.amount) || 0), 0);
      const dayTotal = effectiveIncome + dailyAllowanceTotal;

      return {
        date,
        work_logs: dayWls.map((wl: any) => ({
          id: wl.id,
          service_type: wl.service_type,
          day_night: wl.day_night,
          start_location: wl.start_location,
          end_location: wl.end_location,
          client_name: wl.client?.name || '',
          contract_no: wl.quotation?.quotation_no || '',
          quantity: Number(wl.quantity) || 1,
          matched_rate: wl._matched_rate ? Number(wl._matched_rate) : null,
          line_amount: Number(wl._line_amount) || 0,
          price_match_status: wl._price_match_status || 'unmatched',
        })),
        work_income: workIncome,
        base_salary: baseSalary,
        needs_top_up: needsTopUp,
        top_up_amount: topUpAmount,
        effective_income: effectiveIncome,
        daily_allowances: dayAllowances.map((da: any) => ({
          id: da.id,
          allowance_key: da.allowance_key,
          allowance_name: da.allowance_name,
          amount: Number(da.amount),
          remarks: da.remarks,
        })),
        daily_allowance_total: dailyAllowanceTotal,
        day_total: dayTotal,
      };
    });
  }

  private buildAllowanceOptions(salarySetting: any | null): any[] {
    if (!salarySetting) return [];

    const options: any[] = [];

    const builtInAllowances: { key: string; label: string; field: string }[] = [
      { key: 'allowance_night', label: '夜班津貼', field: 'allowance_night' },
      { key: 'allowance_rent', label: '租車津貼', field: 'allowance_rent' },
      { key: 'allowance_3runway', label: '三跑津貼', field: 'allowance_3runway' },
      { key: 'allowance_well', label: '落井津貼', field: 'allowance_well' },
      { key: 'allowance_machine', label: '揸機津貼', field: 'allowance_machine' },
      { key: 'allowance_roller', label: '火轆津貼', field: 'allowance_roller' },
      { key: 'allowance_crane', label: '吊/挾車津貼', field: 'allowance_crane' },
      { key: 'allowance_move_machine', label: '搬機津貼', field: 'allowance_move_machine' },
      { key: 'allowance_kwh_night', label: '嘉華-夜間津貼', field: 'allowance_kwh_night' },
      { key: 'allowance_mid_shift', label: '中直津貼', field: 'allowance_mid_shift' },
    ];

    for (const ba of builtInAllowances) {
      const amount = Number((salarySetting as any)[ba.field]) || 0;
      if (amount > 0) {
        options.push({
          key: ba.key,
          label: ba.label,
          default_amount: amount,
        });
      }
    }

    // Custom allowances
    if (salarySetting.custom_allowances && Array.isArray(salarySetting.custom_allowances)) {
      for (const ca of salarySetting.custom_allowances as any[]) {
        if (ca.amount && Number(ca.amount) > 0) {
          options.push({
            key: `custom:${ca.name}`,
            label: ca.name || '自定義津貼',
            default_amount: Number(ca.amount),
          });
        }
      }
    }

    return options;
  }

  // ══════════════════════════════════════════════════════════════
  // ── 輔助方法 ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  private async enrichWorkLogsWithPrice(workLogs: any[]): Promise<any[]> {
    if (workLogs.length === 0) return [];

    // 批量加載所有相關客戶的 FleetRateCard（租賃價目表）
    const clientIds = [...new Set(workLogs.filter(wl => wl.client_id).map(wl => wl.client_id!))];

    let allFleetRateCards: any[] = [];
    if (clientIds.length > 0) {
      allFleetRateCards = await this.prisma.fleetRateCard.findMany({
        where: {
          status: 'active',
          client_id: { in: clientIds },
        },
      });
    }

    const result: any[] = [];

    for (const wl of workLogs) {
      const enriched: any = { ...wl };

      if (wl.client_id) {
        const clientCards = allFleetRateCards.filter(rc => rc.client_id === wl.client_id);
        const contractNo = wl.quotation?.quotation_no || null;

        // 使用共用 PricingService 進行嚴格匹配
        const { card, unmatchedReason } = this.pricingService.matchFleetRateCardInMemory(
          clientCards,
          contractNo,
          wl.day_night,
          wl.tonnage,
          wl.machine_type,
          wl.start_location,
          wl.end_location,
        );

        if (card) {
          const qty = Number(wl.quantity) || 1;
          const otQty = Number(wl.ot_quantity) || 0;
          const isMidShift = wl.is_mid_shift || false;
          const amounts = this.pricingService.calculateLineAmounts(card, wl.day_night, qty, otQty, isMidShift);
          enriched._matched_rate_card_id = card.id;
          enriched._matched_rate = amounts.rate;
          enriched._matched_unit = amounts.unit;
          enriched._matched_ot_rate = amounts.otRate;
          enriched._matched_mid_shift_rate = amounts.midShiftRate;
          enriched._price_match_status = 'matched';
          enriched._price_match_note = `匹配到：${card.contract_no || `FleetRC#${card.id}`} (${card.day_night || '日'})`;
          enriched._line_amount = amounts.baseAmount;
          enriched._ot_line_amount = amounts.otAmount;
          enriched._mid_shift_line_amount = amounts.midShiftAmount;
        } else {
          enriched._matched_rate_card_id = null;
          enriched._matched_rate = null;
          enriched._matched_unit = null;
          enriched._matched_ot_rate = null;
          enriched._matched_mid_shift_rate = null;
          enriched._price_match_status = 'unmatched';
          enriched._price_match_note = unmatchedReason;
          enriched._line_amount = 0;
          enriched._ot_line_amount = 0;
          enriched._mid_shift_line_amount = 0;
        }
        enriched._group_key = this.buildGroupKeyFromWorkLog(wl);
      } else {
        enriched._matched_rate_card_id = null;
        enriched._matched_rate = null;
        enriched._matched_unit = null;
        enriched._matched_ot_rate = null;
        enriched._matched_mid_shift_rate = null;
        enriched._price_match_status = 'unmatched';
        enriched._price_match_note = '未設定（無客戶）';
        enriched._line_amount = 0;
        enriched._ot_line_amount = 0;
        enriched._mid_shift_line_amount = 0;
        enriched._group_key = this.buildGroupKeyFromWorkLog(wl);
      }

      result.push(enriched);
    }

    return result;
  }

  // tryMatchFleetRateCardInMemory 已移至 PricingService.matchFleetRateCardInMemory()

  private async matchFleetRateCardForWorkLog(wl: any): Promise<{ card: any; rate: number; unit: string } | null> {
    if (!wl.client_id) return null;

    const contractNo = wl.quotation?.quotation_no || wl.contract_no || null;

    // 使用共用 PricingService 進行嚴格匹配
    const { card } = await this.pricingService.matchFleetRateCardFromDb(
      wl.client_id,
      contractNo,
      wl.day_night,
      wl.tonnage,
      wl.machine_type,
      wl.start_location,
      wl.end_location,
    );

    if (!card) return null;

    const resolved = this.pricingService.resolveRate(card, wl.day_night);
    return { card, rate: resolved.rate, unit: resolved.unit };
  }

  // tryMatchFleetRateCard 已移至 PricingService.matchFleetRateCardFromDb()

  // resolveRate 已移至 PricingService.resolveRate()
  private resolveRate(card: any, dayNight: string | null): { rate: number; unit: string } {
    return this.pricingService.resolveRate(card, dayNight);
  }

  private buildGroupKeyFromWorkLog(wl: any): string {
    const parts = [
      wl.client?.name || wl.client_name || `client_${wl.client_id || ''}`,
      wl.quotation?.quotation_no || wl.contract_no || `q_${wl.quotation_id || ''}`,  
      wl.service_type || '',
      wl.day_night || '日',
      wl.start_location || '',
      wl.end_location || '',
      wl.machine_type || '',
      wl.tonnage || '',
    ];
    return parts.join('|');
  }

  private buildGroupedSettlement(pwls: any[]): any[] {
    const groups = new Map<string, any>();

    for (const pwl of pwls) {
      const key = pwl.group_key || this.buildGroupKeyFromPwl(pwl);
      const existing = groups.get(key);

      if (existing) {
        existing.total_quantity += Number(pwl.quantity) || 1;
        existing.total_amount += Number(pwl.line_amount) || 0;
        existing.count += 1;
        existing.work_log_ids.push(pwl.id);
      } else {
        groups.set(key, {
          group_key: key,
          client_name: pwl.client_name || '',
          contract_no: pwl.contract_no || '',
          service_type: pwl.service_type || '',
          day_night: pwl.day_night || '日',
          start_location: pwl.start_location || '',
          end_location: pwl.end_location || '',
          machine_type: pwl.machine_type || '',
          tonnage: pwl.tonnage || '',
          matched_rate: pwl.matched_rate ? Number(pwl.matched_rate) : null,
          matched_unit: pwl.matched_unit || null,
          total_quantity: Number(pwl.quantity) || 1,
          total_amount: Number(pwl.line_amount) || 0,
          count: 1,
          price_match_status: pwl.price_match_status || 'unmatched',
          work_log_ids: [pwl.id],
        });
      }
    }

    return Array.from(groups.values());
  }

  private buildGroupedSettlementFromWorkLogs(workLogs: any[]): any[] {
    const groups = new Map<string, any>();

    for (const wl of workLogs) {
      const key = wl._group_key || this.buildGroupKeyFromWorkLog(wl);
      const existing = groups.get(key);

      if (existing) {
        existing.total_quantity += Number(wl.quantity) || 1;
        existing.total_amount += Number(wl._line_amount) || 0;
        existing.count += 1;
        existing.work_log_ids.push(wl.id);
      } else {
        groups.set(key, {
          group_key: key,
          client_name: wl.client?.name || '',
          contract_no: wl.quotation?.quotation_no || '',
          service_type: wl.service_type || '',
          day_night: wl.day_night || '日',
          start_location: wl.start_location || '',
          end_location: wl.end_location || '',
          machine_type: wl.machine_type || '',
          tonnage: wl.tonnage || '',
          matched_rate: wl._matched_rate ? Number(wl._matched_rate) : null,
          matched_unit: wl._matched_unit || null,
          total_quantity: Number(wl.quantity) || 1,
          total_amount: Number(wl._line_amount) || 0,
          count: 1,
          price_match_status: wl._price_match_status || 'unmatched',
          work_log_ids: [wl.id],
        });
      }
    }

    return Array.from(groups.values());
  }

  private buildGroupKeyFromPwl(pwl: any): string {
    const parts = [
      pwl.client_name || `client_${pwl.client_id || ''}`,
      pwl.contract_no || `q_${pwl.quotation_id || ''}`,
      pwl.service_type || '',
      pwl.day_night || '日',
      pwl.start_location || '',
      pwl.end_location || '',
      pwl.machine_type || '',
      pwl.tonnage || '',
    ];
    return parts.join('|');
  }

  private calculateLineAmount(pwl: any): number {
    if (pwl.price_match_status !== 'matched') return 0;
    const rate = Number(pwl.matched_rate) || 0;
    const qty = Number(pwl.quantity) || 1;
    const otRate = Number(pwl.matched_ot_rate) || 0;
    const otQty = Number(pwl.ot_quantity) || 0;
    const midShiftRate = Number(pwl.matched_mid_shift_rate) || 0;
    const isMidShift = pwl.is_mid_shift === true;

    const baseAmount = rate * qty;
    const otAmount = otRate * otQty;
    const midShiftAmount = isMidShift ? midShiftRate * 1 : 0;

    return baseAmount + otAmount + midShiftAmount;
  }

  private async rematchPayrollWorkLogPrice(pwl: any): Promise<any> {
    if (!pwl.client_id) {
      return {
        price_match_status: 'pending',
        price_match_note: '缺少客戶資訊',
        matched_rate_card_id: null,
        matched_rate: null,
        matched_unit: null,
        matched_ot_rate: null,
      };
    }

    const { card, unmatchedReason } = await this.pricingService.matchFleetRateCardFromDb(
      pwl.client_id,
      pwl.contract_no || null,
      pwl.day_night || null,
      pwl.tonnage || null,
      pwl.machine_type || null,
      pwl.start_location || null,
      pwl.end_location || null,
    );

    if (!card) {
      return {
        price_match_status: 'unmatched',
        price_match_note: unmatchedReason || '未設定',
        matched_rate_card_id: null,
        matched_rate: null,
        matched_unit: null,
        matched_ot_rate: null,
        matched_mid_shift_rate: null,
        ot_line_amount: 0,
        mid_shift_line_amount: 0,
      };
    }

    const resolved = this.pricingService.resolveRate(card, pwl.day_night);
    const otRate = Number(card.ot_rate) || 0;
    const otQty = Number(pwl.ot_quantity) || 0;
    const midShiftRate = Number(card.mid_shift_rate) || 0;
    const isMidShift = pwl.is_mid_shift || false;

    return {
      matched_rate_card_id: card.id,
      matched_rate: resolved.rate,
      matched_unit: resolved.unit,
      matched_ot_rate: otRate,
      matched_mid_shift_rate: midShiftRate,
      ot_line_amount: otRate * otQty,
      mid_shift_line_amount: isMidShift ? midShiftRate * 1 : 0,
      price_match_status: 'matched',
      price_match_note: `匹配到：${card.contract_no || `FleetRC#${card.id}`} (${card.day_night || '日'})`,
    };
  }

  private async recalcAdjustmentTotal(payrollId: number): Promise<void> {
    const adjustments = await this.prisma.payrollAdjustment.findMany({
      where: { payroll_id: payrollId },
    });
    const adjustmentTotal = adjustments.reduce((sum, adj) => sum + Number(adj.amount), 0);

    const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
    if (!payroll) return;

    const grossIncome = Number(payroll.base_amount) + Number(payroll.allowance_total) +
      Number(payroll.ot_total) + Number(payroll.commission_total);
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
    const grossIncome = Number(payroll.base_amount) + Number(payroll.allowance_total) +
      Number(payroll.ot_total) + Number(payroll.commission_total);

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
        const amount = i === projectDistribution.length - 1
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
  private async calculateProjectDistribution(pwls: any[]): Promise<{ project_id: number | null; days: number }[]> {
    const projectDaysMap = new Map<number | null, Set<string>>();

    // Collect work_log_ids to batch-query project_id
    const workLogIds = pwls
      .filter(p => p.work_log_id)
      .map(p => p.work_log_id);

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
}
