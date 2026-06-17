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

    // ── 先呼叫 buildDailyCalculation 取得逐日計算結果（single source of truth）──
    // 判斷 workLogs 是否已有 line_amount（generate/recalculate 流程）或需要從 _line_amount 映射（preview 流程）
    const hasDirectLineAmount = workLogs.length > 0 && workLogs[0].line_amount !== undefined && workLogs[0]._line_amount === undefined;
    const dailyCalcWorkLogs = hasDirectLineAmount
      ? workLogs
      : workLogs.map((wl) => ({
          ...wl,
          line_amount:
            (Number(wl._line_amount) || 0) +
            (Number(wl._ot_line_amount) || 0) +
            (Number(wl._mid_shift_line_amount) || 0),
          ot_line_amount: Number(wl._ot_line_amount) || 0,
          mid_shift_line_amount: Number(wl._mid_shift_line_amount) || 0,
          matched_rate: wl._matched_rate ?? wl.matched_rate,
          matched_ot_rate: wl._matched_ot_rate ?? wl.matched_ot_rate,
          matched_mid_shift_rate: wl._matched_mid_shift_rate ?? wl.matched_mid_shift_rate,
          price_match_status: wl._price_match_status ?? wl.price_match_status,
        }));

    const dailyCalc = this.buildDailyCalculation(
      dailyCalcWorkLogs,
      salarySetting,
      dailyAllowances,
      {
        dateFrom,
        dateTo,
        holidayDates,
      },
    );

    // ── (1) 從逐日結果匯總工作收入、補底薪、OT、津貼 ──
    let baseWorkIncome = 0;
    let topUpTotal = 0;
    let otTotal = 0;
    let midShiftTotal = 0;
    let allowanceTotal = 0;
    const fixedAllowancesByType = new Map<string, { count: number; amount: number; name: string }>();
    let holidayAllowanceTotal = 0;
    let holidayCount = 0;
    let workDays = 0;
    let workNights = 0;
    // 每日津貼按 key 分組
    const dailyAllowancesByKey = new Map<string, { count: number; amount: number; name: string }>();

    for (const day of dailyCalc) {
      // 工作收入 = 每天的 work_income - daily_ot_amount - daily_mid_shift_amount
      // work_income 已包含 OT 和中直，需要減去才是純工作收入
      const dayWorkIncome = (day.work_income || 0) - (day.daily_ot_amount || 0) - (day.daily_mid_shift_amount || 0);
      baseWorkIncome += dayWorkIncome;

      // 補底薪
      topUpTotal += day.top_up_amount || 0;

      // OT 和中直
      otTotal += day.daily_ot_amount || 0;
      midShiftTotal += day.daily_mid_shift_amount || 0;

      // 工作天數（按 quantity 比例計算）
      if (day.work_logs && day.work_logs.length > 0) {
        const dayShiftWls = day.work_logs.filter((wl: any) => wl.day_night !== '夜');
        const nightShiftWls = day.work_logs.filter((wl: any) => wl.day_night === '夜');
        if (dayShiftWls.length > 0) {
          workDays += Math.min(dayShiftWls.reduce((sum: number, wl: any) => sum + (Number(wl.quantity) || 1), 0), 1);
        }
        if (nightShiftWls.length > 0) {
          workNights += Math.min(nightShiftWls.reduce((sum: number, wl: any) => sum + (Number(wl.quantity) || 1), 0), 1);
        }
      }

      // 法定假日津貼（假日沒上班時）
      if (day.is_holiday && (!day.work_logs || day.work_logs.length === 0)) {
        // 檢查是否被排除
        const dateStr = toDateStr(day.date);
        if (!excluded.has(`statutory_holiday_${dateStr}`) && !excluded.has('statutory_holiday')) {
          holidayAllowanceTotal += baseSalary;
          holidayCount += 1;
        }
      }

      // 固定津貼（夜班津貼、租車津貼等）
      for (const fixedAllowance of day.fixed_allowances_per_day || []) {
        const key = fixedAllowance.key;
        if (excluded.has(key)) continue;
        const dateStr = toDateStr(day.date);
        if (excluded.has(`${key}_${dateStr}`)) continue;
        if (!fixedAllowancesByType.has(key)) {
          fixedAllowancesByType.set(key, { count: 0, amount: 0, name: fixedAllowance.name });
        }
        const current = fixedAllowancesByType.get(key)!;
        current.count += 1;
        current.amount += fixedAllowance.amount;
      }

      // 每日津貼（用戶手動加的，排除 OT 類型和 excluded 類型）
      for (const da of day.daily_allowances || []) {
        const key = da.allowance_key;
        if (!key || key === 'statutory_holiday' || key.startsWith('excluded_') || key === 'ot_0600_0700' || key === 'ot_0700_0800' || key === 'base_top_up_override') continue;
        const dateStr = toDateStr(day.date);
        if (excluded.has(key) || excluded.has(`${key}_${dateStr}`)) continue;
        if (!dailyAllowancesByKey.has(key)) {
          dailyAllowancesByKey.set(key, { count: 0, amount: 0, name: da.allowance_name || key });
        }
        const current = dailyAllowancesByKey.get(key)!;
        current.count += 1;
        current.amount += Number(da.amount) || 0;
      }
    }

    const baseAmount = baseWorkIncome + topUpTotal;

    // ── (2) 計算明細項目 ──

    // 工作收入
    if (baseWorkIncome > 0) {
      items.push({
        item_type: 'base_salary',
        item_name: '工作收入',
        unit_price: 0,
        quantity: workDays + workNights,
        amount: baseWorkIncome,
        sort_order: sortOrder++,
      });
    }

    // 補底薪
    if (topUpTotal > 0) {
      // 計算需補底薪的實際天數（按 quantity 比例）
      const topUpDayCount = dailyCalc.reduce((sum: number, day: any) => {
        if ((day.top_up_amount || 0) <= 0) return sum;
        const dayQ = day.day_quantity != null ? Number(day.day_quantity) : (day.work_logs || []).filter((wl: any) => wl.day_night !== '夜').length > 0 ? 1 : 0;
        const nightQ = day.night_quantity != null ? Number(day.night_quantity) : (day.work_logs || []).filter((wl: any) => wl.day_night === '夜').length > 0 ? 1 : 0;
        return sum + Math.min(dayQ + nightQ, 1);
      }, 0);
      
      // 判斷單價是否整除：如果 topUpTotal / topUpDayCount = baseSalary，顯示單價
      const effectiveUnitPrice = topUpDayCount > 0 && Math.abs(topUpTotal / topUpDayCount - baseSalary) < 0.01
        ? baseSalary
        : 0;
      
      items.push({
        item_type: 'base_salary',
        item_name: '底薪',
        unit_price: effectiveUnitPrice,
        quantity: topUpDayCount,
        amount: topUpTotal,
        sort_order: sortOrder++,
      });
    }

    // 法定假日津貼
    if (salaryType === 'daily' && holidayCount > 0 && baseSalary > 0) {
      const holidayNames = (holidayDates || [])
        .filter((h) => {
          const dateStr = toDateStr(h.date);
          return !excluded.has(`statutory_holiday_${dateStr}`) && !excluded.has('statutory_holiday');
        })
        .filter((h) => {
          // 只列出沒上班的假日
          const dateStr = toDateStr(h.date);
          const dayEntry = dailyCalc.find((d: any) => toDateStr(d.date) === dateStr);
          return dayEntry && (!dayEntry.work_logs || dayEntry.work_logs.length === 0);
        })
        .map((h) => h.name);
      allowanceTotal += holidayAllowanceTotal;
      items.push({
        item_type: 'allowance',
        item_name: '法定假日津貼',
        unit_price: baseSalary,
        quantity: holidayCount,
        amount: holidayAllowanceTotal,
        remarks: holidayNames.join('、'),
        sort_order: sortOrder++,
      });
    }

    // 固定津貼（夜班津貼、租車津貼等）
    const fixedAllowanceOrder = [
      'allowance_night', 'allowance_rent', 'allowance_3runway',
      'allowance_well', 'allowance_machine', 'allowance_roller',
      'allowance_crane', 'allowance_move_machine', 'allowance_kwh_night',
      'allowance_mid_shift',
    ];
    for (const key of fixedAllowanceOrder) {
      const fixedData = fixedAllowancesByType.get(key);
      if (fixedData && fixedData.amount > 0) {
        // 取得原始單價
        let unitPrice = 0;
        if (key.startsWith('custom:')) {
          const customName = key.replace('custom:', '');
          const customAllowance = (salarySetting.custom_allowances as any[] || []).find((ca: any) => ca.name === customName);
          unitPrice = customAllowance ? Number(customAllowance.amount) : 0;
        } else {
          unitPrice = Number((salarySetting as any)[key]) || 0;
        }
        // quantity 用 amount / unitPrice 計算（反映 0.5 天比例）
        const quantity = unitPrice > 0 ? fixedData.amount / unitPrice : fixedData.count;
        allowanceTotal += fixedData.amount;
        items.push({
          item_type: 'allowance',
          item_name: fixedData.name,
          unit_price: unitPrice,
          quantity: quantity,
          amount: fixedData.amount,
          sort_order: sortOrder++,
        });
      }
    }
    // 其他固定津貼（不在 fixedAllowanceOrder 中的）
    for (const [key, fixedData] of fixedAllowancesByType) {
      if (fixedAllowanceOrder.includes(key)) continue;
      if (fixedData.amount > 0) {
        // 取得原始單價
        let unitPrice = 0;
        if (key.startsWith('custom:')) {
          const customName = key.replace('custom:', '');
          const customAllowance = (salarySetting.custom_allowances as any[] || []).find((ca: any) => ca.name === customName);
          unitPrice = customAllowance ? Number(customAllowance.amount) : 0;
        } else {
          unitPrice = Number((salarySetting as any)[key]) || 0;
        }
        // quantity 用 amount / unitPrice 計算（反映 0.5 天比例）
        const quantity = unitPrice > 0 ? fixedData.amount / unitPrice : fixedData.count;
        allowanceTotal += fixedData.amount;
        items.push({
          item_type: 'allowance',
          item_name: fixedData.name,
          unit_price: unitPrice,
          quantity: quantity,
          amount: fixedData.amount,
          sort_order: sortOrder++,
        });
      }
    }

    // 每日津貼（用戶手動加的）
    for (const [, daData] of dailyAllowancesByKey) {
      if (daData.amount > 0) {
        const rate = daData.count > 0 ? daData.amount / daData.count : 0;
        allowanceTotal += daData.amount;
        items.push({
          item_type: 'allowance',
          item_name: daData.name,
          unit_price: rate,
          quantity: daData.count,
          amount: daData.amount,
          sort_order: sortOrder++,
        });
      }
    }

    // Custom allowances from salary setting
    // 注：自定義津貼已經透過 buildDailyCalculation 的 buildDailyFixedAllowanceDisplay 加入 fixed_allowances_per_day，
    // 並透過上面的固定津貼匹總邏輯已經計算載入 allowanceTotal 和 items，故此處不需載入。

    // ── (3) OT 計算（保留時段分配邏輯用於分時段顯示）──
    // OT 時段：每條 workLog 獨立計算
    const otSlotFields = ['ot_1800_1900', 'ot_1900_2000'];
    const otSlotLabels: Record<string, string> = {
      ot_1800_1900: 'OT 18:00-19:00',
      ot_1900_2000: 'OT 19:00-20:00',
    };

    // 按時段分組匯總（而不是每小時一行）
    const otBySlot = new Map<string, { rate: number; count: number; amount: number }>();

    for (const wl of dailyCalcWorkLogs) {
      const otQty = Number(wl.ot_quantity) || 0;
      if (otQty <= 0) continue;

      let currentOtHourIndex = 0;
      for (let i = 0; i < otQty; i++) {
        const slotField = otSlotFields[currentOtHourIndex];
        const rate = slotField
          ? Number((salarySetting as any)[slotField]) || 0
          : Number(salarySetting.ot_rate_standard) || 0;
        const slotKey = slotField || 'ot_rate_standard';

        if (!otBySlot.has(slotKey)) {
          otBySlot.set(slotKey, { rate, count: 0, amount: 0 });
        }
        const slot = otBySlot.get(slotKey)!;
        slot.count += 1;
        slot.amount += rate;

        currentOtHourIndex++;
      }
    }

    // 中直OT津貼 - 額外津貼，不佔用 OT 時數
    if (!excluded.has('salary-ot-ot_mid_shift')) {
      const midShiftOtRate = Number((salarySetting as any).ot_mid_shift) || 0;
      if (midShiftOtRate > 0) {
        const midShiftDates = new Set(
          dailyCalcWorkLogs
            .filter((wl) => wl.is_mid_shift === true)
            .map((wl) => toDateStr(wl.scheduled_date)),
        );
        const midShiftDays = midShiftDates.size;
        if (midShiftDays > 0) {
          otBySlot.set('ot_mid_shift', { rate: midShiftOtRate, count: midShiftDays, amount: midShiftOtRate * midShiftDays });
        }
      }
    }

    // 手動 OT 津貼（早上 OT）- 從 dailyAllowances 中提取
    const manualOtKeys = ['ot_0600_0700', 'ot_0700_0800'];
    for (const otKey of manualOtKeys) {
      const manualOtAllowances = (dailyAllowances || []).filter(
        (da) => da.allowance_key === otKey,
      );
      if (manualOtAllowances.length === 0) continue;

      const otRate = Number((salarySetting as any)[otKey]) || 0;
      if (otRate <= 0) continue;

      otBySlot.set(otKey, { rate: otRate, count: manualOtAllowances.length, amount: otRate * manualOtAllowances.length });
    }

    // OT 項目呈現（按時段分組顯示）
    const otSlotOrder = ['ot_1800_1900', 'ot_1900_2000', 'ot_rate_standard', 'ot_mid_shift', 'ot_0600_0700', 'ot_0700_0800'];
    const otSlotDisplayLabels: Record<string, string> = {
      ot_1800_1900: 'OT 18:00-19:00',
      ot_1900_2000: 'OT 19:00-20:00',
      ot_rate_standard: 'OT 加班費 (標準)',
      ot_mid_shift: '中直OT津貼',
      ot_0600_0700: 'OT 06:00-07:00',
      ot_0700_0800: 'OT 07:00-08:00',
    };
    // 使用逐日結果的 otTotal（已在上面匯總），不重新計算
    // 但 OT 明細仍然按時段分配顯示
    let otItemsTotal = 0;
    for (const slotKey of otSlotOrder) {
      const slotData = otBySlot.get(slotKey);
      if (!slotData || slotData.amount <= 0) continue;
      otItemsTotal += slotData.amount;
      items.push({
        item_type: 'ot',
        item_name: otSlotDisplayLabels[slotKey] || slotKey,
        unit_price: slotData.rate,
        quantity: slotData.count,
        amount: slotData.amount,
        sort_order: sortOrder++,
      });
    }
    // 如果逐日 OT 合計跟時段分配不一致，用逐日結果為準
    // （理論上應該一致，但以逐日結果為 source of truth）
    otTotal = otItemsTotal;

    // ── (4) 分傭計算 ──
    let commissionTotal = 0;
    if (salarySetting.is_piece_rate && salarySetting.fleet_rate_card_id) {
      const fleetRateCard = await this.prisma.fleetRateCard.findUnique({
        where: { id: salarySetting.fleet_rate_card_id },
      });
      if (fleetRateCard) {
        for (const wl of dailyCalcWorkLogs) {
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
            quantity: dailyCalcWorkLogs.length,
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

    const result: { key: string; name: string; amount: number }[] = displayAllowances
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

    // 自定義津貼
    if (salarySetting.custom_allowances && Array.isArray(salarySetting.custom_allowances)) {
      for (const ca of salarySetting.custom_allowances as any[]) {
        if (!ca.amount || Number(ca.amount) === 0) continue;
        const triggerType = ca.trigger_type || 'every_work_day';

        // manual 類型不自動給
        if (triggerType === 'manual') continue;

        // 日班條件
        if (triggerType === 'day_shift_only') {
          const hasDayShift = dayWorkLogs.some((wl) => wl.day_night !== '夜');
          if (!hasDayShift) continue;
        }

        // 夜班條件
        if (triggerType === 'night_shift_only') {
          const hasNightShift = dayWorkLogs.some((wl) => wl.day_night === '夜');
          if (!hasNightShift) continue;
        }

        // 特定客戶條件
        if (triggerType === 'specific_client') {
          const clientId = ca.trigger_params?.client_id;
          if (clientId) {
            const hasClient = dayWorkLogs.some((wl) => wl.client_id === clientId || wl.customer_id === clientId);
            if (!hasClient) continue;
          }
        }

        // 特定星期幾條件
        if (triggerType === 'specific_weekday') {
          const weekdays: number[] = ca.trigger_params?.weekdays || [];
          if (weekdays.length > 0) {
            const firstLog = dayWorkLogs[0];
            if (firstLog) {
              const date = new Date(firstLog.scheduled_date);
              const dayOfWeek = date.getDay(); // 0=日 1=一 ... 6=六
              if (!weekdays.includes(dayOfWeek)) continue;
            }
          }
        }

        const key = `custom:${ca.name}`;

        // 若 DB 已有同日同 key 的 daily allowance，跳過（避免重複）
        const existsInDailyAllowances = dayAllowances.some(
          (da) => da.allowance_key === key,
        );
        if (existsInDailyAllowances) continue;

        // 檢查是否有排除記錄
        const isExcluded = dayAllowances.some(
          (da) => da.allowance_key === `excluded_${key}` || da.allowance_key.startsWith(`excluded_${key}_`),
        );
        if (isExcluded) continue;

        // 按當天工作量比例計算金額
        const dayQuantity = Math.min(
          dayWorkLogs.reduce((sum, wl) => sum + (Number(wl.quantity) || 1), 0),
          1
        );

        result.push({
          key,
          name: ca.name || '自定義津貼',
          amount: Number(ca.amount) * dayQuantity,
        });
      }
    }


    return result;
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

    // 每筆 workLog 獨立計算 OT 時段（每天 OT 從 slot 0 開始，與 buildSalaryItems 邏輯一致）
    const getSalaryOtAmount = (pwl: any): number => {
      const otQty = Number(pwl.ot_quantity) || 0;
      if (otQty <= 0) return 0;

      let totalAmount = 0;
      for (let i = 0; i < otQty; i++) {
        const slotField = salaryOtSlots[i];
        const rate = slotField
          ? Number(salarySetting?.[slotField]) || 0
          : Number(salarySetting?.ot_rate_standard) || 0;
        totalAmount += rate;
      }
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
      // 計算日班和夜班的工作天數（按 quantity 比例）
      const dayQuantity = Math.min(
        dayShiftPwls.reduce((sum: number, pwl: any) => sum + (Number(pwl.quantity) || 1), 0),
        1,
      );
      const nightQuantity = Math.min(
        nightShiftPwls.reduce((sum: number, pwl: any) => sum + (Number(pwl.quantity) || 1), 0),
        1,
      );
      const autoDayTopUpAmount =
        !isHolidayDay && dayShiftPwls.length > 0 && baseSalary > 0
          ? Math.max(baseSalary * dayQuantity - dayWorkIncome, 0)
          : 0;
      const autoNightTopUpAmount =
        !isHolidayDay && nightShiftPwls.length > 0 && baseSalaryNight > 0
          ? Math.max(baseSalaryNight * nightQuantity - nightWorkIncome, 0)
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
      const dayTotal = effectiveIncome + dailyOtAmount + dailyMidShiftAmount + dailyAllowanceTotal + fixedAllowanceTotal;
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
        day_quantity: dayQuantity,
        night_quantity: nightQuantity,
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
        daily_allowance_total: dailyAllowanceTotal + fixedAllowanceTotal,
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
      const baseLineAmount = (Number(pwl.line_amount) || 0) - (Number(pwl.ot_line_amount) || 0) - (Number(pwl.mid_shift_line_amount) || 0);
      if (groups.has(key)) {
        const g = groups.get(key)!;
        g.total_quantity += quantity;
        g.product_quantity += productQuantity;
        g.ot_quantity += Number(pwl.ot_quantity) || 0;
        g.ot_amount += Number(pwl.ot_line_amount) || 0;
        g.mid_shift_amount += Number(pwl.mid_shift_line_amount) || 0;
        g.mid_shift_count += pwl.is_mid_shift ? 1 : 0;
        g.base_line_amount_sum += baseLineAmount;
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
          base_line_amount_sum: baseLineAmount,
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
      const theoreticalBase = rate > 0 ? billingQuantity * rate : 0;
      const actualBase = g.base_line_amount_sum || 0;
      const otAmount = Number(g.ot_amount) || 0;
      const midShiftAmount = Number(g.mid_shift_amount) || 0;
      const theoreticalAmount = Math.round((theoreticalBase + otAmount + midShiftAmount) * 100) / 100;
      const actualAmount = Math.round((actualBase + otAmount + midShiftAmount) * 100) / 100;
      const hasDifference = Math.abs(theoreticalAmount - actualAmount) >= 0.01;
      return {
        ...g,
        work_dates: Array.from(g.work_dates || []),
        billing_quantity: billingQuantity,
        ot_amount: otAmount,
        mid_shift_amount: midShiftAmount,
        mid_shift_count: Number(g.mid_shift_count) || 0,
        grouped_amount_theoretical: theoreticalAmount,
        grouped_amount_actual: actualAmount,
        has_rounding_difference: hasDifference,
        total_amount: hasDifference ? actualAmount : theoreticalAmount,
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
      const baseLineAmount = (Number(wl._line_amount) || 0);
      if (groups.has(key)) {
        const g = groups.get(key)!;
        g.total_quantity += quantity;
        g.product_quantity += productQuantity;
        g.ot_quantity += Number(wl.ot_quantity) || 0;
        g.ot_amount += Number(wl._ot_line_amount) || 0;
        g.mid_shift_amount += Number(wl._mid_shift_line_amount) || 0;
        g.mid_shift_count += wl.is_mid_shift ? 1 : 0;
        g.base_line_amount_sum += baseLineAmount;
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
          base_line_amount_sum: baseLineAmount,
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
      const theoreticalBase = rate > 0 ? billingQuantity * rate : 0;
      const actualBase = g.base_line_amount_sum || 0;
      const otAmount = Number(g.ot_amount) || 0;
      const midShiftAmount = Number(g.mid_shift_amount) || 0;
      const theoreticalAmount = Math.round((theoreticalBase + otAmount + midShiftAmount) * 100) / 100;
      const actualAmount = Math.round((actualBase + otAmount + midShiftAmount) * 100) / 100;
      const hasDifference = Math.abs(theoreticalAmount - actualAmount) >= 0.01;
      return {
        ...g,
        work_dates: Array.from(g.work_dates || []),
        billing_quantity: billingQuantity,
        ot_amount: otAmount,
        mid_shift_amount: midShiftAmount,
        mid_shift_count: Number(g.mid_shift_count) || 0,
        grouped_amount_theoretical: theoreticalAmount,
        grouped_amount_actual: actualAmount,
        has_rounding_difference: hasDifference,
        total_amount: hasDifference ? actualAmount : theoreticalAmount,
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
      { key: 'ot_0600_0700', label: 'OT 06:00-07:00', field: 'ot_0600_0700' },
      { key: 'ot_0700_0800', label: 'OT 07:00-08:00', field: 'ot_0700_0800' },
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
            trigger_type: ca.trigger_type || 'every_work_day',
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
