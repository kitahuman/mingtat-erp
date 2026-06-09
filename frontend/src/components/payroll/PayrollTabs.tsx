"use client";

import { useEffect, useMemo, useState } from "react";

type BillingQuantityType = "days" | "quantity" | "product_quantity";
type SortDirection = "asc" | "desc";

type PayrollRecord = Record<string, any> & {
  id: number | string;
  scheduled_date?: string | Date | null;
  service_type?: string | null;
  day_night?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  machine_type?: string | null;
  tonnage?: string | null;
  equipment_number?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  ot_quantity?: number | string | null;
  ot_unit?: string | null;
  is_mid_shift?: boolean | null;
  remarks?: string | null;
  matched_rate?: number | string | null;
  matched_unit?: string | null;
  line_amount?: number | string | null;
  price_match_status?: string | null;
  payroll_work_log_product_quantity?: number | string | null;
  work_log_product_quantity?: number | string | null;
  goods_quantity?: number | string | null;
  product_quantity?: number | string | null;
  billing_quantity_type?: BillingQuantityType | string | null;
  group_key?: string | null;
};

type PayrollGroup = Record<string, any> & {
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

export type PayrollTabsProps = {
  workLogs: PayrollRecord[];
  groupedSettlement?: PayrollGroup[];
  dailyCalculation?: any[];
  unmatchedRecords?: PayrollRecord[];
  calculationDetails?: any;
  calculation?: any;
  readOnly?: boolean;
  className?: string;
  onUpdateWorkLog?: (id: number | string, updates: Record<string, any>) => Promise<void> | void;
  onBatchUpdateWorkLogs?: (ids: Array<number | string>, updates: Record<string, any>) => Promise<void> | void;
  onBatchDeleteWorkLogs?: (ids: Array<number | string>) => Promise<void> | void;
  onGroupBillingQuantityTypeChange?: (groupKey: string, billingQuantityType: BillingQuantityType) => Promise<void> | void;
};

const TAB_DEFS = [
  { key: "detail", label: "逐筆明細（可編輯）" },
  { key: "grouped", label: "歸組結算" },
  { key: "daily", label: "逐日計算" },
  { key: "unmatched", label: "未匹配摘要" },
  { key: "calculation", label: "計算明細" },
] as const;

const DETAIL_COLUMNS: Array<{
  key: string;
  label: string;
  editable?: boolean;
  type?: "text" | "number" | "date" | "select" | "checkbox";
  options?: string[];
  className?: string;
}> = [
  { key: "scheduled_date", label: "日期", editable: true, type: "date" },
  { key: "service_type", label: "服務類型", editable: true, type: "text" },
  { key: "day_night", label: "日/夜", editable: true, type: "select", options: ["日", "夜", "中直"] },
  { key: "start_location", label: "起點", editable: true, type: "text" },
  { key: "end_location", label: "終點", editable: true, type: "text" },
  { key: "machine_type", label: "車種/機械", editable: true, type: "text" },
  { key: "tonnage", label: "噸數", editable: true, type: "text" },
  { key: "equipment_number", label: "車牌/編號", editable: true, type: "text" },
  { key: "quantity", label: "數量", editable: true, type: "number", className: "text-right" },
  { key: "unit", label: "單位", editable: true, type: "text" },
  { key: "payroll_work_log_product_quantity", label: "商品數量", editable: true, type: "number", className: "text-right" },
  { key: "ot_quantity", label: "OT", editable: true, type: "number", className: "text-right" },
  { key: "ot_unit", label: "OT單位", editable: true, type: "text" },
  { key: "is_mid_shift", label: "中直", editable: true, type: "checkbox" },
  { key: "matched_rate", label: "單價", type: "number", className: "text-right" },
  { key: "line_amount", label: "金額", type: "number", className: "text-right" },
  { key: "price_match_status", label: "匹配", type: "text" },
  { key: "remarks", label: "備註", editable: true, type: "text" },
];

const BATCH_FIELDS = [
  { key: "service_type", label: "服務類型", type: "text" },
  { key: "day_night", label: "日/夜", type: "select", options: ["日", "夜", "中直"] },
  { key: "start_location", label: "起點", type: "text" },
  { key: "end_location", label: "終點", type: "text" },
  { key: "machine_type", label: "車種/機械", type: "text" },
  { key: "tonnage", label: "噸數", type: "text" },
] as const;

function formatDate(value: any) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return String(value).slice(0, 10);
  }
}

function asNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value: any) {
  return `$${asNumber(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function normalizeText(value: any) {
  if (value === null || value === undefined || value === "") return "—";
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
      client_contract_no: row.client_contract_no || row.quotation_no || "",
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

function buildUniqueOptions(rows: PayrollRecord[], key: string) {
  return Array.from(new Set(rows.map((row) => normalizeText(row[key])).filter((value) => value !== "—"))).sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function renderJsonLike(value: any) {
  if (!value) return <div className="text-sm text-gray-500">沒有可顯示的資料。</div>;
  if (typeof value === "string" || typeof value === "number") return <div className="text-sm text-gray-700">{String(value)}</div>;
  return <pre className="max-h-[520px] overflow-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">{JSON.stringify(value, null, 2)}</pre>;
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
  const [sortKey, setSortKey] = useState<string>("scheduled_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchField, setBatchField] = useState<string>("service_type");
  const [batchValue, setBatchValue] = useState<string>("");
  const [localGroupTypes, setLocalGroupTypes] = useState<Record<string, BillingQuantityType>>({});

  useEffect(() => {
    setRows(workLogs || []);
    setSelectedIds(new Set());
  }, [workLogs]);

  const groups = useMemo(() => {
    const source = groupedSettlement && groupedSettlement.length > 0 ? groupedSettlement : deriveGroupsFromRows(rows);
    return source.map((group) => ({
      ...group,
      billing_quantity_type: localGroupTypes[group.group_key || ""] || group.billing_quantity_type || "quantity",
    }));
  }, [groupedSettlement, rows, localGroupTypes]);

  const filteredSortedRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      return DETAIL_COLUMNS.every((column) => {
        const filter = filters[column.key];
        if (!filter) return true;
        const raw = column.key === "scheduled_date" ? formatDate(row[column.key]) : normalizeText(row[column.key]);
        return raw.toLowerCase().includes(filter.toLowerCase());
      });
    });

    return [...filtered].sort((a, b) => {
      const av = sortKey === "scheduled_date" ? formatDate(a[sortKey]) : a[sortKey];
      const bv = sortKey === "scheduled_date" ? formatDate(b[sortKey]) : b[sortKey];
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
  }, [rows, filters, sortKey, sortDirection]);

  const effectiveUnmatched = useMemo(() => {
    if (unmatchedRecords) return unmatchedRecords;
    return rows.filter((row) => row.price_match_status && row.price_match_status !== "matched");
  }, [unmatchedRecords, rows]);

  const selectedCount = selectedIds.size;
  const selectedRows = rows.filter((row) => selectedIds.has(String(row.id)));

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(filteredSortedRows.map((row) => String(row.id))));
    } else {
      setSelectedIds(new Set());
    }
  }

  function toggleRow(id: number | string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(String(id));
      else next.delete(String(id));
      return next;
    });
  }

  async function commitRowUpdate(id: number | string, key: string, value: any) {
    setRows((prev) => prev.map((row) => (String(row.id) === String(id) ? { ...row, [key]: value, is_modified: true } : row)));
    if (onUpdateWorkLog) await onUpdateWorkLog(id, { [key]: value });
  }

  async function applyBatchUpdate() {
    if (!batchField || selectedCount === 0) return;
    const updates = { [batchField]: batchValue };
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

  function renderEditor(row: PayrollRecord, column: (typeof DETAIL_COLUMNS)[number]) {
    const value = column.key === "scheduled_date" ? formatDate(row[column.key]) : row[column.key] ?? "";
    const disabled = readOnly || !column.editable;

    if (disabled) {
      if (column.type === "checkbox") return row[column.key] ? "是" : "否";
      if (column.key.includes("amount") || column.key.includes("rate")) return column.key.includes("amount") ? formatMoney(value) : normalizeText(value);
      return normalizeText(value);
    }

    const baseClass = "w-full min-w-[88px] rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
    if (column.type === "select") {
      return (
        <select value={value} onChange={(event) => commitRowUpdate(row.id, column.key, event.target.value)} className={baseClass}>
          <option value="">請選擇</option>
          {(column.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    if (column.type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => commitRowUpdate(row.id, column.key, event.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      );
    }
    return (
      <input
        type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"}
        value={value}
        onChange={(event) => {
          const nextValue = column.type === "number" ? event.target.value : event.target.value;
          setRows((prev) => prev.map((r) => (String(r.id) === String(row.id) ? { ...r, [column.key]: nextValue } : r)));
        }}
        onBlur={(event) => commitRowUpdate(row.id, column.key, column.type === "number" ? Number(event.target.value || 0) : event.target.value)}
        className={`${baseClass} ${column.className || ""}`}
      />
    );
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
                {BATCH_FIELDS.find((field) => field.key === batchField)?.type === "select" ? (
                  <select value={batchValue} onChange={(event) => setBatchValue(event.target.value)} className="rounded border border-blue-200 bg-white px-2 py-1 text-sm">
                    <option value="">請選擇</option>
                    {(BATCH_FIELDS.find((field) => field.key === batchField) as any)?.options?.map((option: string) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input value={batchValue} onChange={(event) => setBatchValue(event.target.value)} className="rounded border border-blue-200 bg-white px-2 py-1 text-sm" />
                )}
              </label>
              <button type="button" onClick={applyBatchUpdate} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">套用</button>
              {onBatchDeleteWorkLogs && (
                <button type="button" onClick={applyBatchDelete} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">批量刪除</button>
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
                  {DETAIL_COLUMNS.map((column) => {
                    const options = buildUniqueOptions(rows, column.key);
                    return (
                      <th key={column.key} className="min-w-[120px] px-3 py-2 text-left align-top font-medium text-gray-700">
                        <button type="button" onClick={() => toggleSort(column.key)} className="flex w-full items-center justify-between gap-2 text-left hover:text-blue-700">
                          <span>{column.label}</span>
                          <span className="text-[10px] text-gray-400">{sortKey === column.key ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                        <div className="mt-1 flex gap-1">
                          <input
                            value={filters[column.key] || ""}
                            onChange={(event) => setFilters((prev) => ({ ...prev, [column.key]: event.target.value }))}
                            placeholder="篩選"
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-normal text-gray-700 focus:border-blue-500 focus:outline-none"
                            list={`payroll-filter-${column.key}`}
                          />
                          <datalist id={`payroll-filter-${column.key}`}>{options.map((option) => <option key={option} value={option} />)}</datalist>
                        </div>
                      </th>
                    );
                  })}
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
                    {DETAIL_COLUMNS.map((column) => <td key={column.key} className={`px-3 py-2 align-middle ${column.className || ""}`}>{renderEditor(row, column)}</td>)}
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
                        onChange={(event) => handleGroupTypeChange(groupKey, event.target.value as BillingQuantityType)}
                        disabled={readOnly}
                        className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value="days">天數</option>
                        <option value="quantity">數量</option>
                        <option value="product_quantity">商品數量</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{billingQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}{(group as any).matched_unit || (group as any).unit || ""}</td>
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
          {!dailyCalculation || dailyCalculation.length === 0 ? <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">沒有逐日計算資料。</div> : dailyCalculation.map((day: any, index: number) => (
            <div key={day.date || index} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold text-gray-900">{formatDate(day.date) || day.date || `第 ${index + 1} 日`}</h3><span className="font-mono text-sm text-blue-700">{formatMoney(day.total_amount ?? day.amount ?? day.daily_total ?? 0)}</span></div>
              {renderJsonLike(day.work_logs || day.items || day.details || day)}
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

      {activeTab === "calculation" && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          {renderJsonLike(calculationDetails || calculation)}
        </div>
      )}
    </div>
  );
}
