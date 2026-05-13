'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  verificationApi,
  type VerificationRecordFilterColumn,
  type VerificationRecordFilterOption,
  type VerificationRecordSortDirection,
  type VerificationRecordSortField,
  type VerificationRecordsParams,
} from '@/lib/api';
import DateInput from '@/components/DateInput';

// ══════════════════════════════════════════════════════════════
// 來源類型 Tab 定義
// ══════════════════════════════════════════════════════════════
const SOURCE_TABS = [
  { key: 'all', label: '全部' },
  { key: 'receipt', label: '入帳票' },
  { key: 'slip_chit', label: '飛仔（有票）' },
  { key: 'slip_no_chit', label: '飛仔（無票）' },
  { key: 'driver_sheet', label: '功課表' },
  { key: 'customer_record', label: '客戶紀錄' },
  { key: 'gps', label: 'GPS' },
  { key: 'clock', label: '打卡' },
];

const RECORDS_COLUMN_STORAGE_KEY = 'verification-records-column-config-v1';
const GPS_COLUMN_STORAGE_KEY = 'verification-records-gps-column-config-v1';

const FILTER_COLUMNS: VerificationRecordFilterColumn[] = [
  'source',
  'vehicle_no',
  'driver_name',
  'location_from',
  'location_to',
  'contract_no',
  'match_status',
];

const NORMAL_COLUMN_KEYS = [
  'source',
  'match_status',
  'date',
  'vehicle_no',
  'driver_name',
  'customer',
  'location_from',
  'location_to',
  'time_in',
  'time_out',
  'contract_no',
  'slip_no',
  'weight',
  'batch_code',
] as const;

const GPS_COLUMN_KEYS = [
  'source',
  'match_status',
  'date',
  'vehicle_no',
  'gps_first_on',
  'gps_last_off',
  'gps_total_km',
  'gps_raw_point_count',
  'gps_locations',
  'batch_code',
] as const;

type NormalColumnKey = (typeof NORMAL_COLUMN_KEYS)[number];
type GpsColumnKey = (typeof GPS_COLUMN_KEYS)[number];
type ColumnKey = NormalColumnKey | GpsColumnKey;
type ColumnFilters = Partial<Record<VerificationRecordFilterColumn, string[]>>;

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════
interface ChitItem {
  chit_no: string;
  chit_seq: number;
}

interface MatchItem {
  id: number;
}

interface BatchInfo {
  batch_code: string;
  batch_period_year: number | null;
  batch_period_month: number | null;
  batch_upload_time: string;
}

interface SourceInfo {
  source_code: string;
  source_name: string;
  source_type: string;
}

interface RecordRawData {
  gps_locations?: string[];
  gps_raw_point_count?: number;
  gps_total_km?: number | string | null;
  gps_first_engine_on?: string | null;
  gps_last_engine_off?: string | null;
  [key: string]: unknown;
}

interface RecordItem {
  id: number;
  record_batch_id: number;
  record_work_date: string | null;
  record_vehicle_no: string | null;
  record_driver_name: string | null;
  record_customer: string | null;
  record_location_from: string | null;
  record_location_to: string | null;
  record_time_in: string | null;
  record_time_out: string | null;
  record_slip_no: string | null;
  record_contract_no: string | null;
  record_quantity: string | null;
  record_weight_net: string | number | null;
  record_raw_data: RecordRawData | null;
  record_created_at: string;
  batch: BatchInfo;
  source: SourceInfo;
  chits: ChitItem[];
  matches?: MatchItem[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface ColumnConfig {
  key: ColumnKey;
  visible: boolean;
}

interface ColumnDefinition {
  key: ColumnKey;
  label: string;
  sortable?: boolean;
  sortField?: VerificationRecordSortField;
  filterColumn?: VerificationRecordFilterColumn;
  hideable?: boolean;
  align?: 'left' | 'right';
  className?: string;
  render: (record: RecordItem) => ReactNode;
}

// ══════════════════════════════════════════════════════════════
// 工具函數
// ══════════════════════════════════════════════════════════════
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '—';
  try {
    const d = new Date(timeStr);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return timeStr;
  }
}

function formatGpsTime(datetimeStr: string | null): string {
  if (!datetimeStr) return '—';
  try {
    const match = datetimeStr.match(/(\d{2}:\d{2}:\d{2})/);
    if (match) return match[1].slice(0, 5);
    return datetimeStr;
  } catch {
    return datetimeStr;
  }
}

function getSourceBadgeColor(sourceCode: string | undefined): string {
  const colors: Record<string, string> = {
    receipt: 'bg-blue-100 text-blue-800',
    slip_chit: 'bg-green-100 text-green-800',
    slip_no_chit: 'bg-teal-100 text-teal-800',
    driver_sheet: 'bg-purple-100 text-purple-800',
    customer_record: 'bg-orange-100 text-orange-800',
    gps: 'bg-yellow-100 text-yellow-800',
    clock: 'bg-gray-100 text-gray-800',
  };
  return sourceCode ? colors[sourceCode] || 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-700';
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return '載入失敗';
}

function createDefaultColumnConfig(keys: readonly ColumnKey[]): ColumnConfig[] {
  return keys.map((key) => ({ key, visible: true }));
}

function parseStoredColumnConfig(raw: string | null, keys: readonly ColumnKey[]): ColumnConfig[] {
  const defaultConfig = createDefaultColumnConfig(keys);
  if (!raw) return defaultConfig;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultConfig;

    const validKeys = new Set<ColumnKey>(keys);
    const storedItems = parsed
      .map((item): ColumnConfig | null => {
        if (typeof item !== 'object' || item === null) return null;
        const candidate = item as { key?: unknown; visible?: unknown };
        if (typeof candidate.key !== 'string' || !validKeys.has(candidate.key as ColumnKey)) return null;
        return {
          key: candidate.key as ColumnKey,
          visible: candidate.key === 'source' ? true : candidate.visible !== false,
        };
      })
      .filter((item): item is ColumnConfig => item !== null);

    const seen = new Set<ColumnKey>();
    const merged: ColumnConfig[] = [];
    for (const item of storedItems) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      merged.push(item);
    }
    for (const item of defaultConfig) {
      if (!seen.has(item.key)) merged.push(item);
    }
    return merged;
  } catch {
    return defaultConfig;
  }
}

function isMatchStatus(record: RecordItem): boolean {
  return Boolean(record.matches && record.matches.length > 0);
}

function MatchStatusBadge({ matched }: { matched: boolean }) {
  return matched ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
      已配對
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
      未配對
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// 主頁面元件
// ══════════════════════════════════════════════════════════════
export default function VerificationRecordsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'all';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 篩選條件
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<VerificationRecordSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<VerificationRecordSortDirection>('desc');
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [filterOptions, setFilterOptions] = useState<Record<VerificationRecordFilterColumn, VerificationRecordFilterOption[]>>({
    source: [],
    vehicle_no: [],
    driver_name: [],
    location_from: [],
    location_to: [],
    contract_no: [],
    match_status: [],
  });
  const [openFilter, setOpenFilter] = useState<VerificationRecordFilterColumn | null>(null);

  // 自訂欄位
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [normalColumnConfig, setNormalColumnConfig] = useState<ColumnConfig[]>(() =>
    createDefaultColumnConfig(NORMAL_COLUMN_KEYS),
  );
  const [gpsColumnConfig, setGpsColumnConfig] = useState<ColumnConfig[]>(() =>
    createDefaultColumnConfig(GPS_COLUMN_KEYS),
  );
  const draggedColumnRef = useRef<ColumnKey | null>(null);

  const isGpsTab = activeTab === 'gps';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setNormalColumnConfig(parseStoredColumnConfig(window.localStorage.getItem(RECORDS_COLUMN_STORAGE_KEY), NORMAL_COLUMN_KEYS));
    setGpsColumnConfig(parseStoredColumnConfig(window.localStorage.getItem(GPS_COLUMN_STORAGE_KEY), GPS_COLUMN_KEYS));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RECORDS_COLUMN_STORAGE_KEY, JSON.stringify(normalColumnConfig));
  }, [normalColumnConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(GPS_COLUMN_STORAGE_KEY, JSON.stringify(gpsColumnConfig));
  }, [gpsColumnConfig]);

  const activeColumnConfig = isGpsTab ? gpsColumnConfig : normalColumnConfig;
  const setActiveColumnConfig = isGpsTab ? setGpsColumnConfig : setNormalColumnConfig;

  const columnDefinitions = useMemo<Record<ColumnKey, ColumnDefinition>>(
    () => ({
      source: {
        key: 'source',
        label: '來源',
        filterColumn: 'source',
        hideable: false,
        render: (record) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getSourceBadgeColor(record.source?.source_code)}`}
          >
            {record.source?.source_name || record.source?.source_code || '—'}
          </span>
        ),
      },
      match_status: {
        key: 'match_status',
        label: '配對狀態',
        filterColumn: 'match_status',
        render: (record) => <MatchStatusBadge matched={isMatchStatus(record)} />,
      },
      date: {
        key: 'date',
        label: '日期',
        sortable: true,
        sortField: 'date',
        render: (record) => formatDate(record.record_work_date),
      },
      vehicle_no: {
        key: 'vehicle_no',
        label: '車牌',
        sortable: true,
        sortField: 'vehicle_no',
        filterColumn: 'vehicle_no',
        className: 'font-medium text-gray-900',
        render: (record) => record.record_vehicle_no || '—',
      },
      driver_name: {
        key: 'driver_name',
        label: '司機',
        sortable: true,
        sortField: 'driver_name',
        filterColumn: 'driver_name',
        render: (record) => record.record_driver_name || '—',
      },
      customer: {
        key: 'customer',
        label: '客戶',
        className: 'max-w-[120px] truncate',
        render: (record) => record.record_customer || '—',
      },
      location_from: {
        key: 'location_from',
        label: '出發地',
        filterColumn: 'location_from',
        className: 'max-w-[120px] truncate',
        render: (record) => record.record_location_from || '—',
      },
      location_to: {
        key: 'location_to',
        label: '目的地',
        filterColumn: 'location_to',
        className: 'max-w-[120px] truncate',
        render: (record) => record.record_location_to || '—',
      },
      time_in: {
        key: 'time_in',
        label: '進入時間',
        className: 'text-gray-600',
        render: (record) => formatTime(record.record_time_in),
      },
      time_out: {
        key: 'time_out',
        label: '離開時間',
        className: 'text-gray-600',
        render: (record) => formatTime(record.record_time_out),
      },
      contract_no: {
        key: 'contract_no',
        label: '戶口號碼',
        sortable: true,
        sortField: 'contract_no',
        filterColumn: 'contract_no',
        render: (record) => record.record_contract_no || '—',
      },
      slip_no: {
        key: 'slip_no',
        label: '入帳票號',
        sortable: true,
        sortField: 'slip_no',
        render: (record) =>
          record.chits && record.chits.length > 0
            ? record.chits.map((chit) => chit.chit_no).join(', ')
            : record.record_slip_no || '—',
      },
      weight: {
        key: 'weight',
        label: '重量',
        sortable: true,
        sortField: 'weight',
        render: (record) =>
          record.record_weight_net != null ? `${record.record_weight_net} t` : record.record_quantity || '—',
      },
      batch_code: {
        key: 'batch_code',
        label: '批次編號',
        className: 'text-xs text-gray-500',
        render: (record) => record.batch?.batch_code || '—',
      },
      gps_first_on: {
        key: 'gps_first_on',
        label: '首次開引擎',
        className: 'text-gray-600',
        render: (record) => formatGpsTime(record.record_raw_data?.gps_first_engine_on || null),
      },
      gps_last_off: {
        key: 'gps_last_off',
        label: '最後關引擎',
        className: 'text-gray-600',
        render: (record) => formatGpsTime(record.record_raw_data?.gps_last_engine_off || null),
      },
      gps_total_km: {
        key: 'gps_total_km',
        label: '行駛里程',
        align: 'right',
        render: (record) => {
          const gpsTotalKm = record.record_raw_data?.gps_total_km;
          const numericDistance = gpsTotalKm == null ? 0 : Number(gpsTotalKm);
          return numericDistance > 0 ? `${numericDistance.toFixed(1)} km` : '—';
        },
      },
      gps_raw_point_count: {
        key: 'gps_raw_point_count',
        label: 'GPS 點數',
        align: 'right',
        className: 'text-gray-500',
        render: (record) => record.record_raw_data?.gps_raw_point_count || '—',
      },
      gps_locations: {
        key: 'gps_locations',
        label: '主要位置',
        className: 'max-w-[250px]',
        render: (record) => {
          const gpsLocations = record.record_raw_data?.gps_locations || [];
          return gpsLocations.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {gpsLocations.slice(0, 5).map((loc, idx) => (
                <span key={`${record.id}-${loc}-${idx}`} className="inline-block px-1.5 py-0.5 bg-yellow-50 text-yellow-800 text-xs rounded">
                  {loc}
                </span>
              ))}
              {gpsLocations.length > 5 && <span className="text-xs text-gray-400">+{gpsLocations.length - 5} 個</span>}
            </div>
          ) : (
            '—'
          );
        },
      },
    }),
    [],
  );

  const visibleColumns = useMemo(() => {
    const availableKeys = new Set<ColumnKey>(isGpsTab ? GPS_COLUMN_KEYS : NORMAL_COLUMN_KEYS);
    return activeColumnConfig
      .filter((config) => availableKeys.has(config.key) && (config.visible || config.key === 'source'))
      .map((config) => columnDefinitions[config.key]);
  }, [activeColumnConfig, columnDefinitions, isGpsTab]);

  const buildParams = useCallback(
    (page = 1): VerificationRecordsParams => {
      const params: VerificationRecordsParams = { page, limit: 20 };
      if (activeTab !== 'all') params.source_type = activeTab;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (search) params.search = search;
      if (sortField) {
        params.sort_field = sortField;
        params.sort_direction = sortDirection;
      }

      if (columnFilters.source?.length) params.filter_source = columnFilters.source.join(',');
      if (columnFilters.vehicle_no?.length) params.filter_vehicle_no = columnFilters.vehicle_no.join(',');
      if (columnFilters.driver_name?.length) params.filter_driver_name = columnFilters.driver_name.join(',');
      if (columnFilters.location_from?.length) params.filter_location_from = columnFilters.location_from.join(',');
      if (columnFilters.location_to?.length) params.filter_location_to = columnFilters.location_to.join(',');
      if (columnFilters.contract_no?.length) params.filter_contract_no = columnFilters.contract_no.join(',');
      if (columnFilters.match_status?.length) params.filter_match_status = columnFilters.match_status.join(',');

      return params;
    },
    [activeTab, columnFilters, dateFrom, dateTo, search, sortDirection, sortField],
  );

  const fetchRecords = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const res = await verificationApi.getRecords(buildParams(page));
        setRecords(res.data.data || []);
        setPagination(res.data.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 });
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [buildParams],
  );

  const fetchFilterOptions = useCallback(async () => {
    const params = buildParams(1);
    try {
      const results: [VerificationRecordFilterColumn, VerificationRecordFilterOption[]][] = [];
      for (const column of FILTER_COLUMNS) {
        const response = await verificationApi.getRecordFilterOptions(column, params);
        results.push([column, response.data.options || []]);
      }
      setFilterOptions((prev) => ({ ...prev, ...Object.fromEntries(results) }));
    } catch {
      // 篩選選項載入失敗不阻塞主要列表顯示。
    }
  }, [buildParams]);

  useEffect(() => {
    fetchRecords(1);
  }, [fetchRecords]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey);
    setColumnFilters({});
    setOpenFilter(null);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleClearFilters = () => {
    setSearch('');
    setSearchInput('');
    setDateFrom('');
    setDateTo('');
    setColumnFilters({});
    setOpenFilter(null);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    fetchRecords(newPage);
  };

  const handleSort = (field: VerificationRecordSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleToggleFilterValue = (column: VerificationRecordFilterColumn, value: string) => {
    setColumnFilters((prev) => {
      const current = prev[column] || [];
      const nextValues = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      const nextFilters: ColumnFilters = { ...prev };
      if (nextValues.length > 0) nextFilters[column] = nextValues;
      else delete nextFilters[column];
      return nextFilters;
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearColumnFilter = (column: VerificationRecordFilterColumn) => {
    setColumnFilters((prev) => {
      const nextFilters: ColumnFilters = { ...prev };
      delete nextFilters[column];
      return nextFilters;
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleColumnVisibilityToggle = (key: ColumnKey) => {
    if (key === 'source') return;
    setActiveColumnConfig((prev) =>
      prev.map((config) => (config.key === key ? { ...config, visible: !config.visible } : config)),
    );
  };

  const handleColumnDragStart = (key: ColumnKey) => {
    draggedColumnRef.current = key;
  };

  const handleColumnDrop = (targetKey: ColumnKey) => {
    const draggedKey = draggedColumnRef.current;
    draggedColumnRef.current = null;
    if (!draggedKey || draggedKey === targetKey) return;

    setActiveColumnConfig((prev) => {
      const fromIndex = prev.findIndex((config) => config.key === draggedKey);
      const toIndex = prev.findIndex((config) => config.key === targetKey);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const resetColumnConfig = () => {
    setActiveColumnConfig(createDefaultColumnConfig(isGpsTab ? GPS_COLUMN_KEYS : NORMAL_COLUMN_KEYS));
  };

  const activeFilterCount = Object.values(columnFilters).reduce((count, values) => count + (values?.length || 0), 0);
  const hasFilters = Boolean(search || dateFrom || dateTo || activeFilterCount > 0);

  const renderHeaderCell = (column: ColumnDefinition) => {
    const selectedValues = column.filterColumn ? columnFilters[column.filterColumn] || [] : [];
    const options = column.filterColumn ? filterOptions[column.filterColumn] || [] : [];
    const isSorted = Boolean(column.sortField && sortField === column.sortField);
    const sortIcon = isSorted ? (sortDirection === 'asc' ? '▲' : '▼') : '↕';

    return (
      <th
        key={column.key}
        className={`relative px-3 py-3 text-${column.align || 'left'} text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap`}
      >
        <div className={`flex items-center gap-1 ${column.align === 'right' ? 'justify-end' : 'justify-start'}`}>
          {column.sortable && column.sortField ? (
            <button
              type="button"
              onClick={() => handleSort(column.sortField as VerificationRecordSortField)}
              className="inline-flex items-center gap-1 hover:text-primary-600 transition-colors"
            >
              <span>{column.label}</span>
              <span className="text-[10px] text-gray-400">{sortIcon}</span>
            </button>
          ) : (
            <span>{column.label}</span>
          )}

          {column.filterColumn && (
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setOpenFilter((prev) => (prev === column.filterColumn ? null : column.filterColumn || null))}
                className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] transition-colors ${
                  selectedValues.length > 0
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                }`}
                title="欄位篩選"
              >
                ▾
              </button>
              {openFilter === column.filterColumn && (
                <div className="absolute left-0 top-7 z-30 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
                  <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                    篩選：{column.label}
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {options.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-gray-400">沒有可選值</div>
                    ) : (
                      options.map((option) => (
                        <label key={option.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selectedValues.includes(option.value)}
                            onChange={() => handleToggleFilterValue(column.filterColumn as VerificationRecordFilterColumn, option.value)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="truncate">{option.label}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                    <span className="text-[11px] text-gray-400">已選 {selectedValues.length} 項</span>
                    <button
                      type="button"
                      onClick={() => clearColumnFilter(column.filterColumn as VerificationRecordFilterColumn)}
                      className="text-xs text-primary-600 hover:text-primary-700 disabled:text-gray-300"
                      disabled={selectedValues.length === 0}
                    >
                      清除
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* 頁面標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">已匯入資料</h1>
          <p className="text-sm text-gray-500 mt-1">
            查看所有已匯入的核對記錄，包括入帳票、飛仔、功課表、GPS 等
          </p>
        </div>
        <div className="text-sm text-gray-500">
          共 <span className="font-semibold text-gray-900">{pagination.total}</span> 筆記錄
        </div>
      </div>

      {/* 來源類型 Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`
                whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 篩選區域 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* 搜尋 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">搜尋</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={isGpsTab ? '車牌、地點...' : '車牌、司機、客戶、地點...'}
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleSearch}
                className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 transition-colors"
              >
                搜尋
              </button>
            </div>
          </div>

          {/* 日期範圍 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">開始日期</label>
            <DateInput
              value={dateFrom}
              onChange={(val) => setDateFrom(val || '')}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">結束日期</label>
            <DateInput
              value={dateTo}
              onChange={(val) => setDateTo(val || '')}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* 月份快捷 */}
          <div className="flex items-end gap-1">
            {(() => {
              const shortcuts = [
                { label: '本月', offset: 0 },
                { label: '上月', offset: 1 },
                { label: '上上月', offset: 2 },
              ];
              return shortcuts.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const y = now.getFullYear();
                    const m = now.getMonth() - s.offset;
                    const first = new Date(y, m, 1);
                    const last = new Date(y, m + 1, 0);
                    const fmt = (d: Date) => d.toISOString().slice(0, 10);
                    setDateFrom(fmt(first));
                    setDateTo(fmt(last));
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors"
                >
                  {s.label}
                </button>
              ));
            })()}
          </div>

          <button
            onClick={() => setShowColumnSettings(true)}
            className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50 transition-colors"
          >
            自訂欄位
          </button>

          {/* 清除篩選 */}
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-md hover:bg-gray-50 transition-colors"
            >
              清除篩選{activeFilterCount > 0 ? `（欄位 ${activeFilterCount}）` : ''}
            </button>
          )}
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 資料表格 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>{visibleColumns.map((column) => renderHeaderCell(column))}</tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5 text-primary-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      載入中...
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-4 py-12 text-center text-gray-400">
                    沒有符合條件的記錄
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.map((column) => (
                      <td
                        key={`${record.id}-${column.key}`}
                        className={`px-3 py-2.5 whitespace-nowrap text-${column.align || 'left'} text-gray-700 ${column.className || ''}`}
                      >
                        {column.render(record)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分頁 */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500">
              第 {pagination.page} 頁，共 {pagination.total_pages} 頁（{pagination.total} 筆）
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
              >
                上一頁
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>

      {showColumnSettings && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">自訂欄位</h2>
                <p className="mt-1 text-xs text-gray-500">拖拉欄位可調整排序；設定會儲存在此瀏覽器。</p>
              </div>
              <button
                type="button"
                onClick={() => setShowColumnSettings(false)}
                className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              <div className="space-y-2">
                {activeColumnConfig.map((config) => {
                  const definition = columnDefinitions[config.key];
                  const isLocked = config.key === 'source' || definition.hideable === false;
                  return (
                    <div
                      key={config.key}
                      draggable
                      onDragStart={() => handleColumnDragStart(config.key)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleColumnDrop(config.key)}
                      className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <span className="cursor-grab text-gray-400">☰</span>
                      <span className="flex-1 font-medium text-gray-700">{definition.label}</span>
                      <button
                        type="button"
                        onClick={() => handleColumnVisibilityToggle(config.key)}
                        disabled={isLocked}
                        className={`rounded-md px-2 py-1 text-xs transition-colors ${
                          config.visible || isLocked
                            ? 'bg-primary-50 text-primary-700'
                            : 'bg-gray-100 text-gray-500'
                        } ${isLocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-primary-100'}`}
                      >
                        {config.visible || isLocked ? '顯示' : '隱藏'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={resetColumnConfig}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                重設預設
              </button>
              <button
                type="button"
                onClick={() => setShowColumnSettings(false)}
                className="rounded-md bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
