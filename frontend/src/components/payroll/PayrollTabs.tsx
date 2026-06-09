"use client";

import { useEffect, useMemo, useState } from "react";
import ColumnFilter from "@/components/ColumnFilter";

type Primitive = string | number | boolean | null | undefined;
type CellValue = Primitive | Date;
type BillingQuantityType = "days" | "quantity" | "product_quantity";
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

type RecordValue = CellValue | Record<string, unknown> | Array<unknown>;

type PayrollRecord = Record<string, RecordValue> & {
  id: number | string;
  scheduled_date?: string | Date | null;
  service_type?: string | null;
  day_night?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  origin?: string | null;
  destination?: string | null;
  machine_type?: string | null;
  tonnage?: string | null;
  equipment_number?: string | null;
  company_id?: number | string | null;
  company_name?: string | null;
  company_profile_name?: string | null;
  client_id?: number | string | null;
  client_name?: string | null;
  client_contract_no?: string | null;
  quotation_id?: number | string | null;
  quotation_no?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  ot_quantity?: number | string | null;
  ot_unit?: string | null;
  is_mid_shift?: boolean | null;
  matched_rate?: number | string | null;
  matched_ot_rate?: number | string | null;
  matched_unit?: string | null;
  line_amount?: number | string | null;
  price_match_status?: string | null;
  price_match_note?: string | null;
  match_note?: string | null;
  payroll_work_log_product_quantity?: number | string | null;
  work_log_product_quantity?: number | string | null;
  goods_quantity?: number | string | null;
  product_quantity?: number | string | null;
  payroll_work_log_product_unit?: string | null;
  billing_quantity_type?: BillingQuantityType | string | null;
  group_key?: string | null;
  is_modified?: boolean | null;
  is_excluded?: boolean | null;
};

type PayrollGroup = Record<string, RecordValue> & {
  group_key?: string;
  client_name?: string;
  company_name?: string;
  company_profile_name?: string;
  client_contract_no?: string;
  service_type?: string;
  day_night?: string;
  quotation_no?: string;
  matched_rate?: number | string | null;
  matched_unit?: string | null;
  unit?: string | null;
  start_location?: string;
  end_location?: string;
  machine_type?: string;
  tonnage?: string;
  total_quantity?: number | string | null;
  billing_quantity?: number | string | null;
  billing_quantity_type?: BillingQuantityType | string | null;
  total_amount?: number | string | null;
  count?: number;
  work_log_ids?: Array<number | string>;
  price_match_status?: string;
};

type DailyCalculation = Record<string, RecordValue> & {
  date?: string | Date | null;
  total_amount?: number | string | null;
  amount?: number | string | null;
  daily_total?: number | string | null;
  work_logs?: unknown;
  items?: unknown;
  details?: unknown;
};

type PayrollSummary = {
  gross_amount?: number | string | null;
  deduction_total?: number | string | null;
  adjustment_total?: number | string | null;
  net_amount?: number | string | null;
  reimbursement_total?: number | string | null;
};

type CalculationItem = Record<string, RecordValue> & {
  id?: number | string;
  item_type?: string | null;
  item_name?: string | null;
  name?: string | null;
  unit_price?: number | string | null;
  quantity?: number | string | null;
  amount?: number | string | null;
  remarks?: string | null;
};

type PayrollAdjustment = Record<string, RecordValue> & {
  id?: number | string;
  type?: string | null;
  adjustment_type?: string | null;
  description?: string | null;
  reason?: string | null;
  amount?: number | string | null;
  remarks?: string | null;
};

type AllowanceOption = Record<string, RecordValue> & {
  key?: string | null;
  label?: string | null;
  default_amount?: number | string | null;
};

type CalculationDetails = {
  payroll_summary?: PayrollSummary;
  items?: CalculationItem[];
  adjustments?: PayrollAdjustment[];
  allowance_options?: AllowanceOption[];
};

export type PayrollTabsProps = {
  workLogs: PayrollRecord[];
  groupedSettlement?: PayrollGroup[];
  dailyCalculation?: DailyCalculation[];
  unmatchedRecords?: PayrollRecord[];
  calculationDetails?: CalculationDetails;
  calculation?: CalculationDetails;
  readOnly?: boolean;
  className?: string;
  onUpdateWorkLog?: (id: number | string, updates: Record<string, CellValue>) => Promise<void> | void;
  onBatchUpdateWorkLogs?: (ids: Array<number | string>, updates: Record<string, CellValue>) => Promise<void> | void;
  onBatchDeleteWorkLogs?: (ids: Array<number | string>) => Promise<void> | void;
  onGroupBillingQuantityTypeChange?: (groupKey: string, billingQuantityType: BillingQuantityType) => Promise<void> | void;
};

type DetailColumn = {
  key: DetailColumnKey;
  label: string;
  editable?: boolean;
  type?: "text" | "number" | "date" | "select" | "checkbox";
  options?: readonly string[];
  align?: "left" | "center" | "right";
  minWidth?: string;
};

const TAB_DEFS = [
  { key: "detail", label: "逐筆明細" },
  { key: "grouped", label: "歸組結算" },
  { key: "daily", label: "逐日計算" },
  { key: "unmatched", label: "未匹配摘要" },
  { key: "calculation", label: "計算明細" },
] as const;

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

function formatDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value: unknown) {
  return `$${asNumber(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getProductQuantity(record: PayrollRecord) {
  return asNumber(
    record.payroll_work_log_product_quantity ??
      record.work_log_product_quantity ??
      record.goods_quantity ??
      record.product_quantity,
    0,
  );
}

function makeFallbackGroupKey(record: PayrollRecord) {
  return [
    record.company_id ?? record.company_name ?? record.company_profile_name ?? "",
    record.client_id ?? record.client_name ?? "",
    record.client_contract_no ?? record.quotation_no ?? "",
    record.service_type ?? "",
    record.quotation_id ?? "",
    record.day_night ?? "",
    record.tonnage ?? "",
    record.machine_type ?? "",
    record.start_location ?? "",
    record.end_location ?? "",
  ].join("|");
}

function deriveGroupsFromRows(rows: PayrollRecord[]): PayrollGroup[] {
  const groups = new Map<string, PayrollGroup>();
  for (const row of rows) {
    const key = row.group_key || makeFallbackGroupKey(row);
    const existing = groups.get(key);
    const quantity = asNumber(row.quantity, 1);
    const amount = asNumber(row.line_amount, 0);
    if (existing) {
      existing.total_quantity = asNumber(existing.total_quantity) + quantity;
      existing.total_amount = asNumber(existing.total_amount) + amount;
      existing.count = asNumber(existing.count) + 1;
      existing.work_log_ids = [...(existing.work_log_ids || []), row.id];
      continue;
    }
    groups.set(key, {
      group_key: key,
      company_id: row.company_id,
      company_name: row.company_name,
      company_profile_name: row.company_profile_name,
      client_id: row.client_id,
      client_name: row.client_name,
      client_contract_no: row.client_contract_no || String(row.quotation_no || ""),
      service_type: row.service_type || "",
      quotation_id: row.quotation_id,
      day_night: row.day_night || "日",
      tonnage: row.tonnage || "",
      machine_type: row.machine_type || "",
      start_location: row.start_location || "",
      end_location: row.end_location || "",
      matched_rate: row.matched_rate ?? null,
      matched_unit: row.matched_unit || row.unit || "天",
      unit: row.unit || row.matched_unit || "天",
      total_quantity: quantity,
      total_amount: amount,
      count: 1,
      price_match_status: row.price_match_status || "unmatched",
      billing_quantity_type: row.billing_quantity_type || "quantity",
      work_log_ids: [row.id],
    });
  }
  return Array.from(groups.values());
}

function calculateBillingQuantity(group: PayrollGroup, rows: PayrollRecord[]) {
  const type = (group.billing_quantity_type || "quantity") as BillingQuantityType;
  const ids = new Set((group.work_log_ids || []).map(String));
  const groupRows = rows.filter((row) => ids.size === 0 ? (row.group_key || makeFallbackGroupKey(row)) === group.group_key : ids.has(String(row.id)));

  if (type === "days") {
    const dates = new Set(groupRows.map((row) => formatDate(row.scheduled_date)).filter(Boolean));
    return dates.size || asNumber(group.count, 0);
  }
  if (type === "product_quantity") {
    return groupRows.reduce((sum, row) => sum + getProductQuantity(row), 0);
  }
  return asNumber(group.total_quantity ?? group.billing_quantity, 0);
}

function getColumnValue(row: PayrollRecord, key: DetailColumnKey): CellValue {
  if (key === "route") {
    const start = row.start_location || row.origin || "";
    const end = row.end_location || row.destination || "";
    return start || end ? `${start || "—"} → ${end || "—"}` : "";
  }
  if (key === "payroll_work_log_product_quantity") {
    return row.payroll_work_log_product_quantity ?? row.work_log_product_quantity ?? row.goods_quantity ?? row.product_quantity ?? "";
  }
  const value = row[key];
  return value instanceof Date || typeof value !== "object" ? value : "";
}

function displayCellValue(row: PayrollRecord, column: DetailColumn): string {
  const value = getColumnValue(row, column.key);
  if (column.key === "scheduled_date") return formatDate(value) || "—";
  if (column.key === "matched_rate" || column.key === "matched_ot_rate" || column.key === "line_amount") {
    return value === null || value === undefined || value === "" ? "—" : formatMoney(value);
  }
  return normalizeText(value);
}

function buildFilterRows(rows: PayrollRecord[]): Array<Record<DetailColumnKey, string>> {
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

function calculationLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    base_salary: "底薪",
    allowance: "津貼",
    ot: "OT",
    mpf_deduction: "強積金扣款",
    reimbursement: "報銷",
    deduction: "扣款",
  };
  return value ? labels[value] || value : "—";
}

type EditableCellProps = {
  row: PayrollRecord;
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

function CalculationDetailsView({ details }: { details?: CalculationDetails }) {
  const summary = details?.payroll_summary;
  const items = details?.items || [];
  const adjustments = details?.adjustments || [];
  const allowanceOptions = details?.allowance_options || [];

  if (!summary && items.length === 0 && adjustments.length === 0 && allowanceOptions.length === 0) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">沒有可顯示的計算明細。</div>;
  }

  const summaryCards = [
    { key: "gross_amount", label: "應收總額", value: summary?.gross_amount },
    { key: "deduction_total", label: "扣款總額", value: summary?.deduction_total },
    { key: "adjustment_total", label: "調整總額", value: summary?.adjustment_total },
    { key: "net_amount", label: "淨額", value: summary?.net_amount },
    { key: "reimbursement_total", label: "報銷總額", value: summary?.reimbursement_total },
  ];

  return (
    <div className="space-y-5">
      {summary && (
        <div>
          <h3 className="mb-2 font-semibold text-gray-900">計糧摘要</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {summaryCards.map((card) => (
              <div key={card.key} className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className="mt-1 font-mono text-lg font-bold text-blue-700">{formatMoney(card.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b px-4 py-3 font-semibold text-gray-900">計算項目</div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr><th className="px-3 py-2">類型</th><th className="px-3 py-2">項目</th><th className="px-3 py-2 text-right">單價</th><th className="px-3 py-2 text-right">數量</th><th className="px-3 py-2 text-right">金額</th><th className="px-3 py-2">備註</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">沒有計算項目。</td></tr> : items.map((item, index) => (
                <tr key={String(item.id ?? index)}>
                  <td className="px-3 py-2">{calculationLabel(item.item_type)}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{normalizeText(item.item_name ?? item.name)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatMoney(item.unit_price)}</td>
                  <td className="px-3 py-2 text-right font-mono">{normalizeText(item.quantity)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{formatMoney(item.amount)}</td>
                  <td className="px-3 py-2 text-gray-500">{normalizeText(item.remarks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b px-4 py-3 font-semibold text-gray-900">調整項</div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr><th className="px-3 py-2">類型</th><th className="px-3 py-2">說明</th><th className="px-3 py-2 text-right">金額</th><th className="px-3 py-2">備註</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {adjustments.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">沒有調整項。</td></tr> : adjustments.map((adjustment, index) => (
                <tr key={String(adjustment.id ?? index)}>
                  <td className="px-3 py-2">{normalizeText(adjustment.type ?? adjustment.adjustment_type)}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{normalizeText(adjustment.description ?? adjustment.reason)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{formatMoney(adjustment.amount)}</td>
                  <td className="px-3 py-2 text-gray-500">{normalizeText(adjustment.remarks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b px-4 py-3 font-semibold text-gray-900">津貼選項</div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr><th className="px-3 py-2">Key</th><th className="px-3 py-2">名稱</th><th className="px-3 py-2 text-right">預設金額</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allowanceOptions.length === 0 ? <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">沒有津貼選項。</td></tr> : allowanceOptions.map((option, index) => (
                <tr key={String(option.key ?? index)}>
                  <td className="px-3 py-2 font-mono text-xs">{normalizeText(option.key)}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{normalizeText(option.label)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatMoney(option.default_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PayrollTabs({
  workLogs,
  groupedSettlement,
  dailyCalculation,
  unmatchedRecords,
  calculationDetails,
  calculation,
  readOnly = false,
  className = "",
  onUpdateWorkLog,
  onBatchUpdateWorkLogs,
  onBatchDeleteWorkLogs,
  onGroupBillingQuantityTypeChange,
}: PayrollTabsProps) {
  const [activeTab, setActiveTab] = useState<(typeof TAB_DEFS)[number]["key"]>("detail");
  const [rows, setRows] = useState<PayrollRecord[]>(workLogs || []);
  const [sortKey, setSortKey] = useState<DetailColumnKey>("scheduled_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchField, setBatchField] = useState<string>("service_type");
  const [batchValue, setBatchValue] = useState<string>("");
  const [localGroupTypes, setLocalGroupTypes] = useState<Record<string, BillingQuantityType>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    setRows(workLogs || []);
    setSelectedIds(new Set());
    setEditingKey(null);
  }, [workLogs]);

  const groups = useMemo(() => {
    const source = groupedSettlement && groupedSettlement.length > 0 ? groupedSettlement : deriveGroupsFromRows(rows);
    return source.map((group) => ({
      ...group,
      billing_quantity_type: localGroupTypes[group.group_key || ""] || group.billing_quantity_type || "quantity",
    }));
  }, [groupedSettlement, rows, localGroupTypes]);

  const filterRows = useMemo(() => buildFilterRows(rows), [rows]);

  const filteredSortedRows = useMemo(() => {
    const filtered = rows.filter((row) => DETAIL_COLUMNS.every((column) => {
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
  }, [rows, columnFilters, sortKey, sortDirection]);

  const effectiveUnmatched = useMemo(() => {
    if (unmatchedRecords) return unmatchedRecords;
    return rows.filter((row) => row.price_match_status && row.price_match_status !== "matched");
  }, [unmatchedRecords, rows]);

  const selectedCount = selectedIds.size;
  const selectedRows = rows.filter((row) => selectedIds.has(String(row.id)));
  const activeBatchField = BATCH_FIELDS.find((field) => field.key === batchField);
  const details = calculationDetails || calculation;

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
    setRows((prev) => prev.map((row) => (String(row.id) === String(id) ? { ...row, [column.key]: value, is_modified: true } : row)));
    if (onUpdateWorkLog) await onUpdateWorkLog(id, { [column.key]: value });
  }

  async function applyBatchUpdate() {
    if (!batchField || selectedCount === 0) return;
    const updates: Record<string, CellValue> = { [batchField]: batchValue === "" ? null : batchValue };
    const ids = selectedRows.map((row) => row.id);
    setRows((prev) => prev.map((row) => (selectedIds.has(String(row.id)) ? { ...row, ...updates, is_modified: true } : row)));
    if (onBatchUpdateWorkLogs) {
      await onBatchUpdateWorkLogs(ids, updates);
    } else if (onUpdateWorkLog) {
      for (const id of ids) await onUpdateWorkLog(id, updates);
    }
    setBatchValue("");
  }

  async function applyBatchDelete() {
    if (selectedCount === 0 || !onBatchDeleteWorkLogs) return;
    const confirmed = window.confirm(`確定刪除已選取的 ${selectedCount} 筆記錄？`);
    if (!confirmed) return;
    const ids = selectedRows.map((row) => row.id);
    await onBatchDeleteWorkLogs(ids);
    setRows((prev) => prev.filter((row) => !selectedIds.has(String(row.id))));
    setSelectedIds(new Set());
  }

  async function handleGroupTypeChange(groupKey: string, value: BillingQuantityType) {
    setLocalGroupTypes((prev) => ({ ...prev, [groupKey]: value }));
    if (onGroupBillingQuantityTypeChange) await onGroupBillingQuantityTypeChange(groupKey, value);
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="overflow-x-auto border-b border-gray-200">
        <div className="flex min-w-max gap-1">
          {TAB_DEFS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${activeTab === tab.key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "detail" && (
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
              <button type="button" onClick={() => void applyBatchUpdate()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">套用</button>
              {onBatchDeleteWorkLogs && (
                <button type="button" onClick={() => void applyBatchDelete()} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">批量刪除</button>
              )}
              <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded border border-blue-200 bg-white px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100">清除選取</button>
            </div>
          )}

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
                        readOnly={readOnly}
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
      )}

      {activeTab === "grouped" && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">公司 / 客戶 / 合約</th>
                <th className="px-3 py-2">服務組合</th>
                <th className="px-3 py-2">路線</th>
                <th className="px-3 py-2 text-right">記錄數</th>
                <th className="px-3 py-2">計費數量類型</th>
                <th className="px-3 py-2 text-right">計費數量</th>
                <th className="px-3 py-2 text-right">單價</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groups.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">沒有歸組結算資料。</td></tr>
              ) : groups.map((group) => {
                const groupKey = group.group_key || `${group.client_name}-${group.service_type}-${group.start_location}-${group.end_location}`;
                const billingQty = calculateBillingQuantity(group, rows);
                const rate = asNumber(group.matched_rate, 0);
                const amount = rate > 0 ? billingQty * rate : asNumber(group.total_amount, 0);
                return (
                  <tr key={groupKey} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{normalizeText(group.company_name || group.company_profile_name)}</div>
                      <div className="text-gray-600">{normalizeText(group.client_name)}</div>
                      <div className="text-xs text-gray-500">{normalizeText(group.client_contract_no || group.quotation_no)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{normalizeText(group.service_type)} / {normalizeText(group.day_night)}</div>
                      <div className="text-xs text-gray-500">{normalizeText(group.machine_type)} {normalizeText(group.tonnage)}</div>
                    </td>
                    <td className="px-3 py-2">{normalizeText(group.start_location)} → {normalizeText(group.end_location)}</td>
                    <td className="px-3 py-2 text-right font-mono">{asNumber(group.count, (group.work_log_ids || []).length)}</td>
                    <td className="px-3 py-2">
                      <select
                        value={(group.billing_quantity_type || "quantity") as BillingQuantityType}
                        onChange={(event) => void handleGroupTypeChange(groupKey, event.target.value as BillingQuantityType)}
                        disabled={readOnly}
                        className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value="days">天數</option>
                        <option value="quantity">數量</option>
                        <option value="product_quantity">商品數量</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{billingQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}{group.matched_unit || group.unit || ""}</td>
                    <td className="px-3 py-2 text-right font-mono">{rate > 0 ? formatMoney(rate) : "未設定"}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{formatMoney(amount)}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs ${group.price_match_status === "matched" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>{group.price_match_status === "matched" ? "已匹配" : "未匹配"}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right font-semibold">歸組結算合計</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{formatMoney(groups.reduce((sum, group) => sum + (asNumber(group.matched_rate) > 0 ? calculateBillingQuantity(group, rows) * asNumber(group.matched_rate) : asNumber(group.total_amount)), 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {activeTab === "daily" && (
        <div className="space-y-3">
          {!dailyCalculation || dailyCalculation.length === 0 ? <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">沒有逐日計算資料。</div> : dailyCalculation.map((day, index) => (
            <div key={String(day.date || index)} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold text-gray-900">{formatDate(day.date) || normalizeText(day.date) || `第 ${index + 1} 日`}</h3><span className="font-mono text-sm text-blue-700">{formatMoney(day.total_amount ?? day.amount ?? day.daily_total ?? 0)}</span></div>
              <div className="text-sm text-gray-600">{normalizeText(day.work_logs || day.items || day.details || "已完成逐日計算")}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "unmatched" && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-2">日期</th><th className="px-3 py-2">客戶</th><th className="px-3 py-2">服務</th><th className="px-3 py-2">組合</th><th className="px-3 py-2">原因</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {effectiveUnmatched.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">所有記錄均已匹配價目。</td></tr> : effectiveUnmatched.map((row) => (
                <tr key={String(row.id)}><td className="px-3 py-2">{formatDate(row.scheduled_date)}</td><td className="px-3 py-2">{normalizeText(row.client_name)}</td><td className="px-3 py-2">{normalizeText(row.service_type)} / {normalizeText(row.day_night)}</td><td className="px-3 py-2">{normalizeText(row.machine_type)} {normalizeText(row.tonnage)} {normalizeText(row.start_location)} → {normalizeText(row.end_location)}</td><td className="px-3 py-2 text-orange-700">{normalizeText(row.price_match_note || row.match_note || row.price_match_status)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "calculation" && <CalculationDetailsView details={details} />}
    </div>
  );
}
