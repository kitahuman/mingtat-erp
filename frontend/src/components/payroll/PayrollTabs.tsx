"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { payrollApi } from "@/lib/api";
import { fmtDate } from "@/lib/dateUtils";

type TabKey = "detail" | "daily" | "grouped" | "unmatched" | "calculation" | "print";
type SortDirection = "asc" | "desc";
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
  client_contract_no?: string | null;
  contract_no?: string | null;
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
  payroll_work_log_product_name?: string | null;
  payroll_work_log_product_quantity?: number | string | null;
  payroll_work_log_product_unit?: string | null;
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
  client_contract_no?: string | null;
  contract_no?: string | null;
  service_type?: string | null;
  day_night?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  machine_type?: string | null;
  tonnage?: string | null;
  quantity?: number | string | null;
  days?: number | string | null;
  count?: number | string | null;
  product_quantity?: number | string | null;
  billing_quantity?: number | string | null;
  billing_quantity_type?: BillingQuantityType | string | null;
  unit?: string | null;
  matched_unit?: string | null;
  matched_rate?: number | string | null;
  matched_ot_rate?: number | string | null;
  amount?: number | string | null;
  total_amount?: number | string | null;
  ot_quantity?: number | string | null;
  ot_amount?: number | string | null;
  mid_shift_amount?: number | string | null;
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
};

type Adjustment = {
  id?: number | string;
  item_name?: string | null;
  amount?: number | string | null;
  remarks?: string | null;
};

type AllowanceOption = {
  allowance_key?: string | null;
  key?: string | null;
  allowance_name?: string | null;
  name?: string | null;
  amount?: number | string | null;
  default_amount?: number | string | null;
  remarks?: string | null;
};

type CalculationDetails = {
  payroll_summary?: Record<string, number | string | null | undefined>;
  items?: PayrollItem[];
  adjustments?: Adjustment[];
  allowance_options?: AllowanceOption[];
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
  base_amount?: number | string | null;
  base_top_up?: number | string | null;
  base_top_up_amount?: number | string | null;
  ot_amount?: number | string | null;
  ot_hours?: number | string | null;
  allowance_total?: number | string | null;
  daily_allowances?: DailyAllowance[];
  allowances?: DailyAllowance[];
  allowance_badges?: DailyBadge[];
  badges?: DailyBadge[];
  remarks?: string | null;
  details?: string | null;
};

type PayrollSnapshot = {
  id?: number;
  employee?: { name?: string | null; employee_name?: string | null } | null;
  employee_name?: string | null;
  period?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  gross_amount?: number | string | null;
  deduction_total?: number | string | null;
  adjustment_total?: number | string | null;
  net_amount?: number | string | null;
  reimbursement_total?: number | string | null;
  payroll_work_logs?: WorkLogRecord[];
  grouped_settlement?: GroupedSettlementRecord[];
  daily_calculation?: DailyCalculationRecord[];
  items?: PayrollItem[];
  adjustments?: Adjustment[];
  allowance_options?: AllowanceOption[];
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
  readOnly?: boolean;
  className?: string;
  onUpdateWorkLog?: (id: number | string, updates: WorkLogUpdatePayload) => Promise<unknown>;
  onBatchUpdateWorkLogs?: (ids: Array<number | string>, updates: WorkLogUpdatePayload) => Promise<unknown>;
  onBatchDeleteWorkLogs?: (ids: Array<number | string>) => Promise<unknown>;
  onGroupBillingQuantityTypeChange?: (groupKey: string, billingQuantityType: BillingQuantityType) => Promise<unknown>;
};

const TAB_LABELS: Record<TabKey, string> = {
  detail: "逐筆明細",
  daily: "逐日計算",
  grouped: "歸組結算",
  unmatched: "未匹配摘要",
  calculation: "計算明細",
  print: "列印",
};

const DETAIL_COLUMNS: Array<{ key: keyof WorkLogRecord | "route"; label: string; editable?: boolean; numeric?: boolean }> = [
  { key: "scheduled_date", label: "日期", editable: true },
  { key: "client_name", label: "客戶", editable: true },
  { key: "service_type", label: "工種", editable: true },
  { key: "day_night", label: "日/夜", editable: true },
  { key: "route", label: "路線" },
  { key: "quantity", label: "數量", editable: true, numeric: true },
  { key: "unit", label: "單位", editable: true },
  { key: "payroll_work_log_product_quantity", label: "商品數量", editable: true, numeric: true },
  { key: "matched_rate", label: "費率", editable: true, numeric: true },
  { key: "ot_quantity", label: "OT數量", editable: true, numeric: true },
  { key: "matched_ot_rate", label: "OT費率", editable: true, numeric: true },
  { key: "line_amount", label: "金額", numeric: true },
  { key: "price_match_status", label: "匹配" },
  { key: "remarks", label: "備註", editable: true },
];

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
  return row.price_match_status !== "matched";
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
  if (type === "product_quantity") return group.unit || group.matched_unit || "商品";
  if (type === "quantity") return group.unit || group.matched_unit || "數量";
  return "天";
}

function summarizeCalculation(details: CalculationDetails | null | undefined, snapshot: PayrollSnapshot | null): CalculationDetails {
  return {
    payroll_summary: details?.payroll_summary || {
      gross_amount: snapshot?.gross_amount,
      deduction_total: snapshot?.deduction_total,
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
  const [snapshot, setSnapshot] = useState<PayrollSnapshot | null>(null);
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
      allowance_name: option.allowance_name || option.name || "津貼",
      amount: toNumber(option.amount ?? option.default_amount),
    }), "新增每日津貼失敗");
  }

  async function removeDailyAllowance(id: number | string) {
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.removeDailyAllowance(payrollId, Number(id)), "移除每日津貼失敗");
  }

  async function excludeBadge(date: string, badgeKey: string) {
    const ok = window.confirm("確定要移除此津貼？");
    if (!ok) return;
    if (!payrollId) return;
    await mutateAndReload(() => payrollApi.excludeBadge(payrollId, { date, badge_key: badgeKey }), "移除津貼失敗");
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
        <button type="button" onClick={loadSnapshot} disabled={loading || saving} className="btn-secondary text-sm">{loading ? "重新載入中..." : "重新載入分頁資料"}</button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryPill label="有效工作記錄" value={`${activeCount} 筆`} tone="blue" />
        <SummaryPill label="已匹配" value={`${matchedCount} 筆`} tone="green" />
        <SummaryPill label="未匹配" value={`${unmatchedCount} 筆`} tone="amber" />
        <SummaryPill label="已移除" value={`${excludedCount} 筆`} tone="gray" />
      </div>

      {activeTab === "detail" && <DetailTab rows={filteredRows} selectedIds={selectedIds} visibleAllSelected={visibleAllSelected} saving={saving} readOnly={readOnly} sortKey={sortKey} sortDirection={sortDirection} filterText={filterText} statusFilter={statusFilter} editingCell={editingCell} cellDraft={cellDraft} onFilterTextChange={setFilterText} onStatusFilterChange={setStatusFilter} onToggleSort={toggleSort} onToggleAll={toggleAllVisible} onToggleRow={toggleRow} onStartEdit={startEdit} onCellDraftChange={setCellDraft} onSaveCell={saveCell} onCancelEdit={cancelEdit} onBatchUpdate={batchUpdate} onExcludeRows={excludeRows} onRestoreRows={restoreRows} />}
      {activeTab === "grouped" && <GroupedTab groups={groups} readOnly={readOnly || saving || !payrollId} onBillingTypeChange={setGroupBillingQuantityType} onSetGroupRate={setGroupRate} onOpenRateCard={openRateCardModal} />}
      {activeTab === "daily" && <DailyTab days={dailyRows} allowanceOptions={calculation.allowance_options || []} expandedDay={expandedDay} readOnly={readOnly || saving || !payrollId} onToggleExpand={(date) => setExpandedDay((prev) => (prev === date ? null : date))} onAddAllowance={addDailyAllowance} onRemoveAllowance={removeDailyAllowance} onExcludeBadge={excludeBadge} onSaveTopUpOverride={saveTopUpOverride} />}
      {activeTab === "unmatched" && <UnmatchedTab groups={computedUnmatchedGroups} readOnly={readOnly || saving || !payrollId} onOpenRateCard={openRateCardModal} />}
      {activeTab === "calculation" && <CalculationTab calculation={calculation} />}
      {activeTab === "print" && <PrintTab rows={rows} groups={groups} calculation={calculation} snapshot={snapshot} printRef={printRef} showGroupedInPrint={showGroupedInPrint} onShowGroupedChange={setShowGroupedInPrint} onPrint={printPayroll} />}

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
  selectedIds: Set<number | string>;
  visibleAllSelected: boolean;
  saving: boolean;
  readOnly: boolean;
  sortKey: keyof WorkLogRecord | "route";
  sortDirection: SortDirection;
  filterText: string;
  statusFilter: "all" | "matched" | "unmatched" | "excluded";
  editingCell: { id: number | string; field: keyof WorkLogRecord } | null;
  cellDraft: string;
  onFilterTextChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | "matched" | "unmatched" | "excluded") => void;
  onToggleSort: (key: keyof WorkLogRecord | "route") => void;
  onToggleAll: () => void;
  onToggleRow: (id: number | string) => void;
  onStartEdit: (row: WorkLogRecord, field: keyof WorkLogRecord) => void;
  onCellDraftChange: (value: string) => void;
  onSaveCell: (row: WorkLogRecord, field: keyof WorkLogRecord, numeric?: boolean) => Promise<void>;
  onCancelEdit: () => void;
  onBatchUpdate: (updates: WorkLogUpdatePayload) => Promise<void>;
  onExcludeRows: (ids: Array<number | string>) => Promise<void>;
  onRestoreRows: (ids: Array<number | string>) => Promise<void>;
};

function DetailTab({ rows, selectedIds, visibleAllSelected, saving, readOnly, sortKey, sortDirection, filterText, statusFilter, editingCell, cellDraft, onFilterTextChange, onStatusFilterChange, onToggleSort, onToggleAll, onToggleRow, onStartEdit, onCellDraftChange, onSaveCell, onCancelEdit, onBatchUpdate, onExcludeRows, onRestoreRows }: DetailTabProps) {
  const selected = Array.from(selectedIds);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={filterText} onChange={(e) => onFilterTextChange(e.target.value)} placeholder="搜尋日期、客戶、工種、路線、備註..." className="input flex min-w-[260px] flex-1" />
        <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value as DetailTabProps["statusFilter"])} className="input w-36"><option value="all">全部</option><option value="matched">已匹配</option><option value="unmatched">未匹配</option><option value="excluded">已移除</option></select>
        <button type="button" disabled={readOnly || saving || selected.length === 0} onClick={() => onBatchUpdate({ day_night: "日" })} className="btn-secondary text-sm">批量設日</button>
        <button type="button" disabled={readOnly || saving || selected.length === 0} onClick={() => onBatchUpdate({ day_night: "夜" })} className="btn-secondary text-sm">批量設夜</button>
        <button type="button" disabled={readOnly || saving || selected.length === 0} onClick={() => onExcludeRows(selected)} className="btn-secondary border-red-200 text-sm text-red-600 hover:bg-red-50">批量移除</button>
        <button type="button" disabled={readOnly || saving || selected.length === 0} onClick={() => onRestoreRows(selected)} className="btn-secondary border-green-200 text-sm text-green-600 hover:bg-green-50">批量恢復</button>
      </div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1320px] text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-center"><input type="checkbox" checked={visibleAllSelected} onChange={onToggleAll} /></th>{DETAIL_COLUMNS.map((column) => <th key={String(column.key)} className={`px-3 py-2 font-medium text-gray-600 ${column.numeric ? "text-right" : "text-left"}`}><button type="button" onClick={() => onToggleSort(column.key)} className="inline-flex items-center gap-1 hover:text-gray-900">{column.label}{sortKey === column.key && <span className="text-[10px]">{sortDirection === "asc" ? "▲" : "▼"}</span>}</button></th>)}<th className="px-3 py-2 text-center font-medium text-gray-600">操作</th></tr></thead><tbody>{rows.length === 0 && <tr><td colSpan={DETAIL_COLUMNS.length + 2} className="px-3 py-8 text-center text-gray-500">沒有符合條件的工作記錄。</td></tr>}{rows.map((row) => <tr key={row.id} className={`border-b hover:bg-gray-50 ${row.is_excluded ? "bg-gray-50 text-gray-400" : isUnmatched(row) ? "bg-amber-50/40" : ""}`}><td className="px-3 py-2 text-center"><input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => onToggleRow(row.id)} /></td>{DETAIL_COLUMNS.map((column) => <EditableCell key={String(column.key)} row={row} column={column} editingCell={editingCell} cellDraft={cellDraft} readOnly={readOnly} onStartEdit={onStartEdit} onCellDraftChange={onCellDraftChange} onSaveCell={onSaveCell} onCancelEdit={onCancelEdit} />)}<td className="px-3 py-2 text-center">{row.is_excluded ? <button type="button" disabled={readOnly || saving} onClick={() => onRestoreRows([row.id])} className="text-xs font-medium text-green-600 hover:underline">恢復</button> : <button type="button" disabled={readOnly || saving} onClick={() => onExcludeRows([row.id])} className="text-xs font-medium text-red-600 hover:underline">移除</button>}</td></tr>)}</tbody></table></div>
      <p className="mt-2 text-xs text-gray-500">提示：可點擊可編輯儲存格直接修改。未匹配行的「費率」及「OT費率」可手動輸入單價，儲存後會重新計算所有分頁。</p>
    </div>
  );
}

function EditableCell({ row, column, editingCell, cellDraft, readOnly, onStartEdit, onCellDraftChange, onSaveCell, onCancelEdit }: { row: WorkLogRecord; column: { key: keyof WorkLogRecord | "route"; label: string; editable?: boolean; numeric?: boolean }; editingCell: { id: number | string; field: keyof WorkLogRecord } | null; cellDraft: string; readOnly: boolean; onStartEdit: (row: WorkLogRecord, field: keyof WorkLogRecord) => void; onCellDraftChange: (value: string) => void; onSaveCell: (row: WorkLogRecord, field: keyof WorkLogRecord, numeric?: boolean) => Promise<void>; onCancelEdit: () => void }) {
  const key = column.key;
  const editableField = key !== "route" && column.editable;
  const editable = Boolean(editableField && !readOnly && !row.is_excluded && (key !== "matched_rate" && key !== "matched_ot_rate" ? true : isUnmatched(row)));
  const isEditing = editableField && editingCell?.id === row.id && editingCell.field === key;
  const value = readCell(row, key);
  const tdClass = `px-3 py-2 ${column.numeric ? "text-right font-mono" : "text-left"} ${row.is_excluded ? "line-through opacity-60" : ""}`;
  if (isEditing && editableField) return <td className={tdClass}><input autoFocus type={column.numeric ? "number" : key === "scheduled_date" ? "date" : "text"} value={cellDraft} onChange={(e) => onCellDraftChange(e.target.value)} onBlur={() => onSaveCell(row, key, column.numeric)} onKeyDown={(e) => { if (e.key === "Enter") onSaveCell(row, key, column.numeric); if (e.key === "Escape") onCancelEdit(); }} className="input h-8 min-w-[90px] px-2 py-1 text-sm" /></td>;
  let content: ReactNode = value === null || value === undefined || value === "" ? "-" : String(value);
  if (key === "scheduled_date") content = displayDate(row.scheduled_date);
  if (key === "matched_rate" || key === "matched_ot_rate" || key === "line_amount") content = formatMoney(value as number | string | null | undefined);
  if (key === "price_match_status") content = isUnmatched(row) ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">未匹配</span> : <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">已匹配</span>;
  return <td className={`${tdClass} ${editable ? "cursor-pointer hover:bg-primary-50" : ""}`} onClick={() => editable && editableField && onStartEdit(row, key)} title={editable ? "點擊編輯" : undefined}>{content}</td>;
}

function GroupedTab({ groups, readOnly, onBillingTypeChange, onSetGroupRate, onOpenRateCard }: { groups: GroupedSettlementRecord[]; readOnly: boolean; onBillingTypeChange: (group: GroupedSettlementRecord, billingType: BillingQuantityType) => Promise<void>; onSetGroupRate: (group: GroupedSettlementRecord) => Promise<void>; onOpenRateCard: (source: RateCardSource) => void }) {
  if (groups.length === 0) return <div className="rounded-lg border border-gray-200 bg-gray-50 py-10 text-center text-gray-500">暫無歸組結算資料。</div>;
  return <div><div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">可按每個歸組選擇計費數量類型。單位邏輯會按「天數 / 數量 / 商品數量」顯示對應數量與單位；未匹配組合可手動設定單價或加入價目表。</div><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1180px] text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left font-medium text-gray-600">客戶 / 合約</th><th className="px-3 py-2 text-left font-medium text-gray-600">工種</th><th className="px-3 py-2 text-center font-medium text-gray-600">日/夜</th><th className="px-3 py-2 text-left font-medium text-gray-600">路線</th><th className="px-3 py-2 text-left font-medium text-gray-600">計費數量類型</th><th className="px-3 py-2 text-right font-medium text-gray-600">計費數量</th><th className="px-3 py-2 text-right font-medium text-gray-600">單價</th><th className="px-3 py-2 text-right font-medium text-gray-600">OT</th><th className="px-3 py-2 text-right font-medium text-gray-600">金額</th><th className="px-3 py-2 text-left font-medium text-gray-600">狀態</th><th className="px-3 py-2 text-center font-medium text-gray-600">操作</th></tr></thead><tbody>{groups.map((group) => { const billingType = (group.billing_quantity_type || "days") as BillingQuantityType; const source = buildRateCardSourceFromGroup(group); return <tr key={normalizeGroupKey(group)} className={`border-b hover:bg-gray-50 ${isUnmatched(group) ? "bg-amber-50/40" : ""}`}><td className="px-3 py-2"><div className="font-medium">{group.client_name || group.company_name || "-"}</div><div className="text-xs text-gray-500">{group.client_contract_no || group.contract_no || "-"}</div></td><td className="px-3 py-2">{group.service_type || "-"}</td><td className="px-3 py-2 text-center">{group.day_night || "-"}</td><td className="px-3 py-2 text-gray-600">{routeOf(group)}</td><td className="px-3 py-2"><select disabled={readOnly} value={billingType} onChange={(e) => onBillingTypeChange(group, e.target.value as BillingQuantityType)} className="input h-8 min-w-[120px] px-2 py-1 text-sm"><option value="days">天數</option><option value="quantity">數量</option><option value="product_quantity">商品數量</option></select></td><td className="px-3 py-2 text-right font-mono">{formatPlainNumber(groupBillingQuantity(group))} {groupBillingUnit(group)}</td><td className="px-3 py-2 text-right font-mono">{isUnmatched(group) && !readOnly ? <button type="button" onClick={() => onSetGroupRate(group)} className="font-medium text-primary-600 hover:underline">{asOptionalNumber(group.matched_rate) !== undefined ? formatMoney(group.matched_rate) : "輸入單價"}</button> : formatMoney(group.matched_rate)}</td><td className="px-3 py-2 text-right font-mono">{formatMoney(group.ot_amount)}<div className="text-[11px] text-gray-500">OT價 {formatMoney(group.matched_ot_rate)}</div></td><td className="px-3 py-2 text-right font-mono font-bold text-primary-600">{formatMoney(group.total_amount ?? group.amount)}</td><td className="px-3 py-2 text-xs">{isUnmatched(group) ? <span className="text-amber-700">{group.price_match_note || "未匹配"}</span> : <span className="text-green-700">已匹配</span>}</td><td className="px-3 py-2 text-center"><button type="button" disabled={readOnly} onClick={() => onOpenRateCard(source)} className="text-xs font-medium text-primary-600 hover:underline">加入價目表</button></td></tr>; })}</tbody></table></div></div>;
}

function DailyTab({ days, allowanceOptions, expandedDay, readOnly, onToggleExpand, onAddAllowance, onRemoveAllowance, onExcludeBadge, onSaveTopUpOverride }: { days: DailyCalculationRecord[]; allowanceOptions: AllowanceOption[]; expandedDay: string | null; readOnly: boolean; onToggleExpand: (date: string) => void; onAddAllowance: (date: string, option: AllowanceOption) => Promise<void>; onRemoveAllowance: (id: number | string) => Promise<void>; onExcludeBadge: (date: string, badgeKey: string) => Promise<void>; onSaveTopUpOverride: (date: string) => Promise<void> }) {
  if (days.length === 0) return <div className="rounded-lg border border-gray-200 bg-gray-50 py-10 text-center text-gray-500">暫無逐日計算資料。</div>;
  return <div className="space-y-3">{days.map((day, index) => { const date = day.date || `day-${index}`; const workLogs = day.work_logs || day.logs || []; const allowances = day.daily_allowances || day.allowances || []; const badges = day.allowance_badges || day.badges || []; const topUp = day.base_top_up ?? day.base_top_up_amount; return <div key={date} className="rounded-xl border bg-white shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3 p-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-gray-900">{displayDate(day.date)}</h3>{day.weekday && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{day.weekday}</span>}{day.is_holiday && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">{day.holiday_name || "假期"}</span>}</div><div className="mt-2 flex flex-wrap gap-2">{badges.map((badge, idx) => { const badgeKey = badge.badge_key || badge.key || String(idx); return <span key={badgeKey} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${badge.className || "bg-green-100 text-green-700"}`}>{badge.label || badge.name || "津貼"} {badge.amount !== undefined && ` ${formatMoney(badge.amount)}`}{!readOnly && badge.removable && day.date && <button type="button" onClick={() => onExcludeBadge(day.date || "", badgeKey)} className="ml-1 font-bold hover:opacity-70">×</button>}</span>; })}{allowances.map((allowance) => <span key={allowance.id || allowance.allowance_key || allowance.key} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">{allowance.allowance_name || allowance.name || "津貼"} {formatMoney(allowance.amount)}{!readOnly && allowance.id && <button type="button" onClick={() => onRemoveAllowance(allowance.id as number | string)} className="ml-1 font-bold hover:opacity-70">×</button>}</span>)}</div></div><div className="grid grid-cols-2 gap-2 text-right md:grid-cols-5"><DailyMetric label="工作" value={`${workLogs.length} 筆`} /><DailyMetric label="底薪" value={formatMoney(day.base_amount)} /><DailyMetric label="補底薪" value={formatMoney(topUp)} action={!readOnly && day.date ? () => onSaveTopUpOverride(day.date || "") : undefined} /><DailyMetric label="OT" value={formatMoney(day.ot_amount)} sub={day.ot_hours ? `${day.ot_hours} 小時` : undefined} /><DailyMetric label="合計" value={formatMoney(day.total_amount)} strong /></div></div><div className="border-t px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2">{allowanceOptions.slice(0, 6).map((option) => <button key={option.allowance_key || option.key || option.allowance_name || option.name} type="button" disabled={readOnly || !day.date} onClick={() => onAddAllowance(day.date || "", option)} className="btn-secondary text-xs">加 {option.allowance_name || option.name || "津貼"}</button>)}</div><button type="button" onClick={() => onToggleExpand(date)} className="text-sm font-medium text-primary-600 hover:underline">{expandedDay === date ? "收起詳情" : "展開詳情"}</button></div>{expandedDay === date && <div className="mt-3 overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">工種</th><th className="px-3 py-2 text-left">路線</th><th className="px-3 py-2 text-right">數量</th><th className="px-3 py-2 text-right">單價</th><th className="px-3 py-2 text-right">金額</th><th className="px-3 py-2 text-left">備註</th></tr></thead><tbody>{workLogs.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">本日沒有工作記錄。</td></tr>}{workLogs.map((row) => <tr key={row.id} className="border-b"><td className="px-3 py-2">{row.service_type || "-"}</td><td className="px-3 py-2 text-gray-600">{routeOf(row)}</td><td className="px-3 py-2 text-right font-mono">{formatPlainNumber(row.quantity)} {row.unit || ""}</td><td className="px-3 py-2 text-right font-mono">{formatMoney(row.matched_rate)}</td><td className="px-3 py-2 text-right font-mono">{formatMoney(row.line_amount)}</td><td className="px-3 py-2 text-xs text-gray-500">{row.remarks || "-"}</td></tr>)}</tbody></table></div>}</div></div>; })}</div>;
}

function DailyMetric({ label, value, sub, strong, action }: { label: string; value: string; sub?: string; strong?: boolean; action?: () => void }) {
  return <button type="button" onClick={action} disabled={!action} className={`rounded-lg bg-gray-50 px-3 py-2 ${action ? "hover:bg-primary-50" : "cursor-default"}`}><div className="text-[11px] text-gray-500">{label}</div><div className={`font-mono ${strong ? "font-bold text-primary-700" : "font-semibold text-gray-900"}`}>{value}</div>{sub && <div className="text-[11px] text-gray-500">{sub}</div>}</button>;
}

function UnmatchedTab({ groups, readOnly, onOpenRateCard }: { groups: UnmatchedGroup[]; readOnly: boolean; onOpenRateCard: (source: RateCardSource) => void }) {
  if (groups.length === 0) return <div className="rounded-lg border border-green-100 bg-green-50 py-10 text-center text-green-700">所有工作記錄已成功匹配價目。</div>;
  return <div><div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">以下工作記錄未能自動匹配價目。可直接將組合加入價目表，重新計算後相關分頁會同步更新。</div><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[980px] text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">客戶</th><th className="px-3 py-2 text-left">合約</th><th className="px-3 py-2 text-center">日/夜</th><th className="px-3 py-2 text-left">路線</th><th className="px-3 py-2 text-right">數量</th><th className="px-3 py-2 text-right">筆數</th><th className="px-3 py-2 text-left">原因</th><th className="px-3 py-2 text-center">操作</th></tr></thead><tbody>{groups.map((group) => <tr key={group.key} className="border-b hover:bg-amber-50/50"><td className="px-3 py-2 font-medium">{group.clientName}</td><td className="px-3 py-2 text-gray-600">{group.contractNo}</td><td className="px-3 py-2 text-center">{group.dayNight}</td><td className="px-3 py-2 text-gray-600">{group.route}</td><td className="px-3 py-2 text-right font-mono">{group.quantity.toLocaleString()} {group.unit}</td><td className="px-3 py-2 text-right font-mono">{group.count}</td><td className="px-3 py-2 text-xs text-amber-700">{group.reason}</td><td className="px-3 py-2 text-center"><button type="button" disabled={readOnly} onClick={() => onOpenRateCard(group.source)} className="text-xs font-medium text-primary-600 hover:underline">加入價目表</button></td></tr>)}</tbody></table></div></div>;
}

function CalculationTab({ calculation }: { calculation: CalculationDetails }) {
  const summary = calculation.payroll_summary || {};
  const items = calculation.items || [];
  const adjustments = calculation.adjustments || [];
  const allowanceOptions = calculation.allowance_options || [];
  return <div className="space-y-5"><section><h3 className="mb-3 font-bold text-gray-900">糧單摘要</h3><div className="grid gap-3 md:grid-cols-5">{Object.entries(summary).map(([key, value]) => <SummaryPill key={key} label={key} value={formatMoney(value)} tone={key === "net_amount" ? "green" : "blue"} />)}{Object.keys(summary).length === 0 && <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-500">暫無摘要資料。</div>}</div></section><SimpleTable title="薪酬項目 items" rows={items} columns={["item_type", "item_name", "unit_price", "quantity", "amount", "remarks"]} moneyColumns={["unit_price", "amount"]} /><SimpleTable title="調整項 adjustments" rows={adjustments} columns={["item_name", "amount", "remarks"]} moneyColumns={["amount"]} /><SimpleTable title="津貼選項 allowance_options" rows={allowanceOptions} columns={["allowance_key", "allowance_name", "amount", "default_amount", "remarks"]} moneyColumns={["amount", "default_amount"]} /></div>;
}

type SimpleRow = Record<string, string | number | boolean | null | undefined>;
function SimpleTable({ title, rows, columns, moneyColumns }: { title: string; rows: SimpleRow[]; columns: string[]; moneyColumns: string[] }) {
  return <section><h3 className="mb-2 font-bold text-gray-900">{title}</h3><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-gray-50"><tr>{columns.map((column) => <th key={column} className="px-3 py-2 text-left font-medium text-gray-600">{column}</th>)}</tr></thead><tbody>{rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500">暫無資料。</td></tr>}{rows.map((row, index) => <tr key={String(row.id || index)} className="border-b">{columns.map((column) => <td key={column} className="px-3 py-2 text-gray-700">{moneyColumns.includes(column) ? formatMoney(row[column] as number | string | null | undefined) : String(row[column] ?? "-")}</td>)}</tr>)}</tbody></table></div></section>;
}

function PrintTab({ rows, groups, calculation, snapshot, printRef, showGroupedInPrint, onShowGroupedChange, onPrint }: { rows: WorkLogRecord[]; groups: GroupedSettlementRecord[]; calculation: CalculationDetails; snapshot: PayrollSnapshot | null; printRef: React.RefObject<HTMLDivElement | null>; showGroupedInPrint: boolean; onShowGroupedChange: (value: boolean) => void; onPrint: () => void }) {
  const employeeName = snapshot?.employee?.name || snapshot?.employee?.employee_name || snapshot?.employee_name || "-";
  const period = snapshot?.period || [snapshot?.date_from, snapshot?.date_to].filter(Boolean).map((d) => displayDate(d)).join(" 至 ") || "-";
  const summary = calculation.payroll_summary || {};
  return <div><div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-gray-50 p-3"><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={showGroupedInPrint} onChange={(e) => onShowGroupedChange(e.target.checked)} />列印歸組結算</label><button type="button" onClick={onPrint} className="btn-primary">列印預覽</button></div><div ref={printRef} className="rounded-lg border bg-white p-6"><div className="mb-6 text-center"><h1 className="text-2xl font-bold">糧單</h1><p className="mt-1 text-sm text-gray-500">{employeeName}　{period}</p></div><div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">{Object.entries(summary).map(([key, value]) => <div key={key} className="rounded border p-3"><div className="text-xs text-gray-500">{key}</div><div className="font-mono font-bold">{formatMoney(value)}</div></div>)}</div>{showGroupedInPrint && <PrintGroupedSettlement groups={groups} />}<h2 className="mb-2 mt-5 font-bold">工作記錄明細</h2><table className="print-table w-full border-collapse text-sm"><thead><tr><th>日期</th><th>客戶</th><th>工種</th><th>路線</th><th className="text-right">數量</th><th className="text-right">單價</th><th className="text-right">金額</th></tr></thead><tbody>{rows.filter((row) => !row.is_excluded).map((row) => <tr key={row.id}><td>{displayDate(row.scheduled_date)}</td><td>{row.client_name || row.company_name || "-"}</td><td>{row.service_type || "-"}</td><td>{routeOf(row)}</td><td className="text-right">{formatPlainNumber(row.quantity)} {row.unit || ""}</td><td className="text-right">{formatMoney(row.matched_rate)}</td><td className="text-right">{formatMoney(row.line_amount)}</td></tr>)}</tbody></table></div></div>;
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
