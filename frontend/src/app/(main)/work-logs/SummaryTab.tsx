'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { workLogsApi, companiesApi, partnersApi, employeesApi, fieldOptionsApi, vehiclesApi, machineryApi, contractsApi, quotationsApi } from '@/lib/api';
import DateInput from '@/components/DateInput';

interface Option { value: string; label: string; }

type PivotDimension =
  | 'none'
  | 'employee'
  | 'equipment_number'
  | 'client'
  | 'company'
  | 'machine_type'
  | 'start_location'
  | 'end_location'
  | 'contract'
  | 'quotation'
  | 'scheduled_date'
  | 'week'
  | 'month'
  | 'day_night'
  | 'service_type';

type PivotValueType = 'count' | 'quantity_sum' | 'ot_sum' | 'mid_shift_count';

type QuickRange = 'week' | 'month' | 'lastMonth' | 'quarter';

interface PivotAxisItem {
  key: string;
  values: string[];
  labels: string[];
}

interface PivotMetric {
  value: number;
  unit: string;
}

interface PivotSummary {
  totalRecords: number;
  confirmedCount: number;
  totalQuantity: number;
  priceMatchRate: number;
  employeeCount: number;
  equipmentCount: number;
}

interface WorkLogPivotResult {
  rows: PivotAxisItem[];
  cols: PivotAxisItem[];
  data: Record<string, PivotMetric>;
  rowTotals: Record<string, PivotMetric>;
  colTotals: Record<string, PivotMetric>;
  grandTotal: PivotMetric;
  summary: PivotSummary;
}

interface AxisNode {
  key: string;
  label: string;
  labels: string[];
  depth: number;
  children: AxisNode[];
  leafKey?: string;
}

interface RowEntry {
  key: string;
  labels: string[];
  depth: number;
  label: string;
  isGroup: boolean;
  isLeaf: boolean;
  canToggle: boolean;
}

interface ColEntry {
  key: string;
  labels: string[];
  depth: number;
  label: string;
  isSubtotal: boolean;
  isLeaf: boolean;
  canToggle: boolean;
}

const DIMENSION_OPTIONS: Array<{ value: PivotDimension; label: string }> = [
  { value: 'none', label: '（無）— 空置' },
  { value: 'employee', label: '員工' },
  { value: 'equipment_number', label: '車牌/機號' },
  { value: 'client', label: '客戶' },
  { value: 'company', label: '公司' },
  { value: 'machine_type', label: '機種' },
  { value: 'start_location', label: '起點' },
  { value: 'end_location', label: '終點' },
  { value: 'contract', label: '合約' },
  { value: 'quotation', label: '報價單' },
  { value: 'scheduled_date', label: '日期（每天）' },
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
  { value: 'day_night', label: '日夜班' },
  { value: 'service_type', label: '服務類型' },
];

const VALUE_OPTIONS: Array<{ value: PivotValueType; label: string }> = [
  { value: 'count', label: '計數（紀錄筆數）' },
  { value: 'quantity_sum', label: '數量合計' },
  { value: 'ot_sum', label: 'OT 數量合計' },
  { value: 'mid_shift_count', label: '中直次數' },
];

const STATUS_OPTIONS: Option[] = [
  { value: 'confirmed', label: '已確認' },
  { value: 'unconfirmed', label: '未確認' },
];

const EMPTY_METRIC: PivotMetric = { value: 0, unit: '' };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function toDataArray(value: unknown): Record<string, unknown>[] {
  const root = asRecord(value);
  const data = root.data;
  if (Array.isArray(data)) return data.map(asRecord);
  if (data && typeof data === 'object') {
    const nested = asRecord(data).data;
    if (Array.isArray(nested)) return nested.map(asRecord);
  }
  return [];
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  return { from: formatDateInput(from), to: formatDateInput(to) };
}

function getQuickDateRange(type: QuickRange): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);
  if (type === 'week') {
    const day = now.getDay() || 7;
    from.setDate(now.getDate() - day + 1);
  } else if (type === 'month') {
    from.setDate(1);
  } else if (type === 'lastMonth') {
    from.setMonth(now.getMonth() - 1, 1);
    to.setDate(0);
  } else {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    from.setMonth(quarterStartMonth, 1);
  }
  return { from: formatDateInput(from), to: formatDateInput(to) };
}

function encodeAxisKey(labels: string[]): string {
  const safeLabels = labels.length > 0 ? labels : ['全部'];
  return safeLabels.map((label) => encodeURIComponent(label)).join('~');
}

function metricText(metric?: PivotMetric): string {
  if (!metric || metric.value === 0) return '—';
  const displayValue = Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(2).replace(/\.00$/, '');
  return metric.unit ? `${displayValue} ${metric.unit}` : displayValue;
}

function addMetric(acc: { value: number; units: Map<string, number> }, metric?: PivotMetric) {
  if (!metric) return;
  acc.value += metric.value;
  const unit = metric.unit || '';
  acc.units.set(unit, (acc.units.get(unit) || 0) + 1);
}

function finalizeMetric(acc: { value: number; units: Map<string, number> }): PivotMetric {
  let selectedUnit = '';
  let selectedCount = -1;
  acc.units.forEach((count, unit) => {
    if (unit && count > selectedCount) {
      selectedUnit = unit;
      selectedCount = count;
    }
  });
  if (!selectedUnit) {
    const first = acc.units.keys().next();
    selectedUnit = first.done ? '' : first.value;
  }
  return { value: Number(acc.value.toFixed(2)), unit: selectedUnit };
}

function startsWithLabels(source: string[], prefix: string[]): boolean {
  if (prefix.length === 0) return true;
  if (source.length < prefix.length) return false;
  return prefix.every((label, index) => source[index] === label);
}

function buildAxisTree(items: PivotAxisItem[]): AxisNode[] {
  const roots: AxisNode[] = [];
  const ensureNode = (siblings: AxisNode[], labels: string[], label: string, depth: number): AxisNode => {
    const key = encodeAxisKey(labels);
    const existing = siblings.find((node) => node.key === key);
    if (existing) return existing;
    const node: AxisNode = { key, label, labels: [...labels], depth, children: [] };
    siblings.push(node);
    return node;
  };

  items.forEach((item) => {
    const labels = item.labels.length > 0 ? item.labels : ['全部'];
    let siblings = roots;
    let current: AxisNode | null = null;
    labels.forEach((label, index) => {
      const prefix = labels.slice(0, index + 1);
      current = ensureNode(siblings, prefix, label, index + 1);
      siblings = current.children;
    });
    if (current) current.leafKey = item.key;
  });

  const sortNodes = (nodes: AxisNode[]) => {
    nodes.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function flattenRows(nodes: AxisNode[], collapsed: Set<string>, maxDepth: number): RowEntry[] {
  const rows: RowEntry[] = [];

  const pushLeaf = (node: AxisNode, omitFirstLabel: boolean) => {
    const displayLabels = omitFirstLabel ? node.labels.slice(1) : node.labels;
    rows.push({
      key: node.leafKey || node.key,
      labels: node.labels,
      depth: omitFirstLabel ? Math.max(node.depth, 2) : node.depth,
      label: displayLabels.join(' / ') || node.label,
      isGroup: false,
      isLeaf: true,
      canToggle: false,
    });
  };

  const visitLeaf = (node: AxisNode, omitFirstLabel: boolean) => {
    const hasChildren = node.children.length > 0;
    const isLeafRow = !hasChildren || node.depth >= maxDepth;
    if (isLeafRow) {
      pushLeaf(node, omitFirstLabel);
      return;
    }
    node.children.forEach((child) => visitLeaf(child, omitFirstLabel));
  };

  if (maxDepth <= 1) {
    nodes.forEach((node) => visitLeaf(node, false));
    return rows;
  }

  nodes.forEach((node) => {
    const hasChildren = node.children.length > 0;
    if (!hasChildren) {
      pushLeaf(node, false);
      return;
    }

    rows.push({
      key: node.key,
      labels: node.labels,
      depth: 1,
      label: `${node.label} :`,
      isGroup: true,
      isLeaf: false,
      canToggle: true,
    });

    if (!collapsed.has(node.key)) {
      node.children.forEach((child) => visitLeaf(child, true));
    }
  });

  return rows;
}

function flattenCols(nodes: AxisNode[], collapsed: Set<string>, maxDepth: number): ColEntry[] {
  const cols: ColEntry[] = [];
  const visit = (node: AxisNode) => {
    const hasChildren = node.children.length > 0;
    const isGroup = hasChildren && node.depth < maxDepth;
    if (isGroup && !collapsed.has(node.key)) {
      node.children.forEach(visit);
      cols.push({ key: node.key, labels: node.labels, depth: node.depth, label: node.label, isSubtotal: true, isLeaf: false, canToggle: true });
    } else {
      cols.push({ key: node.leafKey || node.key, labels: node.labels, depth: node.depth, label: node.label, isSubtotal: isGroup, isLeaf: !isGroup, canToggle: isGroup });
    }
  };
  nodes.forEach(visit);
  return cols;
}

function isSameLeaf(labels: string[], leaf: PivotAxisItem): boolean {
  return labels.length === leaf.labels.length && startsWithLabels(leaf.labels, labels);
}

function aggregateMetric(pivot: WorkLogPivotResult | null, rowLabels: string[], colLabels: string[]): PivotMetric {
  if (!pivot) return EMPTY_METRIC;
  const rowLeaves = pivot.rows.filter((row) => startsWithLabels(row.labels, rowLabels));
  const colLeaves = pivot.cols.filter((col) => startsWithLabels(col.labels, colLabels));

  if (rowLeaves.length === 1 && colLeaves.length === 1 && isSameLeaf(rowLabels, rowLeaves[0]) && isSameLeaf(colLabels, colLeaves[0])) {
    return pivot.data[`${rowLeaves[0].key}|${colLeaves[0].key}`] || EMPTY_METRIC;
  }

  const acc = { value: 0, units: new Map<string, number>() };
  rowLeaves.forEach((row) => {
    colLeaves.forEach((col) => addMetric(acc, pivot.data[`${row.key}|${col.key}`]));
  });
  return finalizeMetric(acc);
}

function makeOptionsFromResponse(response: unknown, labelFields: string[], valueFields: string[] = ['id']): Option[] {
  return toDataArray(response).map((item) => {
    const value = valueFields.map((field) => item[field]).find((fieldValue) => (typeof fieldValue === 'string' && fieldValue.trim()) || typeof fieldValue === 'number');
    const label = labelFields.map((field) => item[field]).find((fieldValue) => typeof fieldValue === 'string' && fieldValue.trim()) || value;
    return { value: String(value || ''), label: String(label || '') };
  }).filter((option) => option.value && option.label);
}

function dedupeOptions(options: Option[]): Option[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function combineOptions(...groups: Option[][]): Option[] {
  return dedupeOptions(groups.flat()).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
}

function getFieldOptions(response: unknown, category: string): Option[] {
  const grouped = asRecord(asRecord(response).data);
  const values = grouped[category];
  if (!Array.isArray(values)) return [];
  const result = values.map((item) => {
    const record = asRecord(item);
    return { value: String(record.label || ''), label: String(record.label || '') };
  }).filter((option) => option.value);
  return [{ value: '(空白)', label: '(空白)' }, ...result];
}

function formatTitleDate(date: string): string {
  return date ? date.replace(/-/g, '/') : '未指定';
}

function getOptionLabels(values: string[], options: Option[]): string[] {
  const optionMap = new Map(options.map((option) => [option.value, option.label]));
  return values.map((value) => optionMap.get(value) || value).filter(Boolean);
}

function getDimensionLabel(value: PivotDimension): string {
  return DIMENSION_OPTIONS.find((option) => option.value === value && option.value !== 'none')?.label || '';
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
      匯出 CSV
    </button>
  );
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{title}</div>
      <div className="mt-1 text-xl font-bold text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function AxisFieldSelector({
  title,
  fields,
  onChange,
}: {
  title: string;
  fields: PivotDimension[];
  onChange: (fields: PivotDimension[]) => void;
}) {
  const normalized = fields.length > 0 ? fields : ['none' as PivotDimension];
  const updateAt = (index: number, value: PivotDimension) => {
    if (value === 'none') {
      onChange([]);
      return;
    }
    const next = normalized.filter((field) => field !== 'none');
    next[index] = value;
    onChange(next.filter((field, idx) => next.indexOf(field) === idx));
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 text-sm font-semibold text-gray-800">{title}</div>
      <div className="space-y-2">
        {normalized.map((field, index) => (
          <div key={`${title}-${index}`} className="flex gap-2">
            <select
              value={field}
              onChange={(event) => updateAt(index, event.target.value as PivotDimension)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {DIMENSION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {normalized.length > 1 && field !== 'none' && (
              <button
                type="button"
                onClick={() => onChange(normalized.filter((_, idx) => idx !== index && normalized[idx] !== 'none'))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                移除
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...fields, DIMENSION_OPTIONS.find((option) => !fields.includes(option.value) && option.value !== 'none')?.value || 'employee'])}
        className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        + 加入分組
      </button>
    </div>
  );
}

function MultiSelectComboBox({
  label,
  values,
  onChange,
  options,
  placeholder = '全部',
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: Option[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedSet = useMemo(() => new Set(values), [values]);
  const selectedOptions = useMemo(() => options.filter((option) => selectedSet.has(option.value)), [options, selectedSet]);
  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((option) => option.label.toLowerCase().includes(keyword) || option.value.toLowerCase().includes(keyword));
  }, [options, search]);
  const summaryText = values.length === 0
    ? placeholder
    : `${selectedOptions.slice(0, 2).map((option) => option.label).join('、')}${values.length > 2 ? ` 等 ${values.length} 項` : ''}`;

  const toggleValue = (value: string) => {
    onChange(selectedSet.has(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  return (
    <label className="relative block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
      >
        <span className={values.length === 0 ? 'truncate text-gray-400' : 'truncate'}>{summaryText}</span>
        <span className="ml-2 text-xs text-gray-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋..."
            className="mb-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
          />
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>已選 {values.length} 項</span>
            {values.length > 0 && <button type="button" onClick={() => onChange([])} className="text-blue-600 hover:text-blue-700">清除</button>}
          </div>
          <div className="max-h-56 overflow-auto">
            {filteredOptions.length === 0 && <div className="px-2 py-3 text-center text-xs text-gray-500">沒有選項</div>}
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleValue(option.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-blue-50"
              >
                <input type="checkbox" readOnly checked={selectedSet.has(option.value)} className="h-4 w-4 rounded border-gray-300" />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </label>
  );
}

export default function SummaryTab() {
  const defaults = useMemo(getDefaultDateRange, []);
  const [rowFields, setRowFields] = useState<PivotDimension[]>(['employee']);
  const [colFields, setColFields] = useState<PivotDimension[]>(['scheduled_date']);
  const [valueType, setValueType] = useState<PivotValueType>('quantity_sum');
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [equipmentNumbers, setEquipmentNumbers] = useState<string[]>([]);
  const [selectedMachineTypes, setSelectedMachineTypes] = useState<string[]>([]);
  const [startLocations, setStartLocations] = useState<string[]>([]);
  const [endLocations, setEndLocations] = useState<string[]>([]);
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [selectedQuotations, setSelectedQuotations] = useState<string[]>([]);
  const [selectedDayNights, setSelectedDayNights] = useState<string[]>([]);
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [axisOpen, setAxisOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pivot, setPivot] = useState<WorkLogPivotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<Option[]>([]);
  const [machineTypes, setMachineTypes] = useState<Option[]>([]);
  const [locationOptions, setLocationOptions] = useState<Option[]>([]);
  const [contractOptions, setContractOptions] = useState<Option[]>([]);
  const [quotationOptions, setQuotationOptions] = useState<Option[]>([]);
  const [dayNights, setDayNights] = useState<Option[]>([]);
  const [serviceTypes, setServiceTypes] = useState<Option[]>([]);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      companiesApi.simple(),
      partnersApi.simple(),
      employeesApi.list({ limit: 500, status: 'active' }),
      vehiclesApi.simple(),
      machineryApi.simple(),
      contractsApi.simple(),
      quotationsApi.list({ limit: 500 }),
      fieldOptionsApi.getAll(),
    ]).then(([companyResponse, clientResponse, employeeResponse, vehicleResponse, machineryResponse, contractResponse, quotationResponse, fieldOptionResponse]) => {
      const blankOption: Option = { value: '(空白)', label: '(空白)' };
      setCompanies([blankOption, ...makeOptionsFromResponse(companyResponse, ['short_name', 'internal_prefix', 'name'])]);
      setClients([blankOption, ...makeOptionsFromResponse(clientResponse, ['name'])]);
      setEmployees([blankOption, ...makeOptionsFromResponse(employeeResponse, ['name_zh', 'name_en'])]);
      setEquipmentOptions([blankOption, ...combineOptions(
        makeOptionsFromResponse(vehicleResponse, ['label', 'plate_number', 'value'], ['value', 'plate_number', 'id']),
        makeOptionsFromResponse(machineryResponse, ['label', 'machine_code', 'value'], ['value', 'machine_code', 'id']),
      )]);
      setMachineTypes(getFieldOptions(fieldOptionResponse, 'machine_type'));
      setLocationOptions(getFieldOptions(fieldOptionResponse, 'location'));
      setContractOptions([blankOption, ...combineOptions(
        makeOptionsFromResponse(contractResponse, ['contract_no', 'contract_name'], ['contract_no', 'id']),
        getFieldOptions(fieldOptionResponse, 'client_contract_no'),
      )]);
      setQuotationOptions([blankOption, ...makeOptionsFromResponse(quotationResponse, ['quotation_no'], ['quotation_no', 'id'])]);
      setDayNights(getFieldOptions(fieldOptionResponse, 'day_night'));
      setServiceTypes(getFieldOptions(fieldOptionResponse, 'service_type'));
    }).catch(() => undefined);
  }, []);

  const params = useMemo(() => {
    const result: Record<string, string | number | undefined> = {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      row_fields: rowFields.length ? rowFields.join(',') : 'none',
      col_fields: colFields.length ? colFields.join(',') : 'none',
      value_type: valueType,
      company_ids: companyIds.length ? companyIds.join(',') : undefined,
      client_ids: clientIds.length ? clientIds.join(',') : undefined,
      employee_ids: employeeIds.length ? employeeIds.join(',') : undefined,
      equipment_numbers: equipmentNumbers.length ? equipmentNumbers.join(',') : undefined,
      machine_types: selectedMachineTypes.length ? selectedMachineTypes.join(',') : undefined,
      start_locations: startLocations.length ? startLocations.join(',') : undefined,
      end_locations: endLocations.length ? endLocations.join(',') : undefined,
      contracts: selectedContracts.length ? selectedContracts.join(',') : undefined,
      quotations: selectedQuotations.length ? selectedQuotations.join(',') : undefined,
      day_nights: selectedDayNights.length ? selectedDayNights.join(',') : undefined,
      service_types: selectedServiceTypes.length ? selectedServiceTypes.join(',') : undefined,
      status: selectedStatuses.length ? selectedStatuses.join(',') : undefined,
    };
    return result;
  }, [dateFrom, dateTo, rowFields, colFields, valueType, companyIds, clientIds, employeeIds, equipmentNumbers, selectedMachineTypes, startLocations, endLocations, selectedContracts, selectedQuotations, selectedDayNights, selectedServiceTypes, selectedStatuses]);

  const fetchPivot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await workLogsApi.pivot(params) as { data: WorkLogPivotResult };
      setPivot(response.data);
      setCollapsedRows(new Set());
      setCollapsedCols(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知錯誤';
      setError(`載入整理分析失敗：${message}`);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { fetchPivot(); }, [fetchPivot]);

  const rowTree = useMemo(() => buildAxisTree(pivot?.rows || []), [pivot]);
  const colTree = useMemo(() => buildAxisTree(pivot?.cols || []), [pivot]);
  const visibleRows = useMemo(() => flattenRows(rowTree, collapsedRows, Math.max(rowFields.length, 1)), [rowTree, collapsedRows, rowFields.length]);
  const visibleCols = useMemo(() => flattenCols(colTree, collapsedCols, Math.max(colFields.length, 1)), [colTree, collapsedCols, colFields.length]);
  const pivotTitle = useMemo(() => {
    const parts: string[] = [];
    const addSelectedFilter = (values: string[], options: Option[]) => {
      if (values.length === 0) return;
      const labels = getOptionLabels(values, options);
      if (labels.length > 0) parts.push(labels.join('、'));
    };

    addSelectedFilter(companyIds, companies);
    addSelectedFilter(clientIds, clients);
    addSelectedFilter(employeeIds, employees);
    addSelectedFilter(equipmentNumbers, equipmentOptions);
    addSelectedFilter(selectedMachineTypes, machineTypes);
    addSelectedFilter(startLocations, locationOptions);
    addSelectedFilter(endLocations, locationOptions);
    addSelectedFilter(selectedContracts, contractOptions);
    addSelectedFilter(selectedQuotations, quotationOptions);
    addSelectedFilter(selectedDayNights, dayNights);
    addSelectedFilter(selectedServiceTypes, serviceTypes);
    addSelectedFilter(selectedStatuses, STATUS_OPTIONS);
    parts.push(`${formatTitleDate(dateFrom)} - ${formatTitleDate(dateTo)}`);
    return `Pivot Table 交叉表 >> ${parts.join(' ')}`;
  }, [companyIds, companies, clientIds, clients, employeeIds, employees, equipmentNumbers, equipmentOptions, selectedMachineTypes, machineTypes, startLocations, locationOptions, endLocations, selectedContracts, contractOptions, selectedQuotations, quotationOptions, selectedDayNights, dayNights, selectedServiceTypes, serviceTypes, selectedStatuses, dateFrom, dateTo]);
  const rowAxisHeader = useMemo(() => {
    const labels = rowFields.map(getDimensionLabel).filter(Boolean);
    return labels.length > 0 ? labels.join(' / ') : '直軸';
  }, [rowFields]);
  const maxVisibleValue = useMemo(() => {
    if (!pivot) return 0;
    let max = 0;
    visibleRows.forEach((row) => {
      if (row.isGroup) return;
      visibleCols.forEach((col) => {
        max = Math.max(max, aggregateMetric(pivot, row.labels, col.labels).value);
      });
    });
    return max;
  }, [pivot, visibleRows, visibleCols]);

  const toggleRow = (key: string) => {
    setCollapsedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleCol = (key: string) => {
    setCollapsedCols((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const applyQuickRange = (type: QuickRange) => {
    const range = getQuickDateRange(type);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const exportCsv = () => {
    if (!pivot) return;
    const headers = [rowAxisHeader, ...visibleCols.map((col) => col.labels.join(' / ')), '合計'];
    const lines = [headers];
    visibleRows.forEach((row) => {
      lines.push([
        row.label,
        ...visibleCols.map((col) => row.isGroup ? '' : metricText(aggregateMetric(pivot, row.labels, col.labels))),
        row.isGroup ? '' : metricText(aggregateMetric(pivot, row.labels, [])),
      ]);
    });
    lines.push(['合計', ...visibleCols.map((col) => metricText(aggregateMetric(pivot, [], col.labels))), metricText(pivot.grandTotal)]);
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `work-log-pivot-${formatDateInput(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const summary = pivot?.summary;

  return (
    <div className="bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">整理分析</h2>
            <p className="text-xs text-gray-500">以 Pivot Table 交叉表整理工作紀錄，可按直軸與橫軸多層分組。</p>
          </div>
          <div className="flex gap-2">
            <CsvButton onClick={exportCsv} />
            <button onClick={() => setControlsOpen((open) => !open)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              {controlsOpen ? '收起控制區' : '展開控制區'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 pb-1">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="總工作紀錄數" value={String(summary?.totalRecords || 0)} subtitle={`已確認 ${summary?.confirmedCount || 0} / 未確認 ${(summary?.totalRecords || 0) - (summary?.confirmedCount || 0)}`} />
          <SummaryCard title="總工作量" value={metricText({ value: summary?.totalQuantity || 0, unit: '' })} subtitle="依 quantity 欄位合計" />
          <SummaryCard title="價格匹配率" value={`${Math.round((summary?.priceMatchRate || 0) * 1000) / 10}%`} subtitle="已匹配單價的工作紀錄比例" />
          <SummaryCard title="員工/機械覆蓋數" value={`${summary?.employeeCount || 0} / ${summary?.equipmentCount || 0}`} subtitle="員工數 / 車牌機號數" />
        </div>
      </div>

      {controlsOpen && (
        <div className="space-y-2 px-3 py-2">
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button onClick={() => setFiltersOpen((open) => !open)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-800">
              <span>篩選區</span><span>{filtersOpen ? '−' : '+'}</span>
            </button>
            {filtersOpen && (
              <div className="border-t border-gray-100 p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  <button onClick={() => applyQuickRange('week')} className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">本週</button>
                  <button onClick={() => applyQuickRange('month')} className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">本月</button>
                  <button onClick={() => applyQuickRange('lastMonth')} className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">上月</button>
                  <button onClick={() => applyQuickRange('quarter')} className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">本季</button>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">自訂日期可直接修改下方日期範圍</span>
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">日期由</span><DateInput value={dateFrom} onChange={(value) => setDateFrom(value || '')} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" /></label>
                  <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">日期至</span><DateInput value={dateTo} onChange={(value) => setDateTo(value || '')} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" /></label>
                  <MultiSelectComboBox label="員工" values={employeeIds} onChange={setEmployeeIds} options={employees} />
                  <MultiSelectComboBox label="車牌/機號" values={equipmentNumbers} onChange={setEquipmentNumbers} options={equipmentOptions} />
                  <MultiSelectComboBox label="客戶" values={clientIds} onChange={setClientIds} options={clients} />
                  <MultiSelectComboBox label="公司" values={companyIds} onChange={setCompanyIds} options={companies} />
                  <MultiSelectComboBox label="機種" values={selectedMachineTypes} onChange={setSelectedMachineTypes} options={machineTypes} />
                  <MultiSelectComboBox label="起點" values={startLocations} onChange={setStartLocations} options={locationOptions} />
                  <MultiSelectComboBox label="終點" values={endLocations} onChange={setEndLocations} options={locationOptions} />
                  <MultiSelectComboBox label="合約" values={selectedContracts} onChange={setSelectedContracts} options={contractOptions} />
                  <MultiSelectComboBox label="報價單" values={selectedQuotations} onChange={setSelectedQuotations} options={quotationOptions} />
                  <MultiSelectComboBox label="日夜班" values={selectedDayNights} onChange={setSelectedDayNights} options={dayNights} />
                  <MultiSelectComboBox label="服務類型" values={selectedServiceTypes} onChange={setSelectedServiceTypes} options={serviceTypes} />
                  <MultiSelectComboBox label="確認狀態" values={selectedStatuses} onChange={setSelectedStatuses} options={STATUS_OPTIONS} />
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button onClick={() => setAxisOpen((open) => !open)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-800">
              <span>軸設定區</span><span>{axisOpen ? '−' : '+'}</span>
            </button>
            {axisOpen && (
              <div className="grid gap-3 border-t border-gray-100 p-4 lg:grid-cols-3">
                <AxisFieldSelector title="直軸" fields={rowFields} onChange={setRowFields} />
                <AxisFieldSelector title="橫軸" fields={colFields} onChange={setColFields} />
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <label className="block text-sm font-semibold text-gray-800">值</label>
                  <select value={valueType} onChange={(event) => setValueType(event.target.value as PivotValueType)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                    {VALUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <div className="p-3 pt-2">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="text-sm font-semibold text-gray-800">{pivotTitle}</div>
            <div className="text-xs text-gray-500">{loading ? '載入中...' : `直軸 ${visibleRows.length} 項，橫軸 ${visibleCols.length} 項`}</div>
          </div>
          {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20 bg-gray-100">
                {Array.from({ length: Math.max(colFields.length, 1) }).map((_, depthIndex) => (
                  <tr key={`head-${depthIndex}`}>
                    {depthIndex === 0 && <th rowSpan={Math.max(colFields.length, 1)} className="sticky left-0 z-30 whitespace-nowrap border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700">{rowAxisHeader}</th>}
                    {visibleCols.map((col) => (
                      <th key={`${col.key}-${depthIndex}`} className="min-w-[120px] border-b border-r border-gray-200 px-3 py-2 text-center font-semibold text-gray-700">
                        {depthIndex === col.labels.length - 1 && col.canToggle && (
                          <button onClick={() => toggleCol(col.key)} className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-xs">
                            {collapsedCols.has(col.key) ? '+' : '−'}
                          </button>
                        )}
                        {col.labels[depthIndex] || ''}
                      </th>
                    ))}
                    {depthIndex === 0 && <th rowSpan={Math.max(colFields.length, 1)} className="sticky right-0 z-30 min-w-[120px] border-b border-l border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700">合計</th>}
                  </tr>
                ))}
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr><td colSpan={visibleCols.length + 2} className="px-4 py-10 text-center text-gray-500">沒有符合條件的工作紀錄</td></tr>
                )}
                {visibleRows.map((row) => (
                  <tr key={row.key} className={row.isGroup ? 'bg-blue-50 font-semibold' : 'bg-white hover:bg-gray-50'}>
                    <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-gray-200 bg-inherit px-3 py-2 text-left text-gray-800" style={{ paddingLeft: `${12 + (row.depth - 1) * 18}px` }}>
                      {row.canToggle && (
                        <button onClick={() => toggleRow(row.key)} className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-xs text-gray-700">
                          {collapsedRows.has(row.key) ? '+' : '−'}
                        </button>
                      )}
                      {row.label}
                    </th>
                    {visibleCols.map((col) => {
                      if (row.isGroup) {
                        return <td key={`${row.key}-${col.key}`} className="border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums text-gray-800" />;
                      }
                      const metric = aggregateMetric(pivot, row.labels, col.labels);
                      const intensity = maxVisibleValue > 0 ? Math.min(metric.value / maxVisibleValue, 1) : 0;
                      const background = metric.value > 0 ? `rgba(37, 99, 235, ${0.08 + intensity * 0.26})` : undefined;
                      return (
                        <td key={`${row.key}-${col.key}`} className="border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums text-gray-800" style={{ backgroundColor: background }}>
                          {metricText(metric)}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 border-b border-l border-gray-200 bg-gray-50 px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                      {row.isGroup ? '' : metricText(aggregateMetric(pivot, row.labels, []))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100">
                <tr>
                  <th className="sticky left-0 z-30 border-t border-r border-gray-300 bg-gray-100 px-3 py-2 text-left font-bold text-gray-900">合計</th>
                  {visibleCols.map((col) => <td key={`total-${col.key}`} className="border-t border-r border-gray-300 px-3 py-2 text-right font-bold tabular-nums text-gray-900">{metricText(aggregateMetric(pivot, [], col.labels))}</td>)}
                  <td className="sticky right-0 z-30 border-t border-l border-gray-300 bg-gray-100 px-3 py-2 text-right font-bold tabular-nums text-gray-900">{metricText(pivot?.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
