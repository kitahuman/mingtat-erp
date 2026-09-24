export const PAYROLL_ITEM_OVERRIDE_NAMES = ['基本薪金', '工作收入', '底薪'] as const;

export type PayrollItemOverrideName =
  (typeof PAYROLL_ITEM_OVERRIDE_NAMES)[number];

type PayrollNumeric = number | string | { toString(): string } | null | undefined;

export type CalculatedPayrollItem = {
  item_type: string;
  item_name: string;
  unit_price?: PayrollNumeric;
  quantity?: PayrollNumeric;
  amount?: PayrollNumeric;
  remarks?: string | null;
  sort_order?: number;
  payroll_item_excluded?: boolean;
};

export type StoredPayrollItem = CalculatedPayrollItem & {
  payroll_item_is_manual_amount?: boolean | null;
  payroll_item_system_amount?: PayrollNumeric;
  payroll_item_system_quantity?: PayrollNumeric;
  payroll_item_system_remarks?: string | null;
  payroll_item_manual_amount?: PayrollNumeric;
  payroll_item_manual_remarks?: string | null;
};

export type PayrollItemOverrideLayer = {
  item_type: string;
  item_name: string;
  payroll_item_excluded: boolean;
  payroll_item_is_manual_amount: boolean;
  payroll_item_manual_amount: number | null;
  payroll_item_manual_remarks: string | null;
};

export type MergedPayrollItem = CalculatedPayrollItem & {
  amount: number;
  quantity: number;
  remarks: string | null;
  payroll_item_excluded: boolean;
  payroll_item_is_manual_amount: boolean;
  payroll_item_system_amount: number | null;
  payroll_item_system_quantity: number | null;
  payroll_item_system_remarks: string | null;
  payroll_item_manual_amount: number | null;
  payroll_item_manual_remarks: string | null;
};

export type MpfComputation = {
  mpf_deduction: number;
  mpf_employer: number;
  mpf_relevant_income: number;
  item_name: string;
  unit_price: number;
  quantity: number;
  amount: number;
  remarks: string;
};

export type CalculatedPayrollResult = {
  items: CalculatedPayrollItem[];
  salary_type: string;
  base_rate: number;
  work_days: number;
  work_nights?: number;
  base_amount: number;
  allowance_total: number;
  ot_total: number;
  commission_total: number;
  mpf_deduction: number;
  mpf_plan: string;
  mpf_employer: number;
  mpf_relevant_income: number;
  gross_income: number;
  net_amount: number;
};

const OVERRIDE_NAME_SET = new Set<string>(PAYROLL_ITEM_OVERRIDE_NAMES);

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

export function toPayrollNumber(value: PayrollNumeric): number {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = typeof value === 'object' && value !== null && 'toString' in value
    ? Number(value.toString())
    : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function payrollItemOverrideKey(item: {
  item_type?: string | null;
  item_name?: string | null;
}): string {
  return `${item.item_type || ''}|${item.item_name || ''}`;
}

export function isPayrollItemOverrideEligible(item: {
  item_type?: string | null;
  item_name?: string | null;
}): boolean {
  return item.item_type === 'base_salary' && OVERRIDE_NAME_SET.has(item.item_name || '');
}

function nullableNumber(value: PayrollNumeric): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'object' && value !== null && 'toString' in value
    ? Number(value.toString())
    : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableText(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  return value;
}

export function collectPayrollItemOverrideLayers(
  items: StoredPayrollItem[] | null | undefined,
): Map<string, PayrollItemOverrideLayer> {
  const layers = new Map<string, PayrollItemOverrideLayer>();
  for (const item of items || []) {
    if (!isPayrollItemOverrideEligible(item)) continue;
    const key = payrollItemOverrideKey(item);
    layers.set(key, {
      item_type: item.item_type,
      item_name: item.item_name,
      payroll_item_excluded: Boolean(item.payroll_item_excluded),
      payroll_item_is_manual_amount: Boolean(item.payroll_item_is_manual_amount),
      payroll_item_manual_amount:
        nullableNumber(item.payroll_item_manual_amount) ??
        (item.payroll_item_is_manual_amount ? nullableNumber(item.amount) : null),
      payroll_item_manual_remarks:
        item.payroll_item_manual_remarks ??
        (item.payroll_item_is_manual_amount ? item.remarks ?? null : null),
    });
  }
  return layers;
}

function buildSystemItem(
  item: CalculatedPayrollItem,
  excluded: boolean,
): MergedPayrollItem {
  const systemAmount = roundMoney(toPayrollNumber(item.amount));
  const systemQuantity = toPayrollNumber(item.quantity);
  const systemRemarks = item.remarks ?? null;
  const eligible = isPayrollItemOverrideEligible(item);
  return {
    ...item,
    amount: systemAmount,
    quantity: systemQuantity,
    remarks: systemRemarks,
    payroll_item_excluded: excluded,
    payroll_item_is_manual_amount: false,
    payroll_item_system_amount: eligible ? systemAmount : null,
    payroll_item_system_quantity: eligible ? systemQuantity : null,
    payroll_item_system_remarks: eligible ? systemRemarks : null,
    payroll_item_manual_amount: null,
    payroll_item_manual_remarks: null,
  };
}

function applyLayerToSystemItem(
  systemItem: MergedPayrollItem,
  layer: PayrollItemOverrideLayer | undefined,
): MergedPayrollItem {
  if (!layer || !isPayrollItemOverrideEligible(systemItem)) {
    return systemItem;
  }
  const isManual = layer.payroll_item_is_manual_amount;
  const manualAmount =
    layer.payroll_item_manual_amount === null
      ? null
      : roundMoney(layer.payroll_item_manual_amount);
  const manualRemarks = layer.payroll_item_manual_remarks;
  return {
    ...systemItem,
    amount: isManual && manualAmount !== null ? manualAmount : systemItem.amount,
    remarks: isManual && manualRemarks !== null ? manualRemarks : systemItem.remarks,
    payroll_item_excluded: Boolean(systemItem.payroll_item_excluded || layer.payroll_item_excluded),
    payroll_item_is_manual_amount: isManual,
    payroll_item_manual_amount: manualAmount,
    payroll_item_manual_remarks: manualRemarks,
  };
}

function synthesizeOmittedOverrideItem(
  layer: PayrollItemOverrideLayer,
  sortOrder: number,
): CalculatedPayrollItem {
  return {
    item_type: layer.item_type,
    item_name: layer.item_name,
    unit_price: 0,
    quantity: 0,
    amount: 0,
    remarks: null,
    sort_order: sortOrder,
  };
}

export function mergePayrollItemsWithOverrides(
  calculatedItems: CalculatedPayrollItem[],
  previousItems: StoredPayrollItem[] | null | undefined,
  previouslyExcludedKeys?: Set<string>,
): MergedPayrollItem[] {
  const layers = collectPayrollItemOverrideLayers(previousItems);
  const previousIneligibleManual = new Map<
    string,
    { amount: number; payroll_item_is_manual_amount: boolean }
  >();
  for (const item of previousItems || []) {
    if (isPayrollItemOverrideEligible(item)) continue;
    if (!item.payroll_item_is_manual_amount) continue;
    previousIneligibleManual.set(payrollItemOverrideKey(item), {
      amount: toPayrollNumber(item.amount),
      payroll_item_is_manual_amount: true,
    });
  }

  const merged: MergedPayrollItem[] = calculatedItems.map((item) => {
    const signature = [item.item_type || '', item.item_name || '', item.sort_order ?? ''].join('|');
    const excluded =
      Boolean(item.payroll_item_excluded) || Boolean(previouslyExcludedKeys?.has(signature));
    const systemItem = buildSystemItem(item, excluded);
    if (isPayrollItemOverrideEligible(item)) {
      return applyLayerToSystemItem(systemItem, layers.get(payrollItemOverrideKey(item)));
    }
    const ineligibleManual = previousIneligibleManual.get(payrollItemOverrideKey(item));
    if (!ineligibleManual) return systemItem;
    return {
      ...systemItem,
      amount: ineligibleManual.amount,
      payroll_item_is_manual_amount: true,
    };
  });

  const presentKeys = new Set(merged.map((item) => payrollItemOverrideKey(item)));
  const extras: PayrollItemOverrideLayer[] = [];
  for (const [key, layer] of layers) {
    if (presentKeys.has(key)) continue;
    if (
      layer.payroll_item_is_manual_amount
    ) {
      extras.push(layer);
    }
  }
  if (extras.length === 0) return merged;

  let lastBaseSalaryIndex = -1;
  let nextSortOrder = merged.reduce(
    (max, item) => Math.max(max, Number(item.sort_order) || 0),
    0,
  );
  merged.forEach((item, index) => {
    if (item.item_type === 'base_salary') lastBaseSalaryIndex = index;
  });
  const insertAt = lastBaseSalaryIndex >= 0 ? lastBaseSalaryIndex + 1 : 0;
  const extraItems = extras.map((layer) => {
    nextSortOrder += 1;
    const systemItem = buildSystemItem(
      synthesizeOmittedOverrideItem(layer, nextSortOrder),
      layer.payroll_item_excluded,
    );
    return applyLayerToSystemItem(systemItem, layer);
  });
  merged.splice(insertAt, 0, ...extraItems);
  return merged;
}

export function snapshotSystemValuesFromCurrent(item: StoredPayrollItem): {
  payroll_item_system_amount: number;
  payroll_item_system_quantity: number;
  payroll_item_system_remarks: string | null;
} {
  return {
    payroll_item_system_amount:
      nullableNumber(item.payroll_item_system_amount) ?? toPayrollNumber(item.amount),
    payroll_item_system_quantity:
      nullableNumber(item.payroll_item_system_quantity) ?? toPayrollNumber(item.quantity),
    payroll_item_system_remarks:
      item.payroll_item_system_remarks ?? item.remarks ?? null,
  };
}

export function switchPayrollItemToManual(
  item: StoredPayrollItem,
  input?: { amount?: number; remarks?: string | null },
): Pick<
  MergedPayrollItem,
  | 'amount'
  | 'quantity'
  | 'remarks'
  | 'payroll_item_is_manual_amount'
  | 'payroll_item_system_amount'
  | 'payroll_item_system_quantity'
  | 'payroll_item_system_remarks'
  | 'payroll_item_manual_amount'
  | 'payroll_item_manual_remarks'
> {
  const snapshot = snapshotSystemValuesFromCurrent(item);
  const nextAmount =
    input?.amount !== undefined
      ? roundMoney(input.amount)
      : nullableNumber(item.payroll_item_manual_amount) ?? toPayrollNumber(item.amount);
  const nextRemarks =
    input?.remarks !== undefined
      ? nullableText(input.remarks)
      : item.payroll_item_manual_remarks ?? item.remarks ?? null;
  return {
    amount: nextAmount,
    quantity: snapshot.payroll_item_system_quantity,
    remarks: nextRemarks,
    payroll_item_is_manual_amount: true,
    payroll_item_system_amount: snapshot.payroll_item_system_amount,
    payroll_item_system_quantity: snapshot.payroll_item_system_quantity,
    payroll_item_system_remarks: snapshot.payroll_item_system_remarks,
    payroll_item_manual_amount: nextAmount,
    payroll_item_manual_remarks: nextRemarks,
  };
}

export function switchPayrollItemToSystem(item: StoredPayrollItem): Pick<
  MergedPayrollItem,
  | 'amount'
  | 'quantity'
  | 'remarks'
  | 'payroll_item_is_manual_amount'
  | 'payroll_item_system_amount'
  | 'payroll_item_system_quantity'
  | 'payroll_item_system_remarks'
  | 'payroll_item_manual_amount'
  | 'payroll_item_manual_remarks'
> {
  const snapshot = snapshotSystemValuesFromCurrent(item);
  return {
    amount: snapshot.payroll_item_system_amount,
    quantity: snapshot.payroll_item_system_quantity,
    remarks: snapshot.payroll_item_system_remarks,
    payroll_item_is_manual_amount: false,
    payroll_item_system_amount: snapshot.payroll_item_system_amount,
    payroll_item_system_quantity: snapshot.payroll_item_system_quantity,
    payroll_item_system_remarks: snapshot.payroll_item_system_remarks,
    payroll_item_manual_amount: nullableNumber(item.payroll_item_manual_amount),
    payroll_item_manual_remarks: item.payroll_item_manual_remarks ?? null,
  };
}

export function updateManualPayrollItemValues(
  item: StoredPayrollItem,
  input: { amount?: number; remarks?: string | null },
): Pick<
  MergedPayrollItem,
  | 'amount'
  | 'quantity'
  | 'remarks'
  | 'payroll_item_is_manual_amount'
  | 'payroll_item_system_amount'
  | 'payroll_item_system_quantity'
  | 'payroll_item_system_remarks'
  | 'payroll_item_manual_amount'
  | 'payroll_item_manual_remarks'
> {
  const snapshot = snapshotSystemValuesFromCurrent(item);
  const nextAmount =
    input.amount !== undefined
      ? roundMoney(input.amount)
      : toPayrollNumber(item.amount);
  const nextRemarks =
    input.remarks !== undefined ? nullableText(input.remarks) : item.remarks ?? null;
  return {
    amount: nextAmount,
    quantity: snapshot.payroll_item_system_quantity,
    remarks: nextRemarks,
    payroll_item_is_manual_amount: true,
    payroll_item_system_amount: snapshot.payroll_item_system_amount,
    payroll_item_system_quantity: snapshot.payroll_item_system_quantity,
    payroll_item_system_remarks: snapshot.payroll_item_system_remarks,
    payroll_item_manual_amount: nextAmount,
    payroll_item_manual_remarks: nextRemarks,
  };
}

export function sumEffectiveAmountsByType(
  items: Array<{ item_type?: string | null; amount?: PayrollNumeric; payroll_item_excluded?: boolean | null }>,
  type: string,
): number {
  return roundMoney(
    items
      .filter((item) => !item.payroll_item_excluded && item.item_type === type)
      .reduce((sum, item) => sum + toPayrollNumber(item.amount), 0),
  );
}

export function sumEffectiveGrossIncome(
  items: Array<{ amount?: PayrollNumeric; payroll_item_excluded?: boolean | null }>,
): number {
  return roundMoney(
    items
      .filter((item) => !item.payroll_item_excluded)
      .reduce((sum, item) => {
        const amount = toPayrollNumber(item.amount);
        return sum + (amount > 0 ? amount : 0);
      }, 0),
  );
}

export function sumEffectiveNetAmount(
  items: Array<{ amount?: PayrollNumeric; payroll_item_excluded?: boolean | null }>,
  adjustmentTotal = 0,
): number {
  const itemTotal = items
    .filter((item) => !item.payroll_item_excluded)
    .reduce((sum, item) => sum + toPayrollNumber(item.amount), 0);
  return roundMoney(itemTotal + adjustmentTotal);
}

export function computeMpfFromEffectiveItems(input: {
  items: Array<{
      item_type?: string | null;
      item_name?: string | null;
      amount?: PayrollNumeric;
      quantity?: PayrollNumeric;
      payroll_item_excluded?: boolean | null;
    }>;
  mpfPlan: string;
  adjustmentTotal?: number;
  mpfDays?: number;
  mpfRelevantIncome?: number | null;
  isMpfExempt?: boolean;
}): MpfComputation | null {
  if (input.isMpfExempt) return null;

  const baseAmount = sumEffectiveAmountsByType(input.items, 'base_salary');
  const allowanceTotal = sumEffectiveAmountsByType(input.items, 'allowance');
  const otTotal = sumEffectiveAmountsByType(input.items, 'ot');
  const commissionTotal = sumEffectiveAmountsByType(input.items, 'commission');
  const defaultMpfBase = roundMoney(
    baseAmount + allowanceTotal + otTotal + commissionTotal + (input.adjustmentTotal || 0),
  );
  const mpfPlan = input.mpfPlan || 'industry';

  if (mpfPlan === 'industry') {
    const existingMpfItem = input.items.find((item) => item.item_type === 'mpf_deduction');
    const mpfDays = Math.max(
      0,
      input.mpfDays !== undefined ? input.mpfDays : toPayrollNumber(existingMpfItem?.quantity),
    );
    const defaultIndustryDailyIncome = mpfDays > 0 ? defaultMpfBase / mpfDays : 0;
    const industryDailyIncome =
      input.mpfRelevantIncome !== undefined && input.mpfRelevantIncome !== null
        ? Number(input.mpfRelevantIncome)
        : defaultIndustryDailyIncome;
    const tier =
      MPF_INDUSTRY_TIERS.find(
        (candidate) => industryDailyIncome > candidate.min && industryDailyIncome <= candidate.max,
      ) || MPF_INDUSTRY_TIERS[MPF_INDUSTRY_TIERS.length - 1];
    const deduction = roundMoney(tier.employee * mpfDays);
    const employer = roundMoney(tier.employer * mpfDays);
    return {
      mpf_deduction: deduction,
      mpf_employer: employer,
      mpf_relevant_income: industryDailyIncome,
      item_name: '強積金（行業計劃）',
      unit_price: tier.employee,
      quantity: mpfDays,
      amount: -deduction,
      remarks: `按日薪級別計算，${mpfDays}天，日薪基數 $${Math.round(industryDailyIncome * 100) / 100}`,
    };
  }

  const mpfBase =
    input.mpfRelevantIncome !== undefined && input.mpfRelevantIncome !== null
      ? Number(input.mpfRelevantIncome)
      : defaultMpfBase;
  const deduction = roundMoney(Math.min(mpfBase * 0.05, 1500));
  const planLabel =
    mpfPlan === 'manulife' ? 'Manulife' : mpfPlan === 'aia' ? 'AIA' : '一般計劃';
  return {
    mpf_deduction: deduction,
    mpf_employer: deduction,
    mpf_relevant_income: mpfBase,
    item_name: `強積金（${planLabel}）`,
    unit_price: mpfBase,
    quantity: 0.05,
    amount: -deduction,
    remarks: '月入 5%，上限 $1,500',
  };
}

function replaceMpfItem(
  items: MergedPayrollItem[],
  mpf: MpfComputation,
): MergedPayrollItem[] {
  const next = items.filter((item) => item.item_type !== 'mpf_deduction');
  const previousMpf = items.find((item) => item.item_type === 'mpf_deduction');
  next.push({
    item_type: 'mpf_deduction',
    item_name: mpf.item_name,
    unit_price: mpf.unit_price,
    quantity: mpf.quantity,
    amount: mpf.amount,
    remarks: mpf.remarks,
    sort_order: previousMpf?.sort_order ?? next.length + 1,
    payroll_item_excluded: Boolean(previousMpf?.payroll_item_excluded),
    payroll_item_is_manual_amount: false,
    payroll_item_system_amount: null,
    payroll_item_system_quantity: null,
    payroll_item_system_remarks: null,
    payroll_item_manual_amount: null,
    payroll_item_manual_remarks: null,
  });
  return next;
}

export function applyOverridesToCalculatedResult(
  calc: CalculatedPayrollResult,
  previousItems: StoredPayrollItem[] | null | undefined,
  options?: {
    previouslyExcludedKeys?: Set<string>;
    adjustmentTotal?: number;
    mpfRelevantIncome?: number | null;
    isMpfExempt?: boolean;
  },
): CalculatedPayrollResult & { items: MergedPayrollItem[] } {
  const mergedItems = mergePayrollItemsWithOverrides(
    calc.items,
    previousItems,
    options?.previouslyExcludedKeys,
  );
  const previousMpfItem = mergedItems.find((item) => item.item_type === 'mpf_deduction');
  const mpf = computeMpfFromEffectiveItems({
    items: mergedItems.filter((item) => item.item_type !== 'mpf_deduction'),
    mpfPlan: calc.mpf_plan,
    adjustmentTotal: options?.adjustmentTotal || 0,
    mpfDays: previousMpfItem ? toPayrollNumber(previousMpfItem.quantity) : undefined,
    mpfRelevantIncome: options?.mpfRelevantIncome,
    isMpfExempt: options?.isMpfExempt,
  });
  const items = mpf ? replaceMpfItem(mergedItems, mpf) : mergedItems;
  return {
    ...calc,
    items,
    base_amount: sumEffectiveAmountsByType(items, 'base_salary'),
    allowance_total: sumEffectiveAmountsByType(items, 'allowance'),
    ot_total: sumEffectiveAmountsByType(items, 'ot'),
    commission_total: sumEffectiveAmountsByType(items, 'commission'),
    mpf_deduction: mpf ? mpf.mpf_deduction : calc.mpf_deduction,
    mpf_employer: mpf ? mpf.mpf_employer : calc.mpf_employer,
    mpf_relevant_income: mpf ? mpf.mpf_relevant_income : calc.mpf_relevant_income,
    gross_income: sumEffectiveGrossIncome(items),
    net_amount: sumEffectiveNetAmount(items, 0),
  };
}

export function payrollItemPersistData(
  item: MergedPayrollItem,
  payrollId: number,
): {
  payroll_id: number;
  item_type: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  amount: number;
  remarks: string | null;
  sort_order: number;
  payroll_item_excluded: boolean;
  payroll_item_is_manual_amount: boolean;
  payroll_item_system_amount: number | null;
  payroll_item_system_quantity: number | null;
  payroll_item_system_remarks: string | null;
  payroll_item_manual_amount: number | null;
  payroll_item_manual_remarks: string | null;
} {
  return {
    item_type: item.item_type,
    item_name: item.item_name,
    unit_price: toPayrollNumber(item.unit_price),
    quantity: toPayrollNumber(item.quantity),
    amount: item.amount,
    remarks: item.remarks,
    sort_order: item.sort_order ?? 0,
    payroll_item_excluded: Boolean(item.payroll_item_excluded),
    payroll_item_is_manual_amount: Boolean(item.payroll_item_is_manual_amount),
    payroll_item_system_amount: item.payroll_item_system_amount,
    payroll_item_system_quantity: item.payroll_item_system_quantity,
    payroll_item_system_remarks: item.payroll_item_system_remarks,
    payroll_item_manual_amount: item.payroll_item_manual_amount,
    payroll_item_manual_remarks: item.payroll_item_manual_remarks,
    payroll_id: payrollId,
  };
}
