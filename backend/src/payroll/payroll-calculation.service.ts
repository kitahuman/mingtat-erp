import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../common/pricing.service';

type PayrollDailyAllowanceForCalculation = {
  allowance_key: string;
  date: Date | string | null | undefined;
  amount: any;
  allowance_name?: string | null;
};

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

function isAgeAtLeastOn(
  dateOfBirth: Date | string | null | undefined,
  targetDate: Date | string | null | undefined,
  ageThreshold: number,
): boolean {
  if (!dateOfBirth || !targetDate) return false;
  const dob = new Date(dateOfBirth);
  const target = new Date(targetDate);
  if (isNaN(dob.getTime()) || isNaN(target.getTime())) return false;
  let age = target.getFullYear() - dob.getFullYear();
  const monthDiff = target.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && target.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= ageThreshold;
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
    excludedBadgeKeys?: Set<string>,
    dailyAllowances: PayrollDailyAllowanceForCalculation[] = [],
    adjustmentTotalForMpf = 0,
  ) {
    const excluded = excludedBadgeKeys || new Set<string>();
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

    // 法定假日津貼：假日沒上班，給一天日薪作為津貼（獨立一行）
    // 過濾掉被排除的假日（每個假日用 excluded_statutory_holiday_YYYY-MM-DD 標記）
    const nonExcludedHolidays = validHolidays.filter((h) => {
      const dateStr = toDateStr(h.date);
      return !excluded.has(`statutory_holiday_${dateStr}`) && !excluded.has('statutory_holiday');
    });
    const effectiveHolidayCount = nonExcludedHolidays.length;
    if (salaryType === 'daily' && effectiveHolidayCount > 0 && baseSalary > 0) {
      const holidayAllowance = baseSalary * effectiveHolidayCount;
      allowanceTotal += holidayAllowance;
      items.push({
        item_type: 'allowance',
        item_name: '法定假日津貼',
        unit_price: baseSalary,
        quantity: effectiveHolidayCount,
        amount: holidayAllowance,
        remarks: nonExcludedHolidays.map((h) => h.name).join('、'),
        sort_order: sortOrder++,
      });
    }

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
    const allowanceRows = (dailyAllowances || []).filter((da) => {
      const key = da.allowance_key;
      if (!key || key === 'statutory_holiday' || key.startsWith('excluded_')) {
        return false;
      }
      const dateStr = toDateStr(da.date);
      return !excluded.has(key) && !excluded.has(`${key}_${dateStr}`);
    });

    for (const af of allowanceFields) {
      // 固定津貼 items 以 PayrollDailyAllowance 作為 source of truth。
      if (excluded.has(af.field)) continue;

      const amountsByDate = new Map<string, number>();
      for (const da of allowanceRows) {
        if (da.allowance_key !== af.field) continue;
        const dateStr = toDateStr(da.date);
        if (!dateStr || excluded.has(`${af.field}_${dateStr}`)) continue;
        if (!amountsByDate.has(dateStr)) {
          amountsByDate.set(dateStr, Number(da.amount) || 0);
        }
      }

      const days = amountsByDate.size;
      if (days === 0) continue;
      const amounts = Array.from(amountsByDate.values());
      const amount = amounts.reduce((sum, value) => sum + value, 0);
      if (amount === 0) continue;
      const rate = days > 0 ? amount / days : 0;
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
    // OT 時段：每條 workLog 獨立計算
    // 第1小時 → OT 18:00-19:00
    // 第2小時 → OT 19:00-20:00
    // 第3小時起 → OT 加班費 (標準)
    const otSlotFields = [
      'ot_1800_1900',
      'ot_1900_2000',
    ];
    const otSlotLabels: Record<string, string> = {
      ot_1800_1900: 'OT 18:00-19:00',
      ot_1900_2000: 'OT 19:00-20:00',
    };

    // 每條 workLog 獨立計算 OT，currentOtHourIndex 每條重置
    for (const wl of workLogs) {
      const otQty = Number(wl.ot_quantity) || 0;
      if (otQty <= 0) continue;

      let currentOtHourIndex = 0;
      for (let i = 0; i < otQty; i++) {
        const slotField = otSlotFields[currentOtHourIndex];
        const rate = slotField
          ? Number((salarySetting as any)[slotField]) || 0
          : Number(salarySetting.ot_rate_standard) || 0;

        const amount = rate * 1;
        otTotal += amount;

        items.push({
          item_type: 'ot',
          item_name: slotField ? otSlotLabels[slotField] : 'OT 加班費 (標準)',
          unit_price: rate,
          quantity: 1,
          amount,
          sort_order: sortOrder++,
        });

        currentOtHourIndex++;
      }
    }

    // 中直OT津貼 - 額外津貼，不佔用 OT 時數
    if (!excluded.has('salary-ot-ot_mid_shift')) {
      const midShiftOtRate = Number((salarySetting as any).ot_mid_shift) || 0;
      if (midShiftOtRate > 0) {
        const midShiftDates = new Set(
          workLogs
            .filter((wl) => wl.is_mid_shift === true)
            .map((wl) => toDateStr(wl.scheduled_date)),
        );
        const midShiftDays = midShiftDates.size;
        if (midShiftDays > 0) {
          const midShiftOtAmount = midShiftOtRate * midShiftDays;
          otTotal += midShiftOtAmount;
          items.push({
            item_type: 'ot',
            item_name: '中直OT津貼',
            unit_price: midShiftOtRate,
            quantity: midShiftDays,
            amount: midShiftOtAmount,
            sort_order: sortOrder++,
          });
        }
      }
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
    const isMpfAgeExempt = isAgeAtLeastOn(emp?.date_of_birth, dateTo, 65);
    const isMpfExempt = isMpfAgeExempt || mpfPlan === 'exempt_age65';

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

    const defaultMpfBase = grossIncome + (Number(adjustmentTotalForMpf) || 0);
    let resolvedMpfRelevantIncome = defaultMpfBase;

    if (isMpfExempt) {
      items.push({
        item_type: 'mpf_deduction',
        item_name: '強積金（過65歲, 不用供）',
        unit_price: 0,
        quantity: 0,
        amount: 0,
        remarks:
          mpfPlan === 'exempt_age65'
            ? '強積金計劃設定為過65歲免供，僱員扣款及僱主供款均為$0'
            : '計糧期完結日已滿65歲，僱員扣款及僱主供款均為$0',
        payroll_item_excluded: true,
        sort_order: sortOrder++,
      });
    } else if (mpfPlan === 'industry') {
      const mpfDateSet = new Set(workLogs.map((wl) => toDateStr(wl.scheduled_date)));
      const mpfDays = mpfDateSet.size;
      const defaultIndustryDailyIncome = mpfDays > 0 ? defaultMpfBase / mpfDays : 0;
      const industryDailyIncome =
        mpfRelevantIncome !== undefined && mpfRelevantIncome !== null
          ? Number(mpfRelevantIncome)
          : defaultIndustryDailyIncome;
      resolvedMpfRelevantIncome = industryDailyIncome;

      const tier =
        MPF_INDUSTRY_TIERS.find(
          (t) => industryDailyIncome > t.min && industryDailyIncome <= t.max,
        ) || MPF_INDUSTRY_TIERS[MPF_INDUSTRY_TIERS.length - 1];
      mpfDeduction = tier.employee * mpfDays;
      mpfEmployer = tier.employer * mpfDays;
      items.push({
        item_type: 'mpf_deduction',
        item_name: '強積金（行業計劃）',
        unit_price: tier.employee,
        quantity: mpfDays,
        amount: -mpfDeduction,
        remarks: `按日薪級別計算，${mpfDays}天，日薪基數 $${Math.round(industryDailyIncome * 100) / 100}`,
        sort_order: sortOrder++,
      });
    } else {
      const mpfBase =
        mpfRelevantIncome !== undefined && mpfRelevantIncome !== null
          ? Number(mpfRelevantIncome)
          : defaultMpfBase;
      resolvedMpfRelevantIncome = mpfBase;
      mpfDeduction = Math.min(mpfBase * 0.05, 1500);
      mpfEmployer = Math.min(mpfBase * 0.05, 1500);
      mpfDeduction = Math.round(mpfDeduction * 100) / 100;
      mpfEmployer = Math.round(mpfEmployer * 100) / 100;
      const planLabel =
        mpfPlan === 'manulife'
          ? 'Manulife'
          : mpfPlan === 'aia'
            ? 'AIA'
            : mpfPlan === 'exempt_age65'
              ? '過65歲, 不用供'
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
      mpf_relevant_income: resolvedMpfRelevantIncome,
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
   * 注意：此資料只供前端逐日 badge 顯示，不參與 payroll_items，
   * 避免把已計入糧單 item 的固定津貼再反向分攤成獨立項目。
   */
  private buildDailyFixedAllowanceDisplay(
    dayWorkLogs: any[],
    salarySetting: any | null,
    dayAllowances: any[],
  ): { key: string; name: string; amount: number }[] {
    if (!salarySetting || dayWorkLogs.length === 0) return [];

    const displayAllowances = [
      { key: 'allowance_rent', name: '租車津貼' },
      { key: 'allowance_3runway', name: '三跑津貼' },
    ];

    return displayAllowances
      .filter((item) => {
        // 若 DB 已有同日同 key 的 daily allowance，DB 記錄就是 source of truth，避免前端重複計算。
        const existsInDailyAllowances = dayAllowances.some(
          (da) => da.allowance_key === item.key,
        );
        if (existsInDailyAllowances) return false;

        // 檢查是否有排除記錄
        const isExcluded = dayAllowances.some(
          (da) =>
            da.allowance_key === `excluded_${item.key}` ||
            da.allowance_key.startsWith(`excluded_${item.key}_`),
        );
        if (isExcluded) return false;

        return item.key === 'allowance_rent'
          ? dayWorkLogs.some((wl) => wl.unit === '天')
          : true;
      })
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
    options: {
      dateFrom?: string;
      dateTo?: string;
      holidayDates?: { date: Date; name: string }[];
      leaves?: any[];
    } = {},
  ): any[] {
    const salaryType = salarySetting?.salary_type || 'daily';
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
    const salaryOtSlots = [
      'ot_1800_1900',
      'ot_1900_2000',
    ];

    // 追蹤累積的 OT 小時數，以便按順序應用時段金額
    let accumulatedOtHours = 0;

    const getSalaryOtAmount = (pwl: any): number => {
      const otQty = Number(pwl.ot_quantity) || 0;
      if (otQty <= 0) return 0;

      let totalAmount = 0;
      for (let i = 0; i < otQty; i++) {
        const slotIndex = accumulatedOtHours + i;
        const slotField = salaryOtSlots[slotIndex];
        const rate = slotField
          ? Number(salarySetting?.[slotField]) || 0
          : Number(salarySetting?.ot_rate_standard) || 0;
        totalAmount += rate;
      }
      accumulatedOtHours += otQty;
      return totalAmount;
    };
    const getSalaryMidShiftAmount = (pwl: any): number =>
      pwl.is_mid_shift === true
        ? Number(salarySetting?.ot_mid_shift) || 0
        : 0;

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

    const leaveMap = new Map<string, any>();
    if (options.leaves) {
      for (const leave of options.leaves) {
        const start = new Date(leave.date_from);
        const end = new Date(leave.date_to);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          leaveMap.set(toDateStr(d), leave);
        }
      }
    }

    const holidayMap = new Map<string, string>();
    if (options.holidayDates) {
      for (const h of options.holidayDates) {
        holidayMap.set(toDateStr(h.date), h.name);
      }
    }

    const allDates = new Set([...dateMap.keys(), ...daMap.keys()]);
    if (options.dateFrom && options.dateTo) {
      const start = new Date(options.dateFrom);
      const end = new Date(options.dateTo);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        allDates.add(toDateStr(d));
      }
    }

    const sortedDates = Array.from(allDates).sort();
    return sortedDates.map((date) => {
      const dayPwls = dateMap.get(date) || [];
      const dayAllowances = daMap.get(date) || [];
      const isSunday = new Date(date).getDay() === 0;
      const leave = leaveMap.get(date);
      const holidayName = holidayMap.get(date);

      let specialLabel = '';
      if (holidayName) {
        specialLabel = holidayName;
      } else if (isSunday) {
        if (leave) {
          const typeLabel = leave.leave_type === 'sick' ? '病假' : leave.leave_type === 'annual' ? '年假' : leave.leave_type;
          specialLabel = `${typeLabel}${leave.reason ? ` (${leave.reason})` : ''}`;
        } else {
          specialLabel = '休息日（星期日）';
        }
      }

      const isHolidayDay =
        dayPwls.length === 0 &&
        (!!holidayName ||
          dayAllowances.some((da: any) => da.allowance_key === 'statutory_holiday'));

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
        dayAllowances,
      );
      const dailyOtAmount = dayPwls.reduce(
        (sum: number, pwl: any) => sum + getSalaryOtAmount(pwl),
        0,
      );
      const dailyMidShiftAmount = dayPwls.some(
        (pwl: any) => pwl.is_mid_shift === true,
      )
        ? Number(salarySetting?.ot_mid_shift) || 0
        : 0;
      const fixedAllowanceTotal = fixedAllowancesPerDay.reduce(
        (sum, item) => sum + item.amount,
        0,
      );
      const dayTotal = effectiveIncome + dailyAllowanceTotal + fixedAllowanceTotal;
      return {
        date,
        is_holiday: isHolidayDay,
        special_label: specialLabel,
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
          product_quantity: this.getProductQuantity(pwl),
          product_unit: pwl.payroll_work_log_product_unit || null,
          billing_quantity_type: this.normalizeBillingQuantityType(
            pwl.billing_quantity_type,
          ),
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
          salary_ot_amount: getSalaryOtAmount(pwl),
          salary_mid_shift_amount: getSalaryMidShiftAmount(pwl),
          price_match_status: pwl.price_match_status,
        })),
        work_income: workIncome,
        day_work_income: dayWorkIncome,
        night_work_income: nightWorkIncome,
        base_salary: baseSalary,
        base_salary_night: baseSalaryNight,
        needs_top_up: needsTopUp,
        top_up_amount: topUpAmount,
        base_top_up: topUpAmount,
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
        daily_ot_amount: dailyOtAmount,
        daily_mid_shift_amount: dailyMidShiftAmount,
        day_total: dayTotal,
      };
    });
  }

  buildDailyCalculationFromWorkLogs(
    workLogs: any[],
    salarySetting: any | null,
    dailyAllowances: any[],
    options: {
      dateFrom?: string;
      dateTo?: string;
      holidayDates?: { date: Date; name: string }[];
      leaves?: any[];
    } = {},
  ): any[] {
    return this.buildDailyCalculation(
      workLogs.map((wl) => ({
        ...wl,
        line_amount:
          (Number(wl._line_amount) || 0) +
          (Number(wl._ot_line_amount) || 0) +
          (Number(wl._mid_shift_line_amount) || 0),
        ot_line_amount: Number(wl._ot_line_amount) || 0,
        mid_shift_line_amount: Number(wl._mid_shift_line_amount) || 0,
        matched_rate: wl._matched_rate,
        matched_ot_rate: wl._matched_ot_rate,
        matched_mid_shift_rate: wl._matched_mid_shift_rate,
        price_match_status: wl._price_match_status,
      })),
      salarySetting,
      dailyAllowances,
      options,
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ── 分組結算邏輯 ──────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  buildGroupedSettlement(pwls: any[]): any[] {
    const groups = new Map<string, any>();
    for (const pwl of pwls) {
      const key = this.buildGroupKeyFromPwl(pwl);
      const billingType = this.normalizeBillingQuantityType(pwl.billing_quantity_type);
      const quantity = Number(pwl.quantity) || 1;
      const productQuantity = this.getProductQuantity(pwl);
      const workDate = this.toDateKey(pwl.scheduled_date);
      if (groups.has(key)) {
        const g = groups.get(key)!;
        g.total_quantity += quantity;
        g.product_quantity += productQuantity;
        g.ot_quantity += Number(pwl.ot_quantity) || 0;
        g.ot_amount += Number(pwl.ot_line_amount) || 0;
        g.mid_shift_amount += Number(pwl.mid_shift_line_amount) || 0;
        g.mid_shift_count += pwl.is_mid_shift ? 1 : 0;
        if (workDate) g.work_dates.add(workDate);
        g.count += 1;
        g.work_log_ids.push(pwl.id);
      } else {
        groups.set(key, {
          group_key: key,
          client_name: pwl.client_name || '',
          client_id: pwl.client_id || null,
          company_id: pwl.company_id || null,
          company_name: pwl.company_name || null,
          company_profile_id: pwl.company_profile_id || null,
          company_profile_name: pwl.company_profile_name || null,
          quotation_id: pwl.quotation_id || null,
          client_contract_no: pwl.client_contract_no || '',
          service_type: pwl.service_type || '',
          day_night: pwl.day_night || '日',
          start_location: pwl.start_location || '',
          end_location: pwl.end_location || '',
          machine_type: pwl.machine_type || '',
          tonnage: pwl.tonnage || '',
          matched_rate: pwl.matched_rate ? Number(pwl.matched_rate) : null,
          matched_ot_rate: pwl.matched_ot_rate ? Number(pwl.matched_ot_rate) : null,
          matched_mid_shift_rate: pwl.matched_mid_shift_rate ? Number(pwl.matched_mid_shift_rate) : null,
          matched_unit: pwl.matched_unit || null,
          unit: pwl.unit || pwl.matched_unit || '天',
          product_unit: pwl.payroll_work_log_product_unit || '',
          total_quantity: quantity,
          product_quantity: productQuantity,
          work_dates: new Set(workDate ? [workDate] : []),
          billing_quantity_type: billingType,
          billing_quantity: quantity,
          ot_quantity: Number(pwl.ot_quantity) || 0,
          ot_amount: Number(pwl.ot_line_amount) || 0,
          mid_shift_amount: Number(pwl.mid_shift_line_amount) || 0,
          mid_shift_count: pwl.is_mid_shift ? 1 : 0,
          total_amount: 0,
          count: 1,
          price_match_status: pwl.price_match_status || 'unmatched',
          is_manual_rate: pwl.is_manual_rate || false,
          work_log_ids: [pwl.id],
        });
      }
    }
    return Array.from(groups.values()).map((g) => {
      const billingQuantity = this.resolveBillingQuantity(g.billing_quantity_type, g);
      const rate = Number(g.matched_rate) || 0;
      const baseAmount = rate > 0 ? billingQuantity * rate : 0;
      const otAmount = Number(g.ot_amount) || 0;
      const midShiftAmount = Number(g.mid_shift_amount) || 0;
      return {
        ...g,
        work_dates: Array.from(g.work_dates || []),
        billing_quantity: billingQuantity,
        ot_amount: otAmount,
        mid_shift_amount: midShiftAmount,
        mid_shift_count: Number(g.mid_shift_count) || 0,
        total_amount: baseAmount + otAmount + midShiftAmount,
      };
    });
  }

  buildGroupedSettlementFromWorkLogs(workLogs: any[]): any[] {
    const groups = new Map<string, any>();
    for (const wl of workLogs) {
      const key = this.buildGroupKeyFromWorkLog(wl);
      const billingType = this.normalizeBillingQuantityType(wl.billing_quantity_type);
      const quantity = Number(wl.quantity) || 1;
      const productQuantity = this.getProductQuantity(wl);
      const workDate = this.toDateKey(wl.scheduled_date);
      if (groups.has(key)) {
        const g = groups.get(key)!;
        g.total_quantity += quantity;
        g.product_quantity += productQuantity;
        g.ot_quantity += Number(wl.ot_quantity) || 0;
        g.ot_amount += Number(wl._ot_line_amount) || 0;
        g.mid_shift_amount += Number(wl._mid_shift_line_amount) || 0;
        g.mid_shift_count += wl.is_mid_shift ? 1 : 0;
        if (workDate) g.work_dates.add(workDate);
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
          matched_ot_rate: wl._matched_ot_rate ? Number(wl._matched_ot_rate) : null,
          matched_mid_shift_rate: wl._matched_mid_shift_rate ? Number(wl._matched_mid_shift_rate) : null,
          matched_unit: wl._matched_unit || null,
          unit: wl.unit || wl._matched_unit || '天',
          product_unit: wl.payroll_work_log_product_unit || '',
          total_quantity: quantity,
          product_quantity: productQuantity,
          work_dates: new Set(workDate ? [workDate] : []),
          billing_quantity_type: billingType,
          billing_quantity: quantity,
          ot_quantity: Number(wl.ot_quantity) || 0,
          ot_amount: Number(wl._ot_line_amount) || 0,
          mid_shift_amount: Number(wl._mid_shift_line_amount) || 0,
          mid_shift_count: wl.is_mid_shift ? 1 : 0,
          total_amount: 0,
          count: 1,
          price_match_status: wl._price_match_status || 'unmatched',
          work_log_ids: [wl.id],
        });
      }
    }
    return Array.from(groups.values()).map((g) => {
      const billingQuantity = this.resolveBillingQuantity(g.billing_quantity_type, g);
      const rate = Number(g.matched_rate) || 0;
      const baseAmount = rate > 0 ? billingQuantity * rate : 0;
      const otAmount = Number(g.ot_amount) || 0;
      const midShiftAmount = Number(g.mid_shift_amount) || 0;
      return {
        ...g,
        work_dates: Array.from(g.work_dates || []),
        billing_quantity: billingQuantity,
        ot_amount: otAmount,
        mid_shift_amount: midShiftAmount,
        mid_shift_count: Number(g.mid_shift_count) || 0,
        total_amount: baseAmount + otAmount + midShiftAmount,
      };
    });
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
    if (pwl.price_match_status !== 'matched' && pwl.price_match_status !== 'manual') return 0;
    const rate = Number(pwl.matched_rate) || 0;
    const qty = this.getBillingQuantityForRecord(pwl);
    const otRate = Number(pwl.matched_ot_rate) || 0;
    const otQty = Number(pwl.ot_quantity) || 0;
    const midShiftRate = Number(pwl.matched_mid_shift_rate) || 0;
    const isMidShift = pwl.is_mid_shift === true;
    const baseAmount = rate * qty;
    const otAmount = otRate * otQty;
    const midShiftAmount = isMidShift ? midShiftRate * 1 : 0;
    return baseAmount + otAmount + midShiftAmount;
  }

  private normalizeBillingQuantityType(value: any): 'days' | 'quantity' | 'product_quantity' {
    return value === 'days' || value === 'product_quantity' ? value : 'quantity';
  }

  private getProductQuantity(record: any): number {
    return Number(
      record.payroll_work_log_product_quantity ??
        record.work_log_product_quantity ??
        record.goods_quantity ??
        record.product_quantity ??
        0,
    ) || 0;
  }

  private toDateKey(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }

  private resolveBillingQuantity(type: any, group: any): number {
    const normalized = this.normalizeBillingQuantityType(type);
    if (normalized === 'days') return Number(group.work_dates?.size ?? group.work_dates?.length ?? group.count ?? 0) || 0;
    if (normalized === 'product_quantity') return Number(group.product_quantity) || 0;
    return Number(group.total_quantity) || 0;
  }

  private getBillingQuantityForRecord(record: any): number {
    const type = this.normalizeBillingQuantityType(record.billing_quantity_type);
    if (type === 'product_quantity') return this.getProductQuantity(record);
    return Number(record.quantity) || 1;
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
