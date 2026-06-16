"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ColumnFilter from "@/components/ColumnFilter";
import { payrollApi } from "@/lib/api";
import { fmtDate } from "@/lib/dateUtils";

type TabKey = "detail" | "daily" | "grouped" | "unmatched" | "calculation" | "print";
type SortDirection = "asc" | "desc";
type DetailColumnKey =
  | "scheduled_date"
  | "equipment_number"
  | "client_name"
  | "client_contract_no"
  | "service_type"
  | "route"
  | "tonnage"
  | "machine_type"
  | "day_night"
  | "quantity"
  | "unit"
  | "payroll_work_log_product_quantity"
  | "payroll_work_log_product_unit"
  | "ot_quantity"
  | "is_mid_shift"
  | "matched_rate"
  | "matched_ot_rate"
  | "line_amount"
  | "price_match_status";
type BillingQuantityType = "days" | "quantity" | "product_quantity";
type CellValue = string | number | boolean | null | undefined;
type WorkLogUpdatePayload = Record<string, CellValue>;

type WorkLogRecord = {
  id: number | string;
  work_log_id?: number | string | null;
  scheduled_date?: string | null;
  service_type?: string | null;
  client_name?: string | null;
  company_name?: string | null;
  company_profile_name?: string | null;
  client_contract_no?: string | null;
  contract_no?: string | null;
  quotation_id?: number | string | null;
  quotation_no?: string | null;
  day_night?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  origin?: string | null;
  destination?: string | null;
  machine_type?: string | null;
  tonnage?: string | null;
  equipment_number?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  ot_quantity?: number | string | null;
  ot_unit?: string | null;
  payroll_work_log_product_name?: string | null;
  payroll_work_log_product_quantity?: number | string | null;
  work_log_product_quantity?: number | string | null;
  goods_quantity?: number | string | null;
  product_quantity?: number | string | null;
  work_log?: {
    payroll_work_log_product_quantity?: number | string | null;
    work_log_product_quantity?: number | string | null;
    goods_quantity?: number | string | null;
    product_quantity?: number | string | null;
  } | null;
  original_work_log?: {
    payroll_work_log_product_quantity?: number | string | null;
    work_log_product_quantity?: number | string | null;
    goods_quantity?: number | string | null;
    product_quantity?: number | string | null;
  } | null;
  payroll_work_log_product_unit?: string | null;
  goods_unit?: string | null;
  product_unit?: string | null;
  billing_quantity_type?: BillingQuantityType | string | null;
  matched_rate?: number | string | null;
  matched_unit?: string | null;
  matched_ot_rate?: number | string | null;
  matched_mid_shift_rate?: number | string | null;
  rate?: number | string | null;
  ot_rate?: number | string | null;
  amount?: number | string | null;
  line_amount?: number | string | null;
  ot_line_amount?: number | string | null;
  mid_shift_line_amount?: number | string | null;
  salary_ot_amount?: number | string | null;
  salary_mid_shift_amount?: number | string | null;
  base_line_amount?: number | string | null;
  client_short_name?: string | null;
  price_match_status?: string | null;
  price_match_note?: string | null;
  is_excluded?: boolean | null;
  is_modified?: boolean | null;
  is_mid_shift?: boolean | null;
  remarks?: string | null;
  group_key?: string | null;
  client_id?: number | string | null;
  company_id?: number | string | null;
  company_profile_id?: number | string | null;
};

type GroupedSettlementRecord = {
  group_key?: string | null;
  client_name?: string | null;
  company_name?: string | null;
  company_profile_name?: string | null;
  client_contract_no?: string | null;
  contract_no?: string | null;
  quotation_id?: number | string | null;
  quotation_no?: string | null;
  service_type?: string | null;
  day_night?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  origin?: string | null;
  destination?: string | null;
  machine_type?: string | null;
  tonnage?: string | null;
  quantity?: number | string | null;
  days?: number | string | null;
  count?: number | string | null;
  product_quantity?: number | string | null;
  billing_quantity?: number | string | null;
  billing_quantity_type?: BillingQuantityType | string | null;
  unit?: string | null;
  product_unit?: string | null;
  matched_unit?: string | null;
  matched_rate?: number | string | null;
  matched_ot_rate?: number | string | null;
  matched_mid_shift_rate?: number | string | null;
  ot_amount?: number | string | null;
  mid_shift_amount?: number | string | null;
  amount?: number | string | null;
  total_amount?: number | string | null;
  ot_quantity?: number | string | null;
  mid_shift?: number | string | null;
  mid_shift_count?: number | string | null;
  mid_shift_quantity?: number | string | null;
  is_mid_shift?: number | string | boolean | null;
  price_match_status?: string | null;
  price_match_note?: string | null;
  work_log_ids?: Array<number | string>;
  ids?: Array<number | string>;
  client_id?: number | string | null;
  company_id?: number | string | null;
  company_profile_id?: number | string | null;
};

type PayrollItem = {
  id?: number | string;
  item_name?: string | null;
  item_type?: string | null;
  unit_price?: number | string | null;
  quantity?: number | string | null;
  amount?: number | string | null;
  remarks?: string | null;
  payroll_item_excluded?: boolean | null;
  payroll_item_is_manual_amount?: boolean | null;
};

type Adjustment = {
  id?: number | string;
  item_name?: string | null;
  amount?: number | string | null;
  adjustment_date?: string | null;
  remarks?: string | null;
};

type PayrollExpenseRecord = {
  id?: number | string;
  expense?: {
    id?: number | string;
    date?: string | null;
    category?: { name?: string | null; parent?: { name?: string | null } | null } | null;
    description?: string | null;
    item?: string | null;
    total_amount?: number | string | null;
  } | null;
};

type AllowanceOption = {
  allowance_key?: string | null;
  key?: string | null;
  label?: string | null;
  allowance_name?: string | null;
  name?: string | null;
  amount?: number | string | null;
  default_amount?: number | string | null;
  remarks?: string | null;
};

type SalarySetting = Record<string, unknown> & {
  id?: number | string;
  salary_type?: string | null;
  base_salary?: number | string | null;
  base_salary_day?: number | string | null;
  base_salary_night?: number | string | null;
  mpf_plan?: string | null;
  is_piece_rate?: boolean | null;
  custom_allowances?: unknown;
};

type CalculationDetails = {
  payroll_summary?: Record<string, number | string | null | undefined>;
  items?: PayrollItem[];
  adjustments?: Adjustment[];
  allowance_options?: AllowanceOption[];
  mpf_plan?: string | null;
};

type DailyAllowance = {
  id?: number | string;
  allowance_key?: string | null;
  key?: string | null;
  allowance_name?: string | null;
  name?: string | null;
  amount?: number | string | null;
  remarks?: string | null;
};

type DailyBadge = {
  key?: string | null;
  badge_key?: string | null;
  label?: ReactNode;
  name?: string | null;
  amount?: number | string | null;
  className?: string;
  removable?: boolean;
  id?: number | string;
  date?: string | null;
};

type DailyCalculationRecord = {
  date?: string | null;
  weekday?: string | null;
  is_holiday?: boolean | null;
  holiday_name?: string | null;
  work_logs?: WorkLogRecord[];
  logs?: WorkLogRecord[];
  total_amount?: number | string | null;
  day_total?: number | string | null;
  work_income?: number | string | null;
  base_amount?: number | string | null;
  base_top_up?: number | string | null;
  base_top_up_amount?: number | string | null;
  ot_amount?: number | string | null;
  ot_hours?: number | string | null;
  daily_ot_amount?: number | string | null;
  daily_mid_shift_amount?: number | string | null;
  allowance_total?: number | string | null;
  daily_allowance_total?: number | string | null;
  special_label?: string | null;
  is_top_up_overridden?: boolean | null;
  day_quantity?: number | null;
  night_quantity?: number | null;
  daily_allowances?: DailyAllowance[];
  allowances?: DailyAllowance[];
  allowance_badges?: DailyBadge[];
  badges?: DailyBadge[];
  fixed_allowances_per_day?: { key: string; name: string; amount: number }[];
  remarks?: string | null;
  details?: string | null;
};

type PayrollSnapshot = {
  id?: number;
  employee?: {
    name?: string | null;
    employee_name?: string | null;
    name_zh?: string | null;
    name_en?: string | null;
    id_number?: string | null;
    address?: string | null;
    emergency_contact?: string | null;
    bank_account?: string | null;
    join_date?: string | null;
  } | null;
  company_profile?: {
    chinese_name?: string | null;
    english_name?: string | null;
    registered_address?: string | null;
    office_address?: string | null;
  } | null;
  company?: { name?: string | null; company_name?: string | null; name_en?: string | null; invoice_address?: string | null; company_logo_url?: string | null; company_stamp_url?: string | null } | null;
  employee_name?: string | null;
  period?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  gross_amount?: number | string | null;
  deduction_total?: number | string | null;
  mpf_employer?: number | string | null;
  adjustment_total?: number | string | null;
  net_amount?: number | string | null;
  reimbursement_total?: number | string | null;
  petty_cash_deducted?: number | string | null;
  payroll_work_logs?: WorkLogRecord[];
  grouped_settlement?: GroupedSettlementRecord[];
  daily_calculation?: DailyCalculationRecord[];
  items?: PayrollItem[];
  adjustments?: Adjustment[];
  payroll_expenses?: PayrollExpenseRecord[];
  allowance_options?: AllowanceOption[];
  salary_setting?: SalarySetting | null;
  mpf_plan?: string | null;
};

type RateCardSource = {
  groupKey: string;
  clientId?: number;
  companyId?: number;
  companyProfileId?: number;
  clientName?: string;
  companyName?: string;
  contractNo?: string;
  serviceType?: string;
  dayNight?: string;
  tonnage?: string;
  machineType?: string;
  origin?: string;
  destination?: string;
  unit?: string;
  rate?: number;
  otRate?: number;
  midShiftRate?: number;
};

type UnmatchedGroup = {
  key: string;
  clientName: string;
  contractNo: string;
  dayNight: string;
  route: string;
  unit: string;
  quantity: number;
  count: number;
  reason: string;
  source: RateCardSource;
};

type AddRateCardForm = {
  client_id?: number;
  company_id?: number;
  client_contract_no: string;
  service_type: string;
  day_night: string;
  tonnage: string;
  machine_type: string;
  origin: string;
  destination: string;
  rate: string;
  unit: string;
  ot_rate: string;
  mid_shift_rate: string;
  effective_date: string;
  remarks: string;
};

export type PayrollTabsProps = {
  payrollId?: number;
  workLogs?: WorkLogRecord[];
  groupedSettlement?: GroupedSettlementRecord[];
  dailyCalculation?: DailyCalculationRecord[];
  unmatchedRecords?: WorkLogRecord[];
  calculationDetails?: CalculationDetails | null;
  calculation?: CalculationDetails | null;
  payrollSnapshot?: PayrollSnapshot | null;
  readOnly?: boolean;
  className?: string;
  onUpdateWorkLog?: (id: number | string, updates: WorkLogUpdatePayload) => Promise<unknown>;
  onBatchUpdateWorkLogs?: (ids: Array<number | string>, updates: WorkLogUpdatePayload) => Promise<unknown>;
  onBatchDeleteWorkLogs?: (ids: Array<number | string>) => Promise<unknown>;
  onGroupBillingQuantityTypeChange?: (groupKey: string, billingQuantityType: BillingQuantityType) => Promise<unknown>;
};

const TAB_LABELS: Record<TabKey, string> = {
  detail: "逐筆明細",
  grouped: "歸組結算",
  unmatched: "未匹配摘要",
  daily: "逐日計算",
  calculation: "計算明細",
  print: "列印",
};

const ALLOWANCE_LABELS: Record<string, string> = {
  allowance_night: "夜班津貼",
  night: "夜班津貼",
  allowance_rent: "租車津貼",
  rent: "租車津貼",
  allowance_3runway: "三跑津貼",
  "3runway": "三跑津貼",
  allowance_well: "落井津貼",
  well: "落井津貼",
  allowance_machine: "揸機津貼",
  machine: "揸機津貼",
  allowance_roller: "火轆津貼",
  roller: "火轆津貼",
  allowance_crane: "吊/挾車津貼",
  crane: "吊/挾車津貼",
  allowance_move_machine: "搬機津貼",
  move_machine: "搬機津貼",
  allowance_kwh_night: "嘉華-夜間津貼",
  kwh_night: "嘉華-夜間津貼",
  allowance_mid_shift: "中直津貼",
  mid_shift: "中直津貼",
  ot_0600_0700: "OT 06:00-07:00",
  ot_0700_0800: "OT 07:00-08:00",
};

const DAILY_METRIC_LABELS = ["工作", "底薪", "補底薪", "OT", "合計"];

const SUMMARY_LABELS: Record<string, string> = {
  gross_amount: "應收總額",
  adjustment_total: "自定義津貼/扣款合計 (+)",
  deduction_total: "強積金（僱員）5%合計 (-)",
  mpf_employer: "強積金（僱主）",
  net_amount: "淨薪金",
  reimbursement_total: "員工報銷 (+)",
  petty_cash_deducted: "零用金抵扣 (-)",
  total_payable: "應付總額",
};

const PAYROLL_ITEM_COLUMN_LABELS: Record<string, string> = {
  item_name: "項目名稱",
  unit_price: "單價",
  quantity: "數量",
  amount: "金額",
  remarks: "備註",
};

const SALARY_TYPE_LABELS: Record<string, string> = {
  daily: "日薪",
  monthly: "月薪",
  piece: "計件",
  piece_rate: "計件",
};

const MPF_PLAN_LABELS: Record<string, string> = {
  industry: "行業計劃",
  master_trust: "集成信託計劃",
  exempt_age65: "過65歲, 不用供",
  none: "不適用",
};

const SALARY_SETTING_ALLOWANCE_FIELDS: Array<[keyof SalarySetting & string, string]> = [
  ["allowance_night", "夜班津貼"],
  ["allowance_rent", "租車津貼"],
  ["allowance_3runway", "三跑津貼"],
  ["allowance_well", "落井津貼"],
  ["allowance_machine", "揸機津貼"],
  ["allowance_roller", "火轆津貼"],
  ["allowance_crane", "吊/挾車津貼"],
  ["allowance_move_machine", "搬機津貼"],
  ["allowance_kwh_night", "嘉華-夜間津貼"],
  ["allowance_mid_shift", "中直津貼"],
];

const SALARY_SETTING_OT_FIELDS: Array<[keyof SalarySetting & string, string]> = [
  ["ot_rate_standard", "標準OT"],
  ["ot_1800_1900", "OT 18:00-19:00"],
  ["ot_1900_2000", "OT 19:00-20:00"],
  ["ot_0600_0700", "OT 06:00-07:00"],
  ["ot_0700_0800", "OT 07:00-08:00"],
  ["ot_mid_shift", "中直OT"],
  ["mid_shift_ot_allowance", "中直OT津貼"],
];

type DetailColumn = {
  key: DetailColumnKey;
  label: string;
  editable?: boolean;
  type?: "text" | "number" | "date" | "select" | "checkbox";
  options?: readonly string[];
  align?: "left" | "center" | "right";
  minWidth?: string;
};

const DETAIL_COLUMNS: DetailColumn[] = [
  { key: "scheduled_date", label: "日期", editable: true, type: "date", minWidth: "110px" },
  { key: "equipment_number", label: "車牌/機號", editable: true, type: "text", minWidth: "110px" },
  { key: "client_name", label: "客戶", editable: true, type: "text", minWidth: "140px" },
  { key: "client_contract_no", label: "客戶合約", editable: true, type: "text", minWidth: "120px" },
  { key: "service_type", label: "服務", editable: true, type: "text", minWidth: "120px" },
  { key: "route", label: "路線", minWidth: "160px" },
  { key: "tonnage", label: "噸數", editable: true, type: "text", minWidth: "90px" },
  { key: "machine_type", label: "機種", editable: true, type: "text", minWidth: "100px" },
  { key: "day_night", label: "日/夜", editable: true, type: "select", options: ["日", "夜", "中直"], align: "center", minWidth: "90px" },
  { key: "quantity", label: "數量", editable: true, type: "number", align: "right", minWidth: "90px" },
  { key: "unit", label: "單位", editable: true, type: "text", minWidth: "80px" },
  { key: "payroll_work_log_product_quantity", label: "商品數量", editable: true, type: "number", align: "right", minWidth: "105px" },
  { key: "payroll_work_log_product_unit", label: "商品單位", editable: true, type: "text", minWidth: "105px" },
  { key: "ot_quantity", label: "OT", editable: true, type: "number", align: "right", minWidth: "80px" },
  { key: "is_mid_shift", label: "中直", editable: true, type: "checkbox", align: "center", minWidth: "80px" },
  { key: "matched_rate", label: "費率", align: "right", minWidth: "90px" },
  { key: "matched_ot_rate", label: "OT費率", align: "right", minWidth: "95px" },
  { key: "line_amount", label: "合計", align: "right", minWidth: "100px" },
  { key: "price_match_status", label: "狀態", align: "center", minWidth: "95px" },
];

const BATCH_FIELDS = [
  { key: "day_night", label: "日/夜", type: "select", options: ["日", "夜", "中直"] },
  { key: "start_location", label: "路線起點", type: "text" },
  { key: "end_location", label: "路線終點", type: "text" },
  { key: "client_name", label: "客戶", type: "text" },
  { key: "client_contract_no", label: "客戶合約", type: "text" },
  { key: "service_type", label: "服務", type: "text" },
  { key: "machine_type", label: "機種", type: "text" },
  { key: "tonnage", label: "噸數", type: "text" },
  { key: "unit", label: "單位", type: "text" },
  { key: "payroll_work_log_product_unit", label: "商品單位", type: "text" },
] as const;

const currencyFormatter = new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD", maximumFractionDigits: 2 });

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asOptionalNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function formatMoney(value: number | string | null | undefined): string {
  return currencyFormatter.format(toNumber(value));
}

function formatPlainNumber(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function displayDate(value: string | null | undefined): string {
  if (!value) return "-";
  return fmtDate(value);
}

function formatDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") {
    const text = typeof (value as { toString?: () => string }).toString === "function" ? (value as { toString: () => string }).toString() : "";
    if (text && text !== "[object Object]") return text;
    return JSON.stringify(value);
  }
  return String(value);
}

function getAllowanceOptionLabel(option: AllowanceOption): string {
  const key = option.allowance_key || option.key || "";
  const explicitName = option.label?.trim() || option.allowance_name?.trim() || option.name?.trim();
  if (explicitName && explicitName !== "津貼") return explicitName;
  return ALLOWANCE_LABELS[key] || explicitName || "津貼";
}

function getProductQuantity(row: WorkLogRecord): CellValue {
  const candidates = [
    row.payroll_work_log_product_quantity,
    row.work_log_product_quantity,
    row.goods_quantity,
    row.product_quantity,
    row.work_log?.payroll_work_log_product_quantity,
    row.work_log?.work_log_product_quantity,
    row.work_log?.goods_quantity,
    row.work_log?.product_quantity,
    row.original_work_log?.payroll_work_log_product_quantity,
    row.original_work_log?.work_log_product_quantity,
    row.original_work_log?.goods_quantity,
    row.original_work_log?.product_quantity,
  ];
  const value = candidates.find((candidate) => candidate !== null && candidate !== undefined && candidate !== "");
  return value ?? "";
}

function getColumnValue(row: WorkLogRecord, key: DetailColumnKey): CellValue {
  if (key === "route") {
    const start = row.start_location || row.origin || "";
    const end = row.end_location || row.destination || "";
    return start || end ? `${start || "—"} → ${end || "—"}` : "";
  }
  if (key === "payroll_work_log_product_quantity") {
    return getProductQuantity(row);
  }
  const value = row[key] as unknown;
  return value instanceof Date || typeof value !== "object" ? (value as CellValue) : "";
}

function displayCellValue(row: WorkLogRecord, column: DetailColumn): string {
  const value = getColumnValue(row, column.key);
  if (column.key === "scheduled_date") return formatDate(value) || "—";
  if (column.key === "matched_rate" || column.key === "matched_ot_rate" || column.key === "line_amount") {
    return value === null || value === undefined || value === "" ? "—" : formatMoney(value as number | string | null | undefined);
  }
  return normalizeText(value);
}

function buildFilterRows(rows: WorkLogRecord[]): Array<Record<DetailColumnKey, string>> {
  return rows.map((row) => {
    const item = {} as Record<DetailColumnKey, string>;
    DETAIL_COLUMNS.forEach((column) => {
      item[column.key] = displayCellValue(row, column);
    });
    return item;
  });
}

function toUpdateValue(value: string | boolean, type: DetailColumn["type"]): CellValue {
  if (type === "checkbox") return Boolean(value);
  if (type === "number") return value === "" ? null : Number(value);
  return value === "" ? null : String(value);
}

function getApiMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return fallback;
}

function normalizeGroupKey(group: GroupedSettlementRecord): string {
  return group.group_key || [group.client_name || group.company_name || "-", group.service_type || "-", group.start_location || "-", group.end_location || "-"].join("-");
}

function routeOf(row: WorkLogRecord | GroupedSettlementRecord): string {
  return [row.start_location, row.end_location].filter(Boolean).join(" → ") || "-";
}

function isUnmatched(row: WorkLogRecord | GroupedSettlementRecord): boolean {
  return row.price_match_status !== "matched" && row.price_match_status !== "manual";
}

function readCell(row: WorkLogRecord, key: keyof WorkLogRecord | "route"): CellValue {
  if (key === "route") return routeOf(row);
  return row[key] as CellValue;
}

function buildRateCardSourceFromWorkLog(row: WorkLogRecord, groupKey: string): RateCardSource {
  return {
    groupKey,
    clientId: asOptionalNumber(row.client_id),
    companyId: asOptionalNumber(row.company_id),
    companyProfileId: asOptionalNumber(row.company_profile_id),
    clientName: row.client_name || undefined,
    companyName: row.company_name || undefined,
    contractNo: row.client_contract_no || row.contract_no || undefined,
    serviceType: row.service_type || undefined,
    dayNight: row.day_night || undefined,
    tonnage: row.tonnage || undefined,
    machineType: row.machine_type || undefined,
    origin: row.start_location || undefined,
    destination: row.end_location || undefined,
    unit: row.unit || row.matched_unit || undefined,
    rate: asOptionalNumber(row.matched_rate),
    otRate: asOptionalNumber(row.matched_ot_rate),
    midShiftRate: asOptionalNumber(row.matched_mid_shift_rate),
  };
}

function buildUnmatchedGroups(rows: WorkLogRecord[]): UnmatchedGroup[] {
  const groups = new Map<string, UnmatchedGroup>();
  rows.filter((row) => !row.is_excluded && isUnmatched(row)).forEach((row) => {
    const route = routeOf(row);
    const unit = row.unit || row.matched_unit || "天";
    const key = [row.client_name || row.company_name || "-", row.client_contract_no || row.contract_no || "-", row.day_night || "日", route, unit].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += toNumber(row.quantity) || 1;
      existing.count += 1;
      if (!existing.reason && row.price_match_note) existing.reason = row.price_match_note;
      return;
    }
    groups.set(key, {
      key,
      clientName: row.client_name || row.company_name || "-",
      contractNo: row.client_contract_no || row.contract_no || "-",
      dayNight: row.day_night || "日",
      route,
      unit,
      quantity: toNumber(row.quantity) || 1,
      count: 1,
      reason: row.price_match_note || "未匹配價目",
      source: buildRateCardSourceFromWorkLog(row, key),
    });
  });
  return Array.from(groups.values());
}

function buildRateCardSourceFromGroup(group: GroupedSettlementRecord): RateCardSource {
  return {
    groupKey: normalizeGroupKey(group),
    clientId: asOptionalNumber(group.client_id),
    companyId: asOptionalNumber(group.company_id),
    companyProfileId: asOptionalNumber(group.company_profile_id),
    clientName: group.client_name || undefined,
    companyName: group.company_name || undefined,
    contractNo: group.client_contract_no || group.contract_no || undefined,
    serviceType: group.service_type || undefined,
    dayNight: group.day_night || undefined,
    tonnage: group.tonnage || undefined,
    machineType: group.machine_type || undefined,
    origin: group.start_location || undefined,
    destination: group.end_location || undefined,
    unit: group.unit || group.matched_unit || undefined,
    rate: asOptionalNumber(group.matched_rate),
    otRate: asOptionalNumber(group.matched_ot_rate),
  };
}

function groupBillingQuantity(group: GroupedSettlementRecord): number {
  if (group.billing_quantity !== null && group.billing_quantity !== undefined) return toNumber(group.billing_quantity);
  const type = group.billing_quantity_type || "days";
  if (type === "product_quantity") return toNumber(group.product_quantity);
  if (type === "quantity") return toNumber(group.quantity);
  return toNumber(group.days || group.count || group.quantity);
}

function groupBillingUnit(group: GroupedSettlementRecord): string {
  const type = group.billing_quantity_type || "days";
  if (type === "product_quantity") return group.product_unit || group.matched_unit || "商品";
  if (type === "quantity") return group.unit || group.matched_unit || "數量";
  return "天";
}

function summarizeCalculation(details: CalculationDetails | null | undefined, snapshot: PayrollSnapshot | null): CalculationDetails {
  return {
    payroll_summary: details?.payroll_summary || {
      gross_amount: snapshot?.gross_amount,
      deduction_total: snapshot?.deduction_total,
      mpf_employer: snapshot?.mpf_employer,
      adjustment_total: snapshot?.adjustment_total,
      reimbursement_total: snapshot?.reimbursement_total,
      net_amount: snapshot?.net_amount,
    },
    items: details?.items || snapshot?.items || [],
    adjustments: details?.adjustments || snapshot?.adjustments || [],
    allowance_options: details?.allowance_options || snapshot?.allowance_options || [],
  };
}

function emptyRateCardForm(): AddRateCardForm {
  return {
    client_contract_no: "",
    service_type: "",
    day_night: "日",
    tonnage: "",
    machine_type: "",
    origin: "",
    destination: "",
    rate: "",
    unit: "天",
    ot_rate: "",
    mid_shift_rate: "",
    effective_date: new Date().toISOString().slice(0, 10),
    remarks: "由糧單未匹配組合新增",
  };
}

function PayrollTabs({
  payrollId,
  workLogs = [],
  groupedSettlement = [],
  dailyCalculation = [],
  unmatchedRecords = [],
  calculationDetails = null,
  calculation: legacyCalculation = null,
  payrollSnapshot = null,
  readOnly = false,
  className = "",
  onUpdateWorkLog,
  onBatchUpdateWorkLogs,
  onBatchDeleteWorkLogs,
  onGroupBillingQuantityTypeChange,
}: PayrollTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("detail");
  const [rows, setRows] = useState<WorkLogRecord[]>(workLogs);
  const [groups, setGroups] = useState<GroupedSettlementRecord[]>(groupedSettlement);
  const [dailyRows, setDailyRows] = useState<DailyCalculationRecord[]>(dailyCalculation);
  const [details, setDetails] = useState<CalculationDetails | null>(calculationDetails || legacyCalculation);
  const [snapshot, setSnapshot] = useState<PayrollSnapshot | null>(payrollSnapshot);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [sortKey, setSortKey] = useState<keyof WorkLogRecord | "route">("scheduled_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "matched" | "unmatched" | "excluded">("all");
  const [editingCell, setEditingCell] = useState<{ id: number | string; field: keyof WorkLogRecord } | null>(null);
  const [cellDraft, setCellDraft] = useState("");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [showGroupedInPrint, setShowGroupedInPrint] = useState(true);
  const [rateCardSource, setRateCardSource] = useState<RateCardSource | null>(null);
  const [rateCardSaving, setRateCardSaving] = useState(false);
  const [rateCardForm, setRateCardForm] = useState<AddRateCardForm>(() => emptyRateCardForm());
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => setRows(workLogs), [workLogs]);
  useEffect(() => setGroups(groupedSettlement), [groupedSettlement]);
  useEffect(() => setDailyRows(dailyCalculation), [dailyCalculation]);
  useEffect(() => setDetails(calculationDetails || legacyCalculation), [calculationDetails, legacyCalculation]);

  const calculation = useMemo(() => summarizeCalculation(details, snapshot), [details, snapshot]);
  const computedUnmatchedGroups = useMemo(() => buildUnmatchedGroups(rows.length > 0 ? rows : unmatchedRecords), [rows, unmatchedRecords]);

  const filteredRows = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const matchesText = !term || [row.scheduled_date, row.client_name, row.company_name, row.service_type, row.day_night, row.start_location, row.end_location, row.remarks, row.price_match_note]
        .some((value) => String(value || "").toLowerCase().includes(term));
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "excluded" && row.is_excluded) ||
        (statusFilter === "matched" && !row.is_excluded && !isUnmatched(row)) ||
        (statusFilter === "unmatched" && !row.is_excluded && isUnmatched(row));
      return matchesText && matchesStatus;
    });
    return [...filtered].sort((a, b) => {
      const av = readCell(a, sortKey);
      const bv = readCell(b, sortKey);
      const an = typeof av === "number" || (typeof av === "string" && av.trim() !== "" && !Number.isNaN(Number(av))) ? Number(av) : null;
      const bn = typeof bv === "number" || (typeof bv === "string" && bv.trim() !== "" && !Number.isNaN(Number(bv))) ? Number(bv) : null;
      let compare = 0;
      if (an !== null && bn !== null) compare = an - bn;
      else compare = String(av || "").localeCompare(String(bv || ""), "zh-Hant");
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [filterText, rows, sortDirection, sortKey, statusFilter]);

  async function loadSnapshot(): Promise<void> {
    setLoading(true);
    try {
      if (!payrollId) return;
      const response = await payrollApi.get(payrollId);
      const data = response.data as PayrollSnapshot;
      setSnapshot(data);
      setRows(data.payroll_work_logs || []);
      setGroups(data.grouped_settlement || []);
      setDailyRows(data.daily_calculation || []);
      setDetails({
        payroll_summary: {
          gross_amount: data.gross_amount,
          deduction_total: data.deduction_total,
          mpf_employer: data.mpf_employer,
          adjustment_total: data.adjustment_total,
          reimbursement_total: data.reimbursement_total,
          net_amount: data.net_amount,
        },
        items: data.items || [],
        adjustments: data.adjustments || [],
        allowance_options: data.allowance_options || [],
      });
    } catch (err: unknown) {
      alert(getApiMessage(err, "載入糧單資料失敗"));
    } finally {
      setLoading(false);
    }
  }

  async function recalculateAndReload(): Promise<void> {
    if (payrollId) {
      await payrollApi.recalculate(payrollId);
      await loadSnapshot();
    }
  }

  async function mutateAndReload(action: () => Promise<unknown>, fallback: string): Promise<void> {
    setSaving(true);
    try {
      await action();
      await recalculateAndReload();
      setSelectedIds(new Set());
    } catch (err: unknown) {
      alert(getApiMessage(err, fallback));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  function toggleSort(key: keyof WorkLogRecord | "route") {
    if (sortKey === key) setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function toggleRow(id: number | string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const visibleIds = filteredRows.map((row) => row.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allSelected) return new Set(Array.from(prev).filter((id) => !visibleIds.includes(id)));
      return new Set([...Array.from(prev), ...visibleIds]);
    });
  }

  function canEditCell(row: WorkLogRecord, field: keyof WorkLogRecord): boolean {
    if (readOnly || row.is_excluded) return false;
    if (field === "matched_rate" || field === "matched_ot_rate") return isUnmatched(row);
    return true;
  }

  function startEdit(row: WorkLogRecord, field: keyof WorkLogRecord) {
    if (!canEditCell(row, field)) return;
    setEditingCell({ id: row.id, field });
    setCellDraft(String(row[field] ?? ""));
  }

  function cancelEdit() {
    setEditingCell(null);
    setCellDraft("");
  }

  async function saveCell(row: WorkLogRecord, field: keyof WorkLogRecord, numeric = false) {
    if (!editingCell) return;
    const original = row[field];
    const value: CellValue = numeric ? (cellDraft.trim() === "" ? null : Number(cellDraft)) : cellDraft;
    if (String(original ?? "") === String(value ?? "")) {
      cancelEdit();
      return;
    }
    cancelEdit();
    await mutateAndReload(() => onUpdateWorkLog ? onUpdateWorkLog(row.id, { [field]: value } as WorkLogUpdatePayload) : payrollApi.updateWorkLog(payrollId as number, Number(row.id), { [field]: value } as WorkLogUpdatePayload), "更新工作記錄失敗");
  }

  async function batchUpdate(updates: WorkLogUpdatePayload) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await mutateAndReload(() => onBatchUpdateWorkLogs ? onBatchUpdateWorkLogs(ids, updates) : Promise.all(ids.map((id) => payrollApi.updateWorkLog(payrollId as number, Number(id), updates))), "批量更新工作記錄失敗");
  }

  async function batchUpdateRows(ids: Array<number | string>, updates: WorkLogUpdatePayload) {
    if (ids.length === 0) return;
    await mutateAndReload(() => onBatchUpdateWorkLogs ? onBatchUpdateWorkLogs(ids, updates) : Promise.all(ids.map((id) => payrollApi.updateWorkLog(payrollId as number, Number(id), updates))), "批量更新工作記錄失敗");
  }

  async function commitDetailRowUpdate(id: number | string, column: DetailColumn, value: CellValue) {
    await mutateAndReload(() => onUpdateWorkLog ? onUpdateWorkLog(id, { [column.key]: value } as WorkLogUpdatePayload) : payrollApi.updateWorkLog(payrollId as number, Number(id), { [column.key]: value } as WorkLogUpdatePayload), "更新工作記錄失敗");
  }

  async function excludeRows(ids: Array<number | string>) {
    if (ids.length === 0) return;
    const ok = window.confirm(`確定要從糧單移除 ${ids.length} 筆工作記錄？可稍後按「恢復」還原。`);
    if (!ok) return;
    await mutateAndReload(() => onBatchDeleteWorkLogs ? onBatchDeleteWorkLogs(ids) : Promise.all(ids.map((id) => payrollApi.excludeWorkLog(payrollId as number, Number(id)))), "移除工作記錄失敗");
  }

  async function restoreRows(ids: Array<number | string>) {
    if (ids.length === 0) return;
    if (!payrollId) return;
    await mutateAndReload(() => Promise.all(ids.map((id) => payrollApi.restoreWorkLog(payrollId, Number(id)))), "恢復工作記錄失敗");
  }

  async function setGroupBillingQuantityType(group: GroupedSettlementRecord, billingType: BillingQuantityType) {
    const ids = group.work_log_ids || group.ids || [];
    if (ids.length === 0) return;
    await mutateAndReload(() => onGroupBillingQuantityTypeChange ? onGroupBillingQuantityTypeChange(normalizeGroupKey(group), billingType) : Promise.all(ids.map((id) => payrollApi.updateWorkLog(payrollId as number, Number(id), { billing_quantity_type: billingType }))), "更新計費數量類型失敗");
  }

  async function setGroupRate(group: GroupedSettlementRecord) {
    if (readOnly) return;
    const groupKey = normalizeGroupKey(group);
    const current = asOptionalNumber(group.matched_rate);
    const input = window.prompt("請輸入此歸組的手動單價", current !== undefined ? String(current) : "");
    if (input === null) return;
    const rate = Number(input);
    if (!Number.isFinite(rate)) {
      alert("請輸入有效單價");
      return;
    }
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.setGroupRate(payrollId, groupKey, rate), "更新歸組單價失敗");
  }

  async function setGroupOtRate(group: GroupedSettlementRecord) {
    if (readOnly) return;
    const groupKey = normalizeGroupKey(group);
    const current = asOptionalNumber(group.matched_ot_rate);
    const input = window.prompt("請輸入此歸組的手動 OT 價", current !== undefined ? String(current) : "");
    if (input === null) return;
    const otRate = Number(input);
    if (!Number.isFinite(otRate)) {
      alert("請輸入有效 OT 價");
      return;
    }
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.setGroupOtRate(payrollId, groupKey, otRate), "更新歸組 OT 價失敗");
  }

  async function setGroupMidShiftRate(group: GroupedSettlementRecord) {
    if (readOnly) return;
    const groupKey = normalizeGroupKey(group);
    const current = asOptionalNumber(group.matched_mid_shift_rate);
    const input = window.prompt("請輸入此歸組的手動中直價", current !== undefined ? String(current) : "");
    if (input === null) return;
    const midShiftRate = Number(input);
    if (!Number.isFinite(midShiftRate)) {
      alert("請輸入有效中直價");
      return;
    }
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.setGroupMidShiftRate(payrollId, groupKey, midShiftRate), "更新歸組中直價失敗");
  }

  function openRateCardModal(source: RateCardSource) {
    setRateCardSource(source);
    setRateCardForm({
      client_id: source.clientId,
      company_id: source.companyId,
      client_contract_no: source.contractNo || "",
      service_type: source.serviceType || "",
      day_night: source.dayNight || "日",
      tonnage: source.tonnage || "",
      machine_type: source.machineType || "",
      origin: source.origin || "",
      destination: source.destination || "",
      rate: source.rate !== undefined && source.rate > 0 ? String(source.rate) : "",
      unit: source.unit || "天",
      ot_rate: source.otRate !== undefined && source.otRate > 0 ? String(source.otRate) : "",
      mid_shift_rate: source.midShiftRate !== undefined && source.midShiftRate > 0 ? String(source.midShiftRate) : "",
      effective_date: new Date().toISOString().slice(0, 10),
      remarks: "由糧單未匹配組合新增",
    });
  }

  async function submitRateCard() {
    if (!rateCardSource || !payrollId) return;
    const rate = Number(rateCardForm.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      alert("請輸入有效單價");
      return;
    }
    setRateCardSaving(true);
    try {
      await payrollApi.addToRateCard(payrollId, {
        client_id: rateCardForm.client_id,
        company_id: rateCardForm.company_id,
        client_contract_no: rateCardForm.client_contract_no || undefined,
        service_type: rateCardForm.service_type || undefined,
        day_night: rateCardForm.day_night || undefined,
        tonnage: rateCardForm.tonnage || undefined,
        machine_type: rateCardForm.machine_type || undefined,
        origin: rateCardForm.origin || undefined,
        destination: rateCardForm.destination || undefined,
        rate,
        unit: rateCardForm.unit || undefined,
        ot_rate: rateCardForm.ot_rate ? Number(rateCardForm.ot_rate) : undefined,
        mid_shift_rate: rateCardForm.mid_shift_rate ? Number(rateCardForm.mid_shift_rate) : undefined,
        effective_date: rateCardForm.effective_date || undefined,
        remarks: rateCardForm.remarks || undefined,
      });
      setRateCardSource(null);
      await recalculateAndReload();
    } catch (err: unknown) {
      alert(getApiMessage(err, "加入價目表失敗"));
    } finally {
      setRateCardSaving(false);
    }
  }

  async function addDailyAllowance(date: string, option: AllowanceOption) {
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.addDailyAllowance(payrollId, {
      date,
      allowance_key: option.allowance_key || option.key || "custom_allowance",
      allowance_name: option.label || option.allowance_name || option.name || "津貼",
      amount: toNumber(option.amount ?? option.default_amount),
    }), "新增每日津貼失敗");
  }

  async function removeDailyAllowance(id: number | string) {
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.removeDailyAllowance(payrollId, Number(id)), "移除每日津貼失敗");
  }

  async function addAdjustment(date: string, item: { item_name: string; amount: number }) {
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.addAdjustment(payrollId, {
      item_name: item.item_name,
      amount: item.amount,
      date,
    }), "新增自定義津貼失敗");
  }

  async function removeAdjustment(id: number | string) {
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.removeAdjustment(payrollId, Number(id)), "移除自定義津貼失敗");
  }

  async function excludeBadge(date: string, badgeKey: string) {
    const ok = window.confirm("確定要移除此津貼？");
    if (!ok) return;
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.excludeBadge(payrollId, { date, badge_key: badgeKey }), "移除津貼失敗");
  }

  async function restoreBadge(date: string, badgeKey: string) {
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.restoreBadge(payrollId, { date, badge_key: badgeKey }), "還原津貼失敗");
  }

  async function saveTopUpOverride(date: string) {
    const input = window.prompt("請輸入補底薪手動覆蓋金額", "0");
    if (input === null) return;
    const amount = Number(input);
    if (!Number.isFinite(amount)) {
      alert("請輸入有效金額");
      return;
    }
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.addDailyAllowance(payrollId, { date, allowance_key: "base_top_up_override", allowance_name: "補底薪手動覆蓋", amount, remarks: "手動覆蓋補底薪差額" }), "儲存補底薪失敗");
  }

  function printPayroll() {
    if (!printRef.current) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>糧單</title><style>body{font-family:'Microsoft JhengHei','PingFang TC',sans-serif;padding:20px;color:#111827}.print-table{width:100%;border-collapse:collapse;font-size:12px}.print-table th,.print-table td{border:1px solid #d1d5db;padding:6px}.print-table th{background:#f3f4f6;text-align:left}.text-right{text-align:right}.no-print{display:none!important}@media print{body{padding:0}}</style></head><body>`);
    w.document.write(printRef.current.innerHTML);
    w.document.write("</body></html>");
    w.document.close();
    setTimeout(() => w.print(), 500);
  }

  const activeCount = rows.filter((row) => !row.is_excluded).length;
  const matchedCount = rows.filter((row) => !row.is_excluded && !isUnmatched(row)).length;
  const unmatchedCount = rows.filter((row) => !row.is_excluded && isUnmatched(row)).length;
  const excludedCount = rows.filter((row) => row.is_excluded).length;
  const visibleAllSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));

  return (
    <div className={className}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${activeTab === key ? "bg-primary-600 text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
        <button type="button" onClick={loadSnapshot} disabled={loading || saving} className="btn-secondary text-sm" title="重新載入頁面資料，不觸發重新計算">{loading ? "重新載入中..." : "重新載入分頁資料"}</button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryPill label="有效工作記錄" value={`${activeCount} 筆`} tone="blue" />
        <SummaryPill label="已匹配" value={`${matchedCount} 筆`} tone="green" />
        <SummaryPill label="未匹配" value={`${unmatchedCount} 筆`} tone="amber" />
        <SummaryPill label="已移除" value={`${excludedCount} 筆`} tone="gray" />
      </div>

      {activeTab === "detail" && <DetailTab rows={rows} saving={saving} readOnly={readOnly} onUpdateWorkLog={commitDetailRowUpdate} onBatchUpdateWorkLogs={batchUpdateRows} onBatchDeleteWorkLogs={excludeRows} />}
      {activeTab === "grouped" && <GroupedTab groups={groups} readOnly={readOnly || saving || !payrollId} onBillingTypeChange={setGroupBillingQuantityType} onSetGroupRate={setGroupRate} onSetGroupOtRate={setGroupOtRate} onSetGroupMidShiftRate={setGroupMidShiftRate} onOpenRateCard={openRateCardModal} />}
      {activeTab === "daily" && <DailyTab days={dailyRows} allowanceOptions={calculation.allowance_options || []} adjustments={calculation.adjustments || []} expandedDay={expandedDay} readOnly={readOnly || saving || !payrollId} onToggleExpand={(date) => setExpandedDay((prev) => (prev === date ? null : date))} onAddAllowance={addDailyAllowance} onRemoveAllowance={removeDailyAllowance} onAddAdjustment={addAdjustment} onRemoveAdjustment={removeAdjustment} onExcludeBadge={excludeBadge} onRestoreBadge={restoreBadge} onSaveTopUpOverride={saveTopUpOverride} />}
      {activeTab === "unmatched" && <UnmatchedTab groups={computedUnmatchedGroups} readOnly={readOnly || saving || !payrollId} onOpenRateCard={openRateCardModal} />}
      {activeTab === "calculation" && <CalculationTab calculation={calculation} snapshot={snapshot} salarySetting={snapshot?.salary_setting} workLogs={rows} dailyCalculation={dailyRows} payrollId={payrollId} readOnly={readOnly} onItemUpdated={loadSnapshot} />}
      {activeTab === "print" && <PrintTab payrollId={payrollId} showGroupedInPrint={showGroupedInPrint} onShowGroupedChange={setShowGroupedInPrint} />}

      {rateCardSource && <RateCardModal source={rateCardSource} form={rateCardForm} saving={rateCardSaving} onChange={setRateCardForm} onClose={() => setRateCardSource(null)} onSubmit={submitRateCard} />}
    </div>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "amber" | "gray" }) {
  const toneClass = { blue: "bg-blue-50 text-blue-700 border-blue-100", green: "bg-green-50 text-green-700 border-green-100", amber: "bg-amber-50 text-amber-700 border-amber-100", gray: "bg-gray-50 text-gray-700 border-gray-100" }[tone];
  return <div className={`rounded-lg border p-3 ${toneClass}`}><div className="text-xs font-medium opacity-75">{label}</div><div className="mt-1 text-lg font-bold">{value}</div></div>;
}

type DetailTabProps = {
  rows: WorkLogRecord[];
  saving: boolean;
  readOnly: boolean;
  onUpdateWorkLog: (id: number | string, column: DetailColumn, value: CellValue) => Promise<void> | void;
  onBatchUpdateWorkLogs: (ids: Array<number | string>, updates: WorkLogUpdatePayload) => Promise<void> | void;
  onBatchDeleteWorkLogs: (ids: Array<number | string>) => Promise<void> | void;
};

type EditableCellProps = {
  row: WorkLogRecord;
  column: DetailColumn;
  readOnly: boolean;
  editingKey: string | null;
  setEditingKey: (key: string | null) => void;
  onCommit: (id: number | string, column: DetailColumn, value: CellValue) => Promise<void> | void;
};

function EditableDetailCell({ row, column, readOnly, editingKey, setEditingKey, onCommit }: EditableCellProps) {
  const cellKey = `${row.id}:${column.key}`;
  const isEditable = Boolean(column.editable) && !readOnly;
  const isEditing = isEditable && editingKey === cellKey;
  const rawValue = getColumnValue(row, column.key);
  const [localValue, setLocalValue] = useState<string>(column.key === "scheduled_date" ? formatDate(rawValue) : rawValue == null ? "" : String(rawValue));

  useEffect(() => {
    setLocalValue(column.key === "scheduled_date" ? formatDate(rawValue) : rawValue == null ? "" : String(rawValue));
  }, [column.key, rawValue]);

  const alignClass = column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left";
  const baseClass = `px-3 py-2 align-middle whitespace-nowrap ${alignClass}`;

  async function commit(next: string | boolean) {
    const value = toUpdateValue(next, column.type);
    await onCommit(row.id, column, value);
    setEditingKey(null);
  }

  if (column.type === "checkbox") {
    const checked = Boolean(rawValue);
    if (!isEditable) {
      return <td className={baseClass}>{checked ? <span className="font-semibold text-green-600">是</span> : <span className="text-gray-400">否</span>}</td>;
    }
    return (
      <td className={`${baseClass} cursor-pointer hover:bg-blue-50`} onClick={() => void commit(!checked)} title="點擊切換">
        {checked ? <span className="font-semibold text-green-600">是</span> : <span className="text-gray-400">否</span>}
      </td>
    );
  }

  if (!isEditing) {
    return (
      <td
        className={`${baseClass} ${isEditable ? "cursor-pointer hover:bg-blue-50" : "text-gray-700"} ${column.align === "right" ? "font-mono" : ""}`}
        onClick={() => isEditable && setEditingKey(cellKey)}
        title={isEditable ? "點擊編輯" : undefined}
      >
        {displayCellValue(row, column)}
      </td>
    );
  }

  if (column.type === "select") {
    return (
      <td className="px-2 py-1 align-middle">
        <select
          autoFocus
          value={localValue}
          onChange={(event) => void commit(event.target.value)}
          onBlur={() => setEditingKey(null)}
          className="w-full min-w-[88px] rounded border border-blue-400 bg-blue-50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">—</option>
          {(column.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </td>
    );
  }

  return (
    <td className="px-2 py-1 align-middle">
      <input
        autoFocus
        type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"}
        step={column.type === "number" ? "0.01" : undefined}
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => void commit(localValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit(localValue);
          if (event.key === "Escape") setEditingKey(null);
        }}
        className={`w-full min-w-[88px] rounded border border-blue-400 bg-blue-50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${column.align === "right" ? "text-right" : ""}`}
      />
    </td>
  );
}

function DetailTab({ rows, saving, readOnly, onUpdateWorkLog, onBatchUpdateWorkLogs, onBatchDeleteWorkLogs }: DetailTabProps) {
  const [localRows, setLocalRows] = useState<WorkLogRecord[]>(rows || []);
  const [sortKey, setSortKey] = useState<DetailColumnKey>("scheduled_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchField, setBatchField] = useState<string>("service_type");
  const [batchValue, setBatchValue] = useState<string>("");
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    setLocalRows(rows || []);
    setSelectedIds(new Set());
    setEditingKey(null);
  }, [rows]);

  const filterRows = useMemo(() => buildFilterRows(localRows), [localRows]);

  const filteredSortedRows = useMemo(() => {
    const filtered = localRows.filter((row) => DETAIL_COLUMNS.every((column) => {
      const selected = columnFilters[column.key];
      if (!selected) return true;
      return selected.has(displayCellValue(row, column));
    }));

    return [...filtered].sort((a, b) => {
      const av = getColumnValue(a, sortKey);
      const bv = getColumnValue(b, sortKey);
      const an = Number(av);
      const bn = Number(bv);
      let result = 0;
      if (Number.isFinite(an) && Number.isFinite(bn)) {
        result = an - bn;
      } else {
        result = normalizeText(av).localeCompare(normalizeText(bv), "zh-Hant", { numeric: true });
      }
      return sortDirection === "asc" ? result : -result;
    });
  }, [localRows, columnFilters, sortKey, sortDirection]);

  const selectedCount = selectedIds.size;
  const selectedRows = localRows.filter((row) => selectedIds.has(String(row.id)));
  const detailSummary = useMemo(() => {
    const sourceRows = selectedCount > 0 ? selectedRows : filteredSortedRows;
    return sourceRows.reduce(
      (summary, row) => ({
        quantity: summary.quantity + toNumber(row.quantity),
        productQuantity: summary.productQuantity + toNumber(getProductQuantity(row) as number | string | null | undefined),
        otQuantity: summary.otQuantity + toNumber(row.ot_quantity),
        midShiftCount: summary.midShiftCount + (row.is_mid_shift ? 1 : 0),
      }),
      { quantity: 0, productQuantity: 0, otQuantity: 0, midShiftCount: 0 },
    );
  }, [filteredSortedRows, selectedCount, selectedRows]);
  const activeBatchField = BATCH_FIELDS.find((field) => field.key === batchField);

  function handleColumnFilterChange(columnKey: string, selectedValues: Set<string> | null) {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (selectedValues === null) delete next[columnKey];
      else next[columnKey] = selectedValues;
      return next;
    });
  }

  function toggleSort(key: DetailColumnKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(filteredSortedRows.map((row) => String(row.id))) : new Set());
  }

  function toggleRow(id: number | string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(String(id));
      else next.delete(String(id));
      return next;
    });
  }

  async function commitRowUpdate(id: number | string, column: DetailColumn, value: CellValue) {
    setLocalRows((prev) => prev.map((row) => (String(row.id) === String(id) ? { ...row, [column.key]: value, is_modified: true } : row)));
    await onUpdateWorkLog(id, column, value);
  }

  async function applyBatchUpdate() {
    if (!batchField || selectedCount === 0) return;
    const updates: WorkLogUpdatePayload = { [batchField]: batchValue === "" ? null : batchValue };
    const ids = selectedRows.map((row) => row.id);
    setLocalRows((prev) => prev.map((row) => (selectedIds.has(String(row.id)) ? { ...row, ...updates, is_modified: true } : row)));
    await onBatchUpdateWorkLogs(ids, updates);
    setBatchValue("");
  }

  async function applyBatchDelete() {
    if (selectedCount === 0) return;
    const ids = selectedRows.map((row) => row.id);
    await onBatchDeleteWorkLogs(ids);
    setLocalRows((prev) => prev.filter((row) => !selectedIds.has(String(row.id))));
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-3">
      {selectedCount > 0 && !readOnly && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
          <div className="font-medium text-blue-900">已選取 {selectedCount} 筆，可批量修改共同欄位。</div>
          <label className="flex flex-col gap-1 text-xs text-blue-900">
            欄位
            <select value={batchField} onChange={(event) => { setBatchField(event.target.value); setBatchValue(""); }} className="rounded border border-blue-200 bg-white px-2 py-1 text-sm">
              {BATCH_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-blue-900">
            新值
            {activeBatchField?.type === "select" ? (
              <select value={batchValue} onChange={(event) => setBatchValue(event.target.value)} className="rounded border border-blue-200 bg-white px-2 py-1 text-sm">
                <option value="">請選擇</option>
                {activeBatchField.options?.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input value={batchValue} onChange={(event) => setBatchValue(event.target.value)} className="rounded border border-blue-200 bg-white px-2 py-1 text-sm" />
            )}
          </label>
          <button type="button" disabled={saving} onClick={() => void applyBatchUpdate()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">套用</button>
          <button type="button" disabled={saving} onClick={() => void applyBatchDelete()} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">批量刪除</button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded border border-blue-200 bg-white px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100">清除選取</button>
        </div>
      )}

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
          <span>數量：<span className="font-mono font-bold">{formatPlainNumber(detailSummary.quantity)}</span></span>
          <span className="text-blue-300">|</span>
          <span>商品數量：<span className="font-mono font-bold">{formatPlainNumber(detailSummary.productQuantity)}</span></span>
          <span className="text-blue-300">|</span>
          <span>OT：<span className="font-mono font-bold">{formatPlainNumber(detailSummary.otQuantity)}</span></span>
          <span className="text-blue-300">|</span>
          <span>中直：<span className="font-mono font-bold">{detailSummary.midShiftCount}</span></span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={filteredSortedRows.length > 0 && filteredSortedRows.every((row) => selectedIds.has(String(row.id)))}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              {DETAIL_COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-2 text-left align-top font-medium text-gray-700" style={{ minWidth: column.minWidth }}>
                  <div className="flex items-center justify-between gap-1">
                    <button type="button" onClick={() => toggleSort(column.key)} className="flex items-center gap-1 text-left hover:text-blue-700">
                      <span>{column.label}</span>
                      <span className="text-[10px] text-gray-400">{sortKey === column.key ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                    <ColumnFilter
                      columnKey={column.key}
                      data={filterRows}
                      activeFilters={columnFilters}
                      onFilterChange={handleColumnFilterChange}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredSortedRows.length === 0 ? (
              <tr><td colSpan={DETAIL_COLUMNS.length + 1} className="px-4 py-8 text-center text-gray-500">沒有符合條件的工作記錄。</td></tr>
            ) : filteredSortedRows.map((row) => (
              <tr key={String(row.id)} className={selectedIds.has(String(row.id)) ? "bg-blue-50" : "hover:bg-gray-50"}>
                <td className="sticky left-0 z-10 bg-inherit px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(String(row.id))}
                    onChange={(event) => toggleRow(row.id, event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                {DETAIL_COLUMNS.map((column) => (
                  <EditableDetailCell
                    key={column.key}
                    row={row}
                    column={column}
                    readOnly={readOnly || saving}
                    editingKey={editingKey}
                    setEditingKey={setEditingKey}
                    onCommit={commitRowUpdate}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupedTab({ groups, readOnly, onBillingTypeChange, onSetGroupRate, onSetGroupOtRate, onSetGroupMidShiftRate, onOpenRateCard }: { groups: GroupedSettlementRecord[]; readOnly: boolean; onBillingTypeChange: (group: GroupedSettlementRecord, billingType: BillingQuantityType) => Promise<void>; onSetGroupRate: (group: GroupedSettlementRecord) => Promise<void>; onSetGroupOtRate: (group: GroupedSettlementRecord) => Promise<void>; onSetGroupMidShiftRate: (group: GroupedSettlementRecord) => Promise<void>; onOpenRateCard: (source: RateCardSource) => void }) {
  if (groups.length === 0) return <div className="rounded-lg border border-gray-200 bg-gray-50 py-10 text-center text-gray-500">暫無歸組結算資料。</div>;

  const getGroupMidShiftCount = (group: GroupedSettlementRecord): number => {
    const explicitCount = [group.mid_shift, group.mid_shift_count, group.mid_shift_quantity].find((value) => value !== null && value !== undefined && value !== "");
    if (explicitCount !== undefined) return toNumber(explicitCount);
    if (typeof group.is_mid_shift === "boolean") return group.is_mid_shift ? 1 : 0;
    if (group.is_mid_shift !== null && group.is_mid_shift !== undefined && group.is_mid_shift !== "") return toNumber(group.is_mid_shift as number | string);
    const midShiftRate = toNumber(group.matched_mid_shift_rate);
    const midShiftAmount = toNumber(group.mid_shift_amount);
    if (midShiftRate > 0 && midShiftAmount > 0) return midShiftAmount / midShiftRate;
    return midShiftAmount > 0 ? 1 : 0;
  };

  const renderRateCell = (group: GroupedSettlementRecord, value: number | string | null | undefined, placeholder: string, onClick: () => Promise<void>) => {
    const canEditManualRate = (isUnmatched(group) || group.price_match_status === "manual") && !readOnly;
    if (!canEditManualRate) return formatMoney(value);
    return (
      <button type="button" onClick={onClick} className="font-medium text-primary-600 hover:underline">
        {asOptionalNumber(value) !== undefined ? formatMoney(value) : placeholder}
      </button>
    );
  };

  return (
    <div>
      <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
        可按每個歸組選擇計費數量類型。單位邏輯會按「天數 / 數量 / 商品數量」顯示對應數量與單位；未匹配或手動設定組合可手動設定單價、OT 價、中直價或加入價目表。
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1500px] text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">客戶 / 合約</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">工種</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">日/夜</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">路線</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">計費數量類型</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">計費數量</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">OT</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">中直</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">單價</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">OT價</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">中直價</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">金額</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">狀態</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const billingType = (group.billing_quantity_type || "days") as BillingQuantityType;
              const source = buildRateCardSourceFromGroup(group);
              return (
                <tr key={normalizeGroupKey(group)} className={`border-b hover:bg-gray-50 ${isUnmatched(group) ? "bg-amber-50/40" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{group.client_name || group.company_name || "-"}</div>
                    <div className="text-xs text-gray-500">{group.client_contract_no || group.contract_no || "-"}</div>
                  </td>
                  <td className="px-3 py-2">{group.service_type || "-"}</td>
                  <td className="px-3 py-2 text-center">{group.day_night || "-"}</td>
                  <td className="px-3 py-2 text-gray-600">{routeOf(group)}</td>
                  <td className="px-3 py-2">
                    <select disabled={readOnly} value={billingType} onChange={(e) => onBillingTypeChange(group, e.target.value as BillingQuantityType)} className="input h-8 min-w-[120px] px-2 py-1 text-sm">
                      <option value="days">天數</option>
                      <option value="quantity">數量</option>
                      <option value="product_quantity">商品數量</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatPlainNumber(groupBillingQuantity(group))} {groupBillingUnit(group)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPlainNumber(group.ot_quantity)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPlainNumber(getGroupMidShiftCount(group))}</td>
                  <td className="px-3 py-2 text-right font-mono">{renderRateCell(group, group.matched_rate, "輸入單價", () => onSetGroupRate(group))}</td>
                  <td className="px-3 py-2 text-right font-mono">{renderRateCell(group, group.matched_ot_rate, "輸入OT價", () => onSetGroupOtRate(group))}</td>
                  <td className="px-3 py-2 text-right font-mono">{renderRateCell(group, group.matched_mid_shift_rate, "輸入中直價", () => onSetGroupMidShiftRate(group))}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-primary-600">{formatMoney(group.total_amount ?? group.amount)}</td>
                  <td className="px-3 py-2 text-xs">{group.price_match_status === "manual" ? <span className="text-blue-700">手動設定</span> : isUnmatched(group) ? <span className="text-amber-700">{group.price_match_note || "未匹配"}</span> : <span className="text-green-700">已匹配</span>}</td>
                  <td className="px-3 py-2 text-center"><button type="button" disabled={readOnly} onClick={() => onOpenRateCard(source)} className="text-xs font-medium text-primary-600 hover:underline">加入價目表</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function dateOnly(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isAdjustmentOnDate(adjustment: Adjustment, date: string | null | undefined): boolean {
  const adjustmentDate = dateOnly(adjustment.adjustment_date);
  return Boolean(adjustmentDate && date && adjustmentDate === dateOnly(date));
}

function DailyTab({ days, allowanceOptions, adjustments, expandedDay, readOnly, onToggleExpand, onAddAllowance, onRemoveAllowance, onAddAdjustment, onRemoveAdjustment, onExcludeBadge, onRestoreBadge, onSaveTopUpOverride }: { days: DailyCalculationRecord[]; allowanceOptions: AllowanceOption[]; adjustments: Adjustment[]; expandedDay: string | null; readOnly: boolean; onToggleExpand: (date: string) => void; onAddAllowance: (date: string, option: AllowanceOption) => Promise<void>; onRemoveAllowance: (id: number | string) => Promise<void>; onAddAdjustment: (date: string, item: { item_name: string; amount: number }) => Promise<void>; onRemoveAdjustment: (id: number | string) => Promise<void>; onExcludeBadge: (date: string, badgeKey: string) => Promise<void>; onRestoreBadge: (date: string, badgeKey: string) => Promise<void>; onSaveTopUpOverride: (date: string) => Promise<void> }) {
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [selectedAllowance, setSelectedAllowance] = useState("");
  const [customAllowanceName, setCustomAllowanceName] = useState("");
  const [customAllowanceAmount, setCustomAllowanceAmount] = useState("");

  if (days.length === 0) return <div className="rounded-lg border border-gray-200 bg-gray-50 py-10 text-center text-gray-500">暫無逐日計算資料。</div>;

  const tableColumnCount = 8;
  const workDayCount = days.reduce((sum, day) => {
    const logs = day.work_logs || day.logs || [];
    if (logs.length === 0) return sum;
    const dayQ = day.day_quantity != null ? day.day_quantity : 1;
    const nightQ = day.night_quantity != null ? day.night_quantity : 0;
    return sum + Math.min(dayQ + nightQ, 1);
  }, 0);
  const topUpDayCount = days.reduce((sum, day) => {
    if (getDailyTopUpAmount(day) <= 0) return sum;
    const dayQ = day.day_quantity != null ? day.day_quantity : 1;
    const nightQ = day.night_quantity != null ? day.night_quantity : 0;
    return sum + Math.min(dayQ + nightQ, 1);
  }, 0);
  const totalTopUp = days.reduce((sum, day) => sum + getDailyTopUpAmount(day), 0);
  const leaveDayCount = days.filter((day) => isLeaveDay(day)).length;
  const totalAllowances = days.reduce((sum, day) => sum + getDailyAllowanceTotal(day), 0);
  const grandTotal = days.reduce((sum, day) => sum + getDailyTotal(day), 0);

  function resetAllowanceForm() {
    setAddingDate(null);
    setSelectedAllowance("");
    setCustomAllowanceName("");
    setCustomAllowanceAmount("");
  }

  function optionValue(option: AllowanceOption, index: number) {
    return option.allowance_key || option.key || `${getAllowanceOptionLabel(option)}-${index}`;
  }

  async function submitAllowance(date: string) {
    if (!date || readOnly) return;
    if (selectedAllowance === "__custom__") {
      const name = customAllowanceName.trim();
      const amount = Number(customAllowanceAmount);
      if (!name) {
        alert("請輸入自定義津貼名稱");
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        alert("請輸入有效自定義津貼金額");
        return;
      }
      await onAddAdjustment(date, { item_name: name, amount });
      resetAllowanceForm();
      return;
    }

    const option = allowanceOptions.find((item, index) => optionValue(item, index) === selectedAllowance);
    if (!option) return;
    await onAddAllowance(date, option);
    resetAllowanceForm();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <DailySummaryItem label="工作天數" value={`${formatPlainNumber(workDayCount)}天`} />
        <DailySummaryItem label="需補底薪天數" value={`${formatPlainNumber(topUpDayCount)}天`} valueClassName="text-orange-600" />
        <DailySummaryItem label="補底薪合計" value={formatCompactMoney(totalTopUp)} valueClassName="text-orange-600" />
        <DailySummaryItem label="休假天數" value={`${leaveDayCount}天`} valueClassName="text-gray-600" />
        <DailySummaryItem label="每日津貼合計" value={formatCompactMoney(totalAllowances)} valueClassName="text-blue-600" />
        <DailySummaryItem label="逐日合計" value={formatCompactMoney(grandTotal)} valueClassName="text-primary-600" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-8 px-3 py-2 text-left font-medium text-gray-600"></th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">工作收入</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">OT/中直</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">補底薪差額</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">每日津貼</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">當日合計</th>
              <th className="w-24 px-3 py-2 text-center font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, index) => {
              const rowDate = day.date || `day-${index}`;
              const workLogs = day.work_logs || day.logs || [];
              const topUp = getDailyTopUpAmount(day);
              const baseWorkIncome = getDailyBaseWorkIncome(day);
              const dailyOt = toNumber(day.daily_ot_amount);
              const dailyMidShift = toNumber(day.daily_mid_shift_amount);
              const otMidShiftLabel = formatDailyOtMidShift({
                otAmount: dailyOt,
                midShiftAmount: dailyMidShift,
              });
              const isExpanded = expandedDay === rowDate;
              const isAdding = addingDate === rowDate;
              const rowTone = day.special_label ? "bg-green-50" : topUp > 0 ? "bg-orange-50" : index % 2 === 0 ? "bg-white" : "bg-gray-50/60";
              const datedAdjustments = adjustments.filter((adjustment) => isAdjustmentOnDate(adjustment, day.date));
              const holidayName = getDailyHolidayName(day);
              const restDayLabel = !day.is_holiday ? day.special_label : null;
              const isLeave = isLeaveDay(day);
              const statutoryHolidayBadgeKey = getStatutoryHolidayBadgeKey(day);
              const canRestoreHolidayAllowance = Boolean(
                !readOnly &&
                day.date &&
                holidayName &&
                statutoryHolidayBadgeKey &&
                isDailyBadgeExcluded(day, statutoryHolidayBadgeKey),
              );

              return (
                <Fragment key={rowDate}>
                  <tr className={`border-b border-gray-200 ${rowTone} hover:bg-blue-50/40`}>
                    <td className="px-3 py-2 text-center align-middle">
                      <button type="button" onClick={() => onToggleExpand(rowDate)} className="text-gray-400 hover:text-gray-700" aria-label={isExpanded ? "收起詳情" : "展開詳情"}>
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-middle font-medium text-gray-900">
                      <div className="flex flex-wrap items-center gap-1">
                        <span>{displayDate(day.date)}</span>
                        {day.weekday && <span className="text-xs text-gray-400">({day.weekday})</span>}
                        {!day.weekday && day.date && <span className="text-xs text-gray-400">({getWeekdayLabel(day.date)})</span>}
                        {workLogs.length >= 1 && <span className="text-xs font-bold text-blue-600">({workLogs.length}筆)</span>}
                        {workLogs.length >= 1 && day.day_quantity !== undefined && day.day_quantity < 1 && <span className="text-xs font-bold text-amber-600">({day.day_quantity}天)</span>}
                        {day.is_holiday && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">法定假期</span>}
                        {holidayName && (
                          <SpecialDateBadge
                            label={holidayName}
                            clickable={canRestoreHolidayAllowance}
                            title={canRestoreHolidayAllowance ? "點擊還原法定假期津貼" : undefined}
                            onClick={day.date ? () => onRestoreBadge(day.date || "", statutoryHolidayBadgeKey) : undefined}
                          />
                        )}
                        {restDayLabel && <SpecialDateBadge label={restDayLabel} />}
                        {isLeave && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">休假</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-middle font-mono">{formatCompactMoney(baseWorkIncome)}</td>
                    <td className="px-3 py-2 text-center align-middle font-mono text-xs">
                      {otMidShiftLabel || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right align-middle font-mono">
                      {topUp > 0 || day.is_top_up_overridden ? (
                        <button type="button" disabled={readOnly || !day.date} onClick={() => day.date && onSaveTopUpOverride(day.date)} className={`${day.is_top_up_overridden ? "text-blue-600" : "text-orange-600"} font-bold ${readOnly ? "cursor-default" : "hover:underline"}`} title={!readOnly ? "點擊編輯補底薪差額" : undefined}>
                          {topUp > 0 ? `+${formatCompactMoney(topUp)}` : formatCompactMoney(0)}
                          {day.is_top_up_overridden && <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-700">覆蓋</span>}
                        </button>
                      ) : (
                        <button type="button" disabled={readOnly || !day.date} onClick={() => day.date && onSaveTopUpOverride(day.date)} className={`${readOnly ? "cursor-default" : "hover:text-blue-500"} text-gray-300`} title={!readOnly ? "點擊設定手動補底薪差額" : undefined}>—</button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center align-middle">
                      <DailyAllowanceBadges day={day} adjustments={datedAdjustments} readOnly={readOnly} onRemoveAllowance={onRemoveAllowance} onRemoveAdjustment={onRemoveAdjustment} onExcludeBadge={onExcludeBadge} />
                    </td>
                    <td className="px-3 py-2 text-right align-middle font-mono font-bold text-gray-900">{formatCompactMoney(getDailyTotal(day))}</td>
                    <td className="px-3 py-2 text-center align-middle">
                      <div className="relative inline-block text-left">
                        <button type="button" disabled={readOnly || !day.date} onClick={() => { if (isAdding) resetAllowanceForm(); else { setAddingDate(rowDate); setSelectedAllowance(""); setCustomAllowanceName(""); setCustomAllowanceAmount(""); } }} className="rounded border border-primary-200 bg-white px-2.5 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50">
                          {isAdding ? "取消" : "+ 津貼"}
                        </button>
                        {isAdding && day.date && (
                          <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg">
                            <label className="mb-1 block text-xs font-medium text-gray-600">選擇津貼類型</label>
                            <select value={selectedAllowance} onChange={(event) => setSelectedAllowance(event.target.value)} className="input h-8 w-full px-2 py-1 text-xs">
                              <option value="">請選擇</option>
                              {allowanceOptions.map((option, optionIndex) => <option key={optionValue(option, optionIndex)} value={optionValue(option, optionIndex)}>{getAllowanceOptionLabel(option)}</option>)}
                              <option value="__custom__">自定義津貼</option>
                            </select>
                            {selectedAllowance === "__custom__" && (
                              <div className="mt-2 grid grid-cols-[1fr_96px] gap-2">
                                <input type="text" value={customAllowanceName} onChange={(event) => setCustomAllowanceName(event.target.value)} placeholder="津貼名稱" className="input h-8 px-2 py-1 text-xs" />
                                <input type="number" min="0" step="0.01" value={customAllowanceAmount} onChange={(event) => setCustomAllowanceAmount(event.target.value)} placeholder="金額" className="input h-8 px-2 py-1 text-right text-xs" />
                              </div>
                            )}
                            <div className="mt-3 flex justify-end gap-2">
                              <button type="button" onClick={resetAllowanceForm} className="btn-secondary px-3 py-1 text-xs">取消</button>
                              <button type="button" disabled={!selectedAllowance} onClick={() => void submitAllowance(day.date || "")} className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">新增</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-gray-200 bg-blue-50">
                      <td colSpan={tableColumnCount} className="px-6 py-3">
                        <DailyWorkLogDetails workLogs={workLogs} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-900">
            <tr className="bg-gray-50">
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-left font-bold">小計</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">{formatCompactMoney(days.reduce((sum, day) => sum + getDailyBaseWorkIncome(day), 0))}</td>
              <td className="px-3 py-2 text-center font-mono font-bold text-gray-900">{formatCompactMoney(days.reduce((sum, day) => sum + getDailyOtMidShiftTotals(day).otAmount + getDailyOtMidShiftTotals(day).midShiftAmount, 0))}</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">{formatCompactMoney(totalTopUp)}</td>
              <td className="px-3 py-2 text-center font-mono font-bold text-gray-900">{formatCompactMoney(totalAllowances)}</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-primary-600">{formatCompactMoney(grandTotal)}</td>
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function formatCompactMoney(value: number | string | null | undefined): string {
  const amount = toNumber(value);
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function getWeekdayLabel(date: string): string {
  const weekday = new Date(`${date.slice(0, 10)}T00:00:00`).getDay();
  return ["日", "一", "二", "三", "四", "五", "六"][weekday] || "";
}

function getDailyHolidayName(day: DailyCalculationRecord): string | null {
  const label = day.holiday_name || day.special_label || null;
  if (!day.is_holiday || !label) return null;
  return label;
}

function getStatutoryHolidayBadgeKey(day: DailyCalculationRecord): string {
  const date = dateOnly(day.date);
  return date ? `statutory_holiday_${date}` : "statutory_holiday";
}

function isDailyBadgeExcluded(day: DailyCalculationRecord, badgeKey: string): boolean {
  const excludedKey = `excluded_${badgeKey}`;
  const allowances = day.daily_allowances || day.allowances || [];
  return allowances.some((allowance) => (allowance.allowance_key || allowance.key) === excludedKey);
}

function isExcludedAllowance(allowance: DailyAllowance): boolean {
  const key = allowance.allowance_key || allowance.key || "";
  return key.startsWith("excluded_");
}

function isRestDay(day: DailyCalculationRecord): boolean {
  return !day.is_holiday && Boolean(day.special_label?.includes("休息日"));
}

function isLeaveDay(day: DailyCalculationRecord): boolean {
  if (day.is_holiday || isRestDay(day)) return false;

  const workLogs = day.work_logs || day.logs || [];
  return workLogs.length === 0;
}

function SpecialDateBadge({ label, clickable = false, title, onClick }: { label: string; clickable?: boolean; title?: string; onClick?: () => void }) {
  const className = `rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700 ${clickable ? "cursor-pointer border border-green-300 hover:bg-green-200 hover:text-green-800" : ""}`;

  if (clickable && onClick) {
    return (
      <button type="button" onClick={onClick} className={className} title={title}>
        {label}<span className="ml-1 text-[10px]">+</span>
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

function getDailyTopUpAmount(day: DailyCalculationRecord): number {
  return toNumber(day.base_top_up ?? day.base_top_up_amount);
}

function getDailyAllowanceTotal(day: DailyCalculationRecord): number {
  if (day.daily_allowance_total !== null && day.daily_allowance_total !== undefined) return toNumber(day.daily_allowance_total);
  if (day.allowance_total !== null && day.allowance_total !== undefined) return toNumber(day.allowance_total);
  const allowances = day.daily_allowances || day.allowances || [];
  const badges = day.allowance_badges || day.badges || [];
  const fixedAllowances = day.fixed_allowances_per_day || [];
  return allowances.reduce((sum, allowance) => sum + toNumber(allowance.amount), 0)
    + badges.reduce((sum, badge) => sum + toNumber(badge.amount), 0)
    + fixedAllowances.reduce((sum, allowance) => sum + toNumber(allowance.amount), 0);
}

function getWorkLogOtAmount(row: WorkLogRecord): number {
  const salaryAmount = toNumber(row.salary_ot_amount);
  if (salaryAmount > 0) return salaryAmount;
  const explicitAmount = toNumber(row.ot_line_amount);
  if (explicitAmount > 0) return explicitAmount;
  return toNumber(row.matched_ot_rate) * toNumber(row.ot_quantity);
}

function getWorkLogMidShiftAmount(row: WorkLogRecord): number {
  const salaryAmount = toNumber(row.salary_mid_shift_amount);
  if (salaryAmount > 0) return salaryAmount;
  const explicitAmount = toNumber(row.mid_shift_line_amount);
  if (explicitAmount > 0) return explicitAmount;
  return row.is_mid_shift ? toNumber(row.matched_mid_shift_rate) : 0;
}

function getDailyOtMidShiftTotals(day: DailyCalculationRecord): { otAmount: number; midShiftAmount: number } {
  if (day.daily_ot_amount !== null && day.daily_ot_amount !== undefined
    || day.daily_mid_shift_amount !== null && day.daily_mid_shift_amount !== undefined) {
    return {
      otAmount: toNumber(day.daily_ot_amount),
      midShiftAmount: toNumber(day.daily_mid_shift_amount),
    };
  }
  const workLogs = day.work_logs || day.logs || [];
  return workLogs.reduce(
    (totals, row) => ({
      otAmount: totals.otAmount + getWorkLogOtAmount(row),
      midShiftAmount: totals.midShiftAmount + getWorkLogMidShiftAmount(row),
    }),
    { otAmount: 0, midShiftAmount: 0 },
  );
}

function formatDailyOtMidShift(totals: { otAmount: number; midShiftAmount: number }): string {
  return [
    totals.otAmount > 0 ? `OT ${formatCompactMoney(totals.otAmount)}` : "",
    totals.midShiftAmount > 0 ? `中直 ${formatCompactMoney(totals.midShiftAmount)}` : "",
  ].filter(Boolean).join(" / ");
}

function getDailyBaseWorkIncome(day: DailyCalculationRecord): number {
  const workLogs = day.work_logs || day.logs || [];
  if (workLogs.length === 0) return toNumber(day.base_amount);
  return workLogs.reduce((sum, row) => {
    const baseAmount = toNumber(row.base_line_amount);
    if (baseAmount > 0) return sum + baseAmount;
    const lineAmount = toNumber(row.line_amount ?? row.amount);
    return sum + Math.max(0, lineAmount - getWorkLogOtAmount(row) - getWorkLogMidShiftAmount(row));
  }, 0);
}

function getDailyTotal(day: DailyCalculationRecord): number {
  if (day.day_total !== null && day.day_total !== undefined) return toNumber(day.day_total);
  if (day.total_amount !== null && day.total_amount !== undefined) return toNumber(day.total_amount);
  const otMidShiftTotals = getDailyOtMidShiftTotals(day);
  return getDailyBaseWorkIncome(day) + otMidShiftTotals.otAmount + otMidShiftTotals.midShiftAmount + getDailyTopUpAmount(day) + getDailyAllowanceTotal(day);
}

function DailySummaryItem({ label, value, valueClassName = "text-gray-900" }: { label: string; value: string; valueClassName?: string }) {
  return <div><span className="text-gray-500">{label}：</span><span className={`font-bold ${valueClassName}`}>{value}</span></div>;
}

function getAllowanceBadgeClass(key: string, label: string, className?: string): string {
  if (className) return className;
  const text = `${key} ${label}`.toLowerCase();
  if (text.includes("法定") || text.includes("假日") || text.includes("holiday")) return "bg-amber-100 text-amber-700 border-amber-200";
  if (text.includes("租車") || text.includes("rent")) return "bg-green-100 text-green-700 border-green-200";
  if (text.includes("ot") || text.includes("中直") || text.includes("mid")) return "bg-purple-100 text-purple-700 border-purple-200";
  if (text.includes("夜班") || text.includes("night")) return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

function DailyAllowanceBadges({ day, adjustments, readOnly, onRemoveAllowance, onRemoveAdjustment, onExcludeBadge }: { day: DailyCalculationRecord; adjustments: Adjustment[]; readOnly: boolean; onRemoveAllowance: (id: number | string) => Promise<void>; onRemoveAdjustment: (id: number | string) => Promise<void>; onExcludeBadge: (date: string, badgeKey: string) => Promise<void> }) {
  const badges = day.allowance_badges || day.badges || [];
  const allowances = (day.daily_allowances || day.allowances || []).filter((allowance) => !isExcludedAllowance(allowance));
  const fixedAllowances = (day as any).fixed_allowances_per_day || [];

  if (badges.length === 0 && allowances.length === 0 && fixedAllowances.length === 0 && adjustments.length === 0) return <span className="text-gray-300">—</span>;

  return (
    <div className="flex flex-wrap justify-center gap-1">
      {badges.map((badge, index) => {
        const badgeKey = badge.badge_key || badge.key || String(index);
        const label = badge.label || badge.name || "津貼";
        const labelText = typeof label === "string" || typeof label === "number" ? String(label) : badge.name || badgeKey;
        return (
          <span key={`badge-${badgeKey}`} className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs ${getAllowanceBadgeClass(badgeKey, labelText, badge.className)}`}>
            {label} {badge.amount !== undefined && formatCompactMoney(badge.amount)}
            {!readOnly && badge.removable && day.date && <button type="button" onClick={() => onExcludeBadge(day.date || "", badgeKey)} className="ml-0.5 font-bold text-current opacity-60 hover:text-red-500 hover:opacity-100">×</button>}
          </span>
        );
      })}
      {allowances.map((allowance, index) => {
        const allowanceKey = allowance.allowance_key || allowance.key || String(index);
        const label = allowance.allowance_name || allowance.name || "津貼";
        return (
          <span key={`allowance-${allowance.id || allowanceKey}-${index}`} className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs ${getAllowanceBadgeClass(allowanceKey, label)}`}>
            {label} {formatCompactMoney(allowance.amount)}
            {!readOnly && allowance.id && <button type="button" onClick={() => onRemoveAllowance(allowance.id as number | string)} className="ml-0.5 font-bold text-current opacity-60 hover:text-red-500 hover:opacity-100">×</button>}
          </span>
        );
      })}
      {fixedAllowances.map((item: any, index: number) => (
        <span key={`fixed-${item.key || index}`} className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs bg-green-100 text-green-700 border-green-200">
          {item.name || item.key || "固定津貼"} {formatCompactMoney(item.amount)}
          {!readOnly && day.date && item.key && <button type="button" onClick={() => onExcludeBadge(day.date || "", item.key)} className="ml-0.5 font-bold text-current opacity-60 hover:text-red-500 hover:opacity-100">×</button>}
        </span>
      ))}
      {adjustments.map((adjustment, index) => {
        const label = adjustment.item_name || "自定義津貼";
        return (
          <span key={`adjustment-${adjustment.id || index}`} className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs ${getAllowanceBadgeClass("custom_allowance", label)}`}>
            {label} {formatCompactMoney(adjustment.amount)}
            {!readOnly && adjustment.id && <button type="button" onClick={() => onRemoveAdjustment(adjustment.id as number | string)} className="ml-0.5 font-bold text-current opacity-60 hover:text-red-500 hover:opacity-100">×</button>}
          </span>
        );
      })}
    </div>
  );
}

function DailyWorkLogDetails({ workLogs }: { workLogs: WorkLogRecord[] }) {
  if (workLogs.length === 0) return <div className="py-2 text-center text-xs text-gray-500">本日沒有工作記錄。</div>;

  return (
    <div className="space-y-2 text-xs">
      {workLogs.map((row, index) => {
        const route = routeOf(row);
        const equipment = [row.tonnage, row.machine_type, row.equipment_number].filter(Boolean).join("");
        const clientShortName = row.client_short_name || (row.client_name ? row.client_name.substring(0, 4) : "");
        const description = [row.service_type, clientShortName, row.client_contract_no, route !== "-" ? route : "", equipment ? `(${equipment})` : "", row.day_night || "日", toNumber(row.ot_quantity) > 0 ? "OT" : "", row.is_mid_shift ? "中直" : ""].filter(Boolean).join(" ");
        const billingType = row.billing_quantity_type || "quantity";
        const productUnit = row.product_unit || row.payroll_work_log_product_unit || row.matched_unit || "商品";
        const tripQuantity = toNumber(row.quantity) || 1;
        const productQuantity = toNumber(getProductQuantity(row) as number | string | null | undefined);
        const basicBillingQuantity = billingType === "product_quantity" ? productQuantity : tripQuantity;
        const normalBillingUnit = billingType === "days" ? "天" : row.unit || "車";
        const baseAmount = row.base_line_amount ?? (row.matched_rate ? toNumber(row.matched_rate) * basicBillingQuantity : 0);
        const basicDetail = billingType === "product_quantity"
          ? `${formatCompactMoney(row.matched_rate)}/${productUnit} × ${formatPlainNumber(productQuantity)}${productUnit} (${formatPlainNumber(tripQuantity)}車) = ${formatCompactMoney(baseAmount)}`
          : `${formatCompactMoney(row.matched_rate)} × ${formatPlainNumber(tripQuantity)} ${normalBillingUnit} = ${formatCompactMoney(baseAmount)}`;
        const otAmount = row.ot_line_amount ?? (row.matched_ot_rate && row.ot_quantity ? toNumber(row.matched_ot_rate) * toNumber(row.ot_quantity) : 0);
        const midShiftAmount = row.mid_shift_line_amount ?? (row.is_mid_shift && row.matched_mid_shift_rate ? toNumber(row.matched_mid_shift_rate) : 0);

        return (
          <div key={row.id || index} className="border-b border-gray-200 py-1 last:border-0">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium text-gray-700">{description || "—"}</span>
              <span className="font-mono font-bold text-primary-600">{formatCompactMoney(row.line_amount ?? row.amount)}</span>
            </div>
            {row.matched_rate && (
              <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-gray-500">
                <span>基本：{basicDetail}</span>
                {toNumber(row.ot_quantity) > 0 && <span>OT：{row.matched_ot_rate ? formatCompactMoney(row.matched_ot_rate) : "未設定"} × {formatPlainNumber(row.ot_quantity)} = {formatCompactMoney(otAmount)}</span>}
                {row.is_mid_shift && <span>中直：{row.matched_mid_shift_rate ? formatCompactMoney(row.matched_mid_shift_rate) : "未設定"} = {formatCompactMoney(midShiftAmount)}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DailyMetricValue({ label, value, sub, strong, action }: { label: string; value: string; sub?: string; strong?: boolean; action?: () => void }) {
  return (
    <button type="button" onClick={action} disabled={!action} aria-label={label} title={label} className={`rounded-lg bg-gray-50 px-3 py-2 text-right ${action ? "hover:bg-primary-50" : "cursor-default"}`}>
      <span className="sr-only">{label}</span>
      <div className={`font-mono ${strong ? "font-bold text-primary-700" : "font-semibold text-gray-900"}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </button>
  );
}

function UnmatchedTab({ groups, readOnly, onOpenRateCard }: { groups: UnmatchedGroup[]; readOnly: boolean; onOpenRateCard: (source: RateCardSource) => void }) {
  if (groups.length === 0) return <div className="rounded-lg border border-green-100 bg-green-50 py-10 text-center text-green-700">所有工作記錄已成功匹配價目。</div>;
  return <div><div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">以下工作記錄未能自動匹配價目。可直接將組合加入價目表，重新計算後相關分頁會同步更新。</div><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[980px] text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">客戶</th><th className="px-3 py-2 text-left">合約</th><th className="px-3 py-2 text-center">日/夜</th><th className="px-3 py-2 text-left">路線</th><th className="px-3 py-2 text-right">數量</th><th className="px-3 py-2 text-right">筆數</th><th className="px-3 py-2 text-left">原因</th><th className="px-3 py-2 text-center">操作</th></tr></thead><tbody>{groups.map((group) => <tr key={group.key} className="border-b hover:bg-amber-50/50"><td className="px-3 py-2 font-medium">{group.clientName}</td><td className="px-3 py-2 text-gray-600">{group.contractNo}</td><td className="px-3 py-2 text-center">{group.dayNight}</td><td className="px-3 py-2 text-gray-600">{group.route}</td><td className="px-3 py-2 text-right font-mono">{group.quantity.toLocaleString()} {group.unit}</td><td className="px-3 py-2 text-right font-mono">{group.count}</td><td className="px-3 py-2 text-xs text-amber-700">{group.reason}</td><td className="px-3 py-2 text-center"><button type="button" disabled={readOnly} onClick={() => onOpenRateCard(group.source)} className="text-xs font-medium text-primary-600 hover:underline">加入價目表</button></td></tr>)}</tbody></table></div></div>;
}

function CalculationTab({ calculation, snapshot, salarySetting, workLogs = [], dailyCalculation = [], payrollId, readOnly = false, onItemUpdated }: { calculation: CalculationDetails; snapshot?: PayrollSnapshot | null; salarySetting?: SalarySetting | null; workLogs?: WorkLogRecord[]; dailyCalculation?: DailyCalculationRecord[]; payrollId?: number; readOnly?: boolean; onItemUpdated?: () => Promise<void> }) {
  const summary = { ...calculation.payroll_summary } || {};
  const items = calculation.items || [];
  const salaryItems = buildSalarySettingDisplayItems(salarySetting, calculation.mpf_plan);
  const adjustments = calculation.adjustments || snapshot?.adjustments || [];
  const payrollExpenses = snapshot?.payroll_expenses || [];
  const workSummary = buildCalculationWorkSummary(workLogs, dailyCalculation);

  // 計算應付總額
  const netAmount = toNumber(summary.net_amount);
  const reimbursement = toNumber(summary.reimbursement_total);
  const pettyCashDeducted = toNumber(summary.petty_cash_deducted ?? snapshot?.petty_cash_deducted);
  const totalPayable = netAmount + reimbursement - pettyCashDeducted;
  
  const displaySummary = {
    gross_amount: summary.gross_amount,
    adjustment_total: summary.adjustment_total,
    deduction_total: summary.deduction_total,
    mpf_employer: summary.mpf_employer ?? snapshot?.mpf_employer,
    net_amount: summary.net_amount,
    reimbursement_total: summary.reimbursement_total,
    petty_cash_deducted: pettyCashDeducted,
    total_payable: totalPayable,
  };

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
        <div className="mb-1 font-semibold text-gray-900">薪酬設定</div>
        {salaryItems.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {salaryItems.map((item, index) => (
              <Fragment key={`${item.label}-${index}`}>
                <span className="whitespace-nowrap"><span className="text-gray-500">{item.label}：</span><span className="font-medium text-gray-900">{item.value}</span></span>
                {index < salaryItems.length - 1 && <span className="hidden text-gray-300 sm:inline">|</span>}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="text-gray-500">暫無薪酬設定資料。</div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-bold text-gray-900">工作摘要</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryPill label="工作天數" value={`${workSummary.workDays}天`} tone="blue" />
          <SummaryPill label="休假天數" value={`${workSummary.leaveDays}天`} tone="gray" />
          <SummaryPill label="OT小時" value={`${workSummary.otCount}小時${workSummary.totalOtQuantity > 0 ? ` / ${formatPlainNumber(workSummary.totalOtQuantity)}` : ""}`} tone="amber" />
          <SummaryPill label="中直小時" value={`${workSummary.midShiftCount}小時`} tone="green" />
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-bold text-gray-900">糧單摘要</h3>
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {Object.entries(displaySummary).map(([key, value]) => {
            if (value === undefined && key !== 'total_payable') return null;
            return (
              <SummaryPill 
                key={key} 
                label={SUMMARY_LABELS[key] || key} 
                value={formatMoney(value)} 
                tone={key === "total_payable" ? "green" : key === "net_amount" ? "blue" : "gray"} 
              />
            );
          })}
        </div>
      </section>
      <PayrollItemsGroupedTable items={items} adjustments={adjustments} payrollExpenses={payrollExpenses} summary={displaySummary} mpfPlan={calculation.mpf_plan || salarySetting?.mpf_plan || snapshot?.mpf_plan || null} payrollId={payrollId} readOnly={readOnly} onItemUpdated={onItemUpdated} />
    </div>
  );
}

type SalarySettingDisplayItem = { label: string; value: string };

function buildSalarySettingDisplayItems(salarySetting: SalarySetting | null | undefined, calculationMpfPlan?: string | null): SalarySettingDisplayItem[] {
  if (!salarySetting) return [];

  const items: SalarySettingDisplayItem[] = [];
  const salaryType = salarySetting.is_piece_rate ? "piece_rate" : normalizeSettingText(salarySetting.salary_type);
  const baseSalaryDay = getSettingNumber(salarySetting, "base_salary_day", "base_salary");
  const baseSalaryNight = getSettingNumber(salarySetting, "base_salary_night");

  items.push({ label: "薪酬類型", value: salaryType ? (SALARY_TYPE_LABELS[salaryType] || salaryType) : "—" });
  items.push({ label: "底薪(日)", value: formatCompactMoney(baseSalaryDay) });
  items.push({ label: "底薪(夜)", value: baseSalaryNight > 0 ? formatCompactMoney(baseSalaryNight) : "跟日薪" });

  for (const [key, label] of SALARY_SETTING_ALLOWANCE_FIELDS) {
    const amount = getSettingNumber(salarySetting, key);
    if (amount !== 0) items.push({ label, value: formatCompactMoney(amount) });
  }

  for (const item of getCustomAllowanceDisplayItems(salarySetting.custom_allowances)) {
    items.push(item);
  }

  for (const [key, label] of SALARY_SETTING_OT_FIELDS) {
    const amount = getSettingNumber(salarySetting, key);
    if (amount !== 0) items.push({ label, value: formatCompactMoney(amount) });
  }

  const mpfPlan = normalizeSettingText(salarySetting.mpf_plan) || normalizeSettingText(calculationMpfPlan);
  if (mpfPlan) items.push({ label: "強積金計劃", value: MPF_PLAN_LABELS[mpfPlan] || mpfPlan });

  return items;
}

function getSettingNumber(setting: SalarySetting, ...keys: string[]): number {
  for (const key of keys) {
    const value = setting[key];
    if (value !== null && value !== undefined && value !== "") return toNumber(value as number | string | null | undefined);
  }
  return 0;
}

function normalizeSettingText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getCustomAllowanceDisplayItems(customAllowances: unknown): SalarySettingDisplayItem[] {
  if (!customAllowances || typeof customAllowances !== "object") return [];

  if (Array.isArray(customAllowances)) {
    return customAllowances.flatMap((allowance, index) => {
      if (!allowance || typeof allowance !== "object") return [];
      const record = allowance as Record<string, unknown>;
      const amount = toNumber(record.amount as number | string | null | undefined);
      if (amount === 0) return [];
      const label = normalizeSettingText(record.name) || normalizeSettingText(record.label) || `自定義津貼${index + 1}`;
      return [{ label, value: formatCompactMoney(amount) }];
    });
  }

  return Object.entries(customAllowances as Record<string, unknown>).flatMap(([key, value]) => {
    const amount = toNumber(value as number | string | null | undefined);
    if (amount === 0) return [];
    return [{ label: ALLOWANCE_LABELS[key] || key, value: formatCompactMoney(amount) }];
  });
}

function buildCalculationWorkSummary(workLogs: WorkLogRecord[], dailyCalculation: DailyCalculationRecord[]) {
  const activeRows = workLogs.filter((row) => !row.is_excluded);
  const workDates = new Set(activeRows.map((row) => dateOnly(row.scheduled_date)).filter(Boolean));
  const dailyWorkDays = dailyCalculation.reduce((sum, day) => {
    const logs = day.work_logs || day.logs || [];
    if (logs.length === 0) return sum;
    const dayQ = day.day_quantity != null ? day.day_quantity : 1;
    const nightQ = day.night_quantity != null ? day.night_quantity : 0;
    return sum + Math.min(dayQ + nightQ, 1);
  }, 0);
  const otRows = activeRows.filter((row) => toNumber(row.ot_quantity) > 0);
  const midShiftRows = activeRows.filter((row) => Boolean(row.is_mid_shift) || normalizeSettingText(row.day_night).includes("中直"));

  return {
    workDays: dailyWorkDays || workDates.size,
    leaveDays: dailyCalculation.filter((day) => isLeaveDay(day)).length,
    otCount: otRows.length,
    totalOtQuantity: otRows.reduce((sum, row) => sum + toNumber(row.ot_quantity), 0),
    midShiftCount: midShiftRows.length,
  };
}


function getPayrollItemTypeLabel(type: string | null | undefined): string {
  if (type === "base_salary") return "底薪";
  if (type === "allowance") return "津貼";
  if (type === "ot") return "OT";
  if (type === "mpf_deduction") return "強積金";
  return type || "—";
}

function getMpfPlanShortLabel(plan: string | null | undefined): string {
  if (plan === "industry") return "行業";
  if (plan === "exempt_age65") return "過65歲, 不用供";
  if (plan === "manulife") return "宏利";
  if (plan === "aia") return "AIA";
  return "一般";
}

function formatAdjustmentDateForTable(value: string | null | undefined): string {
  if (!value) return "";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length !== 3) return "";
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return "";
  return `${month}月${day}日`;
}

function getExpenseCategoryName(record: PayrollExpenseRecord): string {
  const category = record.expense?.category;
  if (!category) return "—";
  return category.parent?.name ? `${category.parent.name} / ${category.name || "—"}` : category.name || "—";
}

function PayrollItemsGroupedTable({
  items,
  adjustments,
  payrollExpenses,
  summary,
  mpfPlan,
  payrollId,
  readOnly = false,
  onItemUpdated,
}: {
  items: PayrollItem[];
  adjustments: Adjustment[];
  payrollExpenses: PayrollExpenseRecord[];
  summary: Record<string, number | string | null | undefined>;
  mpfPlan?: string | null;
  payrollId?: number;
  readOnly?: boolean;
  onItemUpdated?: () => Promise<void>;
}) {
  const [editingItemId, setEditingItemId] = useState<number | string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const handleDoubleClickAmount = (item: PayrollItem) => {
    if (readOnly || !payrollId || !item.id) return;
    setEditingItemId(item.id);
    setEditAmount(String(Math.abs(toNumber(item.amount))));
  };

  const handleAmountSave = async (item: PayrollItem) => {
    if (!payrollId || !item.id) return;
    const newAmount = parseFloat(editAmount);
    if (isNaN(newAmount)) { setEditingItemId(null); return; }
    const finalAmount = toNumber(item.amount) < 0 ? -Math.abs(newAmount) : Math.abs(newAmount);
    if (finalAmount === toNumber(item.amount)) { setEditingItemId(null); return; }
    setSaving(true);
    try {
      await payrollApi.updateItem(payrollId, Number(item.id), { amount: finalAmount });
      if (onItemUpdated) await onItemUpdated();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "更新金額失敗");
    } finally {
      setSaving(false);
      setEditingItemId(null);
    }
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent, item: PayrollItem) => {
    if (e.key === "Enter") { e.preventDefault(); handleAmountSave(item); }
    if (e.key === "Escape") { setEditingItemId(null); }
  };

  const handleResetManualAmount = async (item: PayrollItem) => {
    if (!payrollId || !item.id) return;
    if (!confirm("確定要還原為系統計算金額？")) return;
    setSaving(true);
    try {
      await payrollApi.updateItem(payrollId, Number(item.id), { reset_manual_amount: true });
      if (onItemUpdated) await onItemUpdated();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "還原金額失敗");
    } finally {
      setSaving(false);
    }
  };

  const columns = ["item_name", "unit_price", "quantity", "amount", "remarks"];
  const salaryGroups: Array<{ type: string; title: string }> = [
    { type: "base_salary", title: "底薪項目" },
    { type: "allowance", title: "津貼項目" },
    { type: "ot", title: "OT 項目" },
  ];
  const mpfItems = items.filter((item) => item.item_type === "mpf_deduction");
  const hasAdjustments = adjustments.length > 0 || toNumber(summary.adjustment_total) !== 0;
  const hasReimbursements = payrollExpenses.length > 0 || toNumber(summary.reimbursement_total) > 0;
  const pettyCashDeducted = toNumber(summary.petty_cash_deducted);
  const hasPettyCash = pettyCashDeducted > 0;
  const netAmount = toNumber(summary.net_amount);
  const totalPayable = toNumber(summary.total_payable);
  const mpfDeductionTotal = Math.abs(toNumber(summary.deduction_total));
  const mpfLabel = `強積金（${getMpfPlanShortLabel(mpfPlan)}）(-)`;

  const renderItemRow = (item: PayrollItem, key: string | number | undefined, extraClass = "", groupedQuantity?: number, groupedAmount?: number, groupSize?: number) => {
    const isDeduction = toNumber(item.amount) < 0;
    const isManual = Boolean(item.payroll_item_is_manual_amount);
    const isEditing = editingItemId === item.id;
    const canEdit = !readOnly && !!payrollId && !!item.id;
    const displayQuantity = groupedQuantity !== undefined ? groupedQuantity : toNumber(item.quantity);
    const displayAmount = groupedAmount !== undefined ? groupedAmount : toNumber(item.amount);
    return (
      <tr key={String(key)} className={`border-b ${extraClass}`}>
        <td className="px-3 py-2 font-medium text-gray-800">
          {item.item_name || "—"}
          {groupSize && groupSize > 1 && <span className="ml-2 text-xs text-gray-500">（{groupSize} 筆合併）</span>}
        </td>
        <td className="px-3 py-2 text-right font-mono text-gray-700">{item.item_type === "mpf_deduction" && mpfPlan !== "industry" ? `${(toNumber(item.quantity) * 100).toFixed(0)}%` : toNumber(item.unit_price) === 0 ? "—" : formatMoney(item.unit_price)}</td>
        <td className="px-3 py-2 text-right font-mono text-gray-700">{item.item_type === "mpf_deduction" && mpfPlan !== "industry" ? "—" : formatPlainNumber(displayQuantity)}</td>
        <td className={`px-3 py-2 text-right font-mono font-bold ${isDeduction ? "text-red-600" : "text-primary-600"}`}>
          <div className="flex items-center justify-end gap-1">
            {isEditing ? (
              <input
                type="number"
                step="0.01"
                className="w-24 rounded border border-blue-400 px-2 py-0.5 text-right text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                onKeyDown={(e) => handleAmountKeyDown(e, item)}
                onBlur={() => handleAmountSave(item)}
                autoFocus
                disabled={saving}
              />
            ) : (
              <span
                className={canEdit ? "cursor-pointer hover:bg-blue-50 px-1 rounded" : ""}
                onDoubleClick={() => handleDoubleClickAmount(item)}
                title={canEdit ? "雙擊編輯金額" : undefined}
              >
                {isDeduction ? "-" : ""}{formatMoney(Math.abs(displayAmount))}
              </span>
            )}
            {isManual && (
              <>
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">手動</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleResetManualAmount(item)}
                    className="text-[11px] text-gray-500 hover:text-blue-600 ml-0.5"
                    title="還原為系統計算金額"
                    disabled={saving}
                  >
                    ↺
                  </button>
                )}
              </>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-gray-500">{item.remarks || "—"}</td>
      </tr>
    );
  };

  const renderSectionHeader = (title: string, key: string) => (
    <tr key={key} className="bg-gray-50/80">
      <td colSpan={columns.length} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-600">{title}</td>
    </tr>
  );

  const renderSpacer = (key: string) => <tr key={key} className="h-3"><td colSpan={columns.length} className="border-0 bg-white p-0" /></tr>;
  const renderSeparator = (key: string) => <tr key={key}><td colSpan={columns.length} className="border-t border-dashed border-gray-300 p-0" /></tr>;
  const renderSubtotal = (label: string, amount: number | string | null | undefined, key: string, tone: "primary" | "blue" | "green" = "primary") => (
    <tr key={key} className={tone === "green" ? "bg-green-50" : tone === "blue" ? "bg-blue-50" : "bg-primary-50"}>
      <td colSpan={3} className="px-3 py-2 text-right font-bold text-gray-800">{label}</td>
      <td className={`px-3 py-2 text-right font-mono font-bold ${tone === "green" ? "text-green-700" : tone === "blue" ? "text-blue-700" : "text-primary-700"}`}>{formatMoney(amount)}</td>
      <td />
    </tr>
  );

  const rows: ReactNode[] = [];
  salaryGroups.forEach((group) => {
    const groupItems = items.filter((item) => item.item_type === group.type);
    if (groupItems.length === 0) return;
    rows.push(renderSectionHeader(group.title, `header-${group.type}`));
    
    // Group items by name + unit_price
    const groupedByNameAndPrice = groupItems.reduce((acc: any[], item: PayrollItem) => {
      const key = `${item.item_name}|${item.unit_price}`;
      const existing = acc.find((g: any) => g.groupKey === key);
      if (existing) {
        existing.items.push(item);
        existing.totalQuantity += toNumber(item.quantity);
        existing.totalAmount += toNumber(item.amount);
      } else {
        acc.push({
          groupKey: key,
          items: [item],
          totalQuantity: toNumber(item.quantity),
          totalAmount: toNumber(item.amount),
        });
      }
      return acc;
    }, []);
    
    groupedByNameAndPrice.forEach((group: any, index: number) => {
      const firstItem = group.items[0];
      rows.push(renderItemRow(firstItem, group.groupKey, "", group.totalQuantity, group.totalAmount, group.items.length));
    });
  });
  rows.push(renderSeparator("sep-gross"));
  rows.push(renderSubtotal("應收總額", summary.gross_amount, "subtotal-gross"));

  if (hasAdjustments) {
    rows.push(renderSpacer("space-adjustments"));
    rows.push(renderSectionHeader("自定義津貼/扣款 (+)", "header-adjustments"));
    adjustments.forEach((adj, index) => {
      const amount = toNumber(adj.amount);
      const dateLabel = formatAdjustmentDateForTable(adj.adjustment_date);
      rows.push(
        <tr key={`adjustment-${adj.id || index}`} className="border-b bg-green-50/30">
          <td className="px-3 py-2 font-medium text-gray-800">{adj.item_name || "自定義津貼/扣款"}{dateLabel ? ` (${dateLabel})` : ""}</td>
          <td className="px-3 py-2 text-right font-mono text-gray-700">—</td>
          <td className="px-3 py-2 text-right font-mono text-gray-700">—</td>
          <td className={`px-3 py-2 text-right font-mono font-bold ${amount < 0 ? "text-red-600" : "text-green-600"}`}>{amount < 0 ? "-" : "+"}{formatMoney(Math.abs(amount))}</td>
          <td className="px-3 py-2 text-xs text-gray-500">{adj.remarks || "—"}</td>
        </tr>
      );
    });
    if (adjustments.length === 0) rows.push(renderSubtotal("自定義津貼/扣款合計", summary.adjustment_total, "subtotal-adjustments", "green"));
  }

  rows.push(renderSpacer("space-mpf"));
  rows.push(renderSectionHeader(mpfLabel, "header-mpf"));
  if (mpfItems.length > 0) {
    mpfItems.forEach((item, index) => rows.push(renderItemRow(item, item.id || `mpf-${index}`, "bg-red-50/40")));
  } else {
    rows.push(
      <tr key="mpf-summary" className="border-b bg-red-50/40">
        <td className="px-3 py-2 font-medium text-gray-800">{mpfLabel}</td>
        <td className="px-3 py-2 text-right font-mono text-gray-700">—</td>
        <td className="px-3 py-2 text-right font-mono text-gray-700">—</td>
        <td className="px-3 py-2 text-right font-mono font-bold text-red-600">-{formatMoney(mpfDeductionTotal)}</td>
        <td className="px-3 py-2 text-xs text-gray-500">—</td>
      </tr>
    );
  }
  rows.push(renderSeparator("sep-net"));
  rows.push(renderSubtotal("淨薪金", netAmount, "subtotal-net", "blue"));

  if (hasReimbursements) {
    rows.push(renderSpacer("space-reimbursements"));
    rows.push(renderSectionHeader("員工報銷 (+)", "header-reimbursements"));
    payrollExpenses.forEach((record, index) => {
      const expense = record.expense;
      rows.push(
        <tr key={`reimbursement-${record.id || expense?.id || index}`} className="border-b bg-blue-50/30">
          <td className="px-3 py-2 font-medium text-gray-800">{expense?.date ? fmtDate(expense.date) : "—"} - {getExpenseCategoryName(record)}</td>
          <td className="px-3 py-2 text-gray-700">{expense?.description || expense?.item || "—"}</td>
          <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">+{formatMoney(expense?.total_amount)}</td>
          <td className="px-3 py-2 text-xs text-gray-500">報銷</td>
        </tr>
      );
    });
    if (payrollExpenses.length === 0) rows.push(renderSubtotal("員工報銷合計", summary.reimbursement_total, "subtotal-reimbursement", "blue"));
  }

  if (hasPettyCash) {
    rows.push(renderSpacer("space-petty-cash"));
    rows.push(renderSectionHeader("零用金 (-)", "header-petty-cash"));
    rows.push(
      <tr key="petty-cash" className="border-b bg-amber-50/50">
        <td className="px-3 py-2 font-medium text-gray-800">零用金抵扣</td>
        <td className="px-3 py-2 text-right font-mono text-gray-700">—</td>
        <td className="px-3 py-2 text-right font-mono text-gray-700">—</td>
        <td className="px-3 py-2 text-right font-mono font-bold text-red-600">-{formatMoney(pettyCashDeducted)}</td>
        <td className="px-3 py-2 text-xs text-gray-500">抵扣員工報銷</td>
      </tr>
    );
  }

  rows.push(renderSeparator("sep-payable"));
  rows.push(renderSubtotal("應付總額", totalPayable, "subtotal-payable", "green"));

  return (
    <section>
      <h3 className="mb-2 font-bold text-gray-900">糧單項目</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => <th key={column} className="px-3 py-2 text-left font-medium text-gray-600">{PAYROLL_ITEM_COLUMN_LABELS[column] || column}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500">暫無資料。</td></tr> : rows.map((row, index) => <Fragment key={index}>{row}</Fragment>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type SimpleRow = Record<string, string | number | boolean | null | undefined>;
function SimpleTable({ title, rows, columns, moneyColumns, columnLabels = {} }: { title: string; rows: SimpleRow[]; columns: string[]; moneyColumns: string[]; columnLabels?: Record<string, string> }) {
  return (
    <section>
      <h3 className="mb-2 font-bold text-gray-900">{title}</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>{columns.map((column) => <th key={column} className="px-3 py-2 text-left font-medium text-gray-600">{columnLabels[column] || column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500">暫無資料。</td></tr>}
            {rows.map((row, index) => (
              <tr key={String(row.id || index)} className="border-b">
                {columns.map((column) => <td key={column} className="px-3 py-2 text-gray-700">{moneyColumns.includes(column) ? formatMoney(row[column] as number | string | null | undefined) : String(row[column] ?? "-")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function printNumber(value: number | string | null | undefined, digits = 2): string {
  const numeric = Number(value || 0);
  return numeric.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatEmployeeJoinDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function PrintTab({
  payrollId,
  showGroupedInPrint,
  onShowGroupedChange,
}: {
  payrollId?: number;
  showGroupedInPrint: boolean;
  onShowGroupedChange: (value: boolean) => void;
}) {
  const [showEmployeeSignature, setShowEmployeeSignature] = useState(false);
  const [showCompanyStamp, setShowCompanyStamp] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!payrollId) {
      setPdfUrl(null);
      setPdfError("找不到糧單編號，無法產生 PDF 預覽。");
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setPdfLoading(true);
    setPdfError(null);

    payrollApi.exportPdf(payrollId, {
      show_grouped_settlement: showGroupedInPrint,
      show_employee_signature: showEmployeeSignature,
      show_company_stamp: showCompanyStamp,
      preview: true,
    })
      .then((response) => {
        if (cancelled) return;
        const blob = new Blob([response.data], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          return objectUrl;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPdfError(getApiMessage(err, "產生 PDF 預覽失敗"));
        setPdfUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          return null;
        });
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [payrollId, showCompanyStamp, showEmployeeSignature, showGroupedInPrint]);

  function handlePrintPdf() {
    const iframeWindow = iframeRef.current?.contentWindow;
    if (iframeWindow) {
      iframeWindow.focus();
      iframeWindow.print();
      return;
    }
    if (pdfUrl) window.open(pdfUrl, "_blank", "noopener,noreferrer");
  }

  function handleOpenPdf() {
    if (pdfUrl) window.open(pdfUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showGroupedInPrint}
              onChange={(e) => onShowGroupedChange(e.target.checked)}
              className="rounded"
            />
            顯示歸組結算明細
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showEmployeeSignature}
              onChange={(e) => setShowEmployeeSignature(e.target.checked)}
              className="rounded"
            />
            員工簽署
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showCompanyStamp}
              onChange={(e) => setShowCompanyStamp(e.target.checked)}
              className="rounded"
            />
            公司印
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleOpenPdf} disabled={!pdfUrl || pdfLoading} className="btn-secondary text-sm disabled:opacity-50">開啟 PDF</button>
          <button type="button" onClick={handlePrintPdf} disabled={!pdfUrl || pdfLoading} className="btn-primary text-sm disabled:opacity-50">列印糧單</button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        {pdfLoading && (
          <div className="absolute inset-x-0 top-0 z-10 bg-blue-50 px-4 py-2 text-sm text-blue-700 shadow-sm">
            正在更新 PDF 預覽...
          </div>
        )}
        {pdfError ? (
          <div className="flex min-h-[520px] items-center justify-center p-8 text-center text-sm text-red-600">
            {pdfError}
          </div>
        ) : pdfUrl ? (
          <iframe
            ref={iframeRef}
            src={pdfUrl}
            title="糧單 PDF 預覽"
            className="h-[calc(100vh-260px)] min-h-[640px] w-full bg-white"
          />
        ) : (
          <div className="flex min-h-[520px] items-center justify-center p-8 text-center text-sm text-gray-500">
            準備 PDF 預覽中...
          </div>
        )}
      </div>
    </div>
  );
}

function PrintGroupedSettlement({ groups }: { groups: GroupedSettlementRecord[] }) {
  if (groups.length === 0) return null;
  return <section><h2 className="mb-2 font-bold">歸組結算</h2><table className="print-table w-full border-collapse text-sm"><thead><tr><th>客戶</th><th>工種</th><th>路線</th><th className="text-right">計費數量</th><th className="text-right">單價</th><th className="text-right">金額</th></tr></thead><tbody>{groups.map((group) => <tr key={normalizeGroupKey(group)}><td>{group.client_name || group.company_name || "-"}</td><td>{group.service_type || "-"}</td><td>{routeOf(group)}</td><td className="text-right">{formatPlainNumber(groupBillingQuantity(group))} {groupBillingUnit(group)}</td><td className="text-right">{formatMoney(group.matched_rate)}</td><td className="text-right">{formatMoney(group.total_amount ?? group.amount)}</td></tr>)}</tbody></table></section>;
}

function RateCardModal({ source, form, saving, onChange, onClose, onSubmit }: { source: RateCardSource; form: AddRateCardForm; saving: boolean; onChange: (form: AddRateCardForm) => void; onClose: () => void; onSubmit: () => void }) {
  const setField = (field: keyof AddRateCardForm, value: string) => onChange({ ...form, [field]: value });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-bold text-gray-900">加入價目表</h3><p className="text-sm text-gray-500">{source.clientName || source.companyName || "-"} · {source.serviceType || "-"} · {source.origin || "-"} → {source.destination || "-"}</p></div><button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button></div><div className="grid gap-3 md:grid-cols-2"><RateField label="合約編號" value={form.client_contract_no} onChange={(v) => setField("client_contract_no", v)} /><RateField label="工種" value={form.service_type} onChange={(v) => setField("service_type", v)} /><RateField label="日/夜" value={form.day_night} onChange={(v) => setField("day_night", v)} /><RateField label="單位" value={form.unit} onChange={(v) => setField("unit", v)} /><RateField label="起點" value={form.origin} onChange={(v) => setField("origin", v)} /><RateField label="終點" value={form.destination} onChange={(v) => setField("destination", v)} /><RateField label="機種" value={form.machine_type} onChange={(v) => setField("machine_type", v)} /><RateField label="噸數" value={form.tonnage} onChange={(v) => setField("tonnage", v)} /><RateField label="單價" type="number" value={form.rate} onChange={(v) => setField("rate", v)} /><RateField label="OT 單價" type="number" value={form.ot_rate} onChange={(v) => setField("ot_rate", v)} /><RateField label="中直單價" type="number" value={form.mid_shift_rate} onChange={(v) => setField("mid_shift_rate", v)} /><RateField label="生效日期" type="date" value={form.effective_date} onChange={(v) => setField("effective_date", v)} /><label className="md:col-span-2"><span className="mb-1 block text-sm font-medium text-gray-700">備註</span><textarea value={form.remarks} onChange={(e) => setField("remarks", e.target.value)} className="input min-h-[80px] w-full" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-secondary">取消</button><button type="button" disabled={saving} onClick={onSubmit} className="btn-primary">{saving ? "儲存中..." : "加入價目表"}</button></div></div></div>;
}

function RateField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label><span className="mb-1 block text-sm font-medium text-gray-700">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="input w-full" /></label>;
}

export default PayrollTabs;
