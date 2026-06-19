'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  workLogsApi,
  companiesApi,
  partnersApi,
  employeesApi,
  fieldOptionsApi,
  vehiclesApi,
  machineryApi,
  contractsApi,
  quotationsApi,
  pivotPresetsApi,
} from '@/lib/api';
import DateInput from '@/components/DateInput';
import Cookies from 'js-cookie';

interface Option {
  value: string;
  label: string;
}

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

type PivotValueType =
  | 'count'
  | 'quantity_sum'
  | 'goods_quantity_sum'
  | 'ot_sum'
  | 'mid_shift_count';

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
  grandTotal: PivotMetric | Record<string, PivotMetric>;
  summary: PivotSummary;
}

interface WorkLogPivotFilterOptions {
  companies?: Option[];
  clients?: Option[];
  employees?: Option[];
  equipment_numbers?: Option[];
  machine_types?: Option[];
  start_locations?: Option[];
  end_locations?: Option[];
  contracts?: Option[];
  quotations?: Option[];
  day_nights?: Option[];
  service_types?: Option[];
  statuses?: Option[];
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
  { value: 'goods_quantity_sum', label: '商品數量合計' },
  { value: 'ot_sum', label: 'OT 數量合計' },
  { value: 'mid_shift_count', label: '中直次數' },
];

const STATUS_OPTIONS: Option[] = [
  { value: 'confirmed', label: '已確認' },
  { value: 'unconfirmed', label: '未確認' },
];

const EMPTY_METRIC: PivotMetric = { value: 0, unit: '' };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
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
  const displayValue = Number.isInteger(metric.value)
    ? String(metric.value)
    : metric.value.toFixed(2).replace(/\.00$/, '');
  return metric.unit ? `${displayValue} ${metric.unit}` : displayValue;
}

function addMetric(
  acc: { value: number; units: Map<string, number> },
  metric?: PivotMetric,
) {
  if (!metric) return;
  acc.value += metric.value;
  const unit = metric.unit || '';
  acc.units.set(unit, (acc.units.get(unit) || 0) + 1);
}

function finalizeMetric(acc: {
  value: number;
  units: Map<string, number>;
}): PivotMetric {
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
  const ensureNode = (
    siblings: AxisNode[],
    labels: string[],
    label: string,
    depth: number,
  ): AxisNode => {
    const key = encodeAxisKey(labels);
    const existing = siblings.find((node) => node.key === key);
    if (existing) return existing;
    const node: AxisNode = {
      key,
      label,
      labels: [...labels],
      depth,
      children: [],
    };
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

function flattenRows(
  nodes: AxisNode[],
  collapsed: Set<string>,
  maxDepth: number,
): RowEntry[] {
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

function flattenCols(
  nodes: AxisNode[],
  collapsed: Set<string>,
  maxDepth: number,
): ColEntry[] {
  const cols: ColEntry[] = [];
  const visit = (node: AxisNode) => {
    const hasChildren = node.children.length > 0;
    const isGroup = hasChildren && node.depth < maxDepth;
    if (isGroup && !collapsed.has(node.key)) {
      node.children.forEach(visit);
      cols.push({
        key: node.key,
        labels: node.labels,
        depth: node.depth,
        label: node.label,
        isSubtotal: true,
        isLeaf: false,
        canToggle: true,
      });
    } else {
      cols.push({
        key: node.leafKey || node.key,
        labels: node.labels,
        depth: node.depth,
        label: node.label,
        isSubtotal: isGroup,
        isLeaf: !isGroup,
        canToggle: isGroup,
      });
    }
  };
  nodes.forEach(visit);
  return cols;
}

function isSameLeaf(labels: string[], leaf: PivotAxisItem): boolean {
  return (
    labels.length === leaf.labels.length &&
    startsWithLabels(leaf.labels, labels)
  );
}

function aggregateMetric(
  pivot: WorkLogPivotResult | null,
  rowLabels: string[],
  colLabels: string[],
  valueType?: PivotValueType,
  isMultiValue = false,
): PivotMetric {
  if (!pivot) return EMPTY_METRIC;
  const rowLeaves = pivot.rows.filter((row) =>
    startsWithLabels(row.labels, rowLabels),
  );
  const colLeaves = pivot.cols.filter((col) =>
    startsWithLabels(col.labels, colLabels),
  );

  if (
    rowLeaves.length === 1 &&
    colLeaves.length === 1 &&
    isSameLeaf(rowLabels, rowLeaves[0]) &&
    isSameLeaf(colLabels, colLeaves[0])
  ) {
    return (
      pivot.data[
        getPivotDataKey(rowLeaves[0].key, colLeaves[0].key, valueType, isMultiValue)
      ] || EMPTY_METRIC
    );
  }

  const acc = { value: 0, units: new Map<string, number>() };
  rowLeaves.forEach((row) => {
    colLeaves.forEach((col) =>
      addMetric(
        acc,
        pivot.data[getPivotDataKey(row.key, col.key, valueType, isMultiValue)],
      ),
    );
  });
  return finalizeMetric(acc);
}

function makeOptionsFromResponse(
  response: unknown,
  labelFields: string[],
  valueFields: string[] = ['id'],
): Option[] {
  return toDataArray(response)
    .map((item) => {
      const value = valueFields
        .map((field) => item[field])
        .find(
          (fieldValue) =>
            (typeof fieldValue === 'string' && fieldValue.trim()) ||
            typeof fieldValue === 'number',
        );
      const label =
        labelFields
          .map((field) => item[field])
          .find(
            (fieldValue) => typeof fieldValue === 'string' && fieldValue.trim(),
          ) || value;
      return { value: String(value || ''), label: String(label || '') };
    })
    .filter((option) => option.value && option.label);
}

function normalizeOptions(options: Option[]): Option[] {
  const seen = new Set<string>();
  return options
    .map((option) => ({
      value: String(option.value || '').trim(),
      label: String(option.label || option.value || '').trim(),
    }))
    .filter((option) => option.value && option.label)
    .filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    })
    .sort((a, b) => {
      if (a.value === '(空白)') return -1;
      if (b.value === '(空白)') return 1;
      return a.label.localeCompare(b.label, 'zh-Hant');
    });
}

function combineOptions(...groups: Option[][]): Option[] {
  return normalizeOptions(groups.flat());
}

function optionValues(options: Option[]): string[] {
  return options.map((option) => option.value);
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameOptions(a: Option[], b: Option[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (option, index) =>
        option.value === b[index].value && option.label === b[index].label,
    )
  );
}

function areAllOptionsSelected(values: string[], options: Option[]): boolean {
  const valuesSet = new Set(values);
  const allValues = optionValues(options);
  return (
    allValues.length > 0 && allValues.every((value) => valuesSet.has(value))
  );
}

function selectedFilterParam(
  values: string[],
  options: Option[],
): string | undefined {
  if (areAllOptionsSelected(values, options)) return undefined;
  return values.length ? values.join(',') : undefined;
}

function syncSelectedValues(
  current: string[],
  previousOptions: Option[],
  nextOptions: Option[],
  initialized: boolean,
): string[] {
  const nextValues = optionValues(nextOptions);
  if (nextValues.length === 0) return [];
  if (!initialized && current.length === 0) return nextValues;
  if (areAllOptionsSelected(current, previousOptions))
    return sameStringArray(current, nextValues) ? current : nextValues;
  const nextValueSet = new Set(nextValues);
  const filtered = current.filter((value) => nextValueSet.has(value));
  return sameStringArray(current, filtered) ? current : filtered;
}

function getFieldOptions(response: unknown, category: string): Option[] {
  const grouped = asRecord(asRecord(response).data);
  const values = grouped[category];
  if (!Array.isArray(values)) return [];
  return normalizeOptions(
    values.map((item) => {
      const record = asRecord(item);
      return {
        value: String(record.label || ''),
        label: String(record.label || ''),
      };
    }),
  );
}

function formatTitleDate(date: string): string {
  return date ? date.replace(/-/g, '/') : '未指定';
}

function getOptionLabels(values: string[], options: Option[]): string[] {
  const optionMap = new Map(
    options.map((option) => [option.value, option.label]),
  );
  return values.map((value) => optionMap.get(value) || value).filter(Boolean);
}

function getDimensionLabel(value: PivotDimension): string {
  return (
    DIMENSION_OPTIONS.find(
      (option) => option.value === value && option.value !== 'none',
    )?.label || ''
  );
}

function getValueLabel(value: PivotValueType): string {
  return VALUE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function getPivotDataKey(
  rowKey: string,
  colKey: string,
  valueType: PivotValueType | undefined,
  isMultiValue: boolean,
): string {
  const baseKey = `${rowKey}|${colKey}`;
  return isMultiValue && valueType ? `${baseKey}|${valueType}` : baseKey;
}

function isPivotMetric(value: unknown): value is PivotMetric {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as PivotMetric).value === 'number'
  );
}

function getGrandTotalMetric(
  pivot: WorkLogPivotResult | null,
  valueType: PivotValueType | undefined,
  isMultiValue: boolean,
): PivotMetric {
  if (!pivot) return EMPTY_METRIC;
  if (!isMultiValue) {
    return isPivotMetric(pivot.grandTotal) ? pivot.grandTotal : EMPTY_METRIC;
  }
  const totals = pivot.grandTotal as Record<string, PivotMetric>;
  return (valueType && totals[valueType]) || EMPTY_METRIC;
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      匯出 CSV
    </button>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
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
              onChange={(event) =>
                updateAt(index, event.target.value as PivotDimension)
              }
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {DIMENSION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {normalized.length > 1 && field !== 'none' && (
              <button
                type="button"
                onClick={() =>
                  onChange(
                    normalized.filter(
                      (_, idx) => idx !== index && normalized[idx] !== 'none',
                    ),
                  )
                }
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
        onClick={() =>
          onChange([
            ...fields,
            DIMENSION_OPTIONS.find(
              (option) =>
                !fields.includes(option.value) && option.value !== 'none',
            )?.value || 'employee',
          ])
        }
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
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedSet.has(option.value)),
    [options, selectedSet],
  );
  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(keyword) ||
        option.value.toLowerCase().includes(keyword),
    );
  }, [options, search]);
  const allSelected = areAllOptionsSelected(values, options);
  const summaryText = allSelected
    ? placeholder
    : selectedOptions.length > 0
      ? `${selectedOptions
          .slice(0, 2)
          .map((option) => option.label)
          .join(
            '、',
          )}${selectedOptions.length > 2 ? ` 等 ${selectedOptions.length} 項` : ''}`
      : '未選擇';

  const toggleValue = (value: string) => {
    onChange(
      selectedSet.has(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    );
  };

  const toggleAll = () => {
    onChange(allSelected ? [] : optionValues(options));
  };

  return (
    <label className="relative block">
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
      >
        <span
          className={
            selectedOptions.length === 0 && !allSelected
              ? 'truncate text-gray-400'
              : 'truncate'
          }
        >
          {summaryText}
        </span>
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
            <span>
              {allSelected ? '已選全部' : `已選 ${selectedOptions.length} 項`}
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-blue-600 hover:text-blue-700"
            >
              {allSelected ? '取消全選' : '全選'}
            </button>
          </div>
          <div className="max-h-56 overflow-auto">
            {filteredOptions.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-gray-500">
                沒有選項
              </div>
            )}
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleValue(option.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-blue-50"
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={selectedSet.has(option.value)}
                  className="h-4 w-4 rounded border-gray-300"
                />
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
  const [colFields, setColFields] = useState<PivotDimension[]>([
    'scheduled_date',
  ]);
  const [valueTypes, setValueTypes] = useState<PivotValueType[]>([
    'quantity_sum',
  ]);
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [equipmentNumbers, setEquipmentNumbers] = useState<string[]>([]);
  const [selectedMachineTypes, setSelectedMachineTypes] = useState<string[]>(
    [],
  );
  const [startLocations, setStartLocations] = useState<string[]>([]);
  const [endLocations, setEndLocations] = useState<string[]>([]);
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [selectedQuotations, setSelectedQuotations] = useState<string[]>([]);
  const [selectedDayNights, setSelectedDayNights] = useState<string[]>([]);
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<string[]>(
    [],
  );
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [axisOpen, setAxisOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // ── 儲存/載入視圖（Pivot View Presets）──
  const [presets, setPresets] = useState<
    Array<{ id: number; name: string; config: any; is_last: boolean }>
  >([]);
  const [loadMenuOpen, setLoadMenuOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetError, setPresetError] = useState('');
  const loadMenuRef = useRef<HTMLDivElement | null>(null);
  const lastUsedLoadedRef = useRef(false);
  const [pivot, setPivot] = useState<WorkLogPivotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<Option[]>([]);
  const [machineTypes, setMachineTypes] = useState<Option[]>([]);
  const [startLocationOptions, setStartLocationOptions] = useState<Option[]>(
    [],
  );
  const [endLocationOptions, setEndLocationOptions] = useState<Option[]>([]);
  const [contractOptions, setContractOptions] = useState<Option[]>([]);
  const [quotationOptions, setQuotationOptions] = useState<Option[]>([]);
  const [dayNights, setDayNights] = useState<Option[]>([]);
  const [serviceTypes, setServiceTypes] = useState<Option[]>([]);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const filterOptionsRef = useRef<Record<string, Option[]>>({});
  const filterSelectionInitializedRef = useRef<Record<string, boolean>>({});
  const selectedValueTypes = useMemo<PivotValueType[]>(
    () => (valueTypes.length > 0 ? valueTypes : ['quantity_sum']),
    [valueTypes],
  );
  const isMultiValue = selectedValueTypes.length > 1;
  const hasColumnAxis = colFields.length > 0;

  const updateFilterOptions = useCallback(
    (
      key: string,
      nextOptions: Option[],
      setOptions: Dispatch<SetStateAction<Option[]>>,
      setValues: Dispatch<SetStateAction<string[]>>,
    ) => {
      const normalized = normalizeOptions(nextOptions);
      const previousOptions = filterOptionsRef.current[key] || [];
      const initialized = Boolean(filterSelectionInitializedRef.current[key]);
      filterOptionsRef.current[key] = normalized;
      if (normalized.length > 0)
        filterSelectionInitializedRef.current[key] = true;
      setOptions((current) =>
        sameOptions(current, normalized) ? current : normalized,
      );
      setValues((current) =>
        syncSelectedValues(current, previousOptions, normalized, initialized),
      );
    },
    [],
  );

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
    ])
      .then(
        ([
          companyResponse,
          clientResponse,
          employeeResponse,
          vehicleResponse,
          machineryResponse,
          contractResponse,
          quotationResponse,
          fieldOptionResponse,
        ]) => {
          const fieldLocations = getFieldOptions(
            fieldOptionResponse,
            'location',
          );
          updateFilterOptions(
            'companies',
            makeOptionsFromResponse(companyResponse, [
              'short_name',
              'internal_prefix',
              'name',
            ]),
            setCompanies,
            setCompanyIds,
          );
          updateFilterOptions(
            'clients',
            makeOptionsFromResponse(clientResponse, ['name']),
            setClients,
            setClientIds,
          );
          updateFilterOptions(
            'employees',
            makeOptionsFromResponse(employeeResponse, ['name_zh', 'name_en']),
            setEmployees,
            setEmployeeIds,
          );
          updateFilterOptions(
            'equipment_numbers',
            combineOptions(
              makeOptionsFromResponse(
                vehicleResponse,
                ['label', 'plate_number', 'value'],
                ['value', 'plate_number', 'id'],
              ),
              makeOptionsFromResponse(
                machineryResponse,
                ['label', 'machine_code', 'value'],
                ['value', 'machine_code', 'id'],
              ),
            ),
            setEquipmentOptions,
            setEquipmentNumbers,
          );
          updateFilterOptions(
            'machine_types',
            getFieldOptions(fieldOptionResponse, 'machine_type'),
            setMachineTypes,
            setSelectedMachineTypes,
          );
          updateFilterOptions(
            'start_locations',
            fieldLocations,
            setStartLocationOptions,
            setStartLocations,
          );
          updateFilterOptions(
            'end_locations',
            fieldLocations,
            setEndLocationOptions,
            setEndLocations,
          );
          updateFilterOptions(
            'contracts',
            combineOptions(
              makeOptionsFromResponse(
                contractResponse,
                ['contract_no', 'contract_name'],
                ['contract_no', 'id'],
              ),
              getFieldOptions(fieldOptionResponse, 'client_contract_no'),
            ),
            setContractOptions,
            setSelectedContracts,
          );
          updateFilterOptions(
            'quotations',
            makeOptionsFromResponse(
              quotationResponse,
              ['quotation_no'],
              ['quotation_no', 'id'],
            ),
            setQuotationOptions,
            setSelectedQuotations,
          );
          updateFilterOptions(
            'day_nights',
            getFieldOptions(fieldOptionResponse, 'day_night'),
            setDayNights,
            setSelectedDayNights,
          );
          updateFilterOptions(
            'service_types',
            getFieldOptions(fieldOptionResponse, 'service_type'),
            setServiceTypes,
            setSelectedServiceTypes,
          );
          updateFilterOptions(
            'statuses',
            STATUS_OPTIONS,
            () => undefined,
            setSelectedStatuses,
          );
        },
      )
      .catch(() => undefined);
  }, [updateFilterOptions]);

  const params = useMemo(() => {
    const result: Record<string, string | number | undefined> = {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      row_fields: rowFields.length ? rowFields.join(',') : 'none',
      col_fields: colFields.length ? colFields.join(',') : 'none',
      value_type: !isMultiValue ? selectedValueTypes[0] : undefined,
      value_types: isMultiValue ? selectedValueTypes.join(',') : undefined,
      company_ids: selectedFilterParam(companyIds, companies),
      client_ids: selectedFilterParam(clientIds, clients),
      employee_ids: selectedFilterParam(employeeIds, employees),
      equipment_numbers: selectedFilterParam(
        equipmentNumbers,
        equipmentOptions,
      ),
      machine_types: selectedFilterParam(selectedMachineTypes, machineTypes),
      start_locations: selectedFilterParam(
        startLocations,
        startLocationOptions,
      ),
      end_locations: selectedFilterParam(endLocations, endLocationOptions),
      contracts: selectedFilterParam(selectedContracts, contractOptions),
      quotations: selectedFilterParam(selectedQuotations, quotationOptions),
      day_nights: selectedFilterParam(selectedDayNights, dayNights),
      service_types: selectedFilterParam(selectedServiceTypes, serviceTypes),
      status: selectedFilterParam(selectedStatuses, STATUS_OPTIONS),
    };
    return result;
  }, [
    dateFrom,
    dateTo,
    rowFields,
    colFields,
    selectedValueTypes,
    isMultiValue,
    companyIds,
    companies,
    clientIds,
    clients,
    employeeIds,
    employees,
    equipmentNumbers,
    equipmentOptions,
    selectedMachineTypes,
    machineTypes,
    startLocations,
    startLocationOptions,
    endLocations,
    endLocationOptions,
    selectedContracts,
    contractOptions,
    selectedQuotations,
    quotationOptions,
    selectedDayNights,
    dayNights,
    selectedServiceTypes,
    serviceTypes,
    selectedStatuses,
  ]);

  const filterOptionParams = useMemo(
    () => ({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    [dateFrom, dateTo],
  );

  const applyPivotFilterOptions = useCallback(
    (options: WorkLogPivotFilterOptions) => {
      updateFilterOptions(
        'companies',
        options.companies || [],
        setCompanies,
        setCompanyIds,
      );
      updateFilterOptions(
        'clients',
        options.clients || [],
        setClients,
        setClientIds,
      );
      updateFilterOptions(
        'employees',
        options.employees || [],
        setEmployees,
        setEmployeeIds,
      );
      updateFilterOptions(
        'equipment_numbers',
        options.equipment_numbers || [],
        setEquipmentOptions,
        setEquipmentNumbers,
      );
      updateFilterOptions(
        'machine_types',
        options.machine_types || [],
        setMachineTypes,
        setSelectedMachineTypes,
      );
      updateFilterOptions(
        'start_locations',
        options.start_locations || [],
        setStartLocationOptions,
        setStartLocations,
      );
      updateFilterOptions(
        'end_locations',
        options.end_locations || [],
        setEndLocationOptions,
        setEndLocations,
      );
      updateFilterOptions(
        'contracts',
        options.contracts || [],
        setContractOptions,
        setSelectedContracts,
      );
      updateFilterOptions(
        'quotations',
        options.quotations || [],
        setQuotationOptions,
        setSelectedQuotations,
      );
      updateFilterOptions(
        'day_nights',
        options.day_nights || [],
        setDayNights,
        setSelectedDayNights,
      );
      updateFilterOptions(
        'service_types',
        options.service_types || [],
        setServiceTypes,
        setSelectedServiceTypes,
      );
      updateFilterOptions(
        'statuses',
        options.statuses && options.statuses.length > 0
          ? options.statuses
          : STATUS_OPTIONS,
        () => undefined,
        setSelectedStatuses,
      );
    },
    [updateFilterOptions],
  );

  const fetchPivot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pivotResponse, filterOptionsResponse] = await Promise.all([
        workLogsApi.pivot(params) as Promise<{ data: WorkLogPivotResult }>,
        workLogsApi
          .pivotFilterOptions(filterOptionParams)
          .catch(() => null) as Promise<{
          data: WorkLogPivotFilterOptions;
        } | null>,
      ]);
      setPivot(pivotResponse.data);
      if (filterOptionsResponse?.data)
        applyPivotFilterOptions(filterOptionsResponse.data);
      setCollapsedRows(new Set());
      setCollapsedCols(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知錯誤';
      setError(`載入整理分析失敗：${message}`);
    } finally {
      setLoading(false);
    }
  }, [params, filterOptionParams, applyPivotFilterOptions]);

  useEffect(() => {
    fetchPivot();
  }, [fetchPivot]);

  // ──────────────────────────────────────────────
  // 儲存/載入視圖（Pivot View Presets）
  // ──────────────────────────────────────────────

  // 將當前 state 序列化為 config JSON（對應 pvp_config 結構）
  const buildConfig = useCallback(
    () => ({
      rowFields,
      colFields,
      valueTypes,
      dateFrom,
      dateTo,
      companyIds,
      clientIds,
      employeeIds,
      equipmentNumbers,
      selectedMachineTypes,
      startLocations,
      endLocations,
      selectedContracts,
      selectedQuotations,
      selectedDayNights,
      selectedServiceTypes,
      selectedStatuses,
    }),
    [
      rowFields,
      colFields,
      valueTypes,
      dateFrom,
      dateTo,
      companyIds,
      clientIds,
      employeeIds,
      equipmentNumbers,
      selectedMachineTypes,
      startLocations,
      endLocations,
      selectedContracts,
      selectedQuotations,
      selectedDayNights,
      selectedServiceTypes,
      selectedStatuses,
    ],
  );
  // 用 ref 持有最新 config，供 unload/cleanup 時讀取，避免 effect 依賴反覆綁定
  const configRef = useRef(buildConfig());
  useEffect(() => {
    configRef.current = buildConfig();
  }, [buildConfig]);

  // 將 config JSON 套回各個 state（載入視圖 / 載入上次設定）
  const applyConfig = useCallback((config: any) => {
    if (!config || typeof config !== 'object') return;
    const asStringArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.map((item) => String(item)) : [];

    if (Array.isArray(config.rowFields)) {
      setRowFields(
        config.rowFields.filter((field: string) =>
          DIMENSION_OPTIONS.some(
            (option) => option.value === field && option.value !== 'none',
          ),
        ) as PivotDimension[],
      );
    }
    if (Array.isArray(config.colFields)) {
      setColFields(
        config.colFields.filter((field: string) =>
          DIMENSION_OPTIONS.some(
            (option) => option.value === field && option.value !== 'none',
          ),
        ) as PivotDimension[],
      );
    }
    if (Array.isArray(config.valueTypes)) {
      const valid = config.valueTypes.filter((value: string) =>
        VALUE_OPTIONS.some((option) => option.value === value),
      ) as PivotValueType[];
      setValueTypes(valid.length > 0 ? valid : ['quantity_sum']);
    }
    if (typeof config.dateFrom === 'string') setDateFrom(config.dateFrom);
    if (typeof config.dateTo === 'string') setDateTo(config.dateTo);

    // 各篩選器：套用選取值並標記為已初始化，
    // 避免後續 filter-options 同步把載入的選取當未初始化而重置。
    const applyFilter = (
      key: string,
      value: unknown,
      setValues: Dispatch<SetStateAction<string[]>>,
    ) => {
      if (value === undefined) return;
      filterSelectionInitializedRef.current[key] = true;
      setValues(asStringArray(value));
    };
    applyFilter('companies', config.companyIds, setCompanyIds);
    applyFilter('clients', config.clientIds, setClientIds);
    applyFilter('employees', config.employeeIds, setEmployeeIds);
    applyFilter(
      'equipment_numbers',
      config.equipmentNumbers,
      setEquipmentNumbers,
    );
    applyFilter(
      'machine_types',
      config.selectedMachineTypes,
      setSelectedMachineTypes,
    );
    applyFilter('start_locations', config.startLocations, setStartLocations);
    applyFilter('end_locations', config.endLocations, setEndLocations);
    applyFilter('contracts', config.selectedContracts, setSelectedContracts);
    applyFilter(
      'quotations',
      config.selectedQuotations,
      setSelectedQuotations,
    );
    applyFilter('day_nights', config.selectedDayNights, setSelectedDayNights);
    applyFilter(
      'service_types',
      config.selectedServiceTypes,
      setSelectedServiceTypes,
    );
    applyFilter('statuses', config.selectedStatuses, setSelectedStatuses);
  }, []);

  // 取得視圖清單（過濾掉保留的「上次設定」紀錄）
  const namedPresets = useMemo(
    () => presets.filter((preset) => !preset.is_last),
    [presets],
  );

  const refreshPresets = useCallback(async () => {
    try {
      const res = await pivotPresetsApi.list();
      const list = Array.isArray(res.data) ? res.data : [];
      setPresets(list);
      return list as Array<{
        id: number;
        name: string;
        config: any;
        is_last: boolean;
      }>;
    } catch {
      return [];
    }
  }, []);

  // 進入 tab 時：載入清單，並自動套用「上次設定」
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await refreshPresets();
      if (cancelled || lastUsedLoadedRef.current) return;
      const lastUsed = list.find((preset) => preset.is_last);
      if (lastUsed && lastUsed.config) {
        applyConfig(lastUsed.config);
      }
      lastUsedLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshPresets, applyConfig]);

  // 自動保存「上次設定」：離開頁面（beforeunload/pagehide）時用 keepalive 送出
  const saveLastUsedKeepalive = useCallback(() => {
    if (!lastUsedLoadedRef.current) return;
    try {
      const token = Cookies.get('token');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL || '/api'}/pivot-presets/last-used`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ config: configRef.current }),
          keepalive: true,
        },
      ).catch(() => undefined);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    window.addEventListener('beforeunload', saveLastUsedKeepalive);
    window.addEventListener('pagehide', saveLastUsedKeepalive);
    // 元件卸載（切換 tab 時 SummaryTab 會卸載）也保存一次
    return () => {
      window.removeEventListener('beforeunload', saveLastUsedKeepalive);
      window.removeEventListener('pagehide', saveLastUsedKeepalive);
      if (lastUsedLoadedRef.current) {
        pivotPresetsApi.saveLastUsed(configRef.current).catch(() => undefined);
      }
    };
  }, [saveLastUsedKeepalive]);

  // 點擊外部關閉「載入視圖」下拉選單
  useEffect(() => {
    if (!loadMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        loadMenuRef.current &&
        !loadMenuRef.current.contains(event.target as Node)
      ) {
        setLoadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [loadMenuOpen]);

  const handleLoadPreset = useCallback(
    (preset: { config: any }) => {
      applyConfig(preset.config);
      setLoadMenuOpen(false);
    },
    [applyConfig],
  );

  const handleSavePreset = useCallback(async () => {
    const name = saveName.trim();
    if (!name) {
      setPresetError('請輸入視圖名稱');
      return;
    }
    setSavingPreset(true);
    setPresetError('');
    try {
      const existing = namedPresets.find((preset) => preset.name === name);
      if (existing) {
        // 同名則更新
        await pivotPresetsApi.update(existing.id, {
          name,
          config: buildConfig(),
        });
      } else {
        await pivotPresetsApi.create({ name, config: buildConfig() });
      }
      await refreshPresets();
      setSaveModalOpen(false);
      setSaveName('');
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || '儲存失敗';
      setPresetError(
        Array.isArray(message) ? message.join('、') : String(message),
      );
    } finally {
      setSavingPreset(false);
    }
  }, [saveName, namedPresets, buildConfig, refreshPresets]);

  const handleDeletePreset = useCallback(
    async (id: number) => {
      try {
        await pivotPresetsApi.delete(id);
        await refreshPresets();
      } catch {
        /* noop */
      }
    },
    [refreshPresets],
  );

  const rowTree = useMemo(() => buildAxisTree(pivot?.rows || []), [pivot]);
  const colTree = useMemo(() => buildAxisTree(pivot?.cols || []), [pivot]);
  const visibleRows = useMemo(
    () => flattenRows(rowTree, collapsedRows, Math.max(rowFields.length, 1)),
    [rowTree, collapsedRows, rowFields.length],
  );
  const visibleCols = useMemo(
    () => flattenCols(colTree, collapsedCols, Math.max(colFields.length, 1)),
    [colTree, collapsedCols, colFields.length],
  );
  const pivotTitle = useMemo(() => {
    const parts: string[] = [];
    const addSelectedFilter = (values: string[], options: Option[]) => {
      if (values.length === 0 || areAllOptionsSelected(values, options)) return;
      const labels = getOptionLabels(values, options);
      if (labels.length > 0) parts.push(labels.join('、'));
    };

    addSelectedFilter(companyIds, companies);
    addSelectedFilter(clientIds, clients);
    addSelectedFilter(employeeIds, employees);
    addSelectedFilter(equipmentNumbers, equipmentOptions);
    addSelectedFilter(selectedMachineTypes, machineTypes);
    addSelectedFilter(startLocations, startLocationOptions);
    addSelectedFilter(endLocations, endLocationOptions);
    addSelectedFilter(selectedContracts, contractOptions);
    addSelectedFilter(selectedQuotations, quotationOptions);
    addSelectedFilter(selectedDayNights, dayNights);
    addSelectedFilter(selectedServiceTypes, serviceTypes);
    addSelectedFilter(selectedStatuses, STATUS_OPTIONS);
    parts.push(`${formatTitleDate(dateFrom)} - ${formatTitleDate(dateTo)}`);
    return `Pivot Table 交叉表 >> ${parts.join(' ')}`;
  }, [
    companyIds,
    companies,
    clientIds,
    clients,
    employeeIds,
    employees,
    equipmentNumbers,
    equipmentOptions,
    selectedMachineTypes,
    machineTypes,
    startLocations,
    startLocationOptions,
    endLocations,
    endLocationOptions,
    selectedContracts,
    contractOptions,
    selectedQuotations,
    quotationOptions,
    selectedDayNights,
    dayNights,
    selectedServiceTypes,
    serviceTypes,
    selectedStatuses,
    dateFrom,
    dateTo,
  ]);
  const rowAxisHeader = useMemo(() => {
    const labels = rowFields.map(getDimensionLabel).filter(Boolean);
    return labels.length > 0 ? labels.join(' / ') : '直軸';
  }, [rowFields]);
  const maxVisibleValue = useMemo(() => {
    if (!pivot) return 0;
    let max = 0;
    visibleRows.forEach((row) => {
      if (row.isGroup) return;
      selectedValueTypes.forEach((selectedValueType) => {
        if (!hasColumnAxis && isMultiValue) {
          max = Math.max(
            max,
            aggregateMetric(
              pivot,
              row.labels,
              [],
              selectedValueType,
              isMultiValue,
            ).value,
          );
          return;
        }
        visibleCols.forEach((col) => {
          max = Math.max(
            max,
            aggregateMetric(
              pivot,
              row.labels,
              col.labels,
              selectedValueType,
              isMultiValue,
            ).value,
          );
        });
      });
    });
    return max;
  }, [
    pivot,
    visibleRows,
    visibleCols,
    selectedValueTypes,
    isMultiValue,
    hasColumnAxis,
  ]);

  const toggleRow = (key: string) => {
    setCollapsedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCol = (key: string) => {
    setCollapsedCols((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyQuickRange = (type: QuickRange) => {
    const range = getQuickDateRange(type);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const renderMetricCell = (
    key: string,
    metric: PivotMetric,
    className = 'border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums text-gray-800',
  ) => {
    const intensity =
      maxVisibleValue > 0 ? Math.min(metric.value / maxVisibleValue, 1) : 0;
    const background =
      metric.value > 0
        ? `rgba(37, 99, 235, ${0.08 + intensity * 0.26})`
        : undefined;
    return (
      <td key={key} className={className} style={{ backgroundColor: background }}>
        {metricText(metric)}
      </td>
    );
  };

  const exportCsv = () => {
    if (!pivot) return;
    const headers = isMultiValue
      ? [
          rowAxisHeader,
          ...(hasColumnAxis
            ? visibleCols.flatMap((col) =>
                selectedValueTypes.map(
                  (selectedValueType) =>
                    `${col.labels.join(' / ')} - ${getValueLabel(selectedValueType)}`,
                ),
              )
            : selectedValueTypes.map(getValueLabel)),
          ...(hasColumnAxis
            ? selectedValueTypes.map(
                (selectedValueType) => `合計 - ${getValueLabel(selectedValueType)}`,
              )
            : []),
        ]
      : [
          rowAxisHeader,
          ...visibleCols.map((col) => col.labels.join(' / ')),
          '合計',
        ];
    const lines = [headers];
    visibleRows.forEach((row) => {
      if (isMultiValue) {
        lines.push([
          row.label,
          ...(hasColumnAxis
            ? visibleCols.flatMap((col) =>
                selectedValueTypes.map((selectedValueType) =>
                  row.isGroup
                    ? ''
                    : metricText(
                        aggregateMetric(
                          pivot,
                          row.labels,
                          col.labels,
                          selectedValueType,
                          true,
                        ),
                      ),
                ),
              )
            : selectedValueTypes.map((selectedValueType) =>
                row.isGroup
                  ? ''
                  : metricText(
                      aggregateMetric(
                        pivot,
                        row.labels,
                        [],
                        selectedValueType,
                        true,
                      ),
                    ),
              )),
          ...(hasColumnAxis
            ? selectedValueTypes.map((selectedValueType) =>
                row.isGroup
                  ? ''
                  : metricText(
                      aggregateMetric(
                        pivot,
                        row.labels,
                        [],
                        selectedValueType,
                        true,
                      ),
                    ),
              )
            : []),
        ]);
        return;
      }
      lines.push([
        row.label,
        ...visibleCols.map((col) =>
          row.isGroup
            ? ''
            : metricText(aggregateMetric(pivot, row.labels, col.labels)),
        ),
        row.isGroup ? '' : metricText(aggregateMetric(pivot, row.labels, [])),
      ]);
    });
    lines.push(
      isMultiValue
        ? [
            '合計',
            ...(hasColumnAxis
              ? visibleCols.flatMap((col) =>
                  selectedValueTypes.map((selectedValueType) =>
                    metricText(
                      aggregateMetric(
                        pivot,
                        [],
                        col.labels,
                        selectedValueType,
                        true,
                      ),
                    ),
                  ),
                )
              : selectedValueTypes.map((selectedValueType) =>
                  metricText(getGrandTotalMetric(pivot, selectedValueType, true)),
                )),
            ...(hasColumnAxis
              ? selectedValueTypes.map((selectedValueType) =>
                  metricText(getGrandTotalMetric(pivot, selectedValueType, true)),
                )
              : []),
          ]
        : [
            '合計',
            ...visibleCols.map((col) =>
              metricText(aggregateMetric(pivot, [], col.labels)),
            ),
            metricText(getGrandTotalMetric(pivot, selectedValueTypes[0], false)),
          ],
    );
    const csv = lines
      .map((line) =>
        line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `work-log-pivot-${formatDateInput(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const summary = pivot?.summary;

  return (
    <div className="bg-gray-50">
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  儲存視圖
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  將當前篩選條件與軸設定儲存為命名視圖。
                </p>
              </div>
              <button
                onClick={() => setSaveModalOpen(false)}
                className="text-2xl leading-none text-gray-400 hover:text-gray-600"
                aria-label="關閉"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  視圖名稱
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !savingPreset) {
                      handleSavePreset();
                    }
                  }}
                  maxLength={100}
                  autoFocus
                  placeholder="例如：本月員工×日期"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                {namedPresets.some((preset) => preset.name === saveName.trim()) &&
                  saveName.trim() !== '' && (
                    <p className="mt-1 text-xs text-amber-600">
                      已存在同名視圖，儲存將覆蓋其設定。
                    </p>
                  )}
                {presetError && (
                  <p className="mt-1 text-xs text-red-600">{presetError}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <button
                onClick={() => setSaveModalOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSavePreset}
                disabled={savingPreset}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingPreset ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">整理分析</h2>
            <p className="text-xs text-gray-500">
              以 Pivot Table 交叉表整理工作紀錄，可按直軸與橫軸多層分組。
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative" ref={loadMenuRef}>
              <button
                onClick={() => setLoadMenuOpen((open) => !open)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                載入視圖
              </button>
              {loadMenuOpen && (
                <div className="absolute right-0 z-30 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {namedPresets.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">
                      尚無已保存的視圖
                    </div>
                  ) : (
                    namedPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-gray-50"
                      >
                        <button
                          onClick={() => handleLoadPreset(preset)}
                          className="min-w-0 flex-1 truncate text-left text-gray-700"
                          title={preset.name}
                        >
                          {preset.name}
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeletePreset(preset.id);
                          }}
                          className="shrink-0 rounded px-1.5 text-base leading-none text-gray-400 hover:text-red-500"
                          aria-label={`刪除視圖 ${preset.name}`}
                          title="刪除此視圖"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setSaveName('');
                setPresetError('');
                setSaveModalOpen(true);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              儲存視圖
            </button>
            <CsvButton onClick={exportCsv} />
            <button
              onClick={() => setControlsOpen((open) => !open)}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {controlsOpen ? '收起控制區' : '展開控制區'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 pb-1">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="總工作紀錄數"
            value={String(summary?.totalRecords || 0)}
            subtitle={`已確認 ${summary?.confirmedCount || 0} / 未確認 ${(summary?.totalRecords || 0) - (summary?.confirmedCount || 0)}`}
          />
          <SummaryCard
            title="總工作量"
            value={metricText({ value: summary?.totalQuantity || 0, unit: '' })}
            subtitle="依 quantity 欄位合計"
          />
          <SummaryCard
            title="價格匹配率"
            value={`${Math.round((summary?.priceMatchRate || 0) * 1000) / 10}%`}
            subtitle="已匹配單價的工作紀錄比例"
          />
          <SummaryCard
            title="員工/機械覆蓋數"
            value={`${summary?.employeeCount || 0} / ${summary?.equipmentCount || 0}`}
            subtitle="員工數 / 車牌機號數"
          />
        </div>
      </div>

      {controlsOpen && (
        <div className="space-y-2 px-3 py-2">
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              onClick={() => setFiltersOpen((open) => !open)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-800"
            >
              <span>篩選區</span>
              <span>{filtersOpen ? '−' : '+'}</span>
            </button>
            {filtersOpen && (
              <div className="border-t border-gray-100 p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => applyQuickRange('week')}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                  >
                    本週
                  </button>
                  <button
                    onClick={() => applyQuickRange('month')}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                  >
                    本月
                  </button>
                  <button
                    onClick={() => applyQuickRange('lastMonth')}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                  >
                    上月
                  </button>
                  <button
                    onClick={() => applyQuickRange('quarter')}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                  >
                    本季
                  </button>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                    自訂日期可直接修改下方日期範圍
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      日期由
                    </span>
                    <DateInput
                      value={dateFrom}
                      onChange={(value) => setDateFrom(value || '')}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      日期至
                    </span>
                    <DateInput
                      value={dateTo}
                      onChange={(value) => setDateTo(value || '')}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <MultiSelectComboBox
                    label="員工"
                    values={employeeIds}
                    onChange={setEmployeeIds}
                    options={employees}
                  />
                  <MultiSelectComboBox
                    label="車牌/機號"
                    values={equipmentNumbers}
                    onChange={setEquipmentNumbers}
                    options={equipmentOptions}
                  />
                  <MultiSelectComboBox
                    label="客戶"
                    values={clientIds}
                    onChange={setClientIds}
                    options={clients}
                  />
                  <MultiSelectComboBox
                    label="公司"
                    values={companyIds}
                    onChange={setCompanyIds}
                    options={companies}
                  />
                  <MultiSelectComboBox
                    label="機種"
                    values={selectedMachineTypes}
                    onChange={setSelectedMachineTypes}
                    options={machineTypes}
                  />
                  <MultiSelectComboBox
                    label="起點"
                    values={startLocations}
                    onChange={setStartLocations}
                    options={startLocationOptions}
                  />
                  <MultiSelectComboBox
                    label="終點"
                    values={endLocations}
                    onChange={setEndLocations}
                    options={endLocationOptions}
                  />
                  <MultiSelectComboBox
                    label="合約"
                    values={selectedContracts}
                    onChange={setSelectedContracts}
                    options={contractOptions}
                  />
                  <MultiSelectComboBox
                    label="報價單"
                    values={selectedQuotations}
                    onChange={setSelectedQuotations}
                    options={quotationOptions}
                  />
                  <MultiSelectComboBox
                    label="日夜班"
                    values={selectedDayNights}
                    onChange={setSelectedDayNights}
                    options={dayNights}
                  />
                  <MultiSelectComboBox
                    label="服務類型"
                    values={selectedServiceTypes}
                    onChange={setSelectedServiceTypes}
                    options={serviceTypes}
                  />
                  <MultiSelectComboBox
                    label="確認狀態"
                    values={selectedStatuses}
                    onChange={setSelectedStatuses}
                    options={STATUS_OPTIONS}
                  />
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              onClick={() => setAxisOpen((open) => !open)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-800"
            >
              <span>軸設定區</span>
              <span>{axisOpen ? '−' : '+'}</span>
            </button>
            {axisOpen && (
              <div className="grid gap-3 border-t border-gray-100 p-4 lg:grid-cols-3">
                <AxisFieldSelector
                  title="直軸"
                  fields={rowFields}
                  onChange={setRowFields}
                />
                <AxisFieldSelector
                  title="橫軸"
                  fields={colFields}
                  onChange={setColFields}
                />
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <MultiSelectComboBox
                    label="值"
                    values={selectedValueTypes}
                    onChange={(nextValues) =>
                      setValueTypes(
                        nextValues.length > 0
                          ? (nextValues as PivotValueType[])
                          : ['quantity_sum'],
                      )
                    }
                    options={VALUE_OPTIONS}
                    placeholder="請選擇值"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    可同時選擇多個值；多值會顯示為橫軸項目下的子欄位。
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <div className="p-3 pt-2">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="text-sm font-semibold text-gray-800">
              {pivotTitle}
            </div>
            <div className="text-xs text-gray-500">
              {loading
                ? '載入中...'
                : `直軸 ${visibleRows.length} 項，橫軸 ${visibleCols.length} 項`}
            </div>
          </div>
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20 bg-gray-100">
                {isMultiValue ? (
                  hasColumnAxis ? (
                    <>
                      {Array.from({ length: Math.max(colFields.length, 1) }).map(
                        (_, depthIndex) => (
                          <tr key={`head-${depthIndex}`}>
                            {depthIndex === 0 && (
                              <th
                                rowSpan={Math.max(colFields.length, 1) + 1}
                                className="sticky left-0 z-30 whitespace-nowrap border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700"
                              >
                                {rowAxisHeader}
                              </th>
                            )}
                            {visibleCols.map((col) => (
                              <th
                                key={`${col.key}-${depthIndex}`}
                                colSpan={selectedValueTypes.length}
                                className="min-w-[120px] border-b border-r border-gray-200 px-3 py-2 text-center font-semibold text-gray-700"
                              >
                                {depthIndex === col.labels.length - 1 &&
                                  col.canToggle && (
                                    <button
                                      onClick={() => toggleCol(col.key)}
                                      className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-xs"
                                    >
                                      {collapsedCols.has(col.key) ? '+' : '−'}
                                    </button>
                                  )}
                                {col.labels[depthIndex] || ''}
                              </th>
                            ))}
                            {depthIndex === 0 && (
                              <th
                                colSpan={selectedValueTypes.length}
                                rowSpan={Math.max(colFields.length, 1)}
                                className="sticky right-0 z-30 min-w-[120px] border-b border-l border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                              >
                                合計
                              </th>
                            )}
                          </tr>
                        ),
                      )}
                      <tr key="head-values">
                        {visibleCols.flatMap((col) =>
                          selectedValueTypes.map((selectedValueType) => (
                            <th
                              key={`${col.key}-${selectedValueType}`}
                              className="min-w-[120px] border-b border-r border-gray-200 px-3 py-2 text-center text-xs font-semibold text-gray-600"
                            >
                              {getValueLabel(selectedValueType)}
                            </th>
                          )),
                        )}
                        {selectedValueTypes.map((selectedValueType) => (
                          <th
                            key={`total-head-${selectedValueType}`}
                            className="min-w-[120px] border-b border-l border-gray-200 bg-gray-100 px-3 py-2 text-center text-xs font-semibold text-gray-600"
                          >
                            {getValueLabel(selectedValueType)}
                          </th>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <tr key="head-values-only">
                      <th className="sticky left-0 z-30 whitespace-nowrap border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700">
                        {rowAxisHeader}
                      </th>
                      {selectedValueTypes.map((selectedValueType) => (
                        <th
                          key={`value-only-${selectedValueType}`}
                          className="min-w-[120px] border-b border-r border-gray-200 px-3 py-2 text-center font-semibold text-gray-700"
                        >
                          {getValueLabel(selectedValueType)}
                        </th>
                      ))}
                    </tr>
                  )
                ) : (
                  Array.from({ length: Math.max(colFields.length, 1) }).map(
                    (_, depthIndex) => (
                      <tr key={`head-${depthIndex}`}>
                        {depthIndex === 0 && (
                          <th
                            rowSpan={Math.max(colFields.length, 1)}
                            className="sticky left-0 z-30 whitespace-nowrap border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700"
                          >
                            {rowAxisHeader}
                          </th>
                        )}
                        {visibleCols.map((col) => (
                          <th
                            key={`${col.key}-${depthIndex}`}
                            className="min-w-[120px] border-b border-r border-gray-200 px-3 py-2 text-center font-semibold text-gray-700"
                          >
                            {depthIndex === col.labels.length - 1 &&
                              col.canToggle && (
                                <button
                                  onClick={() => toggleCol(col.key)}
                                  className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-xs"
                                >
                                  {collapsedCols.has(col.key) ? '+' : '−'}
                                </button>
                              )}
                            {col.labels[depthIndex] || ''}
                          </th>
                        ))}
                        {depthIndex === 0 && (
                          <th
                            rowSpan={Math.max(colFields.length, 1)}
                            className="sticky right-0 z-30 min-w-[120px] border-b border-l border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                          >
                            合計
                          </th>
                        )}
                      </tr>
                    ),
                  )
                )}
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={
                        isMultiValue
                          ? hasColumnAxis
                            ? visibleCols.length * selectedValueTypes.length +
                              selectedValueTypes.length +
                              1
                            : selectedValueTypes.length + 1
                          : visibleCols.length + 2
                      }
                      className="px-4 py-10 text-center text-gray-500"
                    >
                      沒有符合條件的工作紀錄
                    </td>
                  </tr>
                )}
                {visibleRows.map((row) => (
                  <tr
                    key={row.key}
                    className={
                      row.isGroup
                        ? 'bg-blue-50 font-semibold'
                        : 'bg-white hover:bg-gray-50'
                    }
                  >
                    <th
                      className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-gray-200 bg-inherit px-3 py-2 text-left text-gray-800"
                      style={{ paddingLeft: `${12 + (row.depth - 1) * 18}px` }}
                    >
                      {row.canToggle && (
                        <button
                          onClick={() => toggleRow(row.key)}
                          className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-xs text-gray-700"
                        >
                          {collapsedRows.has(row.key) ? '+' : '−'}
                        </button>
                      )}
                      {row.label}
                    </th>
                    {isMultiValue ? (
                      <>
                        {hasColumnAxis
                          ? visibleCols.flatMap((col) =>
                              selectedValueTypes.map((selectedValueType) =>
                                row.isGroup ? (
                                  <td
                                    key={`${row.key}-${col.key}-${selectedValueType}`}
                                    className="border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums text-gray-800"
                                  />
                                ) : (
                                  renderMetricCell(
                                    `${row.key}-${col.key}-${selectedValueType}`,
                                    aggregateMetric(
                                      pivot,
                                      row.labels,
                                      col.labels,
                                      selectedValueType,
                                      true,
                                    ),
                                  )
                                ),
                              ),
                            )
                          : selectedValueTypes.map((selectedValueType) =>
                              row.isGroup ? (
                                <td
                                  key={`${row.key}-${selectedValueType}`}
                                  className="border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums text-gray-800"
                                />
                              ) : (
                                renderMetricCell(
                                  `${row.key}-${selectedValueType}`,
                                  aggregateMetric(
                                    pivot,
                                    row.labels,
                                    [],
                                    selectedValueType,
                                    true,
                                  ),
                                )
                              ),
                            )}
                        {hasColumnAxis &&
                          selectedValueTypes.map((selectedValueType) => (
                            <td
                              key={`${row.key}-total-${selectedValueType}`}
                              className="sticky right-0 z-10 border-b border-l border-gray-200 bg-gray-50 px-3 py-2 text-right font-semibold tabular-nums text-gray-900"
                            >
                              {row.isGroup
                                ? ''
                                : metricText(
                                    aggregateMetric(
                                      pivot,
                                      row.labels,
                                      [],
                                      selectedValueType,
                                      true,
                                    ),
                                  )}
                            </td>
                          ))}
                      </>
                    ) : (
                      <>
                        {visibleCols.map((col) => {
                          if (row.isGroup) {
                            return (
                              <td
                                key={`${row.key}-${col.key}`}
                                className="border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums text-gray-800"
                              />
                            );
                          }
                          return renderMetricCell(
                            `${row.key}-${col.key}`,
                            aggregateMetric(pivot, row.labels, col.labels),
                          );
                        })}
                        <td className="sticky right-0 z-10 border-b border-l border-gray-200 bg-gray-50 px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                          {row.isGroup
                            ? ''
                            : metricText(aggregateMetric(pivot, row.labels, []))}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100">
                <tr>
                  <th className="sticky left-0 z-30 border-t border-r border-gray-300 bg-gray-100 px-3 py-2 text-left font-bold text-gray-900">
                    合計
                  </th>
                  {isMultiValue ? (
                    <>
                      {hasColumnAxis
                        ? visibleCols.flatMap((col) =>
                            selectedValueTypes.map((selectedValueType) => (
                              <td
                                key={`total-${col.key}-${selectedValueType}`}
                                className="border-t border-r border-gray-300 px-3 py-2 text-right font-bold tabular-nums text-gray-900"
                              >
                                {metricText(
                                  aggregateMetric(
                                    pivot,
                                    [],
                                    col.labels,
                                    selectedValueType,
                                    true,
                                  ),
                                )}
                              </td>
                            )),
                          )
                        : selectedValueTypes.map((selectedValueType) => (
                            <td
                              key={`grand-${selectedValueType}`}
                              className="border-t border-r border-gray-300 px-3 py-2 text-right font-bold tabular-nums text-gray-900"
                            >
                              {metricText(
                                getGrandTotalMetric(pivot, selectedValueType, true),
                              )}
                            </td>
                          ))}
                      {hasColumnAxis &&
                        selectedValueTypes.map((selectedValueType) => (
                          <td
                            key={`grand-total-${selectedValueType}`}
                            className="sticky right-0 z-30 border-t border-l border-gray-300 bg-gray-100 px-3 py-2 text-right font-bold tabular-nums text-gray-900"
                          >
                            {metricText(
                              getGrandTotalMetric(pivot, selectedValueType, true),
                            )}
                          </td>
                        ))}
                    </>
                  ) : (
                    <>
                      {visibleCols.map((col) => (
                        <td
                          key={`total-${col.key}`}
                          className="border-t border-r border-gray-300 px-3 py-2 text-right font-bold tabular-nums text-gray-900"
                        >
                          {metricText(aggregateMetric(pivot, [], col.labels))}
                        </td>
                      ))}
                      <td className="sticky right-0 z-30 border-t border-l border-gray-300 bg-gray-100 px-3 py-2 text-right font-bold tabular-nums text-gray-900">
                        {metricText(
                          getGrandTotalMetric(pivot, selectedValueTypes[0], false),
                        )}
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
