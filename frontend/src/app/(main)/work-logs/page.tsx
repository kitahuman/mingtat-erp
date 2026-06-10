'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePageState } from '@/hooks/usePageState';
import {
  workLogsApi,
  companiesApi,
  partnersApi,
  contractsApi,
  quotationsApi,
  employeesApi,
  usersApi,
  fieldOptionsApi,
  vehiclesApi,
  machineryApi,
  subconFleetDriversApi,
  invoicesApi,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import EditableCell from './EditableCell';
import SearchableSelect from './SearchableSelect';
import MultiSearchableSelect from './MultiSearchableSelect';
import ColumnFilter from '@/components/ColumnFilter';
import {
  STATUS_OPTIONS,
  STATUS_COLORS,
  getStatusLabel,
  getEquipmentSource,
} from './constants';
import ExportButton from '@/components/ExportButton';
import CsvImportModal from '@/components/CsvImportModal';
import AttendanceImportModal from './AttendanceImportModal';
import MissingPriceTab from './MissingPriceTab';
import SummaryTab from './SummaryTab';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { useWorkLogSocket } from '@/hooks/useWorkLogSocket';
import ColumnCustomizer from '@/components/ColumnCustomizer';
import BatchEditDialog from './BatchEditDialog';
import { fmtDate } from '@/lib/dateUtils';
import DateInput from '@/components/DateInput';
import AttachmentUpload from '@/components/AttachmentUpload';
import Modal from '@/components/Modal';

interface Option {
  value: string | number;
  label: string;
  _raw?: any;
  shortLabel?: string;
}

interface WorkLogAttachmentTarget {
  id: number;
  title: string;
}

const LIMIT_OPTIONS = [25, 50, 100];

const MONTH_SHORTCUTS = [
  { label: '本月', monthOffset: 0 },
  { label: '上月', monthOffset: -1 },
  { label: '上上月', monthOffset: -2 },
] as const;

const formatDatePart = (value: number): string =>
  String(value).padStart(2, '0');

const toDateInputValue = (date: Date): string =>
  `${date.getFullYear()}-${formatDatePart(date.getMonth() + 1)}-${formatDatePart(date.getDate())}`;

const getMonthRange = (
  monthOffset: number,
): { dateFrom: string; dateTo: string } => {
  const today = new Date();
  const firstDay = new Date(
    today.getFullYear(),
    today.getMonth() + monthOffset,
    1,
  );
  const lastDay = new Date(
    today.getFullYear(),
    today.getMonth() + monthOffset + 1,
    0,
  );
  return {
    dateFrom: toDateInputValue(firstDay),
    dateTo: toDateInputValue(lastDay),
  };
};

const normalizeInvoiceFieldValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const getWorkLogInvoiceDate = (row: any): Date | null => {
  const rawDate = row.date || row.scheduled_date;
  if (!rawDate) return null;

  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getWorkLogClientContractNo = (row: any): string => {
  return normalizeInvoiceFieldValue(
    row.client_contract_no || row.contract?.contract_no,
  );
};

const getMostFrequentClientContractNo = (rows: any[]): string => {
  const contractCounts = new Map<string, number>();

  rows.forEach((row) => {
    const contractNo = getWorkLogClientContractNo(row);
    if (!contractNo) return;
    contractCounts.set(contractNo, (contractCounts.get(contractNo) || 0) + 1);
  });

  let selectedContractNo = '';
  let highestCount = 0;
  contractCounts.forEach((count, contractNo) => {
    if (count > highestCount) {
      selectedContractNo = contractNo;
      highestCount = count;
    }
  });

  return selectedContractNo;
};

const buildInvoiceTitleFromWorkLogs = (
  rows: any[],
  contractNo: string,
): string => {
  if (!contractNo) return '';

  const dates = rows
    .map(getWorkLogInvoiceDate)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) return '';

  const first = dates[0];
  const last = dates[dates.length - 1];
  const firstYear = first.getFullYear();
  const lastYear = last.getFullYear();
  const firstMonth = first.getMonth() + 1;
  const lastMonth = last.getMonth() + 1;

  if (firstYear === lastYear && firstMonth === lastMonth) {
    return `${firstYear}年${firstMonth}月份 - ${contractNo}`;
  }

  if (firstYear === lastYear) {
    return `${firstYear}年${firstMonth}-${lastMonth}月份 - ${contractNo}`;
  }

  return `${firstYear}年${firstMonth}月至${lastYear}年${lastMonth}月份 - ${contractNo}`;
};

const SOURCE_LABELS: Record<string, { text: string; cls: string }> = {
  attendance: { text: '打卡', cls: 'bg-amber-100 text-amber-700' },
  manual: { text: '手動', cls: 'bg-gray-100 text-gray-600' },
  whatsapp_clockin: { text: 'WA', cls: 'bg-green-100 text-green-700' },
  whatsapp: { text: 'WhatsApp', cls: 'bg-green-100 text-green-700' },
  report: { text: '報表', cls: 'bg-blue-100 text-blue-700' },
  employee_portal: { text: '員工平台', cls: 'bg-purple-100 text-purple-700' },
};

const getSourceDisplay = (value: any) => {
  if (value == null || value === '') return '(空白)';
  const key = String(value);
  return SOURCE_LABELS[key]?.text || key;
};

const getSourceClassName = (value: any) => {
  const key = value == null ? '' : String(value);
  return SOURCE_LABELS[key]?.cls || 'bg-gray-100 text-gray-600';
};
const formatHongKongDateTime = (value: any) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

// Map column key → backend sortBy field (undefined = not sortable)
const COLUMN_SORT_FIELD: Record<string, string> = {
  publisher: 'publisher',
  status: 'status',
  scheduled_date: 'scheduled_date',
  wl_whatsapp_reported_at: 'wl_whatsapp_reported_at',
  service_type: 'service_type',
  company: 'company',
  client: 'client',
  quotation: 'quotation',
  client_contract_no: 'client_contract_no',
  contract: 'contract',
  employee: 'employee',
  tonnage: 'tonnage',
  machine_type: 'machine_type',
  equipment_number: 'equipment_number',
  day_night: 'day_night',
  start_location: 'start_location',
  start_time: 'start_time',
  end_location: 'end_location',
  end_time: 'end_time',
  work_order_no: 'work_order_no',
  receipt_no: 'receipt_no',
  quantity: 'quantity',
  unit: 'unit',
  ot_quantity: 'ot_quantity',
  ot_unit: 'ot_unit',
  is_mid_shift: 'is_mid_shift',
  goods_quantity: 'goods_quantity',
  work_log_product_name: 'work_log_product_name',
  work_log_product_unit: 'work_log_product_unit',
  is_confirmed: 'is_confirmed',
  is_paid: 'is_paid',
  source: 'source',
  remarks: 'remarks',
  work_content: 'work_content',
};

const COLUMNS = [
  { key: 'publisher', label: '發佈人', width: 'w-24' },
  { key: 'status', label: '狀態', width: 'w-20' },
  { key: 'scheduled_date', label: '約定日期', width: 'w-28' },
  { key: 'wl_whatsapp_reported_at', label: '報工時間', width: 'w-32' },
  { key: 'service_type', label: '服務類型', width: 'w-28' },
  { key: 'work_content', label: '工作內容', width: 'w-40' },
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
  { key: 'start_time', label: '起點時間', width: 'w-24' },
  { key: 'end_location', label: '終點', width: 'w-40' },
  { key: 'end_time', label: '終點時間', width: 'w-24' },
  { key: 'work_order_no', label: '單號', width: 'w-36' },
  { key: 'receipt_no', label: '入帳票編號', width: 'w-36' },
  { key: 'quantity', label: '數量', width: 'w-20' },
  { key: 'unit', label: '工資單位', width: 'w-16' },
  { key: 'ot_quantity', label: 'OT數量', width: 'w-24' },
  { key: 'ot_unit', label: 'OT單位', width: 'w-16' },
  { key: 'is_mid_shift', label: '中直', width: 'w-16' },
  { key: 'goods_quantity', label: '商品數量', width: 'w-24' },
  { key: 'work_log_product_name', label: '商品名稱', width: 'w-28' },
  { key: 'work_log_product_unit', label: '商品單位', width: 'w-20' },
  { key: 'is_confirmed', label: '已確認', width: 'w-20' },
  { key: 'is_paid', label: '已付款', width: 'w-20' },
  { key: 'source', label: '來源', width: 'w-16' },
  { key: 'remarks', label: '備註', width: 'w-36' },
  { key: 'attachments', label: '附件', width: 'w-16' },
];

export default function WorkLogsPage() {
  const { user, isReadOnly } = useAuth();

  // ── Reference data ──────────────────────────────────────────
  const [companies, setCompanies] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [contracts, setContracts] = useState<Option[]>([]);
  const [quotations, setQuotations] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [invoiceOptions, setInvoiceOptions] = useState<Option[]>([]);
  const [fieldOptions, setFieldOptions] = useState<Record<string, Option[]>>(
    {},
  );
  const [allEquipment, setAllEquipment] = useState<Option[]>([]);
  const [dynamicTopFilterOptions, setDynamicTopFilterOptions] = useState<
    Record<string, string[]>
  >({});

  // ── List state ──────────────────────────────────────────────
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const { pageState, saveState, clearState } = usePageState({
    page: 1,
    limit: 25,
    sortBy: 'created_at',
    sortOrder: 'DESC',
    filterPublisher: [],
    filterStatus: [],
    filterCompany: [],
    filterClient: [],
    filterQuotation: [],
    filterContract: [],
    filterEmployee: [],
    filterEquipment: '',
    filterDateFrom: '',
    filterDateTo: '',
    columnFilters: {},
  });

  const { page, limit, sortBy, sortOrder, filterPublisher, filterStatus, filterCompany, filterClient, filterQuotation, filterContract, filterEmployee, filterEquipment, filterDateFrom, filterDateTo, columnFilters = {} } = pageState;

  const activeColumnFilters = useMemo<Record<string, Set<string>>>(
    () => Object.fromEntries(
      Object.entries(columnFilters).map(([key, values]) => [key, new Set(values)]),
    ),
    [columnFilters],
  );

  // Helper to update state and save it
  const setPage = (newPage: number) => saveState((prev) => ({ ...prev, page: newPage }));
  const setLimit = (newLimit: number) => saveState((prev) => ({ ...prev, limit: newLimit }));
  const setSortBy = (newSortBy: string) => saveState((prev) => ({ ...prev, sortBy: newSortBy }));
  const setSortOrder = (newSortOrder: string) => saveState((prev) => ({ ...prev, sortOrder: newSortOrder as 'ASC' | 'DESC' }));
  const setFilterPublisher = (newFilterPublisher: (string | number)[]) => saveState((prev) => ({ ...prev, filterPublisher: newFilterPublisher }));
  const setFilterStatus = (newFilterStatus: (string | number)[]) => saveState((prev) => ({ ...prev, filterStatus: newFilterStatus }));
  const setFilterCompany = (newFilterCompany: (string | number)[]) => saveState((prev) => ({ ...prev, filterCompany: newFilterCompany }));
  const setFilterClient = (newFilterClient: (string | number)[]) => saveState((prev) => ({ ...prev, filterClient: newFilterClient }));
  const setFilterQuotation = (newFilterQuotation: (string | number)[]) => saveState((prev) => ({ ...prev, filterQuotation: newFilterQuotation }));
  const setFilterContract = (newFilterContract: (string | number)[]) => saveState((prev) => ({ ...prev, filterContract: newFilterContract }));
  const setFilterEmployee = (newFilterEmployee: (string | number)[]) => saveState((prev) => ({ ...prev, filterEmployee: newFilterEmployee }));
  const setFilterEquipment = (newFilterEquipment: string) => saveState((prev) => ({ ...prev, filterEquipment: newFilterEquipment }));
  const setFilterDateFrom = (newFilterDateFrom: string) => saveState((prev) => ({ ...prev, filterDateFrom: newFilterDateFrom }));
  const setFilterDateTo = (newFilterDateTo: string) => saveState((prev) => ({ ...prev, filterDateTo: newFilterDateTo }));
  const setColumnFilters = (newColumnFilters: Record<string, string[]>) => saveState((prev) => ({ ...prev, columnFilters: newColumnFilters }));

  // ── Dirty tracking (Airtable-style) ─────────────────────────
  // dirtyRows: Map<rowId, { field: newValue, ... }> — only stores changed fields
  const [dirtyRows, setDirtyRows] = useState<Map<number, Record<string, any>>>(
    new Map(),
  );
  const [saving, setSaving] = useState(false);

  // ── New row ─────────────────────────────────────────────────
  const [newRow, setNewRow] = useState<any | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  // ── Selection ───────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedWorkLogs, setSelectedWorkLogs] = useState<Map<number, any>>(
    new Map(),
  );
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [invoiceLinkOpen, setInvoiceLinkOpen] = useState(false);
  const [invoiceLinkMode, setInvoiceLinkMode] = useState<'existing' | 'new'>(
    'existing',
  );
  const [invoiceLinkType, setInvoiceLinkType] = useState<
    'link-only' | 'link-and-calc'
  >('link-only');
  const [targetInvoiceId, setTargetInvoiceId] = useState<
    string | number | null
  >(null);
  const [invoiceLinkLoading, setInvoiceLinkLoading] = useState(false);

  // ── Attachment Manager ──────────────────────────────────────────
  const [attachmentModalTarget, setAttachmentModalTarget] = useState<WorkLogAttachmentTarget | null>(null);

  // ── Toast 通知 ──────────────────────────────────────────
  const [toasts, setToasts] = useState<
    { id: number; message: string; type: 'error' | 'success' | 'info' }[]
  >([]);
  const toastIdRef = useRef(0);
  const showToast = useCallback(
    (message: string, type: 'error' | 'success' | 'info' = 'error') => {
      const id = ++toastIdRef.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        5000,
      );
    },
    [],
  );

  // ── Verification panel ──────────────────────────────────────────
  // openVerifyId: 目前展開核對面板的 workLogId（null = 全部收起）
  const [openVerifyId, setOpenVerifyId] = useState<number | null>(null);
  // verifyData: Map<workLogId, { loading, data, error }>
  const [verifyData, setVerifyData] = useState<
    Map<number, { loading: boolean; data: any; error: string | null }>
  >(new Map());
  // confirmations: Map<workLogId, Map<sourceCode, status>>
  const [confirmations, setConfirmations] = useState<
    Map<
      number,
      Record<
        string,
        { status: string; confirmed_by: string; confirmed_at: string }
      >
    >
  >(new Map());
  const [confirmActionLoading, setConfirmActionLoading] = useState<
    string | null
  >(null);

  // ── Attendance Match Detail ──────────────────────────────────────
  const [attMatchData, setAttMatchData] = useState<
    Map<number, { loading: boolean; data: any; error: string | null }>
  >(new Map());
  const [attManualPicker, setAttManualPicker] = useState<{
    workLogId: number;
    employeeId: number;
    date: string;
  } | null>(null);
  const [attManualResults, setAttManualResults] = useState<any[]>([]);
  const [attManualLoading, setAttManualLoading] = useState(false);

  // ── Manual Match Popup ──────────────────────────────────────────
  const [manualMatchPopup, setManualMatchPopup] = useState<{
    workLogId: number;
    workLogDate: string; // YYYY-MM-DD
    sourceCode: string;
  } | null>(null);
  const [manualMatchSearch, setManualMatchSearch] = useState('');
  const [manualMatchResults, setManualMatchResults] = useState<any[]>([]);
  const [manualMatchLoading, setManualMatchLoading] = useState(false);
  const [manualMatchSelected, setManualMatchSelected] = useState<any[]>([]);
  const [chitDetailsPopup, setChitDetailsPopup] = useState<{
    workLogId: number;
    sourceKey: string;
    details: any[];
  } | null>(null);

  const handleVerify = async (workLogId: number) => {
    if (openVerifyId === workLogId) {
      // 已展開，點擊再次則收起
      setOpenVerifyId(null);
      return;
    }
    setOpenVerifyId(workLogId);
    // 如果已有資料則不重新載入
    if (verifyData.has(workLogId) && !verifyData.get(workLogId)?.error) return;
    setVerifyData((prev) =>
      new Map(prev).set(workLogId, { loading: true, data: null, error: null }),
    );
    // 同時載入打卡配對詳情
    setAttMatchData((prev) =>
      new Map(prev).set(workLogId, { loading: true, data: null, error: null }),
    );
    try {
      const { verificationApi, attendancesApi } = await import('@/lib/api');
      const [matchRes, confRes, attMatchRes] = await Promise.all([
        verificationApi.matchSingle(workLogId),
        verificationApi.getConfirmations(workLogId),
        attendancesApi.matchDetail(workLogId).catch(() => ({ data: null })),
      ]);
      setVerifyData((prev) =>
        new Map(prev).set(workLogId, {
          loading: false,
          data: matchRes.data,
          error: null,
        }),
      );
      setAttMatchData((prev) =>
        new Map(prev).set(workLogId, {
          loading: false,
          data: attMatchRes.data,
          error: null,
        }),
      );
      // 把確認狀態存到 Map
      const confMap: Record<string, any> = {};
      if (Array.isArray(confRes.data)) {
        confRes.data.forEach((c: any) => {
          confMap[c.source_code] = c;
        });
      }
      setConfirmations((prev) => new Map(prev).set(workLogId, confMap));
    } catch (e: any) {
      setVerifyData((prev) =>
        new Map(prev).set(workLogId, {
          loading: false,
          data: null,
          error: e?.message || '載入失敗',
        }),
      );
      setAttMatchData((prev) =>
        new Map(prev).set(workLogId, {
          loading: false,
          data: null,
          error: e?.message || '載入失敗',
        }),
      );
    }
  };

  const handleConfirmSource = async (
    workLogId: number,
    sourceCode: string,
    status: 'confirmed' | 'rejected',
  ) => {
    const loadKey = `${workLogId}-${sourceCode}`;
    setConfirmActionLoading(loadKey);
    try {
      const { verificationApi } = await import('@/lib/api');
      await verificationApi.upsertConfirmation({
        work_log_id: workLogId,
        source_code: sourceCode,
        status,
      });
      setConfirmations((prev) => {
        const next = new Map(prev);
        const existing = next.get(workLogId) || {};
        next.set(workLogId, {
          ...existing,
          [sourceCode]: {
            status,
            confirmed_by: '我',
            confirmed_at: new Date().toISOString(),
          },
        });
        return next;
      });
      // 同步更新 rows 中的 verification_confirmations，讓核對按鈕顏色即時反映
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== workLogId) return r;
          const confs = (r.verification_confirmations || []).filter(
            (c: any) => c.source_code !== sourceCode,
          );
          return {
            ...r,
            verification_confirmations: [
              ...confs,
              { source_code: sourceCode, status },
            ],
          };
        }),
      );
    } catch (e: any) {
      alert('操作失敗: ' + (e?.message || '未知錯誤'));
    } finally {
      setConfirmActionLoading(null);
    }
  };

  const handleResetConfirmation = async (
    workLogId: number,
    sourceCode: string,
  ) => {
    const loadKey = `${workLogId}-${sourceCode}`;
    setConfirmActionLoading(loadKey);
    try {
      const { verificationApi } = await import('@/lib/api');
      await verificationApi.deleteConfirmation(workLogId, sourceCode);
      setConfirmations((prev) => {
        const next = new Map(prev);
        const existing = { ...(next.get(workLogId) || {}) };
        delete existing[sourceCode];
        next.set(workLogId, existing);
        return next;
      });
      // 同步更新 rows 中的 verification_confirmations
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== workLogId) return r;
          return {
            ...r,
            verification_confirmations: (
              r.verification_confirmations || []
            ).filter((c: any) => c.source_code !== sourceCode),
          };
        }),
      );
    } catch (e: any) {
      alert('操作失敗: ' + (e?.message || '未知錯誤'));
    } finally {
      setConfirmActionLoading(null);
    }
  };

  // 開啟手動配對 popup
  const openManualMatchPopup = async (
    workLogId: number,
    workLogDate: string,
    sourceCode: string,
  ) => {
    setManualMatchPopup({ workLogId, workLogDate, sourceCode });
    setManualMatchSearch('');
    setManualMatchSelected([]);
    setManualMatchResults([]);
    // 自動載入當天所有 WA items
    setManualMatchLoading(true);
    try {
      const { verificationApi } = await import('@/lib/api');
      const res = await verificationApi.searchRecords({
        source_code: sourceCode,
        date: workLogDate,
        search: '',
      });
      setManualMatchResults(res.data || []);
    } catch (e: any) {
      setManualMatchResults([]);
      showToast(
        '載入 WhatsApp 訂單失敗：' +
          (e?.response?.data?.message || e?.message || '未知錯誤'),
      );
    } finally {
      setManualMatchLoading(false);
    }
  };

  // 搜尋 WA items
  const handleManualMatchSearch = async (search: string) => {
    setManualMatchSearch(search);
    if (!manualMatchPopup) return;
    setManualMatchLoading(true);
    try {
      const { verificationApi } = await import('@/lib/api');
      const res = await verificationApi.searchRecords({
        source_code: manualMatchPopup.sourceCode,
        date: manualMatchPopup.workLogDate,
        search,
      });
      setManualMatchResults(res.data || []);
    } catch (e: any) {
      setManualMatchResults([]);
      showToast(
        '搜尋失敗：' + (e?.response?.data?.message || e?.message || '未知錯誤'),
      );
    } finally {
      setManualMatchLoading(false);
    }
  };

  const isManualMatchMultiSelectSource = (sourceCode: string) =>
    sourceCode === 'chit' || sourceCode === 'delivery_note';

  const getManualMatchItemLabel = (sourceCode: string, item: any) => {
    if (sourceCode === 'whatsapp_order') {
      return `${item.wa_item_vehicle_no || item.wa_item_machine_code || `#${item.id}`} ${item.wa_item_driver_nickname || ''}`.trim();
    }
    if (sourceCode === 'chit' || sourceCode === 'delivery_note') {
      return `${item.record_vehicle_no || ''} ${item.record_slip_no ? '#' + item.record_slip_no : `#${item.id}`}`.trim();
    }
    if (sourceCode === 'gps')
      return item.gps_summary_vehicle_no || `#${item.id}`;
    if (sourceCode === 'attendance')
      return item.employee?.name_zh || `#${item.id}`;
    return `#${item.id}`;
  };

  const getManualMatchNotesPrefix = (sourceCode: string) => {
    const prefixMap: Record<string, string> = {
      whatsapp_order: '手動配對',
      chit: '手動配對入帳票',
      delivery_note: '手動配對飛仔',
      gps: '手動配對 GPS',
      attendance: '手動配對打卡',
    };
    return prefixMap[sourceCode] || '手動配對';
  };

  // 確認手動配對
  const handleManualMatchConfirm = async () => {
    if (!manualMatchPopup || manualMatchSelected.length === 0) return;
    setManualMatchLoading(true);
    try {
      const { verificationApi } = await import('@/lib/api');
      const sc = manualMatchPopup.sourceCode;
      const primarySelected = manualMatchSelected[0];
      const recordTypeMap: Record<string, string> = {
        whatsapp_order: 'wa_order_item',
        chit: 'verification_record',
        delivery_note: 'verification_record',
        gps: 'gps_summary',
        attendance: 'attendance',
      };
      const selectedLabels = manualMatchSelected
        .map((item) => getManualMatchItemLabel(sc, item))
        .join(', ');
      const notes = isManualMatchMultiSelectSource(sc)
        ? `${getManualMatchNotesPrefix(sc)}: 記錄ID ${manualMatchSelected.map((item) => item.id).join(', ')}${selectedLabels ? ` (${selectedLabels})` : ''}`
        : `${getManualMatchNotesPrefix(sc)}: ${selectedLabels}`.trim();
      await verificationApi.upsertConfirmation({
        work_log_id: manualMatchPopup.workLogId,
        source_code: sc,
        status: 'manual_match',
        matched_record_id: primarySelected.id,
        matched_record_type: recordTypeMap[sc] || sc,
        notes: notes || `手動配對: #${primarySelected.id}`,
      });
      // 更新確認狀態
      setConfirmations((prev) => {
        const next = new Map(prev);
        const existing = next.get(manualMatchPopup.workLogId) || {};
        next.set(manualMatchPopup.workLogId, {
          ...existing,
          [manualMatchPopup.sourceCode]: {
            status: 'manual_match',
            confirmed_by: '我',
            confirmed_at: new Date().toISOString(),
          },
        });
        return next;
      });
      // 重新載入核對面板資料（面板仍展開，立即重新 fetch 以更新卡片顯示）
      const workLogId = manualMatchPopup.workLogId;
      setManualMatchPopup(null);
      setVerifyData((prev) =>
        new Map(prev).set(workLogId, {
          loading: true,
          data: null,
          error: null,
        }),
      );
      try {
        const { verificationApi: vApi } = await import('@/lib/api');
        const [matchRes, confRes] = await Promise.all([
          vApi.matchSingle(workLogId),
          vApi.getConfirmations(workLogId),
        ]);
        setVerifyData((prev) =>
          new Map(prev).set(workLogId, {
            loading: false,
            data: matchRes.data,
            error: null,
          }),
        );
        const confMap: Record<string, any> = {};
        if (Array.isArray(confRes.data)) {
          confRes.data.forEach((c: any) => {
            confMap[c.source_code] = c;
          });
        }
        setConfirmations((prev) => new Map(prev).set(workLogId, confMap));
      } catch (reloadErr: any) {
        setVerifyData((prev) =>
          new Map(prev).set(workLogId, {
            loading: false,
            data: null,
            error: reloadErr?.message || '重新載入失敗',
          }),
        );
      }
    } catch (e: any) {
      alert('手動配對失敗: ' + (e?.message || '未知錯誤'));
    } finally {
      setManualMatchLoading(false);
    }
  };

  // ── Attendance Import ──────────────────────────────────────────
  const [attendanceImportOpen, setAttendanceImportOpen] = useState(false);
  const [pendingAttendanceCount, setPendingAttendanceCount] = useState<
    number | null
  >(null);

  const fetchPendingCount = useCallback(async () => {
    try {
      const { attendancesApi: attApi } = await import('@/lib/api');
      const res = await attApi.getPendingConversionCount();
      setPendingAttendanceCount(res.data.pending);
    } catch (e) {
      console.error('Failed to fetch pending attendance count', e);
    }
  }, []);

  // ── Row-level WebSocket locks and updates ───────────────────
  const handleRowsUpdated = useCallback(
    (updatedRows: any[]) => {
      const updatedById = new Map(
        updatedRows.map((workLog) => [Number(workLog.id), workLog]),
      );
      setRows((prev) =>
        prev.map((row) => {
          const updated = updatedById.get(Number(row.id));
          if (!updated || dirtyRows.has(Number(row.id))) return row;
          return { ...row, ...updated };
        }),
      );
    },
    [dirtyRows],
  );

  const { locks: rowLocks, lockRows, unlockRows } = useWorkLogSocket({
    onRowsUpdated: handleRowsUpdated,
  });

  const getRowLock = useCallback(
    (rowId: number) => rowLocks.get(Number(rowId)) || null,
    [rowLocks],
  );

  const isRowLockedByOther = useCallback(
    (rowId: number) => {
      const lock = getRowLock(rowId);
      return !!lock && Number(lock.locked_by.id) !== Number(user?.id);
    },
    [getRowLock, user?.id],
  );

  const unlockDirtyRows = useCallback(() => {
    unlockRows(Array.from(dirtyRows.keys()));
  }, [dirtyRows, unlockRows]);

  const totalPages = Math.ceil(total / limit);
  const hasDirty = dirtyRows.size > 0;

  // Column customization
  const {
    columnConfigs,
    visibleColumns,
    columnWidths,
    handleColumnConfigChange,
    handleReset,
    handleColumnResize,
  } = useColumnConfig(
    'work-logs',
    COLUMNS.map((c) => ({ key: c.key, label: c.label })),
  );

  // ── Load reference data ─────────────────────────────────────
  const loadReferenceData = useCallback(
    (includePendingCount = false) => {
      Promise.all([
        companiesApi.simple(),
        partnersApi.simple(),
        contractsApi.simple(),
        quotationsApi.list({ limit: 500 }),
        employeesApi.list({ limit: 500, status: 'active' }),
        usersApi.list({ limit: 200 }),
        fieldOptionsApi.getAll(),
        vehiclesApi.simple().catch(() => ({ data: [] })),
        machineryApi.simple().catch(() => ({ data: [] })),
        subconFleetDriversApi.simple().catch(() => ({ data: [] })),
        subconFleetDriversApi.simpleDrivers().catch(() => ({ data: [] })),
        invoicesApi.list({ limit: 500 }).catch(() => ({ data: [] })),
      ])
        .then(
          ([
            cp,
            pt,
            qt,
            qo,
            em,
            us,
            fo,
            veh,
            mach,
            subconFleet,
            fleetDrivers,
            inv,
          ]) => {
            setCompanies(
              (cp.data || []).map((c: any) => ({
                value: c.id,
                label: c.internal_prefix
                  ? `${c.internal_prefix} ${c.name}`
                  : c.name,
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
              (qt.data || []).map((c: any) => ({
                value: c.id,
                label:
                  c.contract_no +
                  (c.contract_name ? ' ' + c.contract_name : ''),
                _raw: c,
              })),
            );
            const qoData = qo.data?.data || qo.data || [];
            setQuotations(
              qoData.map((q: any) => ({
                value: q.id,
                label:
                  q.quotation_no +
                  (q.contract_name ? ' ' + q.contract_name : ''),
                _raw: q,
              })),
            );
            const employeeList = (em.data?.data || []).map((e: any) => ({
              value: `emp_${e.id}`,
              label: e.name_zh,
              _raw: e,
            }));
            const fleetDriverList = (fleetDrivers.data || []).map((d: any) => ({
              value: d.value,
              label: d.label,
              _raw: d,
            }));
            setEmployees([...employeeList, ...fleetDriverList]);
            setUsers(
              (us.data?.data || us.data || []).map((u: any) => ({
                value: u.id,
                label: u.displayName || u.username,
              })),
            );
            const invData = inv.data?.data || inv.data || [];
            setInvoiceOptions(
              invData.map((invoice: any) => ({
                value: invoice.id,
                label: `${invoice.invoice_no}${invoice.client?.name ? ' - ' + invoice.client.name : ''}${invoice.date ? ' (' + fmtDate(invoice.date) + ')' : ''}`,
                _raw: invoice,
              })),
            );
            const grouped: Record<string, Option[]> = {};
            for (const [cat, opts] of Object.entries(fo.data || {})) {
              grouped[cat] = (opts as any[]).map((o: any) => ({
                value: o.label,
                label: o.label,
              }));
            }
            setFieldOptions(grouped);
            const equipList = [
              ...(veh.data || []),
              ...(mach.data || []),
              ...(subconFleet.data || []),
            ];
            setAllEquipment(equipList);
            if (includePendingCount) fetchPendingCount();
          },
        )
        .catch(console.error);
    },
    [fetchPendingCount],
  );

  useEffect(() => {
    loadReferenceData(true);
  }, [loadReferenceData]);
  useRefetchOnFocus(() => loadReferenceData(false));

  const buildListParams = useCallback(
    (overrides: Record<string, unknown> = {}, { skipColumnFilters = false }: { skipColumnFilters?: boolean } = {}) => {
      const params: Record<string, unknown> = {
        sortBy,
        sortOrder,
        ...overrides,
      };
      if (filterPublisher.length)
        params.publisher_id = filterPublisher.join(',');
      if (filterStatus.length) params.status = filterStatus.join(',');
      if (filterCompany.length) params.company_id = filterCompany.join(',');
      if (filterClient.length) params.client_id = filterClient.join(',');
      if (filterQuotation.length)
        params.quotation_id = filterQuotation.join(',');
      if (filterContract.length) params.contract_id = filterContract.join(',');
      if (filterEmployee.length) {
        const empIds: number[] = [];
        const fleetIds: number[] = [];
        for (const v of filterEmployee) {
          const s = String(v);
          if (s.startsWith('emp_')) empIds.push(Number(s.replace('emp_', '')));
          else if (s.startsWith('fleet_'))
            fleetIds.push(Number(s.replace('fleet_', '')));
        }
        if (empIds.length) params.employee_id = empIds.join(',');
        if (fleetIds.length) params.fleet_driver_id = fleetIds.join(',');
      }
      if (filterEquipment) params.equipment_number = filterEquipment;
      if (filterDateFrom) {
        params.date_from = filterDateFrom;
        params.date_to = filterDateTo || filterDateFrom;
      } else if (filterDateTo) {
        params.date_to = filterDateTo;
      }
      if (!skipColumnFilters) {
        for (const [col, vals] of Object.entries(columnFilters)) {
          if (Array.isArray(vals) && vals.length > 0) {
            params[`filter_${col}`] = JSON.stringify(vals);
          }
        }
      }
      return params;
    },
    [
      sortBy,
      sortOrder,
      filterPublisher,
      filterStatus,
      filterCompany,
      filterClient,
      filterQuotation,
      filterContract,
      filterEmployee,
      filterEquipment,
      filterDateFrom,
      filterDateTo,
      columnFilters,
    ],
  );

  const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const optionCandidates = (
    option: Option,
    rawKeys: string[] = [],
  ): string[] => {
    const candidates = [
      String(option.value),
      option.label,
      option.shortLabel,
    ].filter((value): value is string => Boolean(value));
    const raw = option._raw;
    if (isPlainRecord(raw)) {
      for (const key of rawKeys) {
        const value = raw[key];
        if (value !== undefined && value !== null && value !== '')
          candidates.push(String(value));
      }
    }
    return candidates;
  };

  const contextualOptions = (
    options: Option[],
    columnKey: string,
    selectedValues: (string | number)[],
    rawKeys: string[] = [],
  ) => {
    const availableValues = dynamicTopFilterOptions[columnKey];
    if (!availableValues) return options;

    const selected = new Set(selectedValues.map(String));
    const available = new Set(availableValues.map(String));
    return options.filter((option) => {
      if (selected.has(String(option.value))) return true;
      return optionCandidates(option, rawKeys).some((candidate) =>
        available.has(candidate),
      );
    });
  };

  // ── Dynamic top-filter options: use the same server-side filter-option endpoint
  // so option lists are recalculated from the complete filtered dataset, not only
  // from rows on the current page.
  useEffect(() => {
    let cancelled = false;
    const loadDynamicTopFilterOptions = async () => {
      try {
        const params = buildListParams({
          page: 1,
          limit: Math.max(total, 100000),
        }, { skipColumnFilters: true });
        const [publisher, status, company, client, quotation, contract] =
          await Promise.all([
            workLogsApi.filterOptions('publisher', params),
            workLogsApi.filterOptions('status', params),
            workLogsApi.filterOptions('company', params),
            workLogsApi.filterOptions('client', params),
            workLogsApi.filterOptions('quotation', params),
            workLogsApi.filterOptions('contract', params),
          ]);
        if (cancelled) return;
        setDynamicTopFilterOptions({
          publisher: (publisher.data || []).map(String),
          status: (status.data || []).map(String),
          company: (company.data || []).map(String),
          client: (client.data || []).map(String),
          quotation: (quotation.data || []).map(String),
          contract: (contract.data || []).map(String),
        });
      } catch (error) {
        if (!cancelled) {
          console.error(
            'Failed to fetch contextual work-log filter options',
            error,
          );
          setDynamicTopFilterOptions({});
        }
      }
    };

    loadDynamicTopFilterOptions();
    return () => {
      cancelled = true;
    };
  }, [buildListParams, total]);

  // ── Load work logs ──────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildListParams({ page, limit });
      const res = await workLogsApi.list(params);
      setRows(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (e: any) {
      console.error(e);
      showToast(
        '載入工作紀錄失敗：' +
          (e?.response?.data?.message || e?.message || '未知錯誤'),
      );
    } finally {
      setLoading(false);
    }
  }, [page, limit, buildListParams, showToast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (selected.size === 0 || rows.length === 0) return;
    setSelectedWorkLogs((prev) => {
      const next = new Map(prev);
      let changed = false;
      rows.forEach((row) => {
        const id = Number(row.id);
        if (!Number.isFinite(id) || !selected.has(id)) return;
        if (next.get(id) !== row) {
          next.set(id, row);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [rows, selected]);

  // ── Sort handler ──────────────────────────────────────────
  const handleSort = useCallback(
    (field: string, order: "ASC" | "DESC") => {
      if (
        hasDirty &&
        !confirm("有未儲存的修改，切換排序將會丟失。確定要繼續嗎？")
      )
        return;
      if (hasDirty) {
        unlockDirtyRows();
        setDirtyRows(new Map());
      }
      setSortBy(field);
      setSortOrder(order);
      setPage(1);
    },
    [hasDirty, unlockDirtyRows, setSortBy, setSortOrder, setPage],
  );

  // ── Dirty tracking ─────────────────────────────────────────
  const setCellValue = useCallback(
    async (rowId: number, field: string, value: any) => {
      const existingLock = getRowLock(rowId);
      if (existingLock && Number(existingLock.locked_by.id) !== Number(user?.id)) {
        alert(`此行正在被 ${existingLock.locked_by.name} 編輯中，請稍後再試。`);
        return;
      }

      if (!dirtyRows.has(rowId)) {
        const result = await lockRows([rowId]);
        const conflict = result.conflicts?.[0];
        if (!result.ok && conflict) {
          alert(`此行正在被 ${conflict.locked_by.name} 編輯中，請稍後再試。`);
          return;
        }
      }

      setDirtyRows((prev) => {
        const next = new Map(prev);
        const existing = next.get(rowId) || {};
        const originalRow = rows.find((r) => r.id === rowId);

        // Check if value is same as original — if so, remove from dirty
        let originalValue = originalRow?.[field];
        // Normalize for comparison
        if (field === 'scheduled_date' && originalValue) {
          originalValue =
            typeof originalValue === 'string'
              ? originalValue.split('T')[0]
              : originalValue;
        }
        if (field === 'employee_id') {
          if (originalRow?.work_log_fleet_driver_id) {
            originalValue = `fleet_${originalRow.work_log_fleet_driver_id}`;
          } else if (originalValue) {
            originalValue = `emp_${originalValue}`;
          }
        }

        const isSameAsOriginal =
          String(value ?? '') === String(originalValue ?? '');

        if (isSameAsOriginal) {
          const { [field]: _, ...rest } = existing;
          if (Object.keys(rest).length === 0) {
            next.delete(rowId);
            unlockRows([rowId]);
          } else {
            next.set(rowId, rest);
          }
        } else {
          next.set(rowId, { ...existing, [field]: value });
        }
        return next;
      });
    },
    [rows, dirtyRows, getRowLock, lockRows, unlockRows, user?.id],
  );

  // Get the effective value for a cell (dirty value or original)
  const getCellValue = (row: any, field: string): any => {
    const dirty = dirtyRows.get(row.id);
    if (dirty && field in dirty) return dirty[field];
    if (field === 'employee_id') {
      if (row.work_log_fleet_driver_id)
        return `fleet_${row.work_log_fleet_driver_id}`;
      if (row.employee_id) return `emp_${row.employee_id}`;
    }
    if (field === 'scheduled_date' && row.scheduled_date) {
      return typeof row.scheduled_date === 'string'
        ? row.scheduled_date.split('T')[0]
        : row.scheduled_date;
    }
    return row[field];
  };

  const isCellDirty = (rowId: number, field: string): boolean => {
    const dirty = dirtyRows.get(rowId);
    return !!dirty && field in dirty;
  };

  // ── Save all dirty rows ─────────────────────────────────────
  const handleSaveAll = async () => {
    if (dirtyRows.size === 0) return;
    setSaving(true);
    try {
      const changes: Array<{ id: number; data: any }> = [];
      for (const [id, fields] of Array.from(dirtyRows.entries())) {
        const payload = { ...fields };
        // Strip employee_id prefix and handle fleet driver
        if ('employee_id' in payload) {
          if (typeof payload.employee_id === 'string') {
            if (payload.employee_id.startsWith('emp_')) {
              payload.employee_id = Number(
                payload.employee_id.replace('emp_', ''),
              );
              payload.work_log_fleet_driver_id = null;
            } else if (payload.employee_id.startsWith('fleet_')) {
              payload.work_log_fleet_driver_id = Number(
                payload.employee_id.replace('fleet_', ''),
              );
              payload.employee_id = null;
            } else if (payload.employee_id.startsWith('part_')) {
              payload.employee_id = null;
            }
          } else if (
            payload.employee_id === null ||
            payload.employee_id === ''
          ) {
            payload.work_log_fleet_driver_id = null;
          }
        }
        changes.push({ id, data: payload });
      }
      const res = await workLogsApi.bulkSave(changes);
      const result = res.data;
      if (result.failed > 0) {
        const successfulIds = result.results
          .filter((r: any) => r.success)
          .map((r: any) => Number(r.id));
        const failedIds = result.results
          .filter((r: any) => !r.success)
          .map((r: any) => r.id);
        alert(
          `已儲存 ${result.saved} 筆，${result.failed} 筆失敗（ID: ${failedIds.join(', ')}）`,
        );
        unlockRows(successfulIds);
        // Remove only successfully saved rows from dirty
        setDirtyRows((prev) => {
          const next = new Map(prev);
          for (const r of result.results) {
            if (r.success) next.delete(r.id);
          }
          return next;
        });
      } else {
        unlockDirtyRows();
        setDirtyRows(new Map());
      }
      await fetchLogs();
    } catch (e: any) {
      alert('儲存失敗：' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    if (!confirm('確定放棄所有未儲存的修改？')) return;
    unlockDirtyRows();
    setDirtyRows(new Map());
  };

  // ── Page change with unsaved warning ────────────────────────
  const changePage = (newPage: number) => {
    if (hasDirty) {
      if (!confirm('有未儲存的修改，切換分頁將會丟失。確定要繼續嗎？')) return;
      unlockDirtyRows();
      setDirtyRows(new Map());
    }
    setPage(newPage);
  };

  const changeLimit = (newLimit: number) => {
    if (hasDirty) {
      if (!confirm('有未儲存的修改，切換每頁筆數將會丟失。確定要繼續嗎？'))
        return;
      unlockDirtyRows();
      setDirtyRows(new Map());
    }
    setLimit(newLimit);
    setPage(1);
  };

  // Browser beforeunload warning
  useEffect(() => {
    if (!hasDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasDirty]);

  // ── New row ─────────────────────────────────────────────────
  const handleAddNew = () => {
    setNewRow({
      status: 'editing',
      publisher_id: user?.id,
      scheduled_date: new Date().toISOString().split('T')[0],
    });
  };

  const setNewRowField = (field: string, value: any) => {
    setNewRow((prev: any) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (
        field === 'employee_id' &&
        typeof value === 'string' &&
        value.startsWith('part_')
      ) {
        next.client_id = Number(value.replace('part_', ''));
      }
      if (field === 'client_id') {
        next.quotation_id = null;
        next.contract_id = null;
      }
      return next;
    });
  };

  const handleSaveNew = async () => {
    if (!newRow) return;
    setSavingNew(true);
    try {
      const payload = { ...newRow };
      if (typeof payload.employee_id === 'string') {
        if (payload.employee_id.startsWith('emp_')) {
          payload.employee_id = Number(payload.employee_id.replace('emp_', ''));
          payload.work_log_fleet_driver_id = null;
        } else if (payload.employee_id.startsWith('fleet_')) {
          payload.work_log_fleet_driver_id = Number(
            payload.employee_id.replace('fleet_', ''),
          );
          payload.employee_id = null;
        } else if (payload.employee_id.startsWith('part_')) {
          payload.employee_id = null;
        }
      }
      await workLogsApi.create(payload);
      setNewRow(null);
      await fetchLogs();
    } catch (e: any) {
      alert('新增失敗：' + (e.response?.data?.message || e.message));
    } finally {
      setSavingNew(false);
    }
  };

  // ── Actions ─────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (isRowLockedByOther(id)) {
      const lock = getRowLock(id);
      alert(`此行正在被 ${lock?.locked_by.name || '其他用戶'} 編輯中，無法刪除。`);
      return;
    }
    if (!confirm('確定刪除此記錄？')) return;
    const result = await lockRows([id]);
    const conflict = result.conflicts?.[0];
    if (!result.ok && conflict) {
      alert(`此行正在被 ${conflict.locked_by.name} 編輯中，無法刪除。`);
      return;
    }
    try {
      await workLogsApi.remove(id);
      // Remove from dirty if present
      setDirtyRows((prev) => {
        const n = new Map(prev);
        n.delete(id);
        return n;
      });
      await fetchLogs();
    } catch (e: any) {
      alert('刪除失敗：' + (e.response?.data?.message || e.message));
    } finally {
      unlockRows([id]);
    }
  };

  const handleDuplicate = async (id: number) => {
    const res = await workLogsApi.duplicate(id);
    await fetchLogs();
  };

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectedWorkLogs(new Map());
  }, []);

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`確定刪除選取的 ${selected.size} 筆記錄？`)) return;
    await workLogsApi.bulkDelete(Array.from(selected));
    clearSelection();
    await fetchLogs();
  };

  const handleLinkWorkLogsToInvoice = async () => {
    if (selected.size === 0) return;
    const workLogIds = Array.from(selected);

    if (invoiceLinkMode === 'new') {
      const selectedWorkLogsById = new Map(selectedWorkLogs);
      rows.forEach((row) => {
        const id = Number(row.id);
        if (Number.isFinite(id) && selected.has(id)) {
          selectedWorkLogsById.set(id, row);
        }
      });

      const missingWorkLogIds = workLogIds.filter(
        (id) => !selectedWorkLogsById.has(id),
      );
      if (missingWorkLogIds.length > 0) {
        try {
          const fetchedWorkLogs = await Promise.all(
            missingWorkLogIds.map((id) => workLogsApi.get(id)),
          );
          fetchedWorkLogs.forEach((res, index) => {
            const row = res.data;
            if (row) selectedWorkLogsById.set(missingWorkLogIds[index], row);
          });
          setSelectedWorkLogs(new Map(selectedWorkLogsById));
        } catch (e: any) {
          showToast(
            '無法取得所選工作紀錄資料：' +
              (e?.response?.data?.message || e?.message || '未知錯誤'),
          );
          return;
        }
      }

      const selectedWorkLogRows = workLogIds
        .map((id) => selectedWorkLogsById.get(id))
        .filter((row): row is any => Boolean(row))
        .map((row) => ({
          ...row,
          ...(dirtyRows.get(Number(row.id)) || {}),
        }));

      if (selectedWorkLogRows.length !== workLogIds.length) {
        showToast('無法取得所選工作紀錄資料，請重新整理後再試');
        return;
      }

      const companyIds = new Set(
        selectedWorkLogRows.map((row) => normalizeInvoiceFieldValue(row.company_id)),
      );
      const clientIds = new Set(
        selectedWorkLogRows.map((row) => normalizeInvoiceFieldValue(row.client_id)),
      );

      if (companyIds.size > 1 || clientIds.size > 1) {
        showToast('所選工作紀錄的公司或客戶不一致，無法合併建立發票');
        return;
      }

      const companyId = companyIds.values().next().value || '';
      const clientId = clientIds.values().next().value || '';
      const clientContractNo = getMostFrequentClientContractNo(selectedWorkLogRows);
      const invoiceTitle = buildInvoiceTitleFromWorkLogs(
        selectedWorkLogRows,
        clientContractNo,
      );
      const params = new URLSearchParams({
        work_log_ids: workLogIds.join(','),
        mode: 'link-only',
      });

      if (companyId) params.set('company_id', companyId);
      if (clientId) params.set('client_id', clientId);
      if (clientContractNo) params.set('client_contract_no', clientContractNo);
      if (invoiceTitle) params.set('invoice_title', invoiceTitle);

      window.location.href = `/invoices?${params.toString()}`;
      return;
    }

    if (!targetInvoiceId) {
      showToast('請先選擇目標發票');
      return;
    }

    setInvoiceLinkLoading(true);
    try {
      await invoicesApi.linkWorkLogs(Number(targetInvoiceId), workLogIds);
      showToast(`已將 ${workLogIds.length} 筆工作紀錄加入發票`, 'success');
      setInvoiceLinkOpen(false);
      setTargetInvoiceId(null);
      clearSelection();
    } catch (e: any) {
      showToast(
        '加入發票失敗：' +
          (e?.response?.data?.message || e?.message || '未知錯誤'),
      );
    } finally {
      setInvoiceLinkLoading(false);
    }
  };

  const getEditableSelectedIds = useCallback(() => {
    const selectedIds = Array.from(selected);
    return selectedIds.filter((id) => !isRowLockedByOther(id));
  }, [selected, isRowLockedByOther]);

  const handleOpenBatchEdit = async () => {
    const editableIds = getEditableSelectedIds();
    if (editableIds.length !== selected.size) {
      alert('部分選取的行正在被其他用戶鎖定，請取消選取後再批量編輯。');
      return;
    }
    const result = await lockRows(editableIds);
    const conflict = result.conflicts?.[0];
    if (!result.ok && conflict) {
      alert(`部分選取的行正在被 ${conflict.locked_by.name} 編輯中，請稍後再試。`);
      return;
    }
    setBatchEditOpen(true);
  };

  const handleCloseBatchEdit = () => {
    unlockRows(Array.from(selected));
    setBatchEditOpen(false);
  };

  const handleBulkUpdateSuccess = async () => {
    unlockRows(Array.from(selected));
    clearSelection();
    await fetchLogs();
  };

  const handleAttendanceImportSuccess = async () => {
    await fetchLogs();
    fetchPendingCount();
  };

  const handleBulkConfirm = async () => {
    if (selected.size === 0) return;
    const ids = getEditableSelectedIds();
    if (ids.length !== selected.size) {
      alert('部分選取的行正在被其他用戶鎖定，無法批量確認。');
      return;
    }
    const result = await lockRows(ids);
    const conflict = result.conflicts?.[0];
    if (!result.ok && conflict) {
      alert(`部分選取的行正在被 ${conflict.locked_by.name} 編輯中，請稍後再試。`);
      return;
    }
    try {
      await workLogsApi.bulkConfirm(ids);
      clearSelection();
      await fetchLogs();
    } finally {
      unlockRows(ids);
    }
  };

  const handleBulkUnconfirm = async () => {
    if (selected.size === 0) return;
    const ids = getEditableSelectedIds();
    if (ids.length !== selected.size) {
      alert('部分選取的行正在被其他用戶鎖定，無法批量取消確認。');
      return;
    }
    if (!confirm(`確定取消確認選取的 ${selected.size} 筆記錄？`)) return;
    const result = await lockRows(ids);
    const conflict = result.conflicts?.[0];
    if (!result.ok && conflict) {
      alert(`部分選取的行正在被 ${conflict.locked_by.name} 編輯中，請稍後再試。`);
      return;
    }
    try {
      await workLogsApi.bulkUnconfirm(ids);
      clearSelection();
      await fetchLogs();
    } finally {
      unlockRows(ids);
    }
  };

  const toggleSelect = (row: any, checked: boolean) => {
    const id = Number(row.id);
    if (!Number.isFinite(id)) return;
    if (checked && isRowLockedByOther(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setSelectedWorkLogs((prev) => {
      const next = new Map(prev);
      if (checked) next.set(id, row);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    const currentPageRows = rows.filter((row) => {
      const id = Number(row.id);
      return Number.isFinite(id) && !isRowLockedByOther(id);
    });

    setSelected((prev) => {
      const next = new Set(prev);
      currentPageRows.forEach((row) => {
        const id = Number(row.id);
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });

    setSelectedWorkLogs((prev) => {
      const next = new Map(prev);
      currentPageRows.forEach((row) => {
        const id = Number(row.id);
        if (checked) next.set(id, row);
        else next.delete(id);
      });
      return next;
    });
  };

  const resetFilters = () => {
    if (
      hasDirty &&
      !confirm('有未儲存的修改，重設篩選將會丟失。確定要繼續嗎？')
    )
      return;
    unlockDirtyRows();
    setDirtyRows(new Map());
    setFilterPublisher([]);
    setFilterStatus([]);
    setFilterCompany([]);
    setFilterClient([]);
    setFilterQuotation([]);
    setFilterContract([]);
    setFilterEmployee([]);
    setFilterEquipment('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setColumnFilters({});
    setPage(1);
  };

  const applyMonthShortcut = useCallback((monthOffset: number) => {
    const { dateFrom, dateTo } = getMonthRange(monthOffset);
    setFilterDateFrom(dateFrom);
    setFilterDateTo(dateTo);
    setPage(1);
  }, []);

  const hasFilters = !!(
    filterPublisher.length ||
    filterStatus.length ||
    filterCompany.length ||
    filterClient.length ||
    filterQuotation.length ||
    filterContract.length ||
    filterEmployee.length ||
    filterEquipment ||
    filterDateFrom ||
    filterDateTo ||
    Object.keys(columnFilters).length > 0
  );

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

  const getCompanyDisplayName = (
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
    return (
      getShortOptionLabel(companies, value) ||
      row.company_profile?.chinese_name ||
      row.company_profile?.name ||
      '—'
    );
  };

  const getClientDisplayName = (
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
    return (
      getShortOptionLabel(clients, value) || row.unverified_client_name || '—'
    );
  };

  // ── Helper: get display value for relation fields ───────────
  const getDisplayValue = (row: any, field: string): string => {
    const dirty = dirtyRows.get(row.id);
    // If dirty, resolve display from options
    if (dirty && field in dirty) {
      const val = dirty[field];
      if (field === 'status') return getStatusLabel(val) || val || '—';
      if (field === 'company_id') return getCompanyDisplayName(row, val);
      if (field === 'client_id') return getClientDisplayName(row, val);
      if (field === 'quotation_id')
        return quotations.find((o) => o.value === val)?.label || '—';
      if (field === 'contract_id')
        return contracts.find((o) => o.value === val)?.label || '—';
      if (field === 'employee_id')
        return (
          employees.find((o) => String(o.value) === String(val))?.label || '—'
        );
      if (field === 'scheduled_date') return val ? fmtDate(val) : '—';
      if (
        field === 'is_mid_shift' ||
        field === 'is_confirmed' ||
        field === 'is_paid'
      )
        return val ? '✓' : '—';
      return val != null && val !== '' ? String(val) : '—';
    }
    // Original value display
    if (field === 'status') return getStatusLabel(row.status) || '—';
    if (field === 'company_id')
      return getCompanyDisplayName(row, row.company_id);
    if (field === 'client_id') return getClientDisplayName(row, row.client_id);
    if (field === 'quotation_id')
      return (
        row.quotation?.quotation_no ||
        quotations.find((o) => o.value === row.quotation_id)?.label ||
        '—'
      );
    if (field === 'contract_id')
      return (
        row.contract?.contract_no ||
        contracts.find((o) => o.value === row.contract_id)?.label ||
        '—'
      );
    if (field === 'employee_id') {
      if (row.work_log_fleet_driver_id) {
        const fd = row.fleet_driver;
        if (fd) {
          const company = fd.subcontractor?.name || '街車';
          return fd.name_zh
            ? `${fd.name_zh}（${company}・街車）`
            : `${company}（街車）${fd.plate_no || ''}`;
        }
        return (
          employees.find(
            (o) => String(o.value) === `fleet_${row.work_log_fleet_driver_id}`,
          )?.label || '—'
        );
      }
      return (
        row.employee?.name_zh ||
        employees.find((o) => String(o.value) === `emp_${row.employee_id}`)
          ?.label ||
        '—'
      );
    }
    if (field === 'scheduled_date')
      return row.scheduled_date ? fmtDate(row.scheduled_date) : '—';
    if (
      field === 'is_mid_shift' ||
      field === 'is_confirmed' ||
      field === 'is_paid'
    )
      return row[field] ? '✓' : '—';
    return row[field] != null && row[field] !== '' ? String(row[field]) : '—';
  };

  // ── Filtered quotations/contracts by client ─────────────────
  const getFilteredQuotations = (row: any): Option[] => {
    const clientId = getCellValue(row, 'client_id');
    if (!clientId) return quotations;
    return quotations.filter((q: any) => {
      const qData = q._raw;
      return (
        !qData ||
        qData.client_id === clientId ||
        qData.client_id === Number(clientId)
      );
    });
  };

  const getFilteredContracts = (row: any): Option[] => {
    const clientId = getCellValue(row, 'client_id');
    if (!clientId) return contracts;
    return contracts.filter((c: any) => {
      const cData = c._raw;
      return (
        !cData ||
        cData.client_id === clientId ||
        cData.client_id === Number(clientId)
      );
    });
  };

  // ── Render editable cell ────────────────────────────────────
  const renderCell = (row: any, field: string) => {
    const val = getCellValue(row, field);
    const dirty = isCellDirty(row.id, field);
    const display = getDisplayValue(row, field);
    const isLocked = isRowLockedByOther(row.id);

    const onChange = (v: any) => {
      // When client changes, also clear quotation and contract
      if (field === 'client_id') {
        setCellValue(row.id, 'client_id', v);
        setCellValue(row.id, 'quotation_id', null);
        setCellValue(row.id, 'contract_id', null);
      } else if (
        field === 'employee_id' &&
        typeof v === 'string' &&
        v.startsWith('part_')
      ) {
        setCellValue(row.id, 'employee_id', v);
        setCellValue(row.id, 'client_id', Number(v.replace('part_', '')));
      } else {
        setCellValue(row.id, field, v);
      }
    };

    switch (field) {
      case 'wl_whatsapp_reported_at': {
        const formatted = formatHongKongDateTime(val);
        return (
          <span className="inline-block px-1 py-0.5 text-xs text-gray-700 whitespace-nowrap">
            {formatted || '—'}
          </span>
        );
      }
      case 'status':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="select"
            options={STATUS_OPTIONS}
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'scheduled_date':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={(val) => onChange(val)}
            type="date"
            isDirty={dirty}
            disabled={!!isLocked}
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
            disabled={!!isLocked}
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
            disabled={!!isLocked}
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
            disabled={!!isLocked}
          />
        );
      case 'quotation_id':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="select"
            options={getFilteredQuotations(row)}
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'contract_id':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="select"
            options={getFilteredContracts(row)}
            isDirty={dirty}
            disabled={!!isLocked}
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
            disabled={!!isLocked}
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
            disabled={!!isLocked}
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
            disabled={!!isLocked}
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
            disabled={!!isLocked}
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
            disabled={!!isLocked}
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
            disabled={!!isLocked}
          />
        );
      case 'start_location':
      case 'end_location': {
        const isWhatsappNewLoc =
          (row.source === 'whatsapp' || row.source === 'whatsapp_clockin') &&
          row.is_location_new;
        return (
          <div
            className={`relative group ${isWhatsappNewLoc ? 'bg-yellow-100 ring-1 ring-yellow-300 rounded' : ''}`}
          >
            <EditableCell
              value={val}
              displayValue={display}
              onChange={onChange}
              type="combobox_create"
              options={fieldOptions['location'] || []}
              createCategory="location"
              isDirty={dirty}
              disabled={!!isLocked}
            />
            {isWhatsappNewLoc && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await workLogsApi.confirmLocation(row.id);
                    await fetchLogs();
                  } catch (e: any) {
                    showToast(
                      '確認地點失敗：' +
                        (e?.response?.data?.message ||
                          e?.message ||
                          '未知錯誤'),
                    );
                  }
                }}
                className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-5 h-5 bg-green-500 text-white rounded-full text-xs shadow hover:bg-green-600 z-20"
                title="確認地點正確"
              >
                ✓
              </button>
            )}
          </div>
        );
      }
      case 'start_time':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="time"
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'end_time':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="time"
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'quantity':
      case 'ot_quantity':
      case 'goods_quantity':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="number"
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'unit':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['wage_unit'] || []}
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'ot_unit':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['wage_unit'] || []}
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'is_mid_shift':
      case 'is_confirmed':
      case 'is_paid':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="checkbox"
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'receipt_no':
      case 'work_log_product_name':
      case 'work_order_no':
      case 'work_content':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="text"
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'work_log_product_unit':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['product_unit'] || []}
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'remarks':
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={onChange}
            type="text"
            isDirty={dirty}
            disabled={!!isLocked}
          />
        );
      case 'attachments': {
        const rowId = Number(row.id);
        const scheduledDate = row.scheduled_date ? fmtDate(row.scheduled_date) : '';
        const workOrderNo = row.work_order_no ? String(row.work_order_no) : '';
        const titleParts = [`#${rowId}`, scheduledDate, workOrderNo].filter(Boolean);
        const title = `Work Log ${titleParts.join('｜')}`;

        return (
          <button
            type="button"
            disabled={!Number.isFinite(rowId)}
            onClick={() => setAttachmentModalTarget({ id: rowId, title })}
            className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            title="管理此 Work Log 的附件"
          >
            附件
          </button>
        );
      }
      case 'source': {
        return (
          <span
            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getSourceClassName(val)}`}
          >
            {getSourceDisplay(val)}
          </span>
        );
      }
      default:
        return (
          <EditableCell
            value={val}
            displayValue={display}
            onChange={() => {}}
            type="readonly"
          />
        );
    }
  };

  // ── Render new row cell ─────────────────────────────────────
  const renderNewCell = (field: string) => {
    if (!newRow) return null;
    const val = newRow[field] ?? null;
    const onChange = (v: any) => setNewRowField(field, v);

    switch (field) {
      case 'status':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="select"
            options={STATUS_OPTIONS}
          />
        );
      case 'scheduled_date':
        return (
          <EditableCell
            value={val}
            onChange={(val) => onChange(val)}
            type="date"
          />
        );
      case 'service_type':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['service_type'] || []}
          />
        );
      case 'company_id':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="select"
            options={companies}
          />
        );
      case 'client_id':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="select"
            options={clients}
          />
        );
      case 'quotation_id':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="select"
            options={quotations}
          />
        );
      case 'contract_id':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="select"
            options={contracts}
          />
        );
      case 'client_contract_no':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox_create"
            options={fieldOptions['client_contract_no'] || []}
            createCategory="client_contract_no"
          />
        );
      case 'employee_id':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="select"
            options={employees}
          />
        );
      case 'machine_type':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['machine_type'] || []}
          />
        );
      case 'equipment_number':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox"
            options={allEquipment}
          />
        );
      case 'tonnage':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['tonnage'] || []}
          />
        );
      case 'day_night':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['day_night'] || []}
          />
        );
      case 'start_location':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox_create"
            options={fieldOptions['location'] || []}
            createCategory="location"
          />
        );
      case 'end_location':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox_create"
            options={fieldOptions['location'] || []}
            createCategory="location"
          />
        );
      case 'start_time':
      case 'end_time':
        return <EditableCell value={val} onChange={onChange} type="time" />;
      case 'quantity':
      case 'ot_quantity':
      case 'goods_quantity':
        return <EditableCell value={val} onChange={onChange} type="number" />;
      case 'unit':
      case 'ot_unit':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['wage_unit'] || []}
          />
        );
      case 'is_mid_shift':
      case 'is_confirmed':
      case 'is_paid':
        return <EditableCell value={val} onChange={onChange} type="checkbox" />;
      case 'receipt_no':
      case 'work_log_product_name':
      case 'work_order_no':
      case 'work_content':
      case 'remarks':
        return <EditableCell value={val} onChange={onChange} type="text" />;
      case 'work_log_product_unit':
        return (
          <EditableCell
            value={val}
            onChange={onChange}
            type="combobox"
            options={fieldOptions['product_unit'] || []}
          />
        );
      default:
        return <EditableCell value={val} onChange={() => {}} type="readonly" />;
    }
  };

  // Map column keys to data field keys
  const colKeyToField: Record<string, string> = {
    company: 'company_id',
    client: 'client_id',
    quotation: 'quotation_id',
    contract: 'contract_id',
    employee: 'employee_id',
    publisher: 'publisher_id',
    work_content: 'work_content',
  };

  const [activeTab, setActiveTab] = useState<
    'records' | 'summary' | 'missing-price'
  >('records');

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-gray-50 -m-4 sm:-m-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0 gap-2">
        <div className="shrink-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">
            工作記錄
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            共 {total} 筆記錄
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
          {/* Dirty indicator + save */}
          {hasDirty && (
            <>
              <span className="text-sm text-amber-600 font-medium">
                {dirtyRows.size} 筆未儲存
              </span>
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {saving ? '儲存中…' : '💾 全部儲存'}
              </button>
              <button
                onClick={handleDiscardChanges}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                放棄修改
              </button>
            </>
          )}
          {selected.size > 0 && (
            <>
              <span className="text-sm text-gray-600">
                已選 {selected.size} 筆
              </span>
              <button
                onClick={handleOpenBatchEdit}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                批量編輯
              </button>
              <button
                onClick={handleBulkConfirm}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                批量確認
              </button>
              <button
                onClick={handleBulkUnconfirm}
                className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                取消確認
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                批量刪除
              </button>
              <button
                onClick={() => setInvoiceLinkOpen(true)}
                className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                加入發票
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                清除選取
              </button>
            </>
          )}
          <ColumnCustomizer
            columns={columnConfigs}
            onChange={handleColumnConfigChange}
            onReset={handleReset}
          />
          <ExportButton
            columns={COLUMNS.map((col) => ({
              key: col.key,
              label: col.label,
              exportRender: (val: any, row: any) => {
                if (col.key === 'publisher')
                  return (
                    row.publisher?.displayName || row.publisher?.username || ''
                  );
                if (col.key === 'company')
                  return getCompanyDisplayName(row, row.company_id).replace(
                    '—',
                    '',
                  );
                if (col.key === 'client')
                  return getClientDisplayName(row, row.client_id).replace(
                    '—',
                    '',
                  );
                if (col.key === 'quotation')
                  return row.quotation?.quotation_no || '';
                if (col.key === 'contract')
                  return row.contract?.contract_no || '';
                if (col.key === 'employee') {
                  if (row.work_log_fleet_driver_id && row.fleet_driver) {
                    const fd = row.fleet_driver;
                    return fd.name_zh
                      ? `${fd.name_zh}（${fd.subcontractor?.name || '街車'}・街車）`
                      : `${fd.subcontractor?.name || '街車'}（街車）${fd.plate_no || ''}`;
                  }
                  return row.employee?.name_zh || '';
                }
                if (col.key === 'wl_whatsapp_reported_at')
                  return formatHongKongDateTime(val);
                if (col.key === 'is_confirmed') return val ? '是' : '否';
                if (col.key === 'is_paid') return val ? '是' : '否';
                if (col.key === 'source')
                  return getSourceDisplay(val).replace('(空白)', '');
                return val != null ? String(val) : '';
              },
            }))}
            data={rows}
            filename="工作記錄"
            onFetchAll={async () => {
              const res = await workLogsApi.list(
                buildListParams({ page: 1, limit: Math.max(total, 100000) }),
              );
              return res.data?.data || [];
            }}
          />
          <button
            onClick={() => setAttendanceImportOpen(true)}
            className="px-3 py-1.5 text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 font-medium whitespace-nowrap flex items-center gap-1"
          >
            📥 從打卡匯入
            {pendingAttendanceCount !== null && pendingAttendanceCount > 0 && (
              <span className="bg-amber-200 px-1.5 rounded-full text-[10px]">
                {pendingAttendanceCount}
              </span>
            )}
          </button>
          <button
            onClick={handleAddNew}
            disabled={!!newRow}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 font-medium whitespace-nowrap"
          >
            ＋ 新增記錄
          </button>
          <CsvImportModal module="work-logs" onImportComplete={fetchLogs} />
          <AttendanceImportModal
            isOpen={attendanceImportOpen}
            onClose={() => setAttendanceImportOpen(false)}
            onSuccess={handleAttendanceImportSuccess}
          />
        </div>
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 shrink-0">
        <div className="flex px-4 sm:px-6">
          <button
            onClick={() => setActiveTab('records')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'records'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            工作記錄
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'summary'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            整理分析
          </button>
          <button
            onClick={() => setActiveTab('missing-price')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'missing-price'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            客戶價目缺價表
          </button>
        </div>
      </div>

      {/* ── Tab Content: Summary Analysis ────────────────────────────── */}
      <div className={`flex-1 overflow-y-auto bg-gray-50 ${activeTab === 'summary' ? '' : 'hidden'}`}>
        <SummaryTab />
      </div>

      {/* ── Tab Content: Missing Price ────────────────────────────── */}
      <div className={`flex-1 overflow-hidden ${activeTab === 'missing-price' ? '' : 'hidden'}`}>
        <MissingPriceTab />
      </div>

      {/* ── Tab Content: Work Records (existing content) ────────── */}
      {activeTab === 'records' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* ── Invoice Link Dialog ─────────────────────────────────── */}
          {invoiceLinkOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      加入發票
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      將已選取的 {selected.size} 筆工作紀錄與發票建立關聯。
                    </p>
                  </div>
                  <button
                    onClick={() => setInvoiceLinkOpen(false)}
                    className="text-2xl leading-none text-gray-400 hover:text-gray-600"
                    aria-label="關閉"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-5 px-5 py-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      處理方式
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setInvoiceLinkMode('existing')}
                        className={`rounded border px-3 py-2 text-sm ${invoiceLinkMode === 'existing' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        加到現有發票
                      </button>
                      <button
                        type="button"
                        onClick={() => setInvoiceLinkMode('new')}
                        className={`rounded border px-3 py-2 text-sm ${invoiceLinkMode === 'new' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        生成新發票
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      關聯模式
                    </label>
                    <div className="space-y-2 rounded border border-gray-200 p-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          checked={invoiceLinkType === 'link-only'}
                          onChange={() => setInvoiceLinkType('link-only')}
                        />
                        只關聯
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-400">
                        <input
                          type="radio"
                          disabled
                          checked={invoiceLinkType === 'link-and-calc'}
                          onChange={() => setInvoiceLinkType('link-and-calc')}
                        />
                        關聯並計算價錢（即將推出）
                      </label>
                    </div>
                  </div>

                  {invoiceLinkMode === 'existing' ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        選擇發票
                      </label>
                      <SearchableSelect
                        value={targetInvoiceId}
                        onChange={setTargetInvoiceId}
                        options={invoiceOptions}
                        placeholder="搜尋發票號碼"
                      />
                      {invoiceOptions.length === 0 && (
                        <p className="mt-2 text-xs text-amber-600">
                          目前沒有可選擇的發票，請先建立發票。
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                      會前往發票頁面並帶入所選工作紀錄 ID；Phase 1
                      僅建立關聯，不會自動計算價錢。
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setInvoiceLinkOpen(false)}
                    className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleLinkWorkLogsToInvoice}
                    disabled={
                      invoiceLinkLoading ||
                      (invoiceLinkMode === 'existing' && !targetInvoiceId)
                    }
                    className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {invoiceLinkLoading
                      ? '處理中…'
                      : invoiceLinkMode === 'existing'
                        ? '加入發票'
                        : '生成新發票'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ── Batch Edit Dialog ────────────────────────────────────── */}{' '}
          <BatchEditDialog
            open={batchEditOpen}
            onClose={handleCloseBatchEdit}
            selectedRows={rows.filter((r) => selected.has(r.id))}
            onSuccess={handleBulkUpdateSuccess}
            companies={companies}
            clients={clients}
            quotations={quotations}
            contracts={contracts}
            employees={employees}
            fieldOptions={fieldOptions}
            allEquipment={allEquipment}
          />

          {/* ── Unverified Client Banner ── */}
          {(() => {
            const unverifiedCount = rows.filter(
              (r) => !r.client_id && r.unverified_client_name,
            ).length;
            if (unverifiedCount === 0) return null;
            return (
              <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 shrink-0 flex items-center gap-3">
                <span className="text-amber-600 text-lg">⚠️</span>
                <p className="text-sm text-amber-800 font-medium">
                  有{' '}
                  <span className="font-bold text-amber-900">
                    {unverifiedCount}
                  </span>{' '}
                  筆記錄包含未確認客戶，請盡快處理（已用黃色標示）
                </p>
              </div>
            );
          })()}
          {/* ── WhatsApp New Location Banner ── */}
          {(() => {
            const newLocCount = rows.filter(
              (r) =>
                (r.source === 'whatsapp' || r.source === 'whatsapp_clockin') &&
                r.is_location_new,
            ).length;
            if (newLocCount === 0) return null;
            return (
              <div className="bg-yellow-50 border-b border-yellow-200 px-4 sm:px-6 py-2.5 shrink-0 flex items-center gap-3">
                <span className="text-yellow-600 text-lg">📍</span>
                <p className="text-sm text-yellow-800 font-medium">
                  有{' '}
                  <span className="font-bold text-yellow-900">
                    {newLocCount}
                  </span>{' '}
                  筆 WhatsApp 打卡記錄包含新建地點（黃色標示），請確認或修正
                </p>
              </div>
            );
          })()}
          {/* ── Filters ────────────────────────────────── */}
          {/* 注意：此容器不能有任何 overflow 設定，否則會裁切 MultiSearchableSelect Portal 下拉選單 */}
          <div className="bg-white border-b border-gray-200 shrink-0 overflow-x-auto">
            <div
              className="flex gap-2 items-end px-6 py-3"
              style={{ minWidth: 'max-content' }}
            >
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">發佈人</label>
                <MultiSearchableSelect
                  value={filterPublisher}
                  onChange={(v) => {
                    setFilterPublisher(v);
                    setPage(1);
                  }}
                  options={contextualOptions(
                    users,
                    'publisher',
                    filterPublisher,
                  )}
                  placeholder="全部"
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">狀態</label>
                <MultiSearchableSelect
                  value={filterStatus}
                  onChange={(v) => {
                    setFilterStatus(v);
                    setPage(1);
                  }}
                  options={contextualOptions(
                    STATUS_OPTIONS,
                    'status',
                    filterStatus,
                  )}
                  placeholder="全部"
                  className="w-28"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">公司</label>
                <MultiSearchableSelect
                  value={filterCompany}
                  onChange={(v) => {
                    setFilterCompany(v);
                    setPage(1);
                  }}
                  options={contextualOptions(
                    companies,
                    'company',
                    filterCompany,
                    ['name', 'internal_prefix'],
                  )}
                  placeholder="全部"
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">客戶公司</label>
                <MultiSearchableSelect
                  value={filterClient}
                  onChange={(v) => {
                    setFilterClient(v);
                    setPage(1);
                  }}
                  options={contextualOptions(clients, 'client', filterClient, [
                    'name',
                    'code',
                    'english_code',
                  ])}
                  placeholder="全部"
                  className="w-40"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">報價單</label>
                <MultiSearchableSelect
                  value={filterQuotation}
                  onChange={(v) => {
                    setFilterQuotation(v);
                    setPage(1);
                  }}
                  options={contextualOptions(
                    quotations,
                    'quotation',
                    filterQuotation,
                    ['quotation_no', 'contract_name'],
                  )}
                  placeholder="全部"
                  className="w-36"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">合約</label>
                <MultiSearchableSelect
                  value={filterContract}
                  onChange={(v) => {
                    setFilterContract(v);
                    setPage(1);
                  }}
                  options={contextualOptions(
                    contracts,
                    'contract',
                    filterContract,
                    ['contract_no', 'contract_name'],
                  )}
                  placeholder="全部"
                  className="w-36"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">員工</label>
                <MultiSearchableSelect
                  value={filterEmployee}
                  onChange={(v) => {
                    setFilterEmployee(v);
                    setPage(1);
                  }}
                  options={employees}
                  placeholder="全部"
                  className="w-36"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">機號</label>
                <input
                  type="text"
                  value={filterEquipment}
                  onChange={(e) => {
                    setFilterEquipment(e.target.value);
                    setPage(1);
                  }}
                  placeholder="車牌/機號"
                  className="w-24 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">日期從</label>
                <DateInput
                  value={filterDateFrom}
                  onChange={(val) => {
                    setFilterDateFrom(val || '');
                    setPage(1);
                  }}
                  className="w-32 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500">日期至</label>
                <DateInput
                  value={filterDateTo}
                  onChange={(val) => {
                    setFilterDateTo(val || '');
                    setPage(1);
                  }}
                  className="w-32 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-end gap-1 self-end">
                {MONTH_SHORTCUTS.map((shortcut) => (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={() => applyMonthShortcut(shortcut.monthOffset)}
                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasFilters}
                className="px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed self-end whitespace-nowrap"
              >
                重設篩選
              </button>
            </div>
          </div>
          {/* ── Table ────────────────────────────────────────────────── */}
          {/* flex-1 + min-h-0 讓表格高度由可用視窗空間決定；資料少時保留空白，資料多時只在此區域內滾動。 */}
          <div className="min-h-0 flex-1 overflow-auto bg-white">
            <table
              className="border-collapse text-xs"
              style={{ minWidth: '2800px' }}
            >
              <thead className="sticky top-0 z-20 bg-gray-100 border-b-2 border-gray-300">
                <tr>
                  {/* 行數編號 – sticky left */}
                  <th className="sticky left-0 z-30 bg-gray-100 px-2 py-2 border-r border-gray-300 w-10 text-center font-semibold text-gray-500">
                    #
                  </th>
                  {/* Checkbox – sticky left (after row number) */}
                  <th className="sticky left-10 z-30 bg-gray-100 px-2 py-2 border-r border-gray-300 w-8">
                    <input
                      type="checkbox"
                      checked={
                        rows.some((r) => !isRowLockedByOther(Number(r.id))) &&
                        rows
                          .filter((r) => !isRowLockedByOther(Number(r.id)))
                          .every((r) => selected.has(Number(r.id)))
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="cursor-pointer"
                    />
                  </th>
                  {/* ID – scrollable */}
                  <th className="px-2 py-2 border-r border-gray-300 w-12 text-left font-semibold text-gray-600">
                    ID
                  </th>
                  {/* Visible COLUMNS in user-defined order */}
                  {(visibleColumns as any[]).map((col: any) => {
                    const sortField = COLUMN_SORT_FIELD[col.key];
                    const isActive = sortField && sortBy === sortField;
                    const isFilterable = col.key !== 'attachments';
                    return (
                      <th
                        key={col.key}
                        onClick={
                          sortField
                            ? () =>
                                handleSort(
                                  sortField,
                                  isActive && sortOrder === 'ASC' ? 'DESC' : 'ASC',
                                )
                            : undefined
                        }
                        className={`px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap ${col.width} ${
                          sortField
                            ? 'cursor-pointer select-none hover:bg-gray-200'
                            : ''
                        } ${isActive ? 'bg-blue-50 text-blue-700' : ''}`}
                      >
                        <span className="flex items-center gap-0.5">
                          {col.label}
                          {sortField && (
                            <span
                              className={`ml-0.5 text-[10px] ${isActive ? 'text-blue-600' : 'text-gray-300'}`}
                            >
                              {isActive
                                ? sortOrder === 'ASC'
                                  ? '▲'
                                  : '▼'
                                : '▲▼'}
                            </span>
                          )}
                          {isFilterable && (
                            <ColumnFilter
                              columnKey={col.key}
                              data={rows}
                              activeFilters={activeColumnFilters}
                              onFilterChange={(key, vals) => {
                                if (vals === null) {
                                  const newFilters = { ...columnFilters };
                                  delete newFilters[key];
                                  setColumnFilters(newFilters);
                                } else {
                                  setColumnFilters({
                                    ...columnFilters,
                                    [key]: Array.from(vals instanceof Set ? vals : new Set(vals as any)),
                                  });
                                }
                                setPage(1);
                              }}
                              serverSide={true}
                              optionRender={
                                col.key === 'source'
                                  ? (value) => getSourceDisplay(value)
                                  : undefined
                              }
                              onFetchOptions={async (key) => {
                                const res = await workLogsApi.filterOptions(
                                  key,
                                  buildListParams({}, { skipColumnFilters: true }),
                                );
                                return res.data as string[];
                              }}
                            />
                          )}
                        </span>
                      </th>
                    );
                  })}
                  {/* 操作 – sticky right */}
                  <th className="sticky right-0 z-30 bg-gray-100 px-2 py-2 border-l border-gray-300 w-20 text-left font-semibold text-gray-600">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* New row at top */}
                {newRow && (
                  <tr className="bg-green-50 border-b-2 border-green-300 text-xs">
                    {/* 行數編號 */}
                    <td className="sticky left-0 z-10 bg-green-50 px-2 py-1.5 border-r border-green-200 w-10 text-center text-green-600 font-bold text-xs">
                      ★
                    </td>
                    {/* Checkbox */}
                    <td className="sticky left-10 z-10 bg-green-50 px-2 py-1.5 border-r border-green-200 w-8" />
                    {/* ID */}
                    <td className="px-2 py-1.5 border-r border-green-200 w-12 text-green-600 font-bold">
                      NEW
                    </td>
                    {/* Visible COLUMNS in user-defined order */}
                    {(visibleColumns as any[]).map((col: any) => {
                      const field = colKeyToField[col.key] || col.key;
                      // publisher is readonly
                      if (col.key === 'publisher') {
                        return (
                          <td
                            key={col.key}
                            className={`${col.width} px-2 py-1.5 text-gray-500 text-xs`}
                          >
                            {user?.displayName || user?.username || '—'}
                          </td>
                        );
                      }
                      return (
                        <td key={col.key} className={col.width}>
                          {renderNewCell(field)}
                        </td>
                      );
                    })}
                    {/* Actions */}
                    <td className="sticky right-0 z-10 bg-green-50 px-2 py-1.5 border-l border-green-200 w-20">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={handleSaveNew}
                          disabled={savingNew}
                          className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {savingNew ? '…' : '💾'}
                        </button>
                        <button
                          onClick={() => setNewRow(null)}
                          className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {loading ? (
                  <tr>
                    <td
                      colSpan={(visibleColumns as any[]).length + 3}
                      className="text-center py-12 text-gray-400"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        載入中…
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 && !newRow ? (
                  <tr>
                    <td
                      colSpan={(visibleColumns as any[]).length + 3}
                      className="text-center py-12 text-gray-400"
                    >
                      {hasFilters
                        ? '沒有符合篩選條件的記錄'
                        : '尚無工作記錄，點擊「新增記錄」開始'}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, rowIndex) => {
                    const rowDirty = dirtyRows.has(row.id);
                    const hasUnverifiedClient =
                      !row.client_id && !!row.unverified_client_name;
                    const isRowSelected = selected.has(row.id);
                    const rowLock = getRowLock(row.id);
                    const rowLockedByOther = isRowLockedByOther(row.id);
                    const rowBg = rowLockedByOther
                      ? 'bg-gray-100'
                      : isRowSelected
                        ? 'bg-blue-50'
                        : rowDirty
                          ? 'bg-amber-50'
                          : hasUnverifiedClient
                            ? 'bg-amber-50'
                            : 'bg-white';
                    const rowNum = (page - 1) * limit + rowIndex + 1;

                    return (
                      <>
                        <tr
                          key={row.id}
                          className={`border-b border-gray-100 text-xs ${
                            rowLockedByOther
                              ? 'bg-gray-100 text-gray-500'
                              : isRowSelected
                                ? 'bg-blue-50'
                                : rowDirty
                                  ? 'bg-amber-50'
                                  : hasUnverifiedClient
                                    ? 'bg-amber-50'
                                    : 'hover:bg-blue-100'
                          }`}
                        >
                          {/* 行數編號 - sticky left */}
                          <td
                            className={`sticky left-0 z-10 ${rowBg} px-2 py-0 border-r border-gray-200 w-10 text-center text-gray-400 font-mono select-none`}
                          >
                            {rowNum}
                          </td>
                          {/* Checkbox - sticky */}
                          <td
                            className={`sticky left-10 z-10 ${rowBg} px-2 py-0 border-r border-gray-200 w-8`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(Number(row.id))}
                              disabled={rowLockedByOther}
                              onChange={(e) =>
                                toggleSelect(row, e.target.checked)
                              }
                              className={rowLockedByOther ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                            />
                          </td>
                          {/* ID - scrollable */}
                          <td className="px-2 py-0 border-r border-gray-200 w-20 text-gray-400 font-mono">
                            <div>{row.id}</div>
                            {rowLockedByOther && rowLock && (
                              <div className="mt-0.5 text-[10px] leading-tight text-gray-600 font-sans whitespace-nowrap">
                                鎖定：{rowLock.locked_by.name}
                              </div>
                            )}
                          </td>
                          {/* Visible COLUMNS in user-defined order */}
                          {(visibleColumns as any[]).map((col: any) => {
                            const field = colKeyToField[col.key] || col.key;
                            // publisher is readonly display
                            if (col.key === 'publisher') {
                              return (
                                <td
                                  key={col.key}
                                  className={`${col.width} px-2 py-0 text-gray-600 text-xs`}
                                >
                                  {row.publisher?.displayName ||
                                    row.publisher?.username ||
                                    '—'}
                                </td>
                              );
                            }
                            return (
                              <td key={col.key} className={col.width}>
                                {renderCell(row, field)}
                              </td>
                            );
                          })}
                          {/* 操作 - sticky right */}
                          <td
                            className={`sticky right-0 z-10 ${rowBg} px-1 py-0 border-l border-gray-200 w-28`}
                          >
                            <div className="flex gap-0.5">
                              <button
                                type="button"
                                disabled={!Number.isFinite(Number(row.id))}
                                onClick={() => {
                                  const rowId = Number(row.id);
                                  const scheduledDate = row.scheduled_date
                                    ? fmtDate(row.scheduled_date)
                                    : '';
                                  const workOrderNo = row.work_order_no
                                    ? String(row.work_order_no)
                                    : '';
                                  const titleParts = [
                                    `#${rowId}`,
                                    scheduledDate,
                                    workOrderNo,
                                  ].filter(Boolean);
                                  setAttachmentModalTarget({
                                    id: rowId,
                                    title: `Work Log ${titleParts.join('｜')}`,
                                  });
                                }}
                                className="px-1 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="管理附件"
                              >
                                附件
                              </button>
                              <button
                                onClick={() => handleDuplicate(row.id)}
                                className="px-1 py-0.5 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100"
                                title="複製"
                              >
                                📋
                              </button>
                              <button
                                onClick={() => handleDelete(row.id)}
                                className="px-1 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                                title="刪除"
                              >
                                🗑️
                              </button>
                              {(() => {
                                const confs =
                                  row.verification_confirmations || [];
                                const allConfirmed =
                                  confs.length > 0 &&
                                  confs.every(
                                    (c: any) =>
                                      c.status === 'confirmed' ||
                                      c.status === 'manual_match',
                                  );
                                const hasRejected = confs.some(
                                  (c: any) => c.status === 'rejected',
                                );
                                const hasAny = confs.length > 0;
                                let btnClass = '';
                                let btnTitle = '核對（未審核）';
                                if (openVerifyId === row.id) {
                                  btnClass = 'bg-indigo-600 text-white';
                                } else if (allConfirmed) {
                                  btnClass =
                                    'bg-green-100 text-green-700 hover:bg-green-200';
                                  btnTitle = '核對（全部已確認）';
                                } else if (
                                  hasRejected ||
                                  (hasAny && !allConfirmed)
                                ) {
                                  btnClass =
                                    'bg-amber-100 text-amber-700 hover:bg-amber-200';
                                  btnTitle = '核對（部分審核）';
                                } else {
                                  btnClass =
                                    'bg-indigo-50 text-indigo-600 hover:bg-indigo-100';
                                }
                                return (
                                  <button
                                    onClick={() => handleVerify(row.id)}
                                    className={`px-1 py-0.5 text-xs rounded ${btnClass}`}
                                    title={btnTitle}
                                  >
                                    ✓✓
                                  </button>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                        {/* 核對面板展開行 */}
                        {openVerifyId === row.id &&
                          (() => {
                            const vd = verifyData.get(row.id);
                            const totalCols =
                              (visibleColumns as any[]).length + 3; // 3 = 行號 + checkbox + ID
                            return (
                              <tr
                                key={`verify-${row.id}`}
                                className="bg-indigo-50 border-b border-indigo-200"
                              >
                                <td
                                  colSpan={totalCols + 1}
                                  className="p-0 align-top"
                                >
                                  <div className="sticky left-0 box-border w-[calc(100dvw-2rem)] px-4 py-3 sm:w-[calc(100dvw-3rem)] lg:w-[calc(100dvw-19rem)]">
                                    {vd?.loading && (
                                    <div className="text-xs text-indigo-500 py-1">
                                      核對資料載入中…
                                    </div>
                                  )}
                                  {vd?.error && (
                                    <div className="text-xs text-red-500 py-1">
                                      ✖ {vd.error}
                                    </div>
                                  )}
                                    {vd?.data &&
                                      (() => {
                                        const sources = vd.data.sources || {};
                                      const SOURCE_META: Record<
                                        string,
                                        {
                                          label: string;
                                          icon: string;
                                          color: string;
                                        }
                                      > = {
                                        work_log: {
                                          label: '工作紀錄',
                                          icon: '📝',
                                          color: 'blue',
                                        },
                                        chit: {
                                          label: '入帳票',
                                          icon: '🧾',
                                          color: 'green',
                                        },
                                        delivery_note: {
                                          label: '飛仔 OCR',
                                          icon: '📄',
                                          color: 'purple',
                                        },
                                        gps: {
                                          label: 'GPS 追蹤',
                                          icon: '📍',
                                          color: 'orange',
                                        },
                                        attendance: {
                                          label: '打卡紀錄',
                                          icon: '⏰',
                                          color: 'teal',
                                        },
                                        whatsapp_order: {
                                          label: 'WhatsApp',
                                          icon: '💬',
                                          color: 'emerald',
                                        },
                                      };
                                      const SOURCE_ORDER = [
                                        'whatsapp_order',
                                        'work_log',
                                        'chit',
                                        'delivery_note',
                                        'gps',
                                        'attendance',
                                      ];
                                      return (
                                        <div className="flex flex-wrap gap-3">
                                          {SOURCE_ORDER.map((key) => {
                                            const src = sources[key];
                                            const meta = SOURCE_META[key];
                                            if (!src || !meta) return null;
                                            const found =
                                              src.status === 'found';
                                            const colorMap: Record<
                                              string,
                                              string
                                            > = {
                                              blue: 'border-blue-300 bg-blue-50',
                                              green:
                                                'border-green-300 bg-green-50',
                                              purple:
                                                'border-purple-300 bg-purple-50',
                                              orange:
                                                'border-orange-300 bg-orange-50',
                                              teal: 'border-teal-300 bg-teal-50',
                                              emerald:
                                                'border-emerald-300 bg-emerald-50',
                                            };
                                            const missingColor =
                                              'border-gray-200 bg-gray-50';
                                            const conf = (confirmations.get(
                                              row.id,
                                            ) || {})[key];
                                            const isActionLoading =
                                              confirmActionLoading ===
                                              `${row.id}-${key}`;
                                            const cardBorder = conf
                                              ? conf.status === 'confirmed'
                                                ? 'border-green-400 bg-green-50'
                                                : conf.status === 'rejected'
                                                  ? 'border-red-400 bg-red-50'
                                                  : 'border-purple-400 bg-purple-50'
                                              : found
                                                ? colorMap[meta.color]
                                                : missingColor;
                                            return (
                                              <div
                                                key={key}
                                                className={`rounded-lg border px-3 py-2 min-w-[160px] max-w-[280px] text-xs ${cardBorder}`}
                                              >
                                                {/* 標題 */}
                                                <div className="flex items-center gap-1 mb-1.5">
                                                  <span>{meta.icon}</span>
                                                  <span className="font-semibold text-gray-700">
                                                    {meta.label}
                                                  </span>
                                                  {conf ? (
                                                    <span
                                                      className={`ml-auto text-xs px-1.5 py-0.5 rounded border ${
                                                        conf.status ===
                                                        'confirmed'
                                                          ? 'text-green-600 bg-green-100 border-green-300'
                                                          : conf.status ===
                                                              'rejected'
                                                            ? 'text-red-600 bg-red-100 border-red-300'
                                                            : 'text-purple-600 bg-purple-100 border-purple-300'
                                                      }`}
                                                    >
                                                      {conf.status ===
                                                      'confirmed'
                                                        ? '✅ 已確認'
                                                        : conf.status ===
                                                            'rejected'
                                                          ? '❎ 已拒絕'
                                                          : '🔗 手動配對'}
                                                    </span>
                                                  ) : found ? (
                                                    <span className="ml-auto text-green-600 font-bold">
                                                      ✓
                                                    </span>
                                                  ) : (
                                                    <span className="ml-auto text-gray-400">
                                                      ✕
                                                    </span>
                                                  )}
                                                </div>
                                                {/* 詳情 */}
                                                {found &&
                                                  src.details?.length > 0 &&
                                                  (() => {
                                                    const d = src.details[0];
                                                    if (key === 'work_log')
                                                      return (
                                                        <div className="space-y-0.5 text-gray-600">
                                                          {d.vehicle &&
                                                            d.vehicle !==
                                                              '—' && (
                                                              <div>
                                                                🚗 {d.vehicle}
                                                              </div>
                                                            )}
                                                          {d.employee &&
                                                            d.employee !==
                                                              '—' && (
                                                              <div>
                                                                👤 {d.employee}
                                                              </div>
                                                            )}
                                                          {d.customer &&
                                                            d.customer !==
                                                              '—' && (
                                                              <div>
                                                                🏢 {d.customer}
                                                              </div>
                                                            )}
                                                          {d.contract &&
                                                            d.contract !==
                                                              '—' && (
                                                              <div>
                                                                📄 {d.contract}
                                                              </div>
                                                            )}
                                                          {d.location &&
                                                            d.location !==
                                                              '—' && (
                                                              <div>
                                                                📍 {d.location}
                                                              </div>
                                                            )}
                                                        </div>
                                                      );
                                                    if (key === 'chit') {
                                                      const totalNetWeight =
                                                        src.details.reduce(
                                                          (
                                                            sum: number,
                                                            detail: any,
                                                          ) => {
                                                            const value =
                                                              detail.weight_net;
                                                            if (
                                                              value == null ||
                                                              value === '—'
                                                            )
                                                              return sum;
                                                            const numericValue =
                                                              typeof value ===
                                                              'number'
                                                                ? value
                                                                : parseFloat(
                                                                    String(
                                                                      value,
                                                                    ).replace(
                                                                      /,/g,
                                                                      '',
                                                                    ),
                                                                  );
                                                            return Number.isFinite(
                                                              numericValue,
                                                            )
                                                              ? sum +
                                                                  numericValue
                                                              : sum;
                                                          },
                                                          0,
                                                        );
                                                      return (
                                                        <div className="space-y-1 text-gray-600">
                                                          {d.facility &&
                                                            d.facility !==
                                                              '—' && (
                                                              <div>
                                                                🏭 設施:{' '}
                                                                {d.facility}
                                                              </div>
                                                            )}
                                                          {d.vehicle &&
                                                            d.vehicle !==
                                                              '—' && (
                                                              <div>
                                                                🚗 {d.vehicle}
                                                              </div>
                                                            )}
                                                          {d.account_no &&
                                                            d.account_no !==
                                                              '—' && (
                                                              <div>
                                                                💳 戶口:{' '}
                                                                {d.account_no}
                                                              </div>
                                                            )}
                                                          {/* 支援多票號：逐筆顯示每個配對的入帳票 */}
                                                          {d.chit_nos?.length >
                                                            0 && (
                                                            <div className="space-y-0.5 text-[11px]">
                                                              <div className="font-semibold text-gray-700">
                                                                🧾 配對入帳票:
                                                              </div>
                                                              {d.chit_nos.map(
                                                                (
                                                                  chitNo: string,
                                                                  idx: number,
                                                                ) => (
                                                                  <div
                                                                    key={idx}
                                                                    className="flex items-center gap-1 pl-2"
                                                                  >
                                                                    <span className="text-green-600 font-bold">
                                                                      ✓
                                                                    </span>
                                                                    <span className="font-mono">
                                                                      {chitNo}
                                                                    </span>
                                                                  </div>
                                                                ),
                                                              )}
                                                            </div>
                                                          )}
                                                          {d.weight_net !=
                                                            null &&
                                                            d.weight_net !==
                                                              '—' && (
                                                              <div>
                                                                ⚖️ 净重:{' '}
                                                                {d.weight_net} T
                                                              </div>
                                                            )}
                                                          {src.details.length >
                                                            1 &&
                                                            totalNetWeight >
                                                              0 && (
                                                              <div className="font-semibold text-gray-700">
                                                                總淨重:{' '}
                                                                {totalNetWeight.toLocaleString(
                                                                  'en',
                                                                  {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
                                                                  },
                                                                )}{' '}
                                                                T
                                                              </div>
                                                            )}
                                                          {src.details.length >
                                                            1 && (
                                                            <button
                                                              type="button"
                                                              className="text-blue-500 hover:text-blue-700 underline text-[10px] cursor-pointer"
                                                              onClick={() =>
                                                                setChitDetailsPopup(
                                                                  {
                                                                    workLogId:
                                                                      row.id,
                                                                    sourceKey:
                                                                      key,
                                                                    details:
                                                                      src.details,
                                                                  },
                                                                )
                                                              }
                                                            >
                                                              共{' '}
                                                              {
                                                                src.details
                                                                  .length
                                                              }{' '}
                                                              筆 — 點擊查看詳情
                                                            </button>
                                                          )}
                                                        </div>
                                                      );
                                                    }
                                                    if (key === 'delivery_note')
                                                      return (
                                                        <div className="space-y-0.5 text-gray-600">
                                                          {d.vehicle &&
                                                            d.vehicle !==
                                                              '—' && (
                                                              <div>
                                                                🚗 {d.vehicle}
                                                              </div>
                                                            )}
                                                          {d.employee &&
                                                            d.employee !==
                                                              '—' && (
                                                              <div>
                                                                👤 {d.employee}
                                                              </div>
                                                            )}
                                                          {d.customer &&
                                                            d.customer !==
                                                              '—' && (
                                                              <div>
                                                                🏢 {d.customer}
                                                              </div>
                                                            )}
                                                          {d.location &&
                                                            d.location !==
                                                              '—' && (
                                                              <div>
                                                                📍 {d.location}
                                                              </div>
                                                            )}
                                                          {d.chit_nos?.length >
                                                            0 && (
                                                            <div>
                                                              🧾{' '}
                                                              {d.chit_nos.join(
                                                                ', ',
                                                              )}
                                                            </div>
                                                          )}
                                                        </div>
                                                      );
                                                    if (key === 'gps')
                                                      return (
                                                        <div className="space-y-0.5 text-gray-600">
                                                          {d.vehicle &&
                                                            d.vehicle !==
                                                              '—' && (
                                                              <div>
                                                                🚗 {d.vehicle}
                                                              </div>
                                                            )}
                                                          {d.trip_count !=
                                                            null && (
                                                            <div>
                                                              🔄 行程:{' '}
                                                              {d.trip_count} 次
                                                            </div>
                                                          )}
                                                          {d.distance !=
                                                            null && (
                                                            <div>
                                                              📐 距離:{' '}
                                                              {d.distance} km
                                                            </div>
                                                          )}
                                                          {d.locations &&
                                                            d.locations !==
                                                              '—' &&
                                                            (() => {
                                                              const loc =
                                                                d.locations as string;
                                                              const maxLen = 40;
                                                              if (
                                                                loc.length <=
                                                                maxLen
                                                              )
                                                                return (
                                                                  <div>
                                                                    📍 {loc}
                                                                  </div>
                                                                );
                                                              return (
                                                                <div>
                                                                  <div>
                                                                    📍{' '}
                                                                    {loc.slice(
                                                                      0,
                                                                      maxLen,
                                                                    )}
                                                                    ...
                                                                  </div>
                                                                  <button
                                                                    type="button"
                                                                    className="text-blue-500 hover:text-blue-700 underline text-[10px] cursor-pointer"
                                                                    onClick={() =>
                                                                      setChitDetailsPopup(
                                                                        {
                                                                          workLogId:
                                                                            row.id,
                                                                          sourceKey:
                                                                            key,
                                                                          details:
                                                                            src.details,
                                                                        },
                                                                      )
                                                                    }
                                                                  >
                                                                    更多路線詳情
                                                                  </button>
                                                                </div>
                                                              );
                                                            })()}
                                                        </div>
                                                      );
                                                    if (key === 'attendance') {
                                                      const amd =
                                                        attMatchData.get(
                                                          row.id,
                                                        );
                                                      return (
                                                        <div className="space-y-1 text-gray-600">
                                                          {/* 基本打卡資訊 */}
                                                          {d.employee &&
                                                            d.employee !==
                                                              '—' && (
                                                              <div>
                                                                👤 {d.employee}
                                                              </div>
                                                            )}
                                                          {d.type &&
                                                            d.type !== '—' && (
                                                              <div>
                                                                ⏰ {d.type}
                                                              </div>
                                                            )}
                                                          {d.address &&
                                                            d.address !==
                                                              '—' && (
                                                              <div>
                                                                📍 {d.address}
                                                              </div>
                                                            )}
                                                          {src.details.length >
                                                            1 && (
                                                            <div className="text-gray-400">
                                                              共{' '}
                                                              {
                                                                src.details
                                                                  .length
                                                              }{' '}
                                                              筆
                                                            </div>
                                                          )}
                                                          {/* 增強版打卡配對詳情 */}
                                                          {amd?.data &&
                                                            amd.data
                                                              .matched && (
                                                              <div className="mt-1.5 pt-1.5 border-t border-teal-200 space-y-1">
                                                                {amd.data
                                                                  .clock_in && (
                                                                  <div className="text-teal-700">
                                                                    ⬆ 上班:{' '}
                                                                    {new Date(
                                                                      amd.data
                                                                        .clock_in
                                                                        .time,
                                                                    ).toLocaleTimeString(
                                                                      'zh-HK',
                                                                      {
                                                                        hour: '2-digit',
                                                                        minute:
                                                                          '2-digit',
                                                                      },
                                                                    )}
                                                                  </div>
                                                                )}
                                                                {amd.data
                                                                  .clock_out && (
                                                                  <div className="text-teal-700">
                                                                    ⬇ 下班:{' '}
                                                                    {new Date(
                                                                      amd.data
                                                                        .clock_out
                                                                        .time,
                                                                    ).toLocaleTimeString(
                                                                      'zh-HK',
                                                                      {
                                                                        hour: '2-digit',
                                                                        minute:
                                                                          '2-digit',
                                                                      },
                                                                    )}
                                                                  </div>
                                                                )}
                                                                {amd.data
                                                                  .is_mid_shift && (
                                                                  <div className="text-orange-600">
                                                                    🔄 中直
                                                                  </div>
                                                                )}
                                                                {amd.data
                                                                  .clock_in
                                                                  ?.address && (
                                                                  <div className="text-gray-500">
                                                                    📍{' '}
                                                                    {
                                                                      amd.data
                                                                        .clock_in
                                                                        .address
                                                                    }
                                                                  </div>
                                                                )}
                                                                {/* 逐項核對 */}
                                                                {amd.data
                                                                  .checks &&
                                                                  amd.data
                                                                    .checks
                                                                    .length >
                                                                    0 && (
                                                                    <div className="mt-1 space-y-0.5">
                                                                      <div className="text-[10px] font-semibold text-gray-500 uppercase">
                                                                        核對結果
                                                                      </div>
                                                                      {amd.data.checks.map(
                                                                        (
                                                                          ck: any,
                                                                          ci: number,
                                                                        ) => (
                                                                          <div
                                                                            key={
                                                                              ci
                                                                            }
                                                                            className="flex items-center gap-1"
                                                                          >
                                                                            <span
                                                                              className={`w-4 text-center font-bold ${ck.result === 'O' ? 'text-green-600' : ck.result === 'X' ? 'text-red-600' : 'text-gray-400'}`}
                                                                            >
                                                                              {ck.result ===
                                                                              'O'
                                                                                ? '○'
                                                                                : ck.result ===
                                                                                    'X'
                                                                                  ? '✕'
                                                                                  : '—'}
                                                                            </span>
                                                                            <span className="text-gray-500">
                                                                              {
                                                                                ck.item
                                                                              }
                                                                              :
                                                                            </span>
                                                                            <span
                                                                              className="truncate"
                                                                              title={`工作紀錄: ${ck.work_log_value} / 打卡: ${ck.attendance_value}`}
                                                                            >
                                                                              {
                                                                                ck.attendance_value
                                                                              }
                                                                            </span>
                                                                          </div>
                                                                        ),
                                                                      )}
                                                                    </div>
                                                                  )}
                                                                {/* GPS 位置配對 */}
                                                                {amd.data
                                                                  .location_match &&
                                                                  amd.data
                                                                    .location_match
                                                                    .distance_meters !==
                                                                    null && (
                                                                    <div
                                                                      className={`mt-1 text-[10px] px-1.5 py-0.5 rounded ${amd.data.location_match.is_within_range ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                                                                    >
                                                                      {amd.data
                                                                        .location_match
                                                                        .is_within_range
                                                                        ? '✓'
                                                                        : '✗'}{' '}
                                                                      GPS{' '}
                                                                      {amd.data
                                                                        .location_match
                                                                        .matched_location ||
                                                                        '未知地點'}{' '}
                                                                      (
                                                                      {
                                                                        amd.data
                                                                          .location_match
                                                                          .distance_meters
                                                                      }
                                                                      m)
                                                                    </div>
                                                                  )}
                                                              </div>
                                                            )}
                                                          {amd?.loading && (
                                                            <div className="text-[10px] text-teal-400">
                                                              載入核對詳情…
                                                            </div>
                                                          )}
                                                        </div>
                                                      );
                                                    }
                                                    if (
                                                      key === 'whatsapp_order'
                                                    )
                                                      return (
                                                        <div className="space-y-0.5 text-gray-600">
                                                          {d.vehicle &&
                                                            d.vehicle !==
                                                              '—' && (
                                                              <div>
                                                                🚗 {d.vehicle}
                                                              </div>
                                                            )}
                                                          {d.employee &&
                                                            d.employee !==
                                                              '—' && (
                                                              <div>
                                                                👤 {d.employee}
                                                              </div>
                                                            )}
                                                          {d.customer &&
                                                            d.customer !==
                                                              '—' && (
                                                              <div>
                                                                🏢 {d.customer}
                                                              </div>
                                                            )}
                                                          {d.contract &&
                                                            d.contract !==
                                                              '—' && (
                                                              <div>
                                                                📄 {d.contract}
                                                              </div>
                                                            )}
                                                          {d.location &&
                                                            d.location !==
                                                              '—' && (
                                                              <div>
                                                                📍 {d.location}
                                                              </div>
                                                            )}
                                                          {d.work_desc &&
                                                            d.work_desc !==
                                                              '—' && (
                                                              <div>
                                                                💬 {d.work_desc}
                                                              </div>
                                                            )}
                                                          {src.details.length >
                                                            1 && (
                                                            <div className="text-gray-400">
                                                              共{' '}
                                                              {
                                                                src.details
                                                                  .length
                                                              }{' '}
                                                              筆
                                                            </div>
                                                          )}
                                                        </div>
                                                      );
                                                    return null;
                                                  })()}
                                                {!found && (
                                                  <div className="space-y-2">
                                                    {key === 'attendance' ? (
                                                      <>
                                                        <div className="text-amber-600 text-xs font-medium">
                                                          ⚠ 未找到打卡記錄
                                                        </div>
                                                        {row.employee_id &&
                                                          (!conf ||
                                                            conf.status ===
                                                              'rejected') && (
                                                            <button
                                                              onClick={async (
                                                                e,
                                                              ) => {
                                                                e.stopPropagation();
                                                                const dateStr =
                                                                  row.scheduled_date
                                                                    ? new Date(
                                                                        row.scheduled_date,
                                                                      )
                                                                        .toISOString()
                                                                        .slice(
                                                                          0,
                                                                          10,
                                                                        )
                                                                    : new Date()
                                                                        .toISOString()
                                                                        .slice(
                                                                          0,
                                                                          10,
                                                                        );
                                                                setAttManualPicker(
                                                                  {
                                                                    workLogId:
                                                                      row.id,
                                                                    employeeId:
                                                                      row.employee_id,
                                                                    date: dateStr,
                                                                  },
                                                                );
                                                                setAttManualLoading(
                                                                  true,
                                                                );
                                                                try {
                                                                  const {
                                                                    attendancesApi,
                                                                  } =
                                                                    await import('@/lib/api');
                                                                  const res =
                                                                    await attendancesApi.employeeDay(
                                                                      row.employee_id,
                                                                      dateStr,
                                                                    );
                                                                  setAttManualResults(
                                                                    res.data ||
                                                                      [],
                                                                  );
                                                                } catch {
                                                                  setAttManualResults(
                                                                    [],
                                                                  );
                                                                } finally {
                                                                  setAttManualLoading(
                                                                    false,
                                                                  );
                                                                }
                                                              }}
                                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700 border border-teal-300 hover:bg-teal-200"
                                                            >
                                                              🔍
                                                              查看該員工當天打卡記錄
                                                            </button>
                                                          )}
                                                      </>
                                                    ) : (
                                                      <>
                                                        <div className="text-gray-400 text-xs">
                                                          未找到對應資料
                                                        </div>
                                                        {key !== 'work_log' &&
                                                          (!conf ||
                                                            conf.status ===
                                                              'rejected') && (
                                                            <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                const dateStr =
                                                                  row.scheduled_date
                                                                    ? new Date(
                                                                        row.scheduled_date,
                                                                      )
                                                                        .toISOString()
                                                                        .slice(
                                                                          0,
                                                                          10,
                                                                        )
                                                                    : new Date()
                                                                        .toISOString()
                                                                        .slice(
                                                                          0,
                                                                          10,
                                                                        );
                                                                openManualMatchPopup(
                                                                  row.id,
                                                                  dateStr,
                                                                  key,
                                                                );
                                                              }}
                                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200"
                                                            >
                                                              🔗 手動配對
                                                            </button>
                                                          )}
                                                      </>
                                                    )}
                                                  </div>
                                                )}
                                                {/* 確認/拒絕按鈕 */}
                                                {key !== 'work_log' &&
                                                  found && (
                                                    <div className="mt-2 pt-2 border-t flex items-center gap-2">
                                                      {!conf ? (
                                                        <>
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleConfirmSource(
                                                                row.id,
                                                                key,
                                                                'confirmed',
                                                              );
                                                            }}
                                                            disabled={
                                                              isActionLoading
                                                            }
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-300 hover:bg-green-200 disabled:opacity-50"
                                                          >
                                                            ✅ 確認
                                                          </button>
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleConfirmSource(
                                                                row.id,
                                                                key,
                                                                'rejected',
                                                              );
                                                            }}
                                                            disabled={
                                                              isActionLoading
                                                            }
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 disabled:opacity-50"
                                                          >
                                                            ❎ 拒絕
                                                          </button>
                                                        </>
                                                      ) : (
                                                        <>
                                                          {/* 已拒絕時顯示手動配對按鈕，讓用戶可選擇其他記錄 */}
                                                          {conf.status ===
                                                            'rejected' && (
                                                            <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                const dateStr =
                                                                  row.scheduled_date
                                                                    ? new Date(
                                                                        row.scheduled_date,
                                                                      )
                                                                        .toISOString()
                                                                        .slice(
                                                                          0,
                                                                          10,
                                                                        )
                                                                    : new Date()
                                                                        .toISOString()
                                                                        .slice(
                                                                          0,
                                                                          10,
                                                                        );
                                                                openManualMatchPopup(
                                                                  row.id,
                                                                  dateStr,
                                                                  key,
                                                                );
                                                              }}
                                                              disabled={
                                                                isActionLoading
                                                              }
                                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200 disabled:opacity-50"
                                                            >
                                                              🔗 手動配對
                                                            </button>
                                                          )}
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleResetConfirmation(
                                                                row.id,
                                                                key,
                                                              );
                                                            }}
                                                            disabled={
                                                              isActionLoading
                                                            }
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200 disabled:opacity-50"
                                                          >
                                                            ↩ 重置
                                                          </button>
                                                        </>
                                                      )}
                                                      {isActionLoading && (
                                                        <span className="text-gray-400">
                                                          處理中...
                                                        </span>
                                                      )}
                                                    </div>
                                                  )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                      })()}
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* ── Bottom bar: Save + Pagination ────────────────────── */}
          <div className="sticky bottom-0 z-20 bg-white border-t border-gray-200 shrink-0 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
            {/* 手機版：單行精簡分頁欄 */}
            <div className="flex sm:hidden items-center justify-between gap-1 px-3 py-2 overflow-hidden">
              <div className="flex items-center gap-1 shrink-0">
                {hasDirty && (
                  <button
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded disabled:opacity-50 font-medium whitespace-nowrap"
                  >
                    {saving ? '儲存中…' : `💾 ${dirtyRows.size}`}
                  </button>
                )}
                <select
                  value={limit}
                  onChange={(e) => changeLimit(Number(e.target.value))}
                  className="px-1 py-1 text-xs border border-gray-300 rounded w-16"
                >
                  {LIMIT_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}筆
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => changePage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40"
                >
                  «
                </button>
                <button
                  onClick={() => changePage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40"
                >
                  ‹
                </button>
                {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 3) p = i + 1;
                  else if (page <= 2) p = i + 1;
                  else if (page >= totalPages - 1) p = totalPages - 2 + i;
                  else p = page - 1 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => changePage(p)}
                      className={`px-2 py-1 text-xs border rounded ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => changePage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40"
                >
                  ›
                </button>
                <button
                  onClick={() => changePage(totalPages)}
                  disabled={page >= totalPages}
                  className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40"
                >
                  »
                </button>
              </div>
              <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                {page}/{totalPages}
              </span>
            </div>
            {/* 桌面版：完整分頁欄 */}
            <div className="hidden sm:flex items-center justify-between px-6 py-3">
              <div className="flex items-center gap-3">
                {hasDirty && (
                  <button
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium"
                  >
                    {saving ? '儲存中…' : `💾 儲存 ${dirtyRows.size} 筆修改`}
                  </button>
                )}
                <span className="text-sm text-gray-600">每頁顯示</span>
                <select
                  value={limit}
                  onChange={(e) => changeLimit(Number(e.target.value))}
                  className="px-2 py-1 text-sm border border-gray-300 rounded"
                >
                  {LIMIT_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {l} 筆
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-500">
                  第 {Math.min((page - 1) * limit + 1, total)}–
                  {Math.min(page * limit, total)} 筆，共 {total} 筆
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => changePage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  «
                </button>
                <button
                  onClick={() => changePage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  ‹ 上一頁
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => changePage(p)}
                      className={`px-3 py-1 text-sm border rounded ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => changePage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  下一頁 ›
                </button>
                <button
                  onClick={() => changePage(totalPages)}
                  disabled={page >= totalPages}
                  className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  »
                </button>
              </div>
            </div>
          </div>{' '}
          {/* ── Attendance Manual Picker Popup ──────────────────────────────── */}
          {attManualPicker && (
            <div
              className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
              onClick={() => setAttManualPicker(null)}
            >
              <div
                className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between rounded-t-xl">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      ⏰ 員工當天打卡記錄
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      日期: {attManualPicker.date}，工作紀錄 #
                      {attManualPicker.workLogId}
                    </p>
                  </div>
                  <button
                    onClick={() => setAttManualPicker(null)}
                    className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                  {attManualLoading && (
                    <div className="text-center text-gray-400 py-8 text-sm">
                      載入中...
                    </div>
                  )}
                  {!attManualLoading && attManualResults.length === 0 && (
                    <div className="text-center text-gray-400 py-8 text-sm">
                      該員工當天沒有任何打卡記錄
                    </div>
                  )}
                  {!attManualLoading &&
                    attManualResults.map((att: any) => (
                      <div
                        key={att.id}
                        className="rounded-lg border border-gray-200 p-3 text-sm hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                att.type === 'clock_in'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {att.type === 'clock_in' ? '上班' : '下班'}
                            </span>
                            <span className="text-gray-700 font-medium">
                              {new Date(att.timestamp).toLocaleTimeString(
                                'zh-HK',
                                { hour: '2-digit', minute: '2-digit' },
                              )}
                            </span>
                          </div>
                          <span className="text-gray-400 text-xs">
                            #{att.id}
                          </span>
                        </div>
                        {att.address && (
                          <div className="text-gray-500 text-xs mt-1">
                            📍 {att.address}
                          </div>
                        )}
                        {att.is_mid_shift && (
                          <div className="text-orange-600 text-xs mt-0.5">
                            🔄 中直
                          </div>
                        )}
                        {att.employee?.name_zh && (
                          <div className="text-gray-500 text-xs mt-0.5">
                            👤 {att.employee.name_zh}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
                <div className="border-t border-gray-200 px-5 py-3 flex justify-end bg-gray-50 rounded-b-xl">
                  <button
                    onClick={() => setAttManualPicker(null)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100"
                  >
                    關閉
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ── Manual Match Popup ────────────────────────────────────────── */}
          {manualMatchPopup && (
            <div
              className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
              onClick={() => setManualMatchPopup(null)}
            >
              <div
                className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between rounded-t-xl">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      🔗 手動配對{' '}
                      {(() => {
                        const m: Record<string, string> = {
                          whatsapp_order: 'WhatsApp Order',
                          chit: '入帳票',
                          delivery_note: '飛仔 OCR',
                          gps: 'GPS 追蹤',
                          attendance: '打卡紀錄',
                        };
                        return (
                          m[manualMatchPopup.sourceCode] ||
                          manualMatchPopup.sourceCode
                        );
                      })()}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      日期: {manualMatchPopup.workLogDate}，工作紀錄 #
                      {manualMatchPopup.workLogId}
                    </p>
                  </div>
                  <button
                    onClick={() => setManualMatchPopup(null)}
                    className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>

                {/* Search bar */}
                <div className="px-5 py-3 border-b border-gray-100">
                  <input
                    type="text"
                    value={manualMatchSearch}
                    onChange={(e) => handleManualMatchSearch(e.target.value)}
                    placeholder="搜尋車牌、司機、客戶、合約號碼..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    autoFocus
                  />
                </div>

                {/* Results list */}
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                  {manualMatchLoading && (
                    <div className="text-center text-gray-400 py-8 text-sm">
                      載入中...
                    </div>
                  )}
                  {!manualMatchLoading && manualMatchResults.length === 0 && (
                    <div className="text-center text-gray-400 py-8 text-sm">
                      沒有找到對應的
                      {(() => {
                        const m: Record<string, string> = {
                          whatsapp_order: ' WhatsApp Order',
                          chit: '入帳票記錄',
                          delivery_note: '飛仔記錄',
                          gps: ' GPS 記錄',
                          attendance: '打卡記錄',
                        };
                        return m[manualMatchPopup.sourceCode] || '記錄';
                      })()}
                    </div>
                  )}
                  {!manualMatchLoading &&
                    manualMatchResults.map((item: any) => {
                      const sc = manualMatchPopup.sourceCode;
                      const isMultiSelect = isManualMatchMultiSelectSource(sc);
                      const isSelected = manualMatchSelected.some(
                        (selectedItem) => selectedItem.id === item.id,
                      );
                      return (
                        <div
                          key={item.id}
                          onClick={() =>
                            setManualMatchSelected((prev) => {
                              const selected = prev.some(
                                (selectedItem) => selectedItem.id === item.id,
                              );
                              if (isMultiSelect) {
                                return selected
                                  ? prev.filter(
                                      (selectedItem) =>
                                        selectedItem.id !== item.id,
                                    )
                                  : [...prev, item];
                              }
                              return selected ? [] : [item];
                            })
                          }
                          className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              {isMultiSelect && (
                                <span
                                  className="text-indigo-600 font-semibold text-lg leading-5 mt-0.5 w-5 shrink-0"
                                  aria-hidden="true"
                                >
                                  {isSelected ? '☑' : '☐'}
                                </span>
                              )}
                              <div className="flex-1 min-w-0 space-y-0.5">
                                {sc === 'whatsapp_order' ? (
                                  /* ── WhatsApp Order 格式 ── */
                                  <>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {item.wa_item_vehicle_no ||
                                      item.wa_item_machine_code ? (
                                        <span className="font-mono font-semibold text-gray-800">
                                          {item.wa_item_vehicle_no ||
                                            item.wa_item_machine_code}
                                        </span>
                                      ) : item.wa_item_driver_nickname ? (
                                        <span className="font-semibold text-gray-800">
                                          👤 {item.wa_item_driver_nickname}
                                        </span>
                                      ) : null}
                                      {item.wa_item_order_type && (
                                        <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                                          {item.wa_item_order_type}
                                        </span>
                                      )}
                                      {item.order?.wa_order_version && (
                                        <span className="text-xs text-gray-400">
                                          v{item.order.wa_order_version}
                                        </span>
                                      )}
                                    </div>
                                    {(item.wa_item_vehicle_no ||
                                      item.wa_item_machine_code) &&
                                      item.wa_item_driver_nickname && (
                                        <div className="text-gray-600">
                                          👤 {item.wa_item_driver_nickname}
                                        </div>
                                      )}
                                    {item.wa_item_order_type === 'manpower' &&
                                      item.wa_item_remarks &&
                                      (() => {
                                        const staffMatch =
                                          item.wa_item_remarks.match(
                                            /\[staff\]員工: (.+)/,
                                          );
                                        if (!staffMatch) return null;
                                        return (
                                          <div className="text-gray-600 text-xs">
                                            👥 {staffMatch[1]}
                                          </div>
                                        );
                                      })()}
                                    {item.wa_item_customer && (
                                      <div className="text-gray-600">
                                        🏢 {item.wa_item_customer}
                                      </div>
                                    )}
                                    {item.wa_item_contract_no && (
                                      <div className="text-gray-500 text-xs">
                                        📄 {item.wa_item_contract_no}
                                      </div>
                                    )}
                                    {item.wa_item_location && (
                                      <div className="text-gray-500 text-xs">
                                        📍 {item.wa_item_location}
                                      </div>
                                    )}
                                    {item.wa_item_work_desc && (
                                      <div className="text-gray-500 text-xs">
                                        💬 {item.wa_item_work_desc}
                                      </div>
                                    )}
                                  </>
                                ) : sc === 'chit' || sc === 'delivery_note' ? (
                                  /* ── 入帳票 / 飛仔 OCR 格式（verification_records） ── */
                                  <>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {item.record_vehicle_no && (
                                        <span className="font-mono font-semibold text-gray-800">
                                          {item.record_vehicle_no}
                                        </span>
                                      )}
                                      {item.record_slip_no && (
                                        <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                                          #{item.record_slip_no}
                                        </span>
                                      )}
                                    </div>
                                    {item.record_driver_name && (
                                      <div className="text-gray-600">
                                        👤 {item.record_driver_name}
                                      </div>
                                    )}
                                    {item.record_customer && (
                                      <div className="text-gray-600">
                                        🏢 {item.record_customer}
                                      </div>
                                    )}
                                    {(item.record_origin ||
                                      item.record_destination) && (
                                      <div className="text-gray-500 text-xs">
                                        📍 {item.record_origin || ''}
                                        {item.record_origin &&
                                        item.record_destination
                                          ? ' → '
                                          : ''}
                                        {item.record_destination || ''}
                                      </div>
                                    )}
                                    {(item.record_raw_data?.facility || item.record_raw_data?.account_no) && (
                                      <div className="flex items-center gap-3 flex-wrap text-gray-500 text-xs">
                                        {item.record_raw_data?.facility && (
                                          <span>🏗 {item.record_raw_data.facility}</span>
                                        )}
                                        {item.record_raw_data?.account_no && (
                                          <span>🚛 戶口: {item.record_raw_data.account_no}</span>
                                        )}
                                      </div>
                                    )}
                                    {(item.record_work_date || item.record_time_in) && (
                                      <div className="text-gray-500 text-xs">
                                        🕐 {(() => {
                                          const recDate = item.record_work_date ? new Date(item.record_work_date).toISOString().slice(0, 10) : '';
                                          const formatT = (iso: string | null) => {
                                            if (!iso) return '';
                                            const d = new Date(iso);
                                            return isNaN(d.getTime()) ? iso : d.toISOString().slice(11, 16);
                                          };
                                          const tIn = formatT(item.record_time_in);
                                          const tOut = formatT(item.record_time_out);
                                          const tRange = tIn ? (tOut ? `${tIn} - ${tOut}` : tIn) : '';
                                          return [recDate, tRange].filter(Boolean).join(' ');
                                        })()}
                                      </div>
                                    )}
                                    {item.record_weight_net != null && (
                                      <div className="text-gray-500 text-xs">
                                        ⚖️ {item.record_weight_net}t
                                      </div>
                                    )}
                                    {item.chits && item.chits.length > 0 && (
                                      <div className="text-gray-500 text-xs">
                                        🧾{' '}
                                        {item.chits
                                          .map((c: any) => c.chit_no)
                                          .join(', ')}
                                      </div>
                                    )}
                                  </>
                                ) : sc === 'gps' ? (
                                  /* ── GPS 格式 ── */
                                  <>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {item.gps_summary_vehicle_no && (
                                        <span className="font-mono font-semibold text-gray-800">
                                          {item.gps_summary_vehicle_no}
                                        </span>
                                      )}
                                    </div>
                                    {item.gps_summary_first_location && (
                                      <div className="text-gray-500 text-xs">
                                        📍 {item.gps_summary_first_location}
                                      </div>
                                    )}
                                  </>
                                ) : sc === 'attendance' ? (
                                  /* ── 打卡紀錄格式 ── */
                                  <>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {item.employee?.name_zh && (
                                        <span className="font-semibold text-gray-800">
                                          👤 {item.employee.name_zh}
                                        </span>
                                      )}
                                      {item.employee?.nickname && (
                                        <span className="text-gray-500 text-xs">
                                          ({item.employee.nickname})
                                        </span>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  /* ── 其他來源 fallback ── */
                                  <div className="text-gray-600">
                                    #{item.id}
                                  </div>
                                )}
                              </div>
                            </div>
                            {!isMultiSelect && isSelected && (
                              <span className="text-indigo-600 font-bold text-lg">
                                ✓
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between bg-gray-50 rounded-b-xl">
                  <div className="text-xs text-gray-500">
                    {manualMatchSelected.length > 0
                      ? isManualMatchMultiSelectSource(
                          manualMatchPopup.sourceCode,
                        )
                        ? `已選擇 ${manualMatchSelected.length} 筆記錄`
                        : `已選擇: ${getManualMatchItemLabel(manualMatchPopup.sourceCode, manualMatchSelected[0])}`
                      : '請選擇一筆記錄來配對'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setManualMatchPopup(null)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleManualMatchConfirm}
                      disabled={
                        manualMatchSelected.length === 0 || manualMatchLoading
                      }
                      className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                    >
                      {manualMatchLoading ? '處理中...' : '確認配對'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* ── Work Log Attachment Manager Modal ───────────────────────────── */}
          <Modal
            isOpen={attachmentModalTarget !== null}
            onClose={() => setAttachmentModalTarget(null)}
            title={attachmentModalTarget ? `Work Log 附件｜${attachmentModalTarget.title}` : 'Work Log 附件'}
            size="xl"
          >
            {attachmentModalTarget && (
              <AttachmentUpload
                entityType="work_log"
                entityId={attachmentModalTarget.id}
                title="附件列表"
                readOnly={isReadOnly('work-logs')}
              />
            )}
          </Modal>
          {/* ── Toast 通知 ──────────────────────────────────────── */}
          {toasts.length > 0 && (
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right ${
                    t.type === 'error'
                      ? 'bg-red-600 text-white'
                      : t.type === 'success'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-white'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {t.type === 'error'
                      ? '⚠️'
                      : t.type === 'success'
                        ? '✅'
                        : 'ℹ️'}
                  </span>
                  <span className="flex-1">{t.message}</span>
                  <button
                    onClick={() =>
                      setToasts((prev) => prev.filter((x) => x.id !== t.id))
                    }
                    className="shrink-0 opacity-70 hover:opacity-100 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* End of records tab */}
        </div>
      )}

      {/* 詳情 Popup - 入帳票多筆詳情 / GPS 路線詳情 */}
      {chitDetailsPopup && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
          onClick={() => setChitDetailsPopup(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">
                {chitDetailsPopup.sourceKey === 'chit'
                  ? '🧾 入帳票配對詳情'
                  : chitDetailsPopup.sourceKey === 'gps'
                    ? '📍 GPS 路線詳情'
                    : '📝 配對詳情'}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  (共 {chitDetailsPopup.details.length} 筆)
                </span>
              </h3>
              <button
                onClick={() => setChitDetailsPopup(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              {chitDetailsPopup.sourceKey === 'chit' &&
                chitDetailsPopup.details.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-lg p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      {item.date && item.date !== '—' && (
                        <span>📅 {item.date}</span>
                      )}
                      {item.vehicle && item.vehicle !== '—' && (
                        <span>🚗 {item.vehicle}</span>
                      )}
                      {item.facility && item.facility !== '—' && (
                        <span>🏭 {item.facility}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {item.account_no && item.account_no !== '—' && (
                        <span>💳 戶口: {item.account_no}</span>
                      )}
                      {item.weight_net != null && item.weight_net !== '—' && (
                        <span>⚖️ 净重: {item.weight_net} T</span>
                      )}
                    </div>
                    {item.chit_nos?.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-semibold">🧾 入帳票:</span>
                        {item.chit_nos.map((no: string, i: number) => (
                          <span
                            key={i}
                            className="bg-green-50 border border-green-200 rounded px-1.5 py-0.5 font-mono text-green-700"
                          >
                            {no}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              {chitDetailsPopup.sourceKey === 'gps' &&
                chitDetailsPopup.details.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-lg p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center gap-3">
                      {item.vehicle && item.vehicle !== '—' && (
                        <span>🚗 {item.vehicle}</span>
                      )}
                      {item.trip_count != null && (
                        <span>🔄 行程: {item.trip_count} 次</span>
                      )}
                      {item.distance != null && (
                        <span>📐 {item.distance} km</span>
                      )}
                    </div>
                    {item.locations && item.locations !== '—' && (
                      <div className="text-gray-600 break-all">
                        📍 {item.locations}
                      </div>
                    )}
                  </div>
                ))}
              {chitDetailsPopup.sourceKey !== 'chit' &&
                chitDetailsPopup.sourceKey !== 'gps' &&
                chitDetailsPopup.details.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-lg p-3 text-xs"
                  >
                    <pre className="whitespace-pre-wrap text-gray-600">
                      {JSON.stringify(item, null, 2)}
                    </pre>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
