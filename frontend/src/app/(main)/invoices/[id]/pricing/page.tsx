'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import DateInput from '@/components/DateInput';
import {
  fieldOptionsApi,
  invoicesApi,
  companiesApi,
  partnersApi,
  contractsApi,
  quotationsApi,
  employeesApi,
  vehiclesApi,
  machineryApi,
  subconFleetDriversApi,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import ColumnFilter from '@/components/ColumnFilter';
import ColumnCustomizer from '@/components/ColumnCustomizer';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { fmtDate } from '@/lib/dateUtils';
import EditableCell from '../../../work-logs/EditableCell';
import { STATUS_OPTIONS, getStatusLabel } from '../../../work-logs/constants';

const fmtMoney = (value: unknown) =>
  `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BLANK = '(空白)';
const EMPTY_METRIC: PivotMetric = { value: 0, unit: '' };

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
type SortOrder = 'ASC' | 'DESC';
type LeftViewMode = 'pivot' | 'list';

interface Option {
  value: string | number;
  label: string;
  _raw?: any;
  shortLabel?: string;
}

interface PricingGroup {
  key: string;
  company_id: number | null;
  client_id: number | null;
  client_contract_no: string | null;
  service_type: string | null;
  quotation_id: number | null;
  day_night: string | null;
  tonnage: string | null;
  machine_type: string | null;
  origin: string | null;
  destination: string | null;
  work_date: string | null;
  count: number;
}

interface InvoiceItemDraft {
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount?: number;
  sort_order?: number;
  matched?: boolean;
  rate_card_id?: number | null;
}

interface PivotRowPrice {
  unit_price: number;
  matched?: boolean;
  rate_card_id?: number | null;
  rate_card_name?: string | null;
  unit?: string | null;
  item_name?: string | null;
  description?: string | null;
}

interface PricingDraftPayload {
  pivot_config?: {
    rowFields?: PivotDimension[];
    colFields?: PivotDimension[];
    valueTypes?: PivotValueType[];
    valueType?: PivotValueType;
    filters?: Record<string, unknown>;
    leftViewMode?: LeftViewMode;
    listNewRows?: any[];
  };
  row_prices?: Record<string, PivotRowPrice>;
  draft_items?: InvoiceItemDraft[];
  work_log_drafts?: Record<number, Record<string, any>>;
}

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
  valueTypes?: PivotValueType[];
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

interface WorkLogFilterOptions {
  companies: Option[];
  clients: Option[];
  employees: Option[];
  equipmentNumbers: Option[];
  machineTypes: Option[];
  startLocations: Option[];
  endLocations: Option[];
  contracts: Option[];
  quotations: Option[];
  dayNights: Option[];
  serviceTypes: Option[];
}

const COLUMNS = [
  { key: 'status', label: '狀態', width: 'w-20' },
  { key: 'scheduled_date', label: '約定日期', width: 'w-28' },
  { key: 'service_type', label: '服務類型', width: 'w-28' },
  { key: 'company', label: '公司', width: 'w-24' },
  { key: 'client', label: '客戶公司', width: 'w-28' },
  { key: 'quotation', label: '報價單', width: 'w-32' },
  { key: 'client_contract_no', label: '客戶合約', width: 'w-32' },
  { key: 'contract', label: '合約', width: 'w-32' },
  { key: 'employee', label: '員工', width: 'w-24' },
  { key: 'tonnage', label: '噸數', width: 'w-16' },
  { key: 'machine_type', label: '機種', width: 'w-24' },
  { key: 'equipment_number', label: '機號', width: 'w-28' },
  { key: 'day_night', label: '日夜班', width: 'w-14' },
  { key: 'start_location', label: '起點', width: 'w-40' },
  { key: 'end_location', label: '終點', width: 'w-40' },
  { key: 'quantity', label: '數量', width: 'w-20' },
  { key: 'unit', label: '工資單位', width: 'w-16' },
  { key: 'ot_quantity', label: 'OT數量', width: 'w-24' },
  { key: 'ot_unit', label: 'OT單位', width: 'w-16' },
  { key: 'is_mid_shift', label: '中直', width: 'w-16' },
  { key: 'is_confirmed', label: '已確認', width: 'w-20' },
];

const colKeyToField: Record<string, string> = {
  company: 'company_id',
  client: 'client_id',
  quotation: 'quotation_id',
  contract: 'contract_id',
  employee: 'employee_id',
};

const normalizeDateValue = (value: any): any => {
  if (!value) return value ?? null;
  return typeof value === 'string' ? value.split('T')[0] : value;
};

const normalizeComparable = (value: any): any => {
  if (value === undefined || value === '') return null;
  return value;
};

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

function normalizePivotValueTypes(values: unknown): PivotValueType[] {
  const input = Array.isArray(values) ? values : [values];
  const allowed = new Set(VALUE_OPTIONS.map((option) => option.value));
  const result: PivotValueType[] = [];
  input.forEach((value) => {
    if (typeof value !== 'string') return;
    if (!allowed.has(value as PivotValueType)) return;
    if (!result.includes(value as PivotValueType)) result.push(value as PivotValueType);
  });
  return result.length > 0 ? result : ['quantity_sum'];
}

function getValueTypeLabel(valueType: PivotValueType): string {
  return VALUE_OPTIONS.find((option) => option.value === valueType)?.label || valueType;
}

function metricDataKey(
  baseKey: string,
  valueType: PivotValueType,
  useMetricSuffix: boolean,
): string {
  return useMetricSuffix ? `${baseKey}|${valueType}` : baseKey;
}

function grandTotalMetric(
  pivot: WorkLogPivotResult | null,
  valueType: PivotValueType,
): PivotMetric {
  if (!pivot) return EMPTY_METRIC;
  const useMetricSuffix = (pivot.valueTypes || []).length > 1;
  if (!useMetricSuffix) return (pivot.grandTotal as PivotMetric) || EMPTY_METRIC;
  const totals = pivot.grandTotal as Record<string, PivotMetric>;
  return totals?.[valueType] || EMPTY_METRIC;
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function dateText(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  return text.slice(0, 10);
}

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function recordKey(values: unknown[]): string {
  return values.map((value) => normalizeText(value) || '').join('\u001f');
}

function rowAmount(item: InvoiceItemDraft): number {
  return (
    Math.round(
      (Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100,
    ) / 100
  );
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  valueType: PivotValueType,
): PivotMetric {
  if (!pivot) return EMPTY_METRIC;
  const useMetricSuffix = (pivot.valueTypes || []).length > 1;
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
        metricDataKey(
          `${rowLeaves[0].key}|${colLeaves[0].key}`,
          valueType,
          useMetricSuffix,
        )
      ] || EMPTY_METRIC
    );
  }

  const acc = { value: 0, units: new Map<string, number>() };
  rowLeaves.forEach((row) => {
    colLeaves.forEach((col) =>
      addMetric(
        acc,
        pivot.data[metricDataKey(`${row.key}|${col.key}`, valueType, useMetricSuffix)],
      ),
    );
  });
  return finalizeMetric(acc);
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
      if (a.value === BLANK) return -1;
      if (b.value === BLANK) return 1;
      return a.label.localeCompare(b.label, 'zh-Hant');
    });
}

function optionValues(options: Option[]): string[] {
  return options.map((option) => String(option.value));
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function areAllOptionsSelected(values: string[], options: Option[]): boolean {
  const valuesSet = new Set(values);
  const allValues = optionValues(options);
  return (
    allValues.length > 0 && allValues.every((value) => valuesSet.has(value))
  );
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

function safeLabel(value: unknown): string {
  return normalizeText(value) || BLANK;
}

function optionFromLabel(value: unknown): Option {
  const label = safeLabel(value);
  return { value: label, label };
}

function getEmployeeLabel(workLog: any): string {
  return (
    normalizeText(workLog.employee?.name_zh) ||
    normalizeText(workLog.employee?.name_en) ||
    normalizeText(workLog.fleet_driver?.name_zh) ||
    normalizeText(workLog.fleet_driver?.short_name) ||
    normalizeText(workLog.fleet_driver?.name) ||
    (workLog.employee_id ? `員工 #${workLog.employee_id}` : null) ||
    (workLog.work_log_fleet_driver_id
      ? `司機 #${workLog.work_log_fleet_driver_id}`
      : null) ||
    BLANK
  );
}

function getCompanyLabel(workLog: any): string {
  return (
    normalizeText(workLog.company?.internal_prefix) ||
    normalizeText(workLog.company?.short_name) ||
    normalizeText(workLog.company?.name) ||
    normalizeText(workLog.company_profile?.code) ||
    normalizeText(workLog.company_profile?.chinese_name) ||
    normalizeText(workLog.company_profile?.english_name) ||
    (workLog.company_id ? `公司 #${workLog.company_id}` : null) ||
    BLANK
  );
}

function getClientLabel(workLog: any): string {
  return (
    normalizeText(workLog.client?.name) ||
    normalizeText(workLog.client?.short_name) ||
    (workLog.client_id ? `客戶 #${workLog.client_id}` : null) ||
    BLANK
  );
}

function getContractLabel(workLog: any): string {
  return (
    normalizeText(workLog.contract?.contract_no) ||
    normalizeText(workLog.client_contract_no) ||
    BLANK
  );
}

function getQuotationLabel(workLog: any): string {
  return (
    normalizeText(workLog.quotation?.quotation_no) ||
    (workLog.quotation_id ? `報價單 #${workLog.quotation_id}` : null) ||
    BLANK
  );
}

function getScheduledDateLabel(workLog: any): string {
  return dateText(workLog.scheduled_date) || BLANK;
}

function parseLocalDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMonthLabel(workLog: any): string {
  const date = getScheduledDateLabel(workLog);
  return date === BLANK ? BLANK : date.slice(0, 7);
}

function getWeekLabel(workLog: any): string {
  const dateTextValue = getScheduledDateLabel(workLog);
  if (dateTextValue === BLANK) return BLANK;
  const date = parseLocalDate(dateTextValue);
  if (!date) return dateTextValue;
  const utc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const weekYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

function getConfirmationValue(workLog: any): string {
  if (typeof workLog.confirmed === 'boolean')
    return workLog.confirmed ? 'confirmed' : 'unconfirmed';
  if (typeof workLog.is_confirmed === 'boolean')
    return workLog.is_confirmed ? 'confirmed' : 'unconfirmed';
  if (typeof workLog.status === 'string') {
    const status = workLog.status.toLowerCase();
    if (
      ['confirmed', 'verified', 'approved'].includes(status) ||
      workLog.status.includes('已確認')
    )
      return 'confirmed';
  }
  if (Array.isArray(workLog.verification_confirmations)) {
    const hasConfirmed = workLog.verification_confirmations.some(
      (item: any) => String(item?.status || '').toLowerCase() === 'confirmed',
    );
    if (hasConfirmed) return 'confirmed';
  }
  return 'unconfirmed';
}

function dimensionValue(workLog: any, dimension: PivotDimension): string {
  switch (dimension) {
    case 'employee':
      return getEmployeeLabel(workLog);
    case 'equipment_number':
      return safeLabel(workLog.equipment_number);
    case 'client':
      return getClientLabel(workLog);
    case 'company':
      return getCompanyLabel(workLog);
    case 'machine_type':
      return safeLabel(workLog.machine_type);
    case 'start_location':
      return safeLabel(workLog.start_location);
    case 'end_location':
      return safeLabel(workLog.end_location);
    case 'contract':
      return getContractLabel(workLog);
    case 'quotation':
      return getQuotationLabel(workLog);
    case 'scheduled_date':
      return getScheduledDateLabel(workLog);
    case 'week':
      return getWeekLabel(workLog);
    case 'month':
      return getMonthLabel(workLog);
    case 'day_night':
      return safeLabel(workLog.day_night);
    case 'service_type':
      return safeLabel(workLog.service_type);
    case 'none':
      return '全部';
  }
}

function getPivotMetricForLog(
  workLog: any,
  valueType: PivotValueType,
): PivotMetric {
  switch (valueType) {
    case 'count':
      return { value: 1, unit: '筆' };
    case 'quantity_sum':
      return {
        value: toNumber(workLog.quantity),
        unit: normalizeText(workLog.unit) || '',
      };
    case 'goods_quantity_sum':
      return {
        value: toNumber(workLog.goods_quantity),
        unit: '件',
      };
    case 'ot_sum':
      return {
        value: toNumber(workLog.ot_quantity),
        unit: normalizeText(workLog.ot_unit) || '',
      };
    case 'mid_shift_count':
      return { value: workLog.is_mid_shift ? 1 : 0, unit: '次' };
  }
}

function makePivotAxisItem(
  fields: PivotDimension[],
  workLog: any,
): PivotAxisItem {
  const labels =
    fields.length > 0
      ? fields.map((field) => dimensionValue(workLog, field))
      : ['全部'];
  return { key: encodeAxisKey(labels), values: labels, labels };
}

function buildLocalPivot(
  workLogs: any[],
  rowFields: PivotDimension[],
  colFields: PivotDimension[],
  requestedValueTypes: PivotValueType[],
): WorkLogPivotResult {
  const valueTypes = normalizePivotValueTypes(requestedValueTypes);
  const useMetricSuffix = valueTypes.length > 1;
  const rows = new Map<string, PivotAxisItem>();
  const cols = new Map<string, PivotAxisItem>();
  const dataAcc = new Map<
    string,
    { value: number; units: Map<string, number> }
  >();
  const rowAcc = new Map<
    string,
    { value: number; units: Map<string, number> }
  >();
  const colAcc = new Map<
    string,
    { value: number; units: Map<string, number> }
  >();
  const grandAcc = new Map<
    PivotValueType,
    { value: number; units: Map<string, number> }
  >();

  const addToMap = (
    map: Map<string, { value: number; units: Map<string, number> }>,
    key: string,
    metric: PivotMetric,
  ) => {
    if (!map.has(key))
      map.set(key, { value: 0, units: new Map<string, number>() });
    addMetric(map.get(key)!, metric);
  };

  const addToGrand = (valueType: PivotValueType, metric: PivotMetric) => {
    if (!grandAcc.has(valueType))
      grandAcc.set(valueType, { value: 0, units: new Map<string, number>() });
    addMetric(grandAcc.get(valueType)!, metric);
  };

  workLogs.forEach((workLog) => {
    const row = makePivotAxisItem(rowFields, workLog);
    const col = makePivotAxisItem(colFields, workLog);
    rows.set(row.key, row);
    cols.set(col.key, col);
    valueTypes.forEach((valueType) => {
      const metric = getPivotMetricForLog(workLog, valueType);
      addToMap(
        dataAcc,
        metricDataKey(`${row.key}|${col.key}`, valueType, useMetricSuffix),
        metric,
      );
      addToMap(rowAcc, metricDataKey(row.key, valueType, useMetricSuffix), metric);
      addToMap(colAcc, metricDataKey(col.key, valueType, useMetricSuffix), metric);
      addToGrand(valueType, metric);
    });
  });

  const sortAxisItems = (items: PivotAxisItem[]) =>
    items.sort((a, b) =>
      a.labels.join(' / ').localeCompare(b.labels.join(' / '), 'zh-Hant'),
    );
  const finalizeMap = (
    map: Map<string, { value: number; units: Map<string, number> }>,
  ) =>
    Object.fromEntries(
      Array.from(map.entries()).map(([key, acc]) => [key, finalizeMetric(acc)]),
    );
  const finalizeGrandTotal = (): PivotMetric | Record<string, PivotMetric> => {
    const entries = valueTypes.map((valueType) => [
      valueType,
      finalizeMetric(
        grandAcc.get(valueType) || { value: 0, units: new Map<string, number>() },
      ),
    ]);
    return useMetricSuffix
      ? Object.fromEntries(entries)
      : (entries[0]?.[1] as PivotMetric) || EMPTY_METRIC;
  };
  const employeeSet = new Set(
    workLogs.map(getEmployeeLabel).filter((value) => value !== BLANK),
  );
  const equipmentSet = new Set(
    workLogs
      .map((workLog) => safeLabel(workLog.equipment_number))
      .filter((value) => value !== BLANK),
  );
  const pricedCount = workLogs.filter(
    (workLog) =>
      toNumber(
        workLog.unit_price ??
          workLog.rate ??
          workLog.client_rate ??
          workLog.price,
      ) > 0,
  ).length;
  const totalQuantity = workLogs.reduce(
    (sum, workLog) => sum + toNumber(workLog.quantity),
    0,
  );
  const confirmedCount = workLogs.filter(
    (workLog) => getConfirmationValue(workLog) === 'confirmed',
  ).length;

  return {
    rows: sortAxisItems(Array.from(rows.values())),
    cols: sortAxisItems(Array.from(cols.values())),
    data: finalizeMap(dataAcc),
    rowTotals: finalizeMap(rowAcc),
    colTotals: finalizeMap(colAcc),
    grandTotal: finalizeGrandTotal(),
    valueTypes,
    summary: {
      totalRecords: workLogs.length,
      confirmedCount,
      totalQuantity: Number(totalQuantity.toFixed(2)),
      priceMatchRate: workLogs.length ? pricedCount / workLogs.length : 0,
      employeeCount: employeeSet.size,
      equipmentCount: equipmentSet.size,
    },
  };
}

function workLogMatchFields(workLog: any): Omit<PricingGroup, 'key' | 'count'> {
  return {
    company_id: numberOrNull(workLog.company_id),
    client_id: numberOrNull(workLog.client_id),
    client_contract_no: normalizeText(workLog.client_contract_no),
    service_type: normalizeText(workLog.service_type),
    quotation_id: numberOrNull(workLog.quotation_id),
    day_night: normalizeText(workLog.day_night),
    tonnage: normalizeText(workLog.tonnage),
    machine_type: normalizeText(workLog.machine_type),
    origin: normalizeText(workLog.start_location),
    destination: normalizeText(workLog.end_location),
    work_date: dateText(workLog.scheduled_date),
  };
}

function groupDescription(group: PricingGroup): string {
  const parts = [
    group.client_contract_no && `合約：${group.client_contract_no}`,
    group.service_type && `服務：${group.service_type}`,
    group.day_night && `班別：${group.day_night}`,
    group.tonnage && `噸數：${group.tonnage}`,
    group.machine_type && `機種：${group.machine_type}`,
    (group.origin || group.destination) &&
      `路線：${group.origin || '—'} → ${group.destination || '—'}`,
    `筆數：${group.count}`,
  ].filter(Boolean);
  return parts.join('；');
}

function buildPricingGroups(workLogs: any[]): PricingGroup[] {
  const map = new Map<string, PricingGroup>();
  workLogs.forEach((workLog) => {
    const fields = workLogMatchFields(workLog);
    const key = recordKey([
      fields.company_id,
      fields.client_id,
      fields.client_contract_no,
      fields.service_type,
      fields.quotation_id,
      fields.day_night,
      fields.tonnage,
      fields.machine_type,
      fields.origin,
      fields.destination,
    ]);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.work_date && fields.work_date)
        existing.work_date = fields.work_date;
    } else {
      map.set(key, { key, ...fields, count: 1 });
    }
  });
  return Array.from(map.values()).sort((a, b) =>
    a.key.localeCompare(b.key, 'zh-Hant'),
  );
}

function uniqueNullable<T>(values: Array<T | null | undefined>): T | null {
  const normalized = values.filter(
    (value): value is T =>
      value !== null && value !== undefined && String(value).trim() !== '',
  );
  const unique = Array.from(new Set(normalized.map((value) => String(value))));
  if (unique.length !== 1) return null;
  return normalized[0];
}

function rowMatchesWorkLog(
  row: RowEntry,
  workLog: any,
  rowFields: PivotDimension[],
): boolean {
  const labels =
    rowFields.length > 0
      ? rowFields.map((field) => dimensionValue(workLog, field))
      : ['全部'];
  return (
    labels.length === row.labels.length &&
    row.labels.every((label, index) => labels[index] === label)
  );
}

function buildPivotRowPricingGroup(
  row: RowEntry,
  workLogs: any[],
  rowFields: PivotDimension[],
  quantity: number,
): PricingGroup {
  const matchedLogs = workLogs.filter((workLog) =>
    rowMatchesWorkLog(row, workLog, rowFields),
  );
  const fields = matchedLogs.map(workLogMatchFields);
  return {
    key: row.key,
    company_id: uniqueNullable(fields.map((field) => field.company_id)),
    client_id: uniqueNullable(fields.map((field) => field.client_id)),
    client_contract_no: uniqueNullable(
      fields.map((field) => field.client_contract_no),
    ),
    service_type: uniqueNullable(fields.map((field) => field.service_type)),
    quotation_id: uniqueNullable(fields.map((field) => field.quotation_id)),
    day_night: uniqueNullable(fields.map((field) => field.day_night)),
    tonnage: uniqueNullable(fields.map((field) => field.tonnage)),
    machine_type: uniqueNullable(fields.map((field) => field.machine_type)),
    origin: uniqueNullable(fields.map((field) => field.origin)),
    destination: uniqueNullable(fields.map((field) => field.destination)),
    work_date: uniqueNullable(fields.map((field) => field.work_date)),
    count: quantity || matchedLogs.length,
  };
}

function cleanPivotLabel(label: string | null | undefined): string | null {
  const normalized = normalizeText(label);
  if (!normalized || normalized === BLANK) return null;
  return normalized;
}

function uniqueCleanPivotLabels(
  labels: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(
      labels.map((label) => cleanPivotLabel(label)).filter(Boolean) as string[],
    ),
  );
}

function formatMetricValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

function metricQuantityText(metric: PivotMetric): string {
  const valueText = formatMetricValue(Number(metric.value) || 0);
  return metric.unit ? `${valueText}${metric.unit}` : valueText;
}

function fieldLabelEntries(row: RowEntry, rowFields: PivotDimension[]) {
  return rowFields
    .map((field, index) => ({
      field,
      label: cleanPivotLabel(row.labels[index]),
    }))
    .filter((entry): entry is { field: PivotDimension; label: string } =>
      Boolean(entry.label),
    );
}

function buildPivotItemName(
  row: RowEntry,
  workLogs: any[],
  rowFields: PivotDimension[],
): string {
  const entries = fieldLabelEntries(row, rowFields);
  const origin = entries.find(
    (entry) => entry.field === 'start_location',
  )?.label;
  const destination = entries.find(
    (entry) => entry.field === 'end_location',
  )?.label;
  const nonRouteLabels = entries
    .filter(
      (entry) =>
        entry.field !== 'start_location' && entry.field !== 'end_location',
    )
    .map((entry) => entry.label);

  const baseParts: string[] = [];
  if (nonRouteLabels.length > 0) baseParts.push(nonRouteLabels.join(' / '));
  if (origin || destination)
    baseParts.push(`${origin || '—'} 至 ${destination || '—'}`);
  if (baseParts.length === 0) {
    const rowLabels = uniqueCleanPivotLabels(row.labels);
    baseParts.push(rowLabels.join(' / ') || row.label || 'Pivot 項目');
  }

  const matchedLogs = workLogs.filter((workLog) =>
    rowMatchesWorkLog(row, workLog, rowFields),
  );
  const tonnageLabels = uniqueCleanPivotLabels(
    matchedLogs.map((workLog) => normalizeText(workLog.tonnage)),
  );
  const machineTypeLabels = uniqueCleanPivotLabels(
    matchedLogs.map((workLog) => normalizeText(workLog.machine_type)),
  );
  const baseText = baseParts.join(' / ');
  const tonnageText =
    tonnageLabels.length === 1 && !baseText.includes(tonnageLabels[0])
      ? tonnageLabels[0]
      : '';
  const machineTypeText =
    machineTypeLabels.length === 1 && !baseText.includes(machineTypeLabels[0])
      ? machineTypeLabels[0]
      : '';
  const specText = `${tonnageText}${machineTypeText}`.trim();

  if (!specText) return baseText;
  return `${baseText} - ${specText}`;
}

function buildPivotDescription(
  pivot: WorkLogPivotResult,
  row: RowEntry,
  valueType: PivotValueType,
): string {
  return pivot.cols
    .map((col) => {
      const metric = aggregateMetric(pivot, row.labels, col.labels, valueType);
      if ((Number(metric.value) || 0) <= 0) return null;
      const colLabel = uniqueCleanPivotLabels(col.labels).join(' / ') || '全部';
      return `${colLabel} - ${metricQuantityText(metric)}`;
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeDraftItem(item: any, index: number): InvoiceItemDraft {
  return {
    item_name: item?.item_name || '',
    description: item?.description || '',
    quantity: Number(item?.quantity) || 0,
    unit: item?.unit || '',
    unit_price: Number(item?.unit_price) || 0,
    amount: Number(item?.amount) || 0,
    sort_order: item?.sort_order || index + 1,
    matched: typeof item?.matched === 'boolean' ? item.matched : undefined,
    rate_card_id: item?.rate_card_id || null,
  };
}

function createOptionsFromWorkLogs(workLogs: any[]): WorkLogFilterOptions {
  return {
    companies: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(getCompanyLabel(workLog))),
    ),
    clients: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(getClientLabel(workLog))),
    ),
    employees: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(getEmployeeLabel(workLog))),
    ),
    equipmentNumbers: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(workLog.equipment_number)),
    ),
    machineTypes: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(workLog.machine_type)),
    ),
    startLocations: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(workLog.start_location)),
    ),
    endLocations: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(workLog.end_location)),
    ),
    contracts: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(getContractLabel(workLog))),
    ),
    quotations: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(getQuotationLabel(workLog))),
    ),
    dayNights: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(workLog.day_night)),
    ),
    serviceTypes: normalizeOptions(
      workLogs.map((workLog) => optionFromLabel(workLog.service_type)),
    ),
  };
}

function matchesSelected(
  value: string,
  selectedValues: string[],
  options: Option[],
): boolean {
  if (
    selectedValues.length === 0 ||
    areAllOptionsSelected(selectedValues, options)
  )
    return true;
  return selectedValues.includes(value);
}

function isWithinDateRange(
  workLog: any,
  dateFrom: string,
  dateTo: string,
): boolean {
  const scheduledDate = getScheduledDateLabel(workLog);
  if (scheduledDate === BLANK) return !dateFrom && !dateTo;
  if (dateFrom && scheduledDate < dateFrom) return false;
  if (dateTo && scheduledDate > dateTo) return false;
  return true;
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
    () => options.filter((option) => selectedSet.has(String(option.value))),
    [options, selectedSet],
  );
  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(keyword) ||
        String(option.value).toLowerCase().includes(keyword),
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
                onClick={() => toggleValue(String(option.value))}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-blue-50"
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={selectedSet.has(String(option.value))}
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

export default function InvoicePricingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = Number(params.id);
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('invoices');
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<any>(null);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [items, setItems] = useState<InvoiceItemDraft[]>([]);
  const [unitOptions, setUnitOptions] = useState<Option[]>([]);
  const [rowFields, setRowFields] = useState<PivotDimension[]>([
    'contract',
    'start_location',
    'end_location',
  ]);
  const [colFields, setColFields] = useState<PivotDimension[]>([
    'equipment_number',
  ]);
  const [valueTypes, setValueTypes] = useState<PivotValueType[]>(['quantity_sum']);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [axisOpen, setAxisOpen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [rowPrices, setRowPrices] = useState<Record<string, PivotRowPrice>>({});
  const [leftPanelHidden, setLeftPanelHidden] = useState(false);
  const [rightPanelHidden, setRightPanelHidden] = useState(false);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [leftViewMode, setLeftViewMode] = useState<LeftViewMode>('pivot');
  const [listDrafts, setListDrafts] = useState<
    Map<string, Record<string, any>>
  >(new Map());
  const [listSavedDraftIds, setListSavedDraftIds] = useState<Set<string>>(
    new Set(),
  );
  const [listNewRows, setListNewRows] = useState<any[]>([]);
  const [listSortBy, setListSortBy] = useState('scheduled_date');
  const [listSortOrder, setListSortOrder] = useState<SortOrder>('DESC');
  const [listColumnFilters, setListColumnFilters] = useState<
    Record<string, Set<string>>
  >({});
  const [companies, setCompanies] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [contracts, setContracts] = useState<Option[]>([]);
  const [quotations, setQuotations] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [fieldOptions, setFieldOptions] = useState<Record<string, Option[]>>(
    {},
  );
  const [allEquipment, setAllEquipment] = useState<Option[]>([]);
  const filterOptionsRef = useRef<Record<string, Option[]>>({});
  const filterSelectionInitializedRef = useRef<Record<string, boolean>>({});

  const {
    columnConfigs: listColumnConfigs,
    visibleColumns: listVisibleColumns,
    handleColumnConfigChange: handleListColumnConfigChange,
    handleReset: handleListColumnReset,
    handleSavePersonal: handleListSavePersonal,
    handleSaveDefault: handleListSaveDefault,
  } = useColumnConfig('invoice-pricing-work-logs', COLUMNS);

  const loadReferenceData = useCallback(async () => {
    try {
      const [cp, pt, ct, qo, em, fo, veh, mach, subconFleet, fleetDrivers] =
        await Promise.all([
          companiesApi.simple(),
          partnersApi.simple(),
          contractsApi.simple(),
          quotationsApi.list({ limit: 500 }),
          employeesApi.list({ limit: 500, status: 'active' }),
          fieldOptionsApi.getAll(),
          vehiclesApi.simple().catch(() => ({ data: [] })),
          machineryApi.simple().catch(() => ({ data: [] })),
          subconFleetDriversApi.simple().catch(() => ({ data: [] })),
          subconFleetDriversApi.simpleDrivers().catch(() => ({ data: [] })),
        ]);

      setCompanies(
        (cp.data || []).map((c: any) => ({
          value: c.id,
          label: c.internal_prefix ? `${c.internal_prefix} ${c.name}` : c.name,
          _raw: c,
          shortLabel: c.internal_prefix || c.name,
        })),
      );
      setClients(
        (pt.data || []).map((p: any) => ({
          value: p.id,
          label: p.name,
          _raw: p,
          shortLabel: p.code || p.name,
        })),
      );
      setContracts(
        (ct.data || []).map((c: any) => ({
          value: c.id,
          label: c.contract_no + (c.contract_name ? ' ' + c.contract_name : ''),
          _raw: c,
        })),
      );
      const qoData = qo.data?.data || qo.data || [];
      setQuotations(
        qoData.map((q: any) => ({
          value: q.id,
          label:
            q.quotation_no + (q.contract_name ? ' ' + q.contract_name : ''),
          _raw: q,
        })),
      );
      const employeeList = (em.data?.data || []).map((e: any) => ({
        value: `emp_${e.id}`,
        label: e.name_zh || e.name || String(e.id),
        _raw: e,
      }));
      const fleetDriverList = (fleetDrivers.data || []).map((d: any) => ({
        value: d.value,
        label: d.label,
        _raw: d,
      }));
      setEmployees([...employeeList, ...fleetDriverList]);
      const grouped: Record<string, Option[]> = {};
      for (const [cat, opts] of Object.entries(fo.data || {})) {
        grouped[cat] = (opts as any[]).map((o: any) => ({
          value: o.label,
          label: o.label,
        }));
      }
      setFieldOptions(grouped);
      setAllEquipment([
        ...(veh.data || []),
        ...(mach.data || []),
        ...(subconFleet.data || []),
      ]);
    } catch (err) {
      console.error('load pricing references failed', err);
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pricingRes, draftRes, unitsRes] = await Promise.all([
        invoicesApi.getPricingData(invoiceId),
        invoicesApi
          .getPricingDraft(invoiceId)
          .catch(() => ({ data: { draft: null } })),
        fieldOptionsApi.getByCategory('wage_unit').catch(() => ({ data: [] })),
      ]);
      const loadedWorkLogs = pricingRes.data.work_logs || [];
      const pricingDraft = draftRes.data?.draft as PricingDraftPayload | null;
      const pivotConfig = pricingDraft?.pivot_config || {};
      const filters = pivotConfig.filters || {};
      setInvoice(pricingRes.data.invoice);
      setWorkLogs(loadedWorkLogs);
      setLeftViewMode(pivotConfig.leftViewMode === 'list' ? 'list' : 'pivot');
      setListNewRows(
        Array.isArray(pivotConfig.listNewRows) ? pivotConfig.listNewRows : [],
      );
      const nextListDrafts = new Map<string, Record<string, any>>();
      const nextSavedDraftIds = new Set<string>();
      for (const draft of pricingRes.data.drafts || []) {
        const workLogId = String(draft.work_log_id);
        nextSavedDraftIds.add(workLogId);
        if (draft.draft_data && Object.keys(draft.draft_data).length > 0) {
          nextListDrafts.set(workLogId, { ...draft.draft_data });
        }
      }
      setListDrafts(nextListDrafts);
      setListSavedDraftIds(nextSavedDraftIds);
      setItems(
        Array.isArray(pricingDraft?.draft_items) &&
          pricingDraft.draft_items.length > 0
          ? pricingDraft.draft_items.map(normalizeDraftItem)
          : (pricingRes.data.items || []).map(normalizeDraftItem),
      );
      setUnitOptions(
        (unitsRes.data || [])
          .map((option: any) => ({
            value: option.label || option.value || '',
            label: option.label || option.value || '',
          }))
          .filter((option: Option) => option.value),
      );
      setRowPrices(pricingDraft?.row_prices || {});
      if (Array.isArray(pivotConfig.rowFields))
        setRowFields(
          pivotConfig.rowFields.filter((field) =>
            DIMENSION_OPTIONS.some((option) => option.value === field),
          ),
        );
      if (Array.isArray(pivotConfig.colFields))
        setColFields(
          pivotConfig.colFields.filter((field) =>
            DIMENSION_OPTIONS.some((option) => option.value === field),
          ),
        );
      setValueTypes(
        normalizePivotValueTypes(
          Array.isArray(pivotConfig.valueTypes)
            ? pivotConfig.valueTypes
            : pivotConfig.valueType,
        ),
      );
      setDateFrom(typeof filters.dateFrom === 'string' ? filters.dateFrom : '');
      setDateTo(typeof filters.dateTo === 'string' ? filters.dateTo : '');
      setCompanyIds(
        Array.isArray(filters.companyIds) ? filters.companyIds.map(String) : [],
      );
      setClientIds(
        Array.isArray(filters.clientIds) ? filters.clientIds.map(String) : [],
      );
      setEmployeeIds(
        Array.isArray(filters.employeeIds)
          ? filters.employeeIds.map(String)
          : [],
      );
      setEquipmentNumbers(
        Array.isArray(filters.equipmentNumbers)
          ? filters.equipmentNumbers.map(String)
          : [],
      );
      setSelectedMachineTypes(
        Array.isArray(filters.selectedMachineTypes)
          ? filters.selectedMachineTypes.map(String)
          : [],
      );
      setStartLocations(
        Array.isArray(filters.startLocations)
          ? filters.startLocations.map(String)
          : [],
      );
      setEndLocations(
        Array.isArray(filters.endLocations)
          ? filters.endLocations.map(String)
          : [],
      );
      setSelectedContracts(
        Array.isArray(filters.selectedContracts)
          ? filters.selectedContracts.map(String)
          : [],
      );
      setSelectedQuotations(
        Array.isArray(filters.selectedQuotations)
          ? filters.selectedQuotations.map(String)
          : [],
      );
      setSelectedDayNights(
        Array.isArray(filters.selectedDayNights)
          ? filters.selectedDayNights.map(String)
          : [],
      );
      setSelectedServiceTypes(
        Array.isArray(filters.selectedServiceTypes)
          ? filters.selectedServiceTypes.map(String)
          : [],
      );
      setSelectedStatuses(
        Array.isArray(filters.selectedStatuses)
          ? filters.selectedStatuses.map(String)
          : [],
      );
      setCollapsedRows(new Set());
      setCollapsedCols(new Set());
    } catch (err: any) {
      alert(err.response?.data?.message || '讀取計價資料失敗');
      router.push(`/invoices/${invoiceId}/prepare`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (invoiceId) loadData();
  }, [invoiceId]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  const allPricingWorkLogs = useMemo(
    () => [...workLogs, ...listNewRows],
    [workLogs, listNewRows],
  );

  const filterOptions = useMemo(
    () => createOptionsFromWorkLogs(allPricingWorkLogs),
    [allPricingWorkLogs],
  );

  const syncFilterOptions = (
    key: string,
    options: Option[],
    setValues: Dispatch<SetStateAction<string[]>>,
  ) => {
    const previousOptions = filterOptionsRef.current[key] || [];
    const initialized = Boolean(filterSelectionInitializedRef.current[key]);
    filterOptionsRef.current[key] = options;
    if (options.length > 0) filterSelectionInitializedRef.current[key] = true;
    setValues((current) =>
      syncSelectedValues(current, previousOptions, options, initialized),
    );
  };

  useEffect(() => {
    syncFilterOptions('companies', filterOptions.companies, setCompanyIds);
    syncFilterOptions('clients', filterOptions.clients, setClientIds);
    syncFilterOptions('employees', filterOptions.employees, setEmployeeIds);
    syncFilterOptions(
      'equipment_numbers',
      filterOptions.equipmentNumbers,
      setEquipmentNumbers,
    );
    syncFilterOptions(
      'machine_types',
      filterOptions.machineTypes,
      setSelectedMachineTypes,
    );
    syncFilterOptions(
      'start_locations',
      filterOptions.startLocations,
      setStartLocations,
    );
    syncFilterOptions(
      'end_locations',
      filterOptions.endLocations,
      setEndLocations,
    );
    syncFilterOptions(
      'contracts',
      filterOptions.contracts,
      setSelectedContracts,
    );
    syncFilterOptions(
      'quotations',
      filterOptions.quotations,
      setSelectedQuotations,
    );
    syncFilterOptions(
      'day_nights',
      filterOptions.dayNights,
      setSelectedDayNights,
    );
    syncFilterOptions(
      'service_types',
      filterOptions.serviceTypes,
      setSelectedServiceTypes,
    );
    syncFilterOptions('statuses', STATUS_OPTIONS, setSelectedStatuses);
  }, [filterOptions]);

  const filteredWorkLogs = useMemo(
    () =>
      allPricingWorkLogs.filter(
        (workLog) =>
          isWithinDateRange(workLog, dateFrom, dateTo) &&
          matchesSelected(
            getEmployeeLabel(workLog),
            employeeIds,
            filterOptions.employees,
          ) &&
          matchesSelected(
            safeLabel(workLog.equipment_number),
            equipmentNumbers,
            filterOptions.equipmentNumbers,
          ) &&
          matchesSelected(
            getClientLabel(workLog),
            clientIds,
            filterOptions.clients,
          ) &&
          matchesSelected(
            getCompanyLabel(workLog),
            companyIds,
            filterOptions.companies,
          ) &&
          matchesSelected(
            safeLabel(workLog.machine_type),
            selectedMachineTypes,
            filterOptions.machineTypes,
          ) &&
          matchesSelected(
            safeLabel(workLog.start_location),
            startLocations,
            filterOptions.startLocations,
          ) &&
          matchesSelected(
            safeLabel(workLog.end_location),
            endLocations,
            filterOptions.endLocations,
          ) &&
          matchesSelected(
            getContractLabel(workLog),
            selectedContracts,
            filterOptions.contracts,
          ) &&
          matchesSelected(
            getQuotationLabel(workLog),
            selectedQuotations,
            filterOptions.quotations,
          ) &&
          matchesSelected(
            safeLabel(workLog.day_night),
            selectedDayNights,
            filterOptions.dayNights,
          ) &&
          matchesSelected(
            safeLabel(workLog.service_type),
            selectedServiceTypes,
            filterOptions.serviceTypes,
          ) &&
          matchesSelected(
            getConfirmationValue(workLog),
            selectedStatuses,
            STATUS_OPTIONS,
          ),
      ),
    [
      allPricingWorkLogs,
      dateFrom,
      dateTo,
      employeeIds,
      filterOptions,
      equipmentNumbers,
      clientIds,
      companyIds,
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

  const pricingGroups = useMemo(
    () => buildPricingGroups(allPricingWorkLogs),
    [allPricingWorkLogs],
  );
  const pivot = useMemo(
    () => buildLocalPivot(filteredWorkLogs, rowFields, colFields, valueTypes),
    [filteredWorkLogs, rowFields, colFields, valueTypes],
  );
  const rowTree = useMemo(() => buildAxisTree(pivot.rows || []), [pivot.rows]);
  const colTree = useMemo(() => buildAxisTree(pivot.cols || []), [pivot.cols]);
  const visibleRows = useMemo(
    () => flattenRows(rowTree, collapsedRows, Math.max(rowFields.length, 1)),
    [rowTree, collapsedRows, rowFields.length],
  );
  const visibleCols = useMemo(
    () => flattenCols(colTree, collapsedCols, Math.max(colFields.length, 1)),
    [colTree, collapsedCols, colFields.length],
  );

  useEffect(() => {
    setCollapsedRows(new Set());
    setCollapsedCols(new Set());
  }, [rowFields, colFields, valueTypes, filteredWorkLogs]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + rowAmount(item), 0);
    return { subtotal, count: items.length };
  }, [items]);

  const pivotTitle = useMemo(() => {
    const parts: string[] = [];
    const addSelectedFilter = (values: string[], options: Option[]) => {
      if (values.length === 0 || areAllOptionsSelected(values, options)) return;
      const labels = getOptionLabels(values, options);
      if (labels.length > 0) parts.push(labels.join('、'));
    };

    addSelectedFilter(companyIds, filterOptions.companies);
    addSelectedFilter(clientIds, filterOptions.clients);
    addSelectedFilter(employeeIds, filterOptions.employees);
    addSelectedFilter(equipmentNumbers, filterOptions.equipmentNumbers);
    addSelectedFilter(selectedMachineTypes, filterOptions.machineTypes);
    addSelectedFilter(startLocations, filterOptions.startLocations);
    addSelectedFilter(endLocations, filterOptions.endLocations);
    addSelectedFilter(selectedContracts, filterOptions.contracts);
    addSelectedFilter(selectedQuotations, filterOptions.quotations);
    addSelectedFilter(selectedDayNights, filterOptions.dayNights);
    addSelectedFilter(selectedServiceTypes, filterOptions.serviceTypes);
    addSelectedFilter(selectedStatuses, STATUS_OPTIONS);
    if (dateFrom || dateTo)
      parts.push(`${formatTitleDate(dateFrom)} - ${formatTitleDate(dateTo)}`);
    return `Pivot Table 交叉表 >> ${parts.length ? parts.join(' ') : '全部已載入工作紀錄'}`;
  }, [
    companyIds,
    filterOptions,
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
    dateFrom,
    dateTo,
  ]);

  const rowAxisHeader = useMemo(() => {
    const labels = rowFields.map(getDimensionLabel).filter(Boolean);
    return labels.length > 0 ? labels.join(' / ') : '直軸';
  }, [rowFields]);

  const isMultiValue = valueTypes.length > 1;
  const hasColumnAxis = colFields.length > 0;
  const primaryValueType = valueTypes[0];

  const maxVisibleValue = useMemo(() => {
    let max = 0;
    visibleRows.forEach((row) => {
      if (row.isGroup) return;
      valueTypes.forEach((valueType) => {
        if (!hasColumnAxis && isMultiValue) {
          max = Math.max(
            max,
            aggregateMetric(pivot, row.labels, [], valueType).value,
          );
          return;
        }
        visibleCols.forEach((col) => {
          max = Math.max(
            max,
            aggregateMetric(pivot, row.labels, col.labels, valueType).value,
          );
        });
      });
    });
    return max;
  }, [pivot, visibleRows, visibleCols, valueTypes, isMultiValue, hasColumnAxis]);

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
    const headers = isMultiValue
      ? [
          rowAxisHeader,
          ...(hasColumnAxis
            ? visibleCols.flatMap((col) =>
                valueTypes.map(
                  (valueType) =>
                    `${col.labels.join(' / ')} - ${getValueTypeLabel(valueType)}`,
                ),
              )
            : valueTypes.map(getValueTypeLabel)),
          ...(hasColumnAxis
            ? valueTypes.map(
                (valueType) => `合計 - ${getValueTypeLabel(valueType)}`,
              )
            : []),
          '單價',
          '金額',
        ]
      : [
          rowAxisHeader,
          ...visibleCols.map((col) => col.labels.join(' / ')),
          '合計',
          '單價',
          '金額',
        ];
    const lines = [headers];
    visibleRows.forEach((row) => {
      const primaryMetric = row.isGroup
        ? EMPTY_METRIC
        : aggregateMetric(pivot, row.labels, [], primaryValueType);
      const unitPrice = Number(rowPrices[row.key]?.unit_price) || 0;
      if (isMultiValue) {
        lines.push([
          row.label,
          ...(hasColumnAxis
            ? visibleCols.flatMap((col) =>
                valueTypes.map((valueType) =>
                  row.isGroup
                    ? ''
                    : metricText(
                        aggregateMetric(pivot, row.labels, col.labels, valueType),
                      ),
                ),
              )
            : valueTypes.map((valueType) =>
                row.isGroup
                  ? ''
                  : metricText(aggregateMetric(pivot, row.labels, [], valueType)),
              )),
          ...(hasColumnAxis
            ? valueTypes.map((valueType) =>
                row.isGroup
                  ? ''
                  : metricText(aggregateMetric(pivot, row.labels, [], valueType)),
              )
            : []),
          row.isGroup ? '' : String(unitPrice),
          row.isGroup
            ? ''
            : String(
                Math.round((primaryMetric.value || 0) * unitPrice * 100) / 100,
              ),
        ]);
        return;
      }
      lines.push([
        row.label,
        ...visibleCols.map((col) =>
          row.isGroup
            ? ''
            : metricText(
                aggregateMetric(pivot, row.labels, col.labels, primaryValueType),
              ),
        ),
        row.isGroup ? '' : metricText(primaryMetric),
        row.isGroup ? '' : String(unitPrice),
        row.isGroup
          ? ''
          : String(Math.round((primaryMetric.value || 0) * unitPrice * 100) / 100),
      ]);
    });
    lines.push(
      isMultiValue
        ? [
            '合計',
            ...(hasColumnAxis
              ? visibleCols.flatMap((col) =>
                  valueTypes.map((valueType) =>
                    metricText(aggregateMetric(pivot, [], col.labels, valueType)),
                  ),
                )
              : valueTypes.map((valueType) =>
                  metricText(grandTotalMetric(pivot, valueType)),
                )),
            ...(hasColumnAxis
              ? valueTypes.map((valueType) =>
                  metricText(grandTotalMetric(pivot, valueType)),
                )
              : []),
            '',
            '',
          ]
        : [
            '合計',
            ...visibleCols.map((col) =>
              metricText(aggregateMetric(pivot, [], col.labels, primaryValueType)),
            ),
            metricText(grandTotalMetric(pivot, primaryValueType)),
            '',
            '',
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
    link.download = `invoice-${invoiceId}-pivot-${formatDateInput(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const updateItem = (
    index: number,
    field: keyof InvoiceItemDraft,
    value: string | number,
  ) => {
    setItems((current) =>
      current.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        item_name: '',
        description: '',
        quantity: 1,
        unit: 'JOB',
        unit_price: 0,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, idx) => idx !== index));
  };

  const updateRowUnitPrice = (rowKey: string, unitPrice: number) => {
    setRowPrices((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] || {}),
        unit_price: unitPrice,
        matched:
          unitPrice > 0 ? current[rowKey]?.matched : current[rowKey]?.matched,
      },
    }));
  };

  const addPivotRowToItems = (row: RowEntry) => {
    if (readOnly || row.isGroup || !pivot) return;
    const metric = aggregateMetric(pivot, row.labels, [], valueTypes[0]);
    const rowPrice = rowPrices[row.key] || { unit_price: 0 };
    const unitPrice = Number(rowPrice.unit_price) || 0;
    const quantity = Number(metric.value) || 0;
    const itemName = buildPivotItemName(row, filteredWorkLogs, rowFields);
    const description = buildPivotDescription(pivot, row, valueTypes[0]);
    setItems((current) => [
      ...current,
      {
        item_name: itemName,
        description: description || rowPrice.description || row.label,
        quantity,
        unit: metric.unit || rowPrice.unit || 'JOB',
        unit_price: unitPrice,
        amount: Math.round(quantity * unitPrice * 100) / 100,
        sort_order: current.length + 1,
        matched: rowPrice.matched,
        rate_card_id: rowPrice.rate_card_id || null,
      },
    ]);
  };

  const handleMatchRates = async () => {
    const matchableRows = visibleRows.filter((row) => !row.isGroup);
    if (matchableRows.length === 0) {
      alert('沒有可配對的 Pivot 行');
      return;
    }
    setMatching(true);
    try {
      const groups = matchableRows.map((row) => {
        const metric = aggregateMetric(pivot, row.labels, [], valueTypes[0]);
        return buildPivotRowPricingGroup(
          row,
          filteredWorkLogs,
          rowFields,
          metric.value,
        );
      });
      const res = await invoicesApi.matchRates(invoiceId, { groups });
      const results = res.data.results || [];
      setMatchResults(results);
      setRowPrices((current) => {
        const next = { ...current };
        results.forEach((result: any, index: number) => {
          const row = matchableRows[index];
          const rowKey = result.key || row?.key;
          if (!rowKey) return;
          next[rowKey] = {
            ...(next[rowKey] || {}),
            unit_price: Number(result.unit_price) || 0,
            matched: Boolean(result.matched),
            rate_card_id: result.rate_card_id || null,
            rate_card_name: result.rate_card_name || null,
            unit: result.unit || null,
            item_name: result.item_name || null,
            description: result.matched
              ? groupDescription(result)
              : `未配對價目表；${groupDescription(result)}`,
          };
        });
        return next;
      });
      const matchedCount = results.filter((r: any) => r.matched).length;
      const unmatchedCountLocal = results.length - matchedCount;
      if (unmatchedCountLocal === 0) {
        alert(`配對完成：全部 ${results.length} 行成功配對價目表`);
      } else {
        alert(
          `配對完成：${matchedCount} 行成功，${unmatchedCountLocal} 行未找到對應價目。未配對的行以黃色標示，請手動輸入單價。`,
        );
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '配對價目表失敗');
    } finally {
      setMatching(false);
    }
  };

  const handleSavePricingDraft = async () => {
    if (readOnly) return;
    setSavingDraft(true);
    try {
      await invoicesApi.savePricingDraft(invoiceId, {
        pivot_config: {
          rowFields,
          colFields,
          valueTypes,
          valueType: valueTypes[0],
          leftViewMode,
          listNewRows,
          filters: {
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
          },
        },
        row_prices: rowPrices,
        draft_items: items.map((item, idx) => ({
          ...item,
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          amount: rowAmount(item),
          sort_order: idx + 1,
        })),
      });
      const draftIds = new Set<string>([
        ...Array.from(listSavedDraftIds),
        ...Array.from(listDrafts.keys()),
      ]);
      const prepareDrafts = Array.from(draftIds)
        .filter((workLogId) => /^\d+$/.test(workLogId))
        .map((workLogId) => ({
          work_log_id: Number(workLogId),
          draft_data: listDrafts.get(workLogId) || {},
        }));
      if (prepareDrafts.length > 0) {
        await invoicesApi.savePrepare(invoiceId, { drafts: prepareDrafts });
      }
      alert('Step B 草稿已儲存');
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存 Step B 草稿失敗');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveItems = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await invoicesApi.updateItems(invoiceId, {
        items: items.map((item, idx) => ({
          item_name: item.item_name || null,
          description: item.description || null,
          quantity: Number(item.quantity) || 0,
          unit: item.unit || null,
          unit_price: Number(item.unit_price) || 0,
          amount: rowAmount(item),
          sort_order: idx + 1,
        })),
      });
      alert('Invoice Items 已更新');
      router.push(`/invoices/${invoiceId}`);
    } catch (err: any) {
      alert(err.response?.data?.message || '確認生成失敗');
    } finally {
      setSaving(false);
    }
  };

  const getListRowKey = (row: any): string => String(row.id);

  const findOptionByValue = (
    options: Option[],
    value: string | number | null | undefined,
  ): Option | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    return options.find((o) => String(o.value) === String(value));
  };

  const getShortOptionLabel = (
    options: Option[],
    value: string | number | null | undefined,
  ): string | undefined => {
    const option = findOptionByValue(options, value);
    return option?.shortLabel || option?.label;
  };

  const getListCellValue = (row: any, field: string): any => {
    const key = getListRowKey(row);
    const draft = listDrafts.get(key);
    if (draft && field in draft) return draft[field];
    if (field === 'employee_id') {
      if (
        draft &&
        'work_log_fleet_driver_id' in draft &&
        draft.work_log_fleet_driver_id
      )
        return `fleet_${draft.work_log_fleet_driver_id}`;
      if (draft && 'employee_id' in draft && draft.employee_id)
        return `emp_${draft.employee_id}`;
      if (row.work_log_fleet_driver_id)
        return `fleet_${row.work_log_fleet_driver_id}`;
      if (row.employee_id) return `emp_${row.employee_id}`;
      return null;
    }
    if (field === 'scheduled_date')
      return normalizeDateValue(row.scheduled_date);
    return normalizeComparable(row[field]);
  };

  const isListCellDirty = (row: any, field: string): boolean => {
    if (row._is_new_draft) return true;
    const draft = listDrafts.get(getListRowKey(row));
    if (!draft) return false;
    if (field === 'employee_id')
      return 'employee_id' in draft || 'work_log_fleet_driver_id' in draft;
    return field in draft;
  };

  const setListDraftField = (row: any, field: string, value: any) => {
    const rowKey = getListRowKey(row);
    const normalizedValue =
      field === 'scheduled_date'
        ? normalizeDateValue(value)
        : normalizeComparable(value);

    const applyToRow = (currentRow: any) => {
      const nextRow = { ...currentRow };
      if (field === 'employee_id') {
        if (typeof value === 'string' && value.startsWith('emp_')) {
          nextRow.employee_id = Number(value.replace('emp_', ''));
          nextRow.work_log_fleet_driver_id = null;
        } else if (typeof value === 'string' && value.startsWith('fleet_')) {
          nextRow.employee_id = null;
          nextRow.work_log_fleet_driver_id = Number(
            value.replace('fleet_', ''),
          );
        } else {
          nextRow.employee_id = null;
          nextRow.work_log_fleet_driver_id = null;
        }
      } else {
        nextRow[field] = normalizedValue;
      }
      return nextRow;
    };

    if (row._is_new_draft) {
      setListNewRows((current) =>
        current.map((item) =>
          getListRowKey(item) === rowKey ? applyToRow(item) : item,
        ),
      );
      return;
    }

    setListDrafts((current) => {
      const next = new Map(current);
      const draft = { ...(next.get(rowKey) || {}) };
      if (field === 'employee_id') {
        if (typeof value === 'string' && value.startsWith('emp_')) {
          draft.employee_id = Number(value.replace('emp_', ''));
          draft.work_log_fleet_driver_id = null;
        } else if (typeof value === 'string' && value.startsWith('fleet_')) {
          draft.employee_id = null;
          draft.work_log_fleet_driver_id = Number(value.replace('fleet_', ''));
        } else {
          draft.employee_id = null;
          draft.work_log_fleet_driver_id = null;
        }
      } else {
        draft[field] = normalizedValue;
      }
      next.set(rowKey, draft);
      return next;
    });
  };

  const getListCompanyDisplayName = (
    row: any,
    value: string | number | null | undefined,
  ): string => {
    if (
      row.company &&
      typeof row.company === 'object' &&
      String(row.company.id) === String(value)
    ) {
      return (
        row.company.internal_prefix ||
        row.company.name ||
        row.company.name_en ||
        '—'
      );
    }
    return getShortOptionLabel(companies, value) || getCompanyLabel(row) || '—';
  };

  const getListClientDisplayName = (
    row: any,
    value: string | number | null | undefined,
  ): string => {
    if (
      row.client &&
      typeof row.client === 'object' &&
      String(row.client.id) === String(value)
    ) {
      return row.client.code || row.client.name || row.client.name_en || '—';
    }
    return getShortOptionLabel(clients, value) || getClientLabel(row) || '—';
  };

  const getListDisplayValue = (row: any, field: string): string => {
    const val = getListCellValue(row, field);
    if (field === 'status') return getStatusLabel(val) || val || '—';
    if (field === 'company_id') return getListCompanyDisplayName(row, val);
    if (field === 'client_id') return getListClientDisplayName(row, val);
    if (field === 'quotation_id')
      return row.quotation?.quotation_no && !isListCellDirty(row, field)
        ? row.quotation.quotation_no
        : quotations.find((o) => String(o.value) === String(val))?.label || '—';
    if (field === 'contract_id')
      return row.contract?.contract_no && !isListCellDirty(row, field)
        ? row.contract.contract_no
        : contracts.find((o) => String(o.value) === String(val))?.label || '—';
    if (field === 'employee_id') {
      if (isListCellDirty(row, field) || row._is_new_draft)
        return (
          employees.find((o) => String(o.value) === String(val))?.label || '—'
        );
      if (row.work_log_fleet_driver_id)
        return (
          employees.find(
            (o) => String(o.value) === `fleet_${row.work_log_fleet_driver_id}`,
          )?.label || '—'
        );
      return (
        row.employee?.name_zh ||
        employees.find((o) => String(o.value) === `emp_${row.employee_id}`)
          ?.label ||
        '—'
      );
    }
    if (field === 'scheduled_date') return val ? fmtDate(val) : '—';
    if (field === 'is_mid_shift' || field === 'is_confirmed')
      return val ? '✓' : '—';
    return val != null && val !== '' ? String(val) : '—';
  };

  const getFilteredListQuotations = (row: any): Option[] => {
    const clientId = getListCellValue(row, 'client_id');
    if (!clientId) return quotations;
    return quotations.filter(
      (q: any) =>
        !q._raw ||
        q._raw.client_id === clientId ||
        q._raw.client_id === Number(clientId),
    );
  };

  const getFilteredListContracts = (row: any): Option[] => {
    const clientId = getListCellValue(row, 'client_id');
    if (!clientId) return contracts;
    return contracts.filter(
      (c: any) =>
        !c._raw ||
        c._raw.client_id === clientId ||
        c._raw.client_id === Number(clientId),
    );
  };

  const renderListCell = (row: any, field: string) => {
    const val = getListCellValue(row, field);
    const dirty = isListCellDirty(row, field);
    const display = getListDisplayValue(row, field);
    const onChange = (v: any) => {
      if (field === 'client_id') {
        setListDraftField(row, 'client_id', v);
        setListDraftField(row, 'quotation_id', null);
        setListDraftField(row, 'contract_id', null);
      } else {
        setListDraftField(row, field, v);
      }
    };

    switch (field) {
      case 'status':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="select"
            options={STATUS_OPTIONS}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'scheduled_date':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="date"
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'service_type':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['service_type'] || []}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'company_id':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="select"
            options={companies}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'client_id':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="select"
            options={clients}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'quotation_id':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="select"
            options={getFilteredListQuotations(row)}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'contract_id':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="select"
            options={getFilteredListContracts(row)}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'client_contract_no':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox_create"
            options={fieldOptions['client_contract_no'] || []}
            createCategory="client_contract_no"
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'employee_id':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="select"
            options={employees}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'machine_type':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['machine_type'] || []}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'equipment_number':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox"
            options={allEquipment}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'tonnage':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['tonnage'] || []}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'day_night':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['day_night'] || []}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'start_location':
      case 'end_location':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox_create"
            options={fieldOptions['location'] || []}
            createCategory="location"
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'quantity':
      case 'ot_quantity':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="number"
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'unit':
      case 'ot_unit':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['wage_unit'] || unitOptions}
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      case 'is_mid_shift':
      case 'is_confirmed':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="checkbox"
            isDirty={dirty}
            disabled={readOnly}
          />
        );
      default:
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="text"
            isDirty={dirty}
            disabled={readOnly}
          />
        );
    }
  };

  const getListSortValue = (row: any, colKey: string): string | number => {
    const field = colKeyToField[colKey] || colKey;
    const value = getListCellValue(row, field);
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return getListDisplayValue(row, field).toLowerCase();
  };

  const handleListFilterChange = (
    columnKey: string,
    selectedValues: Set<string> | null,
  ) => {
    setListColumnFilters((prev) => {
      const next = { ...prev };
      if (!selectedValues || selectedValues.size === 0) delete next[columnKey];
      else next[columnKey] = selectedValues;
      return next;
    });
  };

  const listRows = useMemo(() => {
    let next = allPricingWorkLogs.filter((row) => {
      for (const [colKey, values] of Object.entries(listColumnFilters)) {
        const field = colKeyToField[colKey] || colKey;
        const display = getListDisplayValue(row, field);
        if (!values.has(display)) return false;
      }
      return true;
    });
    next = [...next].sort((a, b) => {
      const av = getListSortValue(a, listSortBy);
      const bv = getListSortValue(b, listSortBy);
      const result =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'zh-Hant');
      return listSortOrder === 'ASC' ? result : -result;
    });
    return next;
  }, [
    allPricingWorkLogs,
    listColumnFilters,
    listSortBy,
    listSortOrder,
    listDrafts,
    listNewRows,
    companies,
    clients,
    contracts,
    quotations,
    employees,
  ]);

  const handleListSort = (colKey: string) => {
    if (listSortBy === colKey)
      setListSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    else {
      setListSortBy(colKey);
      setListSortOrder('ASC');
    }
  };

  const handleAddListRow = () => {
    const today = formatDateInput(new Date());
    const newRow = {
      id: `draft_${Date.now()}`,
      _is_new_draft: true,
      status: 'editing',
      scheduled_date: today,
      company_id: invoice?.company_id || null,
      client_id: invoice?.client_id || null,
      quantity: 1,
      unit: unitOptions[0]?.value || 'JOB',
      ot_quantity: 0,
      ot_unit: null,
      is_mid_shift: false,
      is_confirmed: false,
    };
    setListNewRows((current) => [newRow, ...current]);
    setLeftViewMode('list');
  };

  const handleDuplicateListRow = (row: any) => {
    const duplicated: any = {
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      _is_new_draft: true,
    };
    for (const column of COLUMNS) {
      const field = colKeyToField[column.key] || column.key;
      duplicated[field] = getListCellValue(row, field);
    }
    setListNewRows((current) => [duplicated, ...current]);
    setLeftViewMode('list');
  };

  const unmatchedCount = matchResults.filter(
    (result) => !result.matched,
  ).length;
  if (loading) {
    return <div className="p-6 text-gray-500">載入計價資料中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 text-sm text-gray-500">
            <Link
              href={`/invoices/${invoiceId}/prepare`}
              className="text-blue-600 hover:underline"
            >
              Step A 整理資料
            </Link>
            <span className="mx-2">/</span>
            <span>Step B 配對價目與生成項目</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            發票計價：{invoice?.invoice_no || `#${invoiceId}`}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            左側以已載入的發票工作紀錄在前端完成篩選與 Pivot Table
            交叉分析；右側將 10 欄位組合配對 RateCard 並產生 Invoice Items。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/invoices/${invoiceId}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            返回發票
          </Link>
          <button
            onClick={loadData}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            重新整理
          </button>
          <button
            onClick={handleSavePricingDraft}
            disabled={savingDraft || readOnly}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {savingDraft ? '儲存中...' : '儲存 Step B'}
          </button>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 gap-5 ${leftPanelHidden || rightPanelHidden ? 'xl:grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_minmax(460px,0.85fr)]'}`}
      >
        {leftPanelHidden ? (
          <button
            onClick={() => setLeftPanelHidden(false)}
            className="rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            展開左側工作紀錄 / Pivot Table
          </button>
        ) : (
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    工作紀錄與 Pivot Table
                  </h2>
                  <p className="text-sm text-gray-500">
                    已載入 {allPricingWorkLogs.length} 筆工作紀錄，Pivot 篩選後{' '}
                    {filteredWorkLogs.length} 筆；可切換列表直接整理計價草稿。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setLeftPanelHidden(true)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    隱藏左側
                  </button>
                  <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                    <button
                      type="button"
                      onClick={() => setLeftViewMode('pivot')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${leftViewMode === 'pivot' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      交叉表
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeftViewMode('list')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${leftViewMode === 'list' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      列表
                    </button>
                  </div>
                  {leftViewMode === 'pivot' ? (
                    <>
                      <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                        10 欄位組合：{pricingGroups.length} 組
                      </div>
                      <CsvButton onClick={exportCsv} />
                      <button
                        onClick={handleMatchRates}
                        disabled={matching || filteredWorkLogs.length === 0}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        {matching ? '配對中...' : '配對價目表'}
                      </button>
                      <button
                        onClick={() => setControlsOpen((open) => !open)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        {controlsOpen ? '收起控制區' : '展開控制區'}
                      </button>
                    </>
                  ) : (
                    <>
                      <ColumnCustomizer
                        columns={listColumnConfigs}
                        onChange={handleListColumnConfigChange}
                        onReset={handleListColumnReset}
                        onSavePersonal={handleListSavePersonal}
                        onSaveDefault={handleListSaveDefault}
                      />
                      <button
                        onClick={handleAddListRow}
                        disabled={readOnly}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        新增列
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {leftViewMode === 'pivot' && controlsOpen && (
              <div className="space-y-2 bg-gray-50 px-3 py-2">
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
                        <button
                          onClick={() => {
                            setDateFrom('');
                            setDateTo('');
                          }}
                          className="rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                        >
                          清除日期
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
                          options={filterOptions.employees}
                        />
                        <MultiSelectComboBox
                          label="車牌/機號"
                          values={equipmentNumbers}
                          onChange={setEquipmentNumbers}
                          options={filterOptions.equipmentNumbers}
                        />
                        <MultiSelectComboBox
                          label="客戶"
                          values={clientIds}
                          onChange={setClientIds}
                          options={filterOptions.clients}
                        />
                        <MultiSelectComboBox
                          label="公司"
                          values={companyIds}
                          onChange={setCompanyIds}
                          options={filterOptions.companies}
                        />
                        <MultiSelectComboBox
                          label="機種"
                          values={selectedMachineTypes}
                          onChange={setSelectedMachineTypes}
                          options={filterOptions.machineTypes}
                        />
                        <MultiSelectComboBox
                          label="起點"
                          values={startLocations}
                          onChange={setStartLocations}
                          options={filterOptions.startLocations}
                        />
                        <MultiSelectComboBox
                          label="終點"
                          values={endLocations}
                          onChange={setEndLocations}
                          options={filterOptions.endLocations}
                        />
                        <MultiSelectComboBox
                          label="合約"
                          values={selectedContracts}
                          onChange={setSelectedContracts}
                          options={filterOptions.contracts}
                        />
                        <MultiSelectComboBox
                          label="報價單"
                          values={selectedQuotations}
                          onChange={setSelectedQuotations}
                          options={filterOptions.quotations}
                        />
                        <MultiSelectComboBox
                          label="日夜班"
                          values={selectedDayNights}
                          onChange={setSelectedDayNights}
                          options={filterOptions.dayNights}
                        />
                        <MultiSelectComboBox
                          label="服務類型"
                          values={selectedServiceTypes}
                          onChange={setSelectedServiceTypes}
                          options={filterOptions.serviceTypes}
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
                          values={valueTypes}
                          onChange={(values) =>
                            setValueTypes(normalizePivotValueTypes(values))
                          }
                          options={VALUE_OPTIONS}
                          placeholder="選擇值"
                        />
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {leftViewMode === 'list' && (
              <div className="overflow-auto p-4">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-gray-100 shadow-sm">
                    <tr>
                      <th className="sticky left-0 z-30 w-20 bg-gray-100 px-2 py-2 text-left font-semibold text-gray-700 border-b border-r">
                        ID
                      </th>
                      {listVisibleColumns.map((col: any) => {
                        const field = colKeyToField[col.key] || col.key;
                        return (
                          <th
                            key={col.key}
                            className={`${col.width || col._width || 'w-28'} bg-gray-100 px-2 py-2 text-left font-semibold text-gray-700 border-b border-r whitespace-nowrap`}
                          >
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleListSort(col.key)}
                                className="hover:text-blue-600"
                              >
                                {col.label}
                                {listSortBy === col.key
                                  ? listSortOrder === 'ASC'
                                    ? ' ↑'
                                    : ' ↓'
                                  : ''}
                              </button>
                              <ColumnFilter
                                columnKey={col.key}
                                data={allPricingWorkLogs.map((row) => ({
                                  ...row,
                                  [col.key]: getListDisplayValue(row, field),
                                }))}
                                activeFilters={listColumnFilters}
                                onFilterChange={handleListFilterChange}
                              />
                            </div>
                          </th>
                        );
                      })}
                      <th className="sticky right-0 z-30 w-24 bg-gray-100 px-2 py-2 text-center font-semibold text-gray-700 border-b border-l">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {listRows.map((row) => (
                      <tr
                        key={getListRowKey(row)}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${row._is_new_draft ? 'bg-blue-50/30' : ''}`}
                      >
                        <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-mono text-gray-600 border-r">
                          {row._is_new_draft ? '草稿' : `#${row.id}`}
                        </td>
                        {listVisibleColumns.map((col: any) => {
                          const field = colKeyToField[col.key] || col.key;
                          const dirty = isListCellDirty(row, field);
                          return (
                            <td
                              key={col.key}
                              className={`${dirty ? 'bg-amber-50' : ''} border-r align-top ${col.width || col._width || 'w-28'}`}
                            >
                              {renderListCell(row, field)}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 border-l bg-white px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDuplicateListRow(row)}
                            disabled={readOnly}
                            className="rounded border border-blue-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400"
                          >
                            複製
                          </button>
                        </td>
                      </tr>
                    ))}
                    {listRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={listVisibleColumns.length + 2}
                          className="px-4 py-10 text-center text-sm text-gray-400"
                        >
                          沒有符合條件的工作紀錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="border-t border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
                  顯示 {listRows.length} / {allPricingWorkLogs.length}{' '}
                  筆。列表編輯會存入 Step B
                  草稿；既有工作紀錄欄位會同步存為發票整理草稿，新增與複製列會保留在
                  Step B 草稿。
                </div>
              </div>
            )}

            {leftViewMode === 'pivot' && (
              <div className="overflow-auto p-4">
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-800">
                      {pivotTitle}
                    </div>
                    <div className="text-xs text-gray-500">
                      直軸 {visibleRows.length} 項，橫軸 {visibleCols.length} 項
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead className="sticky top-0 z-20 bg-gray-100">
                        {isMultiValue ? (
                          hasColumnAxis ? (
                            <>
                              {Array.from({
                                length: Math.max(colFields.length, 1),
                              }).map((_, depthIndex) => (
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
                                      colSpan={valueTypes.length}
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
                                    <>
                                      <th
                                        colSpan={valueTypes.length}
                                        className="min-w-[120px] border-b border-l border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                                      >
                                        合計
                                      </th>
                                      <th
                                        rowSpan={Math.max(colFields.length, 1) + 1}
                                        className="min-w-[120px] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                                      >
                                        單價
                                      </th>
                                      <th
                                        rowSpan={Math.max(colFields.length, 1) + 1}
                                        className="min-w-[120px] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                                      >
                                        金額
                                      </th>
                                      <th
                                        rowSpan={Math.max(colFields.length, 1) + 1}
                                        className="min-w-[110px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                                      >
                                        操作
                                      </th>
                                    </>
                                  )}
                                </tr>
                              ))}
                              <tr>
                                {visibleCols.flatMap((col) =>
                                  valueTypes.map((valueType) => (
                                    <th
                                      key={`${col.key}-${valueType}`}
                                      className="min-w-[120px] border-b border-r border-gray-200 px-3 py-2 text-center font-semibold text-gray-700"
                                    >
                                      {getValueTypeLabel(valueType)}
                                    </th>
                                  )),
                                )}
                                {valueTypes.map((valueType) => (
                                  <th
                                    key={`total-head-${valueType}`}
                                    className="min-w-[120px] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                                  >
                                    {getValueTypeLabel(valueType)}
                                  </th>
                                ))}
                              </tr>
                            </>
                          ) : (
                            <tr>
                              <th className="sticky left-0 z-30 whitespace-nowrap border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700">
                                {rowAxisHeader}
                              </th>
                              {valueTypes.map((valueType) => (
                                <th
                                  key={`value-head-${valueType}`}
                                  className="min-w-[120px] border-b border-r border-gray-200 px-3 py-2 text-center font-semibold text-gray-700"
                                >
                                  {getValueTypeLabel(valueType)}
                                </th>
                              ))}
                              <th className="min-w-[120px] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700">
                                單價
                              </th>
                              <th className="min-w-[120px] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700">
                                金額
                              </th>
                              <th className="min-w-[110px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700">
                                操作
                              </th>
                            </tr>
                          )
                        ) : (
                          Array.from({
                            length: Math.max(colFields.length, 1),
                          }).map((_, depthIndex) => (
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
                                <>
                                  <th
                                    rowSpan={Math.max(colFields.length, 1)}
                                    className="min-w-[120px] border-b border-l border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                                  >
                                    合計
                                  </th>
                                  <th
                                    rowSpan={Math.max(colFields.length, 1)}
                                    className="min-w-[120px] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                                  >
                                    單價
                                  </th>
                                  <th
                                    rowSpan={Math.max(colFields.length, 1)}
                                    className="min-w-[120px] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                                  >
                                    金額
                                  </th>
                                  <th
                                    rowSpan={Math.max(colFields.length, 1)}
                                    className="min-w-[110px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                                  >
                                    操作
                                  </th>
                                </>
                              )}
                            </tr>
                          ))
                        )}
                      </thead>
                      <tbody>
                        {visibleRows.length === 0 && (
                          <tr>
                            <td
                              colSpan={
                                1 +
                                (isMultiValue
                                  ? hasColumnAxis
                                    ? visibleCols.length * valueTypes.length + valueTypes.length
                                    : valueTypes.length
                                  : visibleCols.length + 1) +
                                3
                              }
                              className="px-4 py-10 text-center text-gray-500"
                            >
                              沒有符合條件的工作紀錄
                            </td>
                          </tr>
                        )}
                        {visibleRows.map((row) => {
                          const totalMetric = row.isGroup
                            ? EMPTY_METRIC
                            : aggregateMetric(pivot, row.labels, [], primaryValueType);
                          const rowPrice = rowPrices[row.key];
                          const unitPrice = Number(rowPrice?.unit_price) || 0;
                          const amount =
                            Math.round(
                              (Number(totalMetric.value) || 0) * unitPrice * 100,
                            ) / 100;
                          const priceStatusClass =
                            rowPrice?.matched === false
                              ? 'bg-yellow-50 text-yellow-900'
                              : rowPrice?.matched === true
                                ? 'bg-green-50 text-green-900'
                                : 'bg-white text-gray-900';
                          return (
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
                                style={{
                                  paddingLeft: `${12 + (row.depth - 1) * 18}px`,
                                }}
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
                              {isMultiValue
                                ? hasColumnAxis
                                  ? visibleCols.flatMap((col) =>
                                      valueTypes.map((valueType) =>
                                        row.isGroup
                                          ? (
                                              <td
                                                key={`${row.key}-${col.key}-${valueType}`}
                                                className="border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums text-gray-800"
                                              />
                                            )
                                          : renderMetricCell(
                                              `${row.key}-${col.key}-${valueType}`,
                                              aggregateMetric(
                                                pivot,
                                                row.labels,
                                                col.labels,
                                                valueType,
                                              ),
                                            ),
                                      ),
                                    )
                                  : valueTypes.map((valueType) =>
                                      row.isGroup
                                        ? (
                                            <td
                                              key={`${row.key}-${valueType}`}
                                              className="border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums text-gray-800"
                                            />
                                          )
                                        : renderMetricCell(
                                            `${row.key}-${valueType}`,
                                            aggregateMetric(
                                              pivot,
                                              row.labels,
                                              [],
                                              valueType,
                                            ),
                                          ),
                                    )
                                : visibleCols.map((col) =>
                                    row.isGroup
                                      ? (
                                          <td
                                            key={`${row.key}-${col.key}`}
                                            className="border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums text-gray-800"
                                          />
                                        )
                                      : renderMetricCell(
                                          `${row.key}-${col.key}`,
                                          aggregateMetric(
                                            pivot,
                                            row.labels,
                                            col.labels,
                                            primaryValueType,
                                          ),
                                        ),
                                  )}
                              {isMultiValue && hasColumnAxis
                                ? valueTypes.map((valueType) => (
                                    <td
                                      key={`${row.key}-total-${valueType}`}
                                      className="border-b border-l border-gray-200 bg-gray-50 px-3 py-2 text-right font-semibold tabular-nums text-gray-900"
                                    >
                                      {row.isGroup
                                        ? ''
                                        : metricText(
                                            aggregateMetric(
                                              pivot,
                                              row.labels,
                                              [],
                                              valueType,
                                            ),
                                          )}
                                    </td>
                                  ))
                                : !isMultiValue && (
                                    <td className="border-b border-l border-gray-200 bg-gray-50 px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                      {row.isGroup ? '' : metricText(totalMetric)}
                                    </td>
                                  )}
                              <td
                                className={`border-b border-r border-gray-200 px-2 py-2 ${row.isGroup ? 'bg-gray-50' : priceStatusClass}`}
                              >
                                {!row.isGroup && (
                                  <div className="space-y-1">
                                    <input
                                      type="number"
                                      value={rowPrice?.unit_price ?? ''}
                                      onChange={(event) =>
                                        updateRowUnitPrice(
                                          row.key,
                                          Number(event.target.value),
                                        )
                                      }
                                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-right text-sm tabular-nums"
                                      placeholder="0.00"
                                      disabled={readOnly}
                                    />
                                    {rowPrice?.matched === false && (
                                      <div className="text-left text-[11px] font-semibold text-yellow-700">
                                        未配對
                                      </div>
                                    )}
                                    {rowPrice?.matched === true && (
                                      <div className="flex items-center justify-end gap-2 text-[11px] font-semibold text-green-700">
                                        <span>已配對</span>
                                        {rowPrice.rate_card_id && (
                                          <Link
                                            href={`/rental-rate-cards/${rowPrice.rate_card_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded border border-green-200 bg-white px-1.5 py-0.5 text-green-700 hover:bg-green-50 hover:text-green-800"
                                          >
                                            查看價目
                                          </Link>
                                        )}
                                      </div>
                                    )}
                                    {rowPrice?.matched !== true &&
                                      rowPrice?.matched !== false &&
                                      rowPrice?.rate_card_id && (
                                        <div className="flex justify-end text-[11px]">
                                          <Link
                                            href={`/rental-rate-cards/${rowPrice.rate_card_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                                          >
                                            查看價目
                                          </Link>
                                        </div>
                                      )}
                                  </div>
                                )}
                              </td>
                              <td className="border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                {row.isGroup ? '' : fmtMoney(amount)}
                              </td>
                              <td className="border-b border-gray-200 bg-white px-2 py-2 text-center">
                                {!row.isGroup && (
                                  <button
                                    onClick={() => addPivotRowToItems(row)}
                                    disabled={readOnly}
                                    className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                                  >
                                    加到右邊
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-100">
                        <tr>
                          <th className="sticky left-0 z-30 border-t border-r border-gray-300 bg-gray-100 px-3 py-2 text-left font-bold text-gray-900">
                            合計
                          </th>
                          {isMultiValue
                            ? hasColumnAxis
                              ? visibleCols.flatMap((col) =>
                                  valueTypes.map((valueType) => (
                                    <td
                                      key={`total-${col.key}-${valueType}`}
                                      className="border-t border-r border-gray-300 px-3 py-2 text-right font-bold tabular-nums text-gray-900"
                                    >
                                      {metricText(
                                        aggregateMetric(
                                          pivot,
                                          [],
                                          col.labels,
                                          valueType,
                                        ),
                                      )}
                                    </td>
                                  )),
                                )
                              : valueTypes.map((valueType) => (
                                  <td
                                    key={`total-${valueType}`}
                                    className="border-t border-r border-gray-300 px-3 py-2 text-right font-bold tabular-nums text-gray-900"
                                  >
                                    {metricText(grandTotalMetric(pivot, valueType))}
                                  </td>
                                ))
                            : visibleCols.map((col) => (
                                <td
                                  key={`total-${col.key}`}
                                  className="border-t border-r border-gray-300 px-3 py-2 text-right font-bold tabular-nums text-gray-900"
                                >
                                  {metricText(
                                    aggregateMetric(
                                      pivot,
                                      [],
                                      col.labels,
                                      primaryValueType,
                                    ),
                                  )}
                                </td>
                              ))}
                          {isMultiValue && hasColumnAxis
                            ? valueTypes.map((valueType) => (
                                <td
                                  key={`grand-total-${valueType}`}
                                  className="border-t border-l border-gray-300 bg-gray-100 px-3 py-2 text-right font-bold tabular-nums text-gray-900"
                                >
                                  {metricText(grandTotalMetric(pivot, valueType))}
                                </td>
                              ))
                            : !isMultiValue && (
                                <td className="border-t border-l border-gray-300 bg-gray-100 px-3 py-2 text-right font-bold tabular-nums text-gray-900">
                                  {metricText(grandTotalMetric(pivot, primaryValueType))}
                                </td>
                              )}
                          <td className="border-t border-r border-gray-300 bg-gray-100 px-3 py-2"></td>
                          <td className="border-t border-r border-gray-300 bg-gray-100 px-3 py-2"></td>
                          <td className="border-t border-gray-300 bg-gray-100 px-3 py-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {rightPanelHidden ? (
          <button
            onClick={() => setRightPanelHidden(false)}
            className="rounded-xl border border-dashed border-green-300 bg-green-50 px-4 py-3 text-left text-sm font-semibold text-green-700 hover:bg-green-100"
          >
            展開右側 Invoice Items
          </button>
        ) : (
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Invoice Items 編輯器
                  </h2>
                  <p className="text-sm text-gray-500">
                    左側「配對價目表」會填入 Pivot
                    單價；按每行「加到右邊」建立草稿，按「確認生成」才會寫入
                    InvoiceItems。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setRightPanelHidden(true)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    隱藏右側
                  </button>
                  <button
                    onClick={handleSaveItems}
                    disabled={saving || readOnly}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {saving ? '寫入中...' : '確認生成'}
                  </button>
                </div>
              </div>
              {matchResults.length > 0 && (
                <div
                  className={`mt-3 rounded-lg px-3 py-2 text-sm ${unmatchedCount > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-700'}`}
                >
                  已完成配對：成功 {matchResults.length - unmatchedCount}{' '}
                  行，未配對 {unmatchedCount} 行。未配對的 Pivot
                  行會以黃色標示，請人工輸入單價後再加到右邊。
                </div>
              )}
            </div>

            <div className="overflow-auto p-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-2 py-2">項目</th>
                    <th className="px-2 py-2">描述</th>
                    <th className="w-24 px-2 py-2 text-right">數量</th>
                    <th className="w-28 px-2 py-2">單位</th>
                    <th className="w-28 px-2 py-2 text-right">單價</th>
                    <th className="w-28 px-2 py-2 text-right">金額</th>
                    <th className="w-16 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-gray-500"
                      >
                        尚未有項目。可先在左側 Pivot
                        配對價目表後按「加到右邊」，或手動新增。
                      </td>
                    </tr>
                  )}
                  {items.map((item, index) => (
                    <tr
                      key={index}
                      className={
                        item.matched === false ? 'bg-yellow-50/60' : ''
                      }
                    >
                      <td className="min-w-[150px] px-2 py-2 align-top">
                        <input
                          value={item.item_name}
                          onChange={(event) =>
                            updateItem(index, 'item_name', event.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="min-w-[220px] px-2 py-2 align-top">
                        <textarea
                          value={item.description}
                          onChange={(event) =>
                            updateItem(index, 'description', event.target.value)
                          }
                          rows={6}
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm resize-y"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(event) =>
                            updateItem(
                              index,
                              'quantity',
                              Number(event.target.value),
                            )
                          }
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          list="pricing-unit-options"
                          value={item.unit}
                          onChange={(event) =>
                            updateItem(index, 'unit', event.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(event) =>
                            updateItem(
                              index,
                              'unit_price',
                              Number(event.target.value),
                            )
                          }
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm"
                        />
                      </td>
                      <td className="px-2 py-2 text-right align-top font-semibold tabular-nums text-gray-900">
                        {fmtMoney(rowAmount(item))}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <button
                          onClick={() => removeItem(index)}
                          disabled={readOnly}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-400"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td
                      colSpan={5}
                      className="px-2 py-3 text-right font-semibold text-gray-700"
                    >
                      小計（{totals.count} 項）
                    </td>
                    <td className="px-2 py-3 text-right font-bold tabular-nums text-gray-900">
                      {fmtMoney(totals.subtotal)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <datalist id="pricing-unit-options">
                {unitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </datalist>
              <button
                onClick={addItem}
                disabled={readOnly}
                className="mt-4 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                + 手動新增項目
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
