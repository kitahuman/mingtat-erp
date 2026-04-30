import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../common/pricing.service';

/**
 * 將日期轉為 YYYY-MM-DD 字串
 */
export function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return '';
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return d;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * PayrollCalculationService
 *
 * 負責薪酬計算的核心邏輯，包括：
 * - 底薪、津貼、OT、分傭、強積金計算
 * - 工作記錄價格匹配與豐富化
 * - 逐日計算邏輯
 * - 分組結算邏輯
 * - 津貼選項構建
 */
@Injectable()
export class PayrollCalculationService {
  private readonly logger = new Logger(PayrollCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  // ── 核心計算邏輯（可被 preview、generate、recalculate 共用）──
  // ══════════════════════════════════════════════════════════════

  async calculatePayroll(
    emp: any,
    salarySetting: any,
    workLogs: any[],
    dateFrom: string,
    dateTo: string,
    companyOrCpId?: number | null,
    mpfRelevantIncome?: number | null,
    holidayDates?: { date: Date; name: string }[],
  ) {
    const salaryType = salarySetting.salary_type || 'daily';
    const baseSalary = Number(salarySetting.base_salary) || 0;
    const configuredBaseSalaryNight = Number(salarySetting.base_salary_night) || 0;
    const baseSalaryNight = configuredBaseSalaryNight > 0 ? configuredBaseSalaryNight : baseSalary;
    const items: any[] = [];
    let sortOrder = 1;

    // ── (1) 底薪計算 ──
    let baseAmount = 0;
    let workDays = 0;
    let workNights = 0;
    // 實際工作日期（底薪只算實際上班天數）；同一天日更和夜更可同時各算一次
    const workDateSet = new Set(
      workLogs.map((wl) => toDateStr(wl.scheduled_date)),
    );
    const dayWorkDateSet = new Set(
      workLogs
        .filter((wl) => wl.day_night !== '夜')
        .map((wl) => toDateStr(wl.scheduled_date)),
    );
    const nightWorkDateSet = new Set(
      workLogs
        .filter((wl) => wl.day_night === '夜')
        .map((wl) => toDateStr(wl.scheduled_date)),
    );
    // 法定假日：假日没上班才算（假日有上班則已包含在 workDateSet 中），並固定用日更底薪計算
    const validHolidays = (holidayDates || []).filter(
      (h) => !workDateSet.has(toDateStr(h.date)),
    );
    const holidayCount = validHolidays.length;
    if (salaryType === 'daily') {
      workDays = dayWorkDateSet.size;
      workNights = nightWorkDateSet.size;
      const dayBaseAmount = baseSalary * workDays;
      const nightBaseAmount = baseSalaryNight * workNights;
      baseAmount = dayBaseAmount + nightBaseAmount;
      items.push({
        item_type: 'base_salary',
        item_name: '底薪-日更',
        unit_price: baseSalary,
        quantity: workDays,
        amount: dayBaseAmount,
        sort_order: sortOrder++,
      });
      if (workNights > 0) {
        items.push({
          item_type: 'base_salary',
          item_name: '底薪-夜更',
          unit_price: baseSalaryNight,
          quantity: workNights,
          amount: nightBaseAmount,
          sort_order: sortOrder++,
        });
      }
      // 法定假日津貼：假日沒上班，給一天日薪作為津貼（獨立一行）
      if (holidayCount > 0 && baseSalary > 0) {
        const holidayAllowance = baseSalary * holidayCount;
        items.push({
          item_type: 'allowance',
          item_name: '法定假日津貼',
          unit_price: baseSalary,
          quantity: holidayCount,
          amount: holidayAllowance,
          remarks: validHolidays.map((h) => h.name).join('、'),
          sort_order: sortOrder++,
        });
      }
    } else {
      workDays = workDateSet.size;
      workNights = nightWorkDateSet.size;
      baseAmount = baseSalary;
      items.push({
        item_type: 'base_salary',
        item_name: '底薪（月薪制）',
        unit_price: baseSalary,
        quantity: 1,
        amount: baseAmount,
        sort_order: sortOrder++,
      });
    }

    // ── (2) 津貼計算 ──
    let allowanceTotal = 0;

    // Phase 2: 連結優先規則 - 如果某個 allowance_key 在 PayrollDailyAllowance 中已有自動記錄，則跳過固定津貼計算
    // 注意：workLogs 這裡如果包含了 _linked_allowance_keys 標記，我們可以用它來跳過
    const linkedAllowanceKeys = new Set<string>();
    workLogs.forEach(wl => {
      if (wl._linked_allowance_keys && Array.isArray(wl._linked_allowance_keys)) {
        wl._linked_allowance_keys.forEach((k: string) => linkedAllowanceKeys.add(k));
      }
    });

    const allowanceFields: {
      field: string;
      label: string;
      condition?: (wl: any) => boolean;
    }[] = [
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
    for (const af of allowanceFields) {
      // 連結優先規則：如果該津貼已由價目表自動產生，則跳過固定津貼
      if (linkedAllowanceKeys.has(af.field)) continue;

      const rate = Number((salarySetting as any)[af.field]) || 0;
      if (rate === 0) continue;
      let days = 0;
      if (af.condition) {
        const matchDates = new Set(
          workLogs
            .filter(af.condition)
            .map((wl) => toDateStr(wl.scheduled_date)),
        );
        days = matchDates.size;
      } else {
        const workDates = new Set(
          workLogs.map((wl) => toDateStr(wl.scheduled_date)),
        );
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
    if (
      salarySetting.custom_allowances &&
      Array.isArray(salarySetting.custom_allowances)
    ) {
      for (const ca of salarySetting.custom_allowances as any[]) {
        if (!ca.amount || ca.amount === 0) continue;
        const workDatesSet = new Set(
          workLogs.map((wl) => toDateStr(wl.scheduled_date)),
        );
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
    const otSlots: {
      field: string;
      label: string;
      condition?: (wl: any) => boolean;
    }[] = [
      { field: 'ot_1800_1900', label: 'OT 18:00-19:00' },
      { field: 'ot_1900_2000', label: 'OT 19:00-20:00' },
      { field: 'ot_0600_0700', label: 'OT 06:00-07:00' },
      { field: 'ot_0700_0800', label: 'OT 07:00-08:00' },
      {
        field: 'ot_mid_shift',
        label: '中直OT津貼',
        condition: (wl) => wl.is_mid_shift === true,
      },
    ];
    for (const os of otSlots) {
      const rate = Number((salarySetting as any)[os.field]) || 0;
      if (rate === 0) continue;
      const filteredLogs = workLogs.filter((wl) => {
        if (!(wl.ot_quantity && Number(wl.ot_quantity) > 0)) return false;
        if (os.condition) return os.condition(wl);
        return true;
      });
      const otDays = new Set(
        filteredLogs.map((wl) => toDateStr(wl.scheduled_date)),
      ).size;
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

    const MPF_INDUSTRY_TIERS = [
      { min: 0, max: 280, employer: 10, employee: 0 },
      { min: 280, max: 350, employer: 15, employee: 15 },
      { min: 350, max: 450, employer: 20, employee: 20 },
      { min: 450, max: 550, employer: 25, employee: 25 },
      { min: 550, max: 650, employer: 30, employee: 30 },
      { min: 650, max: 750, employer: 35, employee: 35 },
      { min: 750, max: 850, employer: 40, employee: 40 },
      { min: 850, max: 950, employer: 45, employee: 45 },
      { min: 950, max: Infinity, employer: 50, employee: 50 },
    ];

    if (mpfPlan === 'industry') {
      const dayIncomeMap = new Map<
        string,
        { dayIncome: number; nightIncome: number; hasDay: boolean; hasNight: boolean }
      >();
      for (const wl of workLogs) {
        const date = toDateStr(wl.scheduled_date);
        const current = dayIncomeMap.get(date) || {
          dayIncome: 0,
          nightIncome: 0,
          hasDay: false,
          hasNight: false,
        };
        const lineAmt =
          Number(wl.line_amount ?? wl._line_amount ?? 0) +
          Number(wl.ot_line_amount ?? wl._ot_line_amount ?? 0) +
          Number(wl.mid_shift_line_amount ?? wl._mid_shift_line_amount ?? 0);
        if (wl.day_night === '夜') {
          current.nightIncome += lineAmt;
          current.hasNight = true;
        } else {
          current.dayIncome += lineAmt;
          current.hasDay = true;
        }
        dayIncomeMap.set(date, current);
      }
      let totalEmployeeContrib = 0;
      let totalEmployerContrib = 0;
      for (const [, income] of dayIncomeMap) {
        // 同一天的日更與夜更合併成一個強積金計算日；日/夜只用於套用各自底薪下限。
        let effectiveIncome = income.dayIncome + income.nightIncome;
        if (salaryType === 'daily') {
          const effectiveDayIncome = income.hasDay
            ? Math.max(income.dayIncome, baseSalary)
            : 0;
          const effectiveNightIncome = income.hasNight
            ? Math.max(income.nightIncome, baseSalaryNight)
            : 0;
          effectiveIncome = effectiveDayIncome + effectiveNightIncome;
        }
        const tier =
          MPF_INDUSTRY_TIERS.find(
            (t) => effectiveIncome > t.min && effectiveIncome <= t.max,
          ) || MPF_INDUSTRY_TIERS[MPF_INDUSTRY_TIERS.length - 1];
        totalEmployeeContrib += tier.employee;
        totalEmployerContrib += tier.employer;
      }
      mpfDeduction = totalEmployeeContrib;
      mpfEmployer = totalEmployerContrib;
      const mpfDays = dayIncomeMap.size;
      const avgEmployee =
        mpfDays > 0
          ? Math.round((totalEmployeeContrib / mpfDays) * 100) / 100
          : 0;
      items.push({
        item_type: 'mpf_deduction',
        item_name: '強積金（行業計劃）',
        unit_price: avgEmployee,
        quantity: mpfDays,
        amount: -mpfDeduction,
        remarks: `按日薪級別計算，${mpfDays}天`,
        sort_order: sortOrder++,
      });
    } else {
      const mpfBase =
        mpfRelevantIncome !== undefined && mpfRelevantIncome !== null
          ? Number(mpfRelevantIncome)
          : grossIncome;
      mpfDeduction = Math.min(mpfBase * 0.05, 1500);
      mpfEmployer = Math.min(mpfBase * 0.05, 1500);
      mpfDeduction = Math.round(mpfDeduction * 100) / 100;
      mpfEmployer = Math.round(mpfEmployer * 100) / 100;
      const planLabel =
        mpfPlan === 'manulife'
          ? 'Manulife'
          : mpfPlan === 'aia'
            ? 'AIA'
            : '一般計劃';
      items.push({
        item_type: 'mpf_deduction',
        item_name: `強積金（${planLabel}）`,
        unit_price: mpfBase,
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
      work_nights: workNights,
      base_amount: baseAmount,
      allowance_total: allowanceTotal,
      ot_total: otTotal,
      commission_total: commissionTotal,
      mpf_deduction: mpfDeduction,
      mpf_plan: mpfPlan,
      mpf_employer: mpfEmployer,
      mpf_relevant_income: grossIncome,
      gross_income: grossIncome,
      net_amount: netAmount,
      items,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 工作記錄價格匹配與豐富化 ──────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  async enrichWorkLogsWithPrice(workLogs: any[]): Promise<any[]> {
    if (workLogs.length === 0) return [];
    const clientIds = [
      ...new Set(
        workLogs.filter((wl) => wl.client_id).map((wl) => wl.client_id!),
      ),
    ];
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
        const clientCards = allFleetRateCards.filter(
          (rc) => rc.client_id === wl.client_id,
        );
        const { card, unmatchedReason } =
          this.pricingService.matchFleetRateCardInMemory(
            clientCards,
            wl.company_id || wl.company_profile_id,
            wl.client_contract_no || null,
            wl.service_type,
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
          const amounts = this.pricingService.calculateLineAmounts(
            card,
            wl.day_night,
            qty,
            otQty,
            isMidShift,
          );
          enriched._matched_rate_card_id = card.id;
          enriched._matched_rate = amounts.rate;
          enriched._matched_unit = amounts.unit;
          enriched._matched_ot_rate = amounts.otRate;
          enriched._matched_mid_shift_rate = amounts.midShiftRate;
          enriched._price_match_status = 'matched';
          enriched._price_match_note = `匹配到：${card.client_contract_no || `FleetRC#${card.id}`} (${card.day_night || '日'})`;
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

  async matchFleetRateCardForWorkLog(
    wl: any,
  ): Promise<{ card: any; rate: number; unit: string } | null> {
    if (!wl.client_id) return null;
    const { card } = await this.pricingService.matchFleetRateCardFromDb(
      wl.client_id,
      wl.company_id || null,
      wl.client_contract_no || null,
      wl.service_type || null,
      wl.day_night || null,
      wl.tonnage || null,
      wl.machine_type || null,
      wl.start_location || null,
      wl.end_location || null,
    );
    if (!card) return null;
    const resolved = this.pricingService.resolveRate(card, wl.day_night);
    return { card, rate: resolved.rate, unit: resolved.unit };
  }

  resolveRate(
    card: any,
    dayNight: string | null,
  ): { rate: number; unit: string } {
    return this.pricingService.resolveRate(card, dayNight);
  }

  // ══════════════════════════════════════════════════════════════
  // ── 逐日計算邏輯 ──────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  /**
   * 建立逐日顯示用固定津貼。
   *
   * 注意：此資料只供前端逐日 badge 顯示，不參與 payroll_items、
   * daily_allowance_total 或 day_total 的金額計算，避免把已計入糧單
   * item 的固定津貼再反向分攤或重複加總。
   */
  private buildDailyFixedAllowanceDisplay(
    dayWorkLogs: any[],
    salarySetting: any | null,
  ): { key: string; name: string; amount: number }[] {
    if (!salarySetting || dayWorkLogs.length === 0) return [];

    const displayAllowances = [
      { key: 'allowance_rent', name: '租車津貼' },
      { key: 'allowance_3runway', name: '三跑津貼' },
    ];

    return displayAllowances
      .filter((item) =>
        item.key === 'allowance_rent'
          ? dayWorkLogs.some((wl) => wl.unit === '天')
          : true,
      )
      .map((item) => ({
        ...item,
        amount: Number((salarySetting as any)[item.key]) || 0,
      }))
      .filter((item) => item.amount > 0);
  }

  buildDailyCalculation(
    pwls: any[],
    salarySetting: any | null,
    dailyAllowances: any[],
  ): any[] {
    const salaryType = salarySetting?.salary_type || 'daily';
    // For monthly salary, do NOT apply daily base guarantee / top-up
    const baseSalary =
      salaryType === 'daily'
        ? (salarySetting ? Number(salarySetting.base_salary) || 0 : 0)
        : 0;
    const configuredBaseSalaryNight =
      salaryType === 'daily' && salarySetting
        ? Number((salarySetting as any).base_salary_night) || 0
        : 0;
    const baseSalaryNight =
      configuredBaseSalaryNight > 0 ? configuredBaseSalaryNight : baseSalary;
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
    const allDates = new Set([...dateMap.keys(), ...daMap.keys()]);
    const sortedDates = Array.from(allDates).sort();
    return sortedDates.map((date) => {
      const dayPwls = dateMap.get(date) || [];
      const dayAllowances = daMap.get(date) || [];
      // 判斷是否為法定假日：該天有 statutory_holiday 津貼且沒有工作記錄
      const isHolidayDay =
        dayPwls.length === 0 &&
        dayAllowances.some(
          (da: any) => da.allowance_key === 'statutory_holiday',
        );
      const dayShiftPwls = dayPwls.filter((pwl: any) => pwl.day_night !== '夜');
      const nightShiftPwls = dayPwls.filter((pwl: any) => pwl.day_night === '夜');
      const workIncome = dayPwls.reduce(
        (sum: number, pwl: any) => sum + (Number(pwl.line_amount) || 0),
        0,
      );
      const dayWorkIncome = dayShiftPwls.reduce(
        (sum: number, pwl: any) => sum + (Number(pwl.line_amount) || 0),
        0,
      );
      const nightWorkIncome = nightShiftPwls.reduce(
        (sum: number, pwl: any) => sum + (Number(pwl.line_amount) || 0),
        0,
      );
      const autoDayTopUpAmount =
        !isHolidayDay && dayShiftPwls.length > 0 && baseSalary > 0
          ? Math.max(baseSalary - dayWorkIncome, 0)
          : 0;
      const autoNightTopUpAmount =
        !isHolidayDay && nightShiftPwls.length > 0 && baseSalaryNight > 0
          ? Math.max(baseSalaryNight - nightWorkIncome, 0)
          : 0;
      const autoTopUpAmount = autoDayTopUpAmount + autoNightTopUpAmount;
      const override = dayAllowances.find(
        (da: any) => da.allowance_key === 'base_top_up_override',
      );
      const isTopUpOverridden = !!override;
      // 假日天不補底薪（effectiveIncome=0），只顯示假日津貼；手動覆蓋只替代補底薪差額本身
      const topUpAmount = isTopUpOverridden
        ? Number(override.amount) || 0
        : autoTopUpAmount;
      const dayTopUpAmount = isTopUpOverridden
        ? topUpAmount
        : autoDayTopUpAmount;
      const nightTopUpAmount = isTopUpOverridden ? 0 : autoNightTopUpAmount;
      const needsTopUp = !isHolidayDay && topUpAmount > 0;
      const effectiveIncome = isHolidayDay ? 0 : workIncome + topUpAmount;
      const displayDayAllowances = dayAllowances.filter(
        (da: any) => da.allowance_key !== 'base_top_up_override',
      );
      const dailyAllowanceTotal = displayDayAllowances.reduce(
        (sum: number, da: any) => sum + (Number(da.amount) || 0),
        0,
      );
      const fixedAllowancesPerDay = this.buildDailyFixedAllowanceDisplay(
        dayPwls,
        salarySetting,
      );
      const dayTotal = effectiveIncome + dailyAllowanceTotal;
      return {
        date,
        is_holiday: isHolidayDay,
        work_logs: dayPwls.map((pwl: any) => ({
          id: pwl.id,
          service_type: pwl.service_type,
          day_night: pwl.day_night,
          start_location: pwl.start_location,
          end_location: pwl.end_location,
          machine_type: pwl.machine_type,
          tonnage: pwl.tonnage,
          equipment_number: pwl.equipment_number,
          client_name: pwl.client_name,
          client_short_name: pwl.company_name || null,
          client_contract_no: pwl.client_contract_no,
          quantity: Number(pwl.quantity) || 1,
          ot_quantity: Number(pwl.ot_quantity) || 0,
          is_mid_shift: pwl.is_mid_shift || false,
          matched_rate: pwl.matched_rate ? Number(pwl.matched_rate) : null,
          matched_ot_rate: pwl.matched_ot_rate
            ? Number(pwl.matched_ot_rate)
            : null,
          matched_mid_shift_rate: pwl.matched_mid_shift_rate
            ? Number(pwl.matched_mid_shift_rate)
            : null,
          line_amount: Number(pwl.line_amount) || 0,
          base_line_amount:
            Number(pwl.line_amount) -
            (Number(pwl.ot_line_amount) || 0) -
            (Number(pwl.mid_shift_line_amount) || 0),
          ot_line_amount: Number(pwl.ot_line_amount) || 0,
          mid_shift_line_amount: Number(pwl.mid_shift_line_amount) || 0,
          price_match_status: pwl.price_match_status,
        })),
        work_income: workIncome,
        day_work_income: dayWorkIncome,
        night_work_income: nightWorkIncome,
        base_salary: baseSalary,
        base_salary_night: baseSalaryNight,
        needs_top_up: needsTopUp,
        top_up_amount: topUpAmount,
        auto_top_up_amount: autoTopUpAmount,
        day_top_up_amount: dayTopUpAmount,
        night_top_up_amount: nightTopUpAmount,
        is_top_up_overridden: isTopUpOverridden,
        top_up_override_id: override?.id ?? null,
        effective_income: effectiveIncome,
        daily_allowances: displayDayAllowances.map((da: any) => ({
          id: da.id,
          allowance_key: da.allowance_key,
          allowance_name: da.allowance_name,
          amount: Number(da.amount),
          remarks: da.remarks,
        })),
        fixed_allowances_per_day: fixedAllowancesPerDay,
        daily_allowance_total: dailyAllowanceTotal,
        day_total: dayTotal,
      };
    });
  }

  buildDailyCalculationFromWorkLogs(
    workLogs: any[],
    salarySetting: any | null,
    dailyAllowances: any[],
  ): any[] {
    const salaryType = salarySetting?.salary_type || 'daily';
    // For monthly salary, do NOT apply daily base guarantee / top-up
    const baseSalary =
      salaryType === 'daily'
        ? (salarySetting ? Number(salarySetting.base_salary) || 0 : 0)
        : 0;
    const configuredBaseSalaryNight =
      salaryType === 'daily' && salarySetting
        ? Number((salarySetting as any).base_salary_night) || 0
        : 0;
    const baseSalaryNight =
      configuredBaseSalaryNight > 0 ? configuredBaseSalaryNight : baseSalary;
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
    // 假日日期：daMap 中有 statutory_holiday 且 dateMap 中沒有工作記錄
    const holidayDatesSet = new Set(
      Array.from(daMap.entries())
        .filter(
          ([, das]) =>
            das.some((da: any) => da.allowance_key === 'statutory_holiday'),
        )
        .filter(([date]) => !dateMap.has(date))
        .map(([date]) => date),
    );
    // 合並工作日期和假日日期
    const allDatesSet = new Set([...dateMap.keys(), ...holidayDatesSet]);
    const sortedDates = Array.from(allDatesSet).sort();
    return sortedDates.map((date) => {
      const dayWls = dateMap.get(date) || [];
      const dayAllowances = daMap.get(date) || [];
      const isHolidayDay = holidayDatesSet.has(date);
      const dayShiftWls = dayWls.filter((wl: any) => wl.day_night !== '夜');
      const nightShiftWls = dayWls.filter((wl: any) => wl.day_night === '夜');
      const sumWorkLogIncome = (logs: any[]) =>
        logs.reduce((sum: number, wl: any) => {
          const base = Number(wl._line_amount) || 0;
          const ot = Number(wl._ot_line_amount) || 0;
          const mid = Number(wl._mid_shift_line_amount) || 0;
          return sum + base + ot + mid;
        }, 0);
      const workIncome = sumWorkLogIncome(dayWls);
      const dayWorkIncome = sumWorkLogIncome(dayShiftWls);
      const nightWorkIncome = sumWorkLogIncome(nightShiftWls);
      const autoDayTopUpAmount =
        !isHolidayDay && dayShiftWls.length > 0 && baseSalary > 0
          ? Math.max(baseSalary - dayWorkIncome, 0)
          : 0;
      const autoNightTopUpAmount =
        !isHolidayDay && nightShiftWls.length > 0 && baseSalaryNight > 0
          ? Math.max(baseSalaryNight - nightWorkIncome, 0)
          : 0;
      const autoTopUpAmount = autoDayTopUpAmount + autoNightTopUpAmount;
      const override = dayAllowances.find(
        (da: any) => da.allowance_key === 'base_top_up_override',
      );
      const isTopUpOverridden = !!override;
      // 假日天不補底薪；手動覆蓋只替代補底薪差額本身
      const topUpAmount = isTopUpOverridden
        ? Number(override.amount) || 0
        : autoTopUpAmount;
      const dayTopUpAmount = isTopUpOverridden
        ? topUpAmount
        : autoDayTopUpAmount;
      const nightTopUpAmount = isTopUpOverridden ? 0 : autoNightTopUpAmount;
      const needsTopUp = !isHolidayDay && topUpAmount > 0;
      const effectiveIncome = isHolidayDay ? 0 : workIncome + topUpAmount;
      const displayDayAllowances = dayAllowances.filter(
        (da: any) => da.allowance_key !== 'base_top_up_override',
      );
      const dailyAllowanceTotal = displayDayAllowances.reduce(
        (sum: number, da: any) => sum + (Number(da.amount) || 0),
        0,
      );
      const fixedAllowancesPerDay = this.buildDailyFixedAllowanceDisplay(
        dayWls,
        salarySetting,
      );
      const dayTotal = effectiveIncome + dailyAllowanceTotal;
      return {
        date,
        is_holiday: isHolidayDay,
        work_logs: dayWls.map((wl: any) => ({
          id: wl.id,
          service_type: wl.service_type,
          day_night: wl.day_night,
          start_location: wl.start_location,
          end_location: wl.end_location,
          machine_type: wl.machine_type,
          tonnage: wl.tonnage,
          equipment_number: wl.equipment_number,
          client_name: wl.client?.name || wl.client_name || '',
          client_short_name: wl.client?.code || null,
          client_contract_no:
            wl.quotation?.quotation_no || wl.client_contract_no || '',
          quantity: Number(wl.quantity) || 1,
          ot_quantity: Number(wl.ot_quantity) || 0,
          is_mid_shift: wl.is_mid_shift || false,
          matched_rate: wl._matched_rate ? Number(wl._matched_rate) : null,
          matched_ot_rate: wl._matched_ot_rate
            ? Number(wl._matched_ot_rate)
            : null,
          matched_mid_shift_rate: wl._matched_mid_shift_rate
            ? Number(wl._matched_mid_shift_rate)
            : null,
          line_amount:
            (Number(wl._line_amount) || 0) +
            (Number(wl._ot_line_amount) || 0) +
            (Number(wl._mid_shift_line_amount) || 0),
          base_line_amount: Number(wl._line_amount) || 0,
          ot_line_amount: Number(wl._ot_line_amount) || 0,
          mid_shift_line_amount: Number(wl._mid_shift_line_amount) || 0,
          price_match_status: wl._price_match_status || 'unmatched',
        })),
        work_income: workIncome,
        day_work_income: dayWorkIncome,
        night_work_income: nightWorkIncome,
        base_salary: baseSalary,
        base_salary_night: baseSalaryNight,
        needs_top_up: needsTopUp,
        top_up_amount: topUpAmount,
        auto_top_up_amount: autoTopUpAmount,
        day_top_up_amount: dayTopUpAmount,
        night_top_up_amount: nightTopUpAmount,
        is_top_up_overridden: isTopUpOverridden,
        top_up_override_id: override?.id ?? null,
        effective_income: effectiveIncome,
        daily_allowances: displayDayAllowances.map((da: any) => ({
          id: da.id,
          allowance_key: da.allowance_key,
          allowance_name: da.allowance_name,
          amount: Number(da.amount),
          remarks: da.remarks,
        })),
        fixed_allowances_per_day: fixedAllowancesPerDay,
        daily_allowance_total: dailyAllowanceTotal,
        day_total: dayTotal,
      };
    });
  }

  // ══════════════════════════════════════════════════════════════
  // ── 分組結算邏輯 ──────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  buildGroupedSettlement(pwls: any[]): any[] {
    const groups = new Map<string, any>();
    for (const pwl of pwls) {
      const key = this.buildGroupKeyFromPwl(pwl);
      if (groups.has(key)) {
        const g = groups.get(key)!;
        g.total_quantity += Number(pwl.quantity) || 1;
        g.total_amount += Number(pwl.line_amount) || 0;
        g.count += 1;
        g.work_log_ids.push(pwl.id);
      } else {
        groups.set(key, {
          group_key: key,
          client_name: pwl.client_name || '',
          client_id: pwl.client_id || null,
          company_id: pwl.company_id || null,
          client_contract_no: pwl.client_contract_no || '',
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
          is_manual_rate: pwl.is_manual_rate || false,
          work_log_ids: [pwl.id],
        });
      }
    }
    return Array.from(groups.values());
  }

  buildGroupedSettlementFromWorkLogs(workLogs: any[]): any[] {
    const groups = new Map<string, any>();
    for (const wl of workLogs) {
      const key = this.buildGroupKeyFromWorkLog(wl);
      if (groups.has(key)) {
        const g = groups.get(key)!;
        g.total_quantity += Number(wl.quantity) || 1;
        g.total_amount += Number(wl._line_amount) || 0;
        g.count += 1;
        g.work_log_ids.push(wl.id);
      } else {
        groups.set(key, {
          group_key: key,
          client_name: wl.client?.name || wl.client_name || '',
          client_contract_no:
            wl.quotation?.quotation_no || wl.client_contract_no || '',
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

  // ══════════════════════════════════════════════════════════════
  // ── 津貼選項 ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  buildAllowanceOptions(salarySetting: any | null): any[] {
    if (!salarySetting) return [];
    const options: any[] = [];
    const builtInAllowances: { key: string; label: string; field: string }[] = [
      { key: 'allowance_night', label: '夜班津貼', field: 'allowance_night' },
      { key: 'allowance_rent', label: '租車津貼', field: 'allowance_rent' },
      {
        key: 'allowance_3runway',
        label: '三跑津貼',
        field: 'allowance_3runway',
      },
      { key: 'allowance_well', label: '落井津貼', field: 'allowance_well' },
      {
        key: 'allowance_machine',
        label: '揸機津貼',
        field: 'allowance_machine',
      },
      { key: 'allowance_roller', label: '火轆津貼', field: 'allowance_roller' },
      {
        key: 'allowance_crane',
        label: '吊/挾車津貼',
        field: 'allowance_crane',
      },
      {
        key: 'allowance_move_machine',
        label: '搬機津貼',
        field: 'allowance_move_machine',
      },
      {
        key: 'allowance_kwh_night',
        label: '嘉華-夜間津貼',
        field: 'allowance_kwh_night',
      },
      {
        key: 'allowance_mid_shift',
        label: '中直津貼',
        field: 'allowance_mid_shift',
      },
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
    if (
      salarySetting.custom_allowances &&
      Array.isArray(salarySetting.custom_allowances)
    ) {
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
  // ── 行金額計算 ────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  calculateLineAmount(pwl: any): number {
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

  async rematchPayrollWorkLogPrice(pwl: any): Promise<any> {
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
    const { card, unmatchedReason } =
      await this.pricingService.matchFleetRateCardFromDb(
        pwl.client_id,
        pwl.company_id || null,
        pwl.client_contract_no || null,
        pwl.service_type || null,
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
      price_match_note: `匹配到：${card.client_contract_no || `FleetRC#${card.id}`} (${card.day_night || '日'})`,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 輔助方法 ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  buildGroupKeyFromWorkLog(wl: any): string {
    const parts = [
      wl.client?.name || wl.client_name || `client_${wl.client_id || ''}`,
      wl.quotation?.quotation_no ||
        wl.client_contract_no ||
        `q_${wl.quotation_id || ''}`,
      wl.service_type || '',
      wl.day_night || '日',
      wl.start_location || '',
      wl.end_location || '',
      wl.machine_type || '',
      wl.tonnage || '',
    ];
    return parts.join('|');
  }

  buildGroupKeyFromPwl(pwl: any): string {
    const parts = [
      pwl.client_name || `client_${pwl.client_id || ''}`,
      pwl.client_contract_no || `q_${pwl.quotation_id || ''}`,
      pwl.service_type || '',
      pwl.day_night || '日',
      pwl.start_location || '',
      pwl.end_location || '',
      pwl.machine_type || '',
      pwl.tonnage || '',
    ];
    return parts.join('|');
  }
}
