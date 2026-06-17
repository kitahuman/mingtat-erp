'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  companiesApi,
  contractsApi,
  employeesApi,
  fieldOptionsApi,
  invoicesApi,
  machineryApi,
  partnersApi,
  quotationsApi,
  subconFleetDriversApi,
  usersApi,
  vehiclesApi,
} from '@/lib/api';
import ColumnFilter from '@/components/ColumnFilter';
import ColumnCustomizer from '@/components/ColumnCustomizer';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { fmtDate } from '@/lib/dateUtils';
import EditableCell from '../../../work-logs/EditableCell';
import { STATUS_OPTIONS, getStatusLabel } from '../../../work-logs/constants';

interface Option { value: string | number; label: string; _raw?: any; shortLabel?: string; }
type SortOrder = 'ASC' | 'DESC';

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
  }).formatToParts(d).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

const COLUMNS = [
  { key: 'publisher',        label: '發佈人',    width: 'w-24' },
  { key: 'status',           label: '狀態',      width: 'w-20' },
  { key: 'scheduled_date',   label: '約定日期',  width: 'w-28' },
  { key: 'wl_whatsapp_reported_at', label: '報工時間', width: 'w-32' },
  { key: 'service_type',     label: '服務類型',  width: 'w-28' },
  { key: 'work_content',     label: '工作內容',  width: 'w-40' },
  { key: 'company',          label: '公司',      width: 'w-24' },
  { key: 'client',           label: '客戶公司',  width: 'w-28' },
  { key: 'quotation',        label: '報價單',    width: 'w-32' },
  { key: 'client_contract_no', label: '客戶合約', width: 'w-32' },
  { key: 'contract',         label: '合約',      width: 'w-32' },
  { key: 'employee',         label: '員工',      width: 'w-24' },
  { key: 'tonnage',          label: '噸數',      width: 'w-16' },
  { key: 'machine_type',     label: '機種',      width: 'w-24' },
  { key: 'equipment_number', label: '機號',      width: 'w-28' },
  { key: 'day_night',        label: '日夜班',    width: 'w-14' },
  { key: 'start_location',   label: '起點',      width: 'w-40' },
  { key: 'start_time',       label: '起點時間',  width: 'w-24' },
  { key: 'end_location',     label: '終點',      width: 'w-40' },
  { key: 'end_time',         label: '終點時間',  width: 'w-24' },
  { key: 'work_order_no',    label: '單號',      width: 'w-36' },
  { key: 'receipt_no',       label: '入帳票編號', width: 'w-36' },
  { key: 'quantity',         label: '數量',      width: 'w-20' },
  { key: 'unit',             label: '工資單位',  width: 'w-16' },
  { key: 'ot_quantity',      label: 'OT數量',    width: 'w-24' },
  { key: 'ot_unit',          label: 'OT單位',    width: 'w-16' },
  { key: 'is_mid_shift',     label: '中直',      width: 'w-16' },
  { key: 'goods_quantity',   label: '商品數量',  width: 'w-24' },
  { key: 'work_log_product_name', label: '商品名稱', width: 'w-28' },
  { key: 'work_log_product_unit', label: '商品單位', width: 'w-20' },
  { key: 'is_confirmed',     label: '已確認',    width: 'w-20' },
  { key: 'is_paid',          label: '已付款',    width: 'w-20' },
  { key: 'source',           label: '來源',      width: 'w-16' },
  { key: 'remarks',          label: '備註',      width: 'w-36' },
  { key: 'attachments',      label: '附件',      width: 'w-16' },
];

const colKeyToField: Record<string, string> = {
  company: 'company_id',
  client: 'client_id',
  quotation: 'quotation_id',
  contract: 'contract_id',
  employee: 'employee_id',
  publisher: 'publisher_id',
  work_content: 'work_content',
};

const normalizeDateValue = (value: any): any => {
  if (!value) return value ?? null;
  return typeof value === 'string' ? value.split('T')[0] : value;
};

const normalizeComparable = (value: any): any => {
  if (value === undefined || value === '') return null;
  return value;
};

export default function InvoicePreparePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = Number(id);

  const [invoice, setInvoice] = useState<any>(null);
  const [baseRows, setBaseRows] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Map<number, Record<string, any>>>(new Map());
  const [savedDraftIds, setSavedDraftIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sortBy, setSortBy] = useState('scheduled_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const toastIdRef = useRef(0);

  const [companies, setCompanies] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [contracts, setContracts] = useState<Option[]>([]);
  const [quotations, setQuotations] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [fieldOptions, setFieldOptions] = useState<Record<string, Option[]>>({});
  const [allEquipment, setAllEquipment] = useState<Option[]>([]);

  const {
    columnConfigs,
    visibleColumns,
    handleColumnConfigChange,
    handleReset,
    handleSavePersonal,
    handleSaveDefault,
  } = useColumnConfig('invoice-prepare-work-logs', COLUMNS.map(c => ({ key: c.key, label: c.label })));

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const toastId = ++toastIdRef.current;
    setToasts(prev => [...prev, { id: toastId, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 4000);
  }, []);

  const loadReferenceData = useCallback(async () => {
    const [cp, pt, ct, qo, em, us, fo, veh, mach, subconFleet, fleetDrivers] = await Promise.all([
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
    ]);

    setCompanies((cp.data || []).map((c: any) => ({
      value: c.id,
      label: c.internal_prefix ? `${c.internal_prefix} ${c.name}` : c.name,
      _raw: c,
      shortLabel: c.internal_prefix || c.name,
    })));
    setClients((pt.data || []).map((p: any) => ({ value: p.id, label: p.name, _raw: p, shortLabel: p.code || p.name })));
    setContracts((ct.data || []).map((c: any) => ({ value: c.id, label: c.contract_no + (c.contract_name ? ' ' + c.contract_name : ''), _raw: c })));
    const qoData = qo.data?.data || qo.data || [];
    setQuotations(qoData.map((q: any) => ({ value: q.id, label: q.quotation_no + (q.contract_name ? ' ' + q.contract_name : ''), _raw: q })));
    const employeeList = (em.data?.data || []).map((e: any) => ({ value: `emp_${e.id}`, label: e.name_zh, _raw: e }));
    const fleetDriverList = (fleetDrivers.data || []).map((d: any) => ({ value: d.value, label: d.label, _raw: d }));
    setEmployees([...employeeList, ...fleetDriverList]);
    setUsers((us.data?.data || us.data || []).map((u: any) => ({ value: u.id, label: u.displayName || u.username })));
    const grouped: Record<string, Option[]> = {};
    for (const [cat, opts] of Object.entries(fo.data || {})) {
      grouped[cat] = (opts as any[]).map((o: any) => ({ value: o.label, label: o.label }));
    }
    setFieldOptions(grouped);
    setAllEquipment([...(veh.data || []), ...(mach.data || []), ...(subconFleet.data || [])]);
  }, []);

  const loadPrepare = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicesApi.getPrepare(invoiceId);
      const data = res.data || {};
      setInvoice(data.invoice || null);
      setBaseRows(data.work_logs || []);
      const nextDrafts = new Map<number, Record<string, any>>();
      const nextSavedIds = new Set<number>();
      for (const draft of data.drafts || []) {
        const workLogId = Number(draft.work_log_id);
        nextSavedIds.add(workLogId);
        if (draft.draft_data && Object.keys(draft.draft_data).length > 0) {
          nextDrafts.set(workLogId, { ...draft.draft_data });
        }
      }
      setDrafts(nextDrafts);
      setSavedDraftIds(nextSavedIds);
    } catch (err: any) {
      showToast(err.response?.data?.message || '載入整理視窗失敗', 'error');
      router.push(`/invoices/${invoiceId}`);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, router, showToast]);

  useEffect(() => {
    void loadReferenceData();
    void loadPrepare();
  }, [loadReferenceData, loadPrepare]);

  const rows = useMemo(() => {
    return baseRows.map(row => ({ ...row, ...(drafts.get(row.id) || {}) }));
  }, [baseRows, drafts]);

  const findBaseRow = useCallback((rowId: number) => baseRows.find(row => row.id === rowId), [baseRows]);

  const getBaseCellValue = useCallback((row: any, field: string): any => {
    if (field === 'employee_id') {
      if (row.work_log_fleet_driver_id) return `fleet_${row.work_log_fleet_driver_id}`;
      if (row.employee_id) return `emp_${row.employee_id}`;
      return null;
    }
    if (field === 'scheduled_date') return normalizeDateValue(row.scheduled_date);
    return normalizeComparable(row[field]);
  }, []);

  const getCellValue = useCallback((row: any, field: string): any => {
    const draft = drafts.get(row.id);
    if (draft && field in draft) return draft[field];
    if (field === 'employee_id') {
      if (draft && 'work_log_fleet_driver_id' in draft && draft.work_log_fleet_driver_id) return `fleet_${draft.work_log_fleet_driver_id}`;
      if (draft && 'employee_id' in draft && draft.employee_id) return `emp_${draft.employee_id}`;
      if (row.work_log_fleet_driver_id) return `fleet_${row.work_log_fleet_driver_id}`;
      if (row.employee_id) return `emp_${row.employee_id}`;
      return null;
    }
    if (field === 'scheduled_date') return normalizeDateValue(row.scheduled_date);
    return normalizeComparable(row[field]);
  }, [drafts]);

  const isCellDirty = useCallback((rowId: number, field: string): boolean => {
    const draft = drafts.get(rowId);
    if (!draft) return false;
    if (field === 'employee_id') return 'employee_id' in draft || 'work_log_fleet_driver_id' in draft;
    return field in draft;
  }, [drafts]);

  const setDraftField = useCallback((rowId: number, field: string, value: any) => {
    const baseRow = findBaseRow(rowId);
    if (!baseRow) return;

    setDrafts(prev => {
      const next = new Map(prev);
      const draft = { ...(next.get(rowId) || {}) };

      const applyField = (fieldName: string, nextValue: any) => {
        const normalizedNext = normalizeComparable(fieldName === 'scheduled_date' ? normalizeDateValue(nextValue) : nextValue);
        const original = getBaseCellValue(baseRow, fieldName);
        if (String(normalizedNext ?? '') === String(original ?? '')) {
          delete draft[fieldName];
        } else {
          draft[fieldName] = normalizedNext;
        }
      };

      if (field === 'employee_id') {
        const originalEmployeeValue = getBaseCellValue(baseRow, 'employee_id');
        if (String(value ?? '') === String(originalEmployeeValue ?? '')) {
          delete draft.employee_id;
          delete draft.work_log_fleet_driver_id;
        } else if (typeof value === 'string' && value.startsWith('emp_')) {
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
        applyField(field, value);
      }

      for (const key of Object.keys(draft)) {
        if (draft[key] === undefined) delete draft[key];
      }
      if (Object.keys(draft).length === 0) next.delete(rowId);
      else next.set(rowId, draft);
      return next;
    });
  }, [findBaseRow, getBaseCellValue]);

  useEffect(() => {
    if (drafts.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [drafts]);

  const findOptionByValue = (options: Option[], value: string | number | null | undefined): Option | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    return options.find(o => String(o.value) === String(value));
  };

  const getShortOptionLabel = (options: Option[], value: string | number | null | undefined): string | undefined => {
    const option = findOptionByValue(options, value);
    return option?.shortLabel || option?.label;
  };

  const getCompanyDisplayName = (row: any, value: string | number | null | undefined): string => {
    if (row.company && typeof row.company === 'object' && String(row.company.id) === String(value)) {
      return row.company.internal_prefix || row.company.name || row.company.name_en || '—';
    }
    return getShortOptionLabel(companies, value) || row.company_profile?.chinese_name || row.company_profile?.name || '—';
  };

  const getClientDisplayName = (row: any, value: string | number | null | undefined): string => {
    if (row.client && typeof row.client === 'object' && String(row.client.id) === String(value)) {
      return row.client.code || row.client.name || row.client.name_en || '—';
    }
    return getShortOptionLabel(clients, value) || row.unverified_client_name || '—';
  };

  const getDisplayValue = useCallback((row: any, field: string): string => {
    const val = getCellValue(row, field);
    if (field === 'publisher_id') return row.publisher?.displayName || row.publisher?.username || users.find(o => String(o.value) === String(val))?.label || '—';
    if (field === 'status') return getStatusLabel(val) || val || '—';
    if (field === 'company_id') return getCompanyDisplayName(row, val);
    if (field === 'client_id') return getClientDisplayName(row, val);
    if (field === 'quotation_id') return row.quotation?.quotation_no && !isCellDirty(row.id, field) ? row.quotation.quotation_no : quotations.find(o => String(o.value) === String(val))?.label || '—';
    if (field === 'contract_id') return row.contract?.contract_no && !isCellDirty(row.id, field) ? row.contract.contract_no : contracts.find(o => String(o.value) === String(val))?.label || '—';
    if (field === 'employee_id') {
      if (isCellDirty(row.id, field)) return employees.find(o => String(o.value) === String(val))?.label || '—';
      if (row.work_log_fleet_driver_id) {
        const fd = row.fleet_driver;
        if (fd) {
          const company = fd.subcontractor?.name || '街車';
          return fd.name_zh ? `${fd.name_zh}（${company}・街車）` : `${company}（街車）${fd.plate_no || ''}`;
        }
        return employees.find(o => String(o.value) === `fleet_${row.work_log_fleet_driver_id}`)?.label || '—';
      }
      return row.employee?.name_zh || employees.find(o => String(o.value) === `emp_${row.employee_id}`)?.label || '—';
    }
    if (field === 'scheduled_date') return val ? fmtDate(val) : '—';
    if (field === 'is_mid_shift' || field === 'is_confirmed' || field === 'is_paid') return val ? '✓' : '—';
    if (field === 'source') return getSourceDisplay(val);
    if (field === 'wl_whatsapp_reported_at') return formatHongKongDateTime(val) || '—';
    return val != null && val !== '' ? String(val) : '—';
  }, [contracts, employees, getCellValue, isCellDirty, quotations, users]);

  const getFilteredQuotations = (row: any): Option[] => {
    const clientId = getCellValue(row, 'client_id');
    if (!clientId) return quotations;
    return quotations.filter((q: any) => !q._raw || q._raw.client_id === clientId || q._raw.client_id === Number(clientId));
  };

  const getFilteredContracts = (row: any): Option[] => {
    const clientId = getCellValue(row, 'client_id');
    if (!clientId) return contracts;
    return contracts.filter((c: any) => !c._raw || c._raw.client_id === clientId || c._raw.client_id === Number(clientId));
  };

  const renderCell = (row: any, field: string) => {
    const val = getCellValue(row, field);
    const dirty = isCellDirty(row.id, field);
    const display = getDisplayValue(row, field);
    const onChange = (v: any) => {
      if (field === 'client_id') {
        setDraftField(row.id, 'client_id', v);
        setDraftField(row.id, 'quotation_id', null);
        setDraftField(row.id, 'contract_id', null);
      } else {
        setDraftField(row.id, field, v);
      }
    };

    switch (field) {
      case 'publisher_id':
        return <EditableCell value={val} displayValue={display} onChange={() => {}} type="readonly" isDirty={dirty} />;
      case 'wl_whatsapp_reported_at':
        return <span className="inline-block px-1 py-0.5 text-xs text-gray-700 whitespace-nowrap">{formatHongKongDateTime(val) || '—'}</span>;
      case 'status':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={STATUS_OPTIONS} isDirty={dirty} />;
      case 'scheduled_date':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="date" isDirty={dirty} />;
      case 'service_type':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['service_type'] || []} isDirty={dirty} />;
      case 'company_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={companies} isDirty={dirty} />;
      case 'client_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={clients} isDirty={dirty} />;
      case 'quotation_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={getFilteredQuotations(row)} isDirty={dirty} />;
      case 'contract_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={getFilteredContracts(row)} isDirty={dirty} />;
      case 'client_contract_no':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox_create" options={fieldOptions['client_contract_no'] || []} createCategory="client_contract_no" isDirty={dirty} />;
      case 'employee_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={employees} isDirty={dirty} />;
      case 'machine_type':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['machine_type'] || []} isDirty={dirty} />;
      case 'equipment_number':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={allEquipment} isDirty={dirty} />;
      case 'tonnage':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['tonnage'] || []} isDirty={dirty} />;
      case 'day_night':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['day_night'] || []} isDirty={dirty} />;
      case 'start_location':
      case 'end_location':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox_create" options={fieldOptions['location'] || []} createCategory="location" isDirty={dirty} />;
      case 'start_time':
      case 'end_time':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="time" isDirty={dirty} />;
      case 'quantity':
      case 'ot_quantity':
      case 'goods_quantity':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="number" isDirty={dirty} />;
      case 'unit':
      case 'ot_unit':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['wage_unit'] || []} isDirty={dirty} />;
      case 'is_mid_shift':
      case 'is_confirmed':
      case 'is_paid':
        return <EditableCell value={val} onChange={onChange} type="checkbox" isDirty={dirty} />;
      case 'receipt_no':
      case 'work_log_product_name':
      case 'work_order_no':
      case 'work_content':
      case 'remarks':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="text" isDirty={dirty} />;
      case 'work_log_product_unit':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['product_unit'] || []} isDirty={dirty} />;
      case 'attachments': {
        const photos = Array.isArray(row.work_log_photo_urls) ? row.work_log_photo_urls : [];
        const hasSig = !!row.work_log_signature_url;
        const total = photos.length + (hasSig ? 1 : 0);
        if (total === 0) return <span className="text-gray-300 text-xs">—</span>;
        return <span className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-600 rounded font-medium whitespace-nowrap">附件 {total}</span>;
      }
      case 'source':
        return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getSourceClassName(val)}`}>{getSourceDisplay(val)}</span>;
      default:
        return <EditableCell value={val} displayValue={display} onChange={() => {}} type="readonly" isDirty={dirty} />;
    }
  };

  const getSortValue = (row: any, colKey: string): string | number => {
    const field = colKeyToField[colKey] || colKey;
    const value = getCellValue(row, field);
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return getDisplayValue(row, field).toLowerCase();
  };

  const handleFilterChange = (columnKey: string, selectedValues: Set<string> | null) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      if (!selectedValues || selectedValues.size === 0) delete next[columnKey];
      else next[columnKey] = selectedValues;
      return next;
    });
  };

  const filteredRows = useMemo(() => {
    let next = rows.filter(row => {
      for (const [colKey, values] of Object.entries(columnFilters)) {
        const field = colKeyToField[colKey] || colKey;
        const display = getDisplayValue(row, field);
        if (!values.has(display)) return false;
      }
      return true;
    });
    next = [...next].sort((a, b) => {
      const av = getSortValue(a, sortBy);
      const bv = getSortValue(b, sortBy);
      const result = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'zh-Hant');
      return sortOrder === 'ASC' ? result : -result;
    });
    return next;
  }, [rows, columnFilters, getDisplayValue, sortBy, sortOrder]);

  const draftFieldCount = useMemo(() => {
    let count = 0;
    drafts.forEach(draft => { count += Object.keys(draft).length; });
    return count;
  }, [drafts]);

  const handleSort = (colKey: string) => {
    if (sortBy === colKey) setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    else {
      setSortBy(colKey);
      setSortOrder('ASC');
    }
  };

  const handleSaveDrafts = async () => {
    setSaving(true);
    try {
      const ids = new Set<number>([...Array.from(savedDraftIds), ...Array.from(drafts.keys())]);
      const payload = Array.from(ids).map(workLogId => ({
        work_log_id: workLogId,
        draft_data: drafts.get(workLogId) || {},
      }));
      await invoicesApi.savePrepare(invoiceId, { drafts: payload });
      showToast('草稿已儲存', 'success');
      await loadPrepare();
    } catch (err: any) {
      showToast(err.response?.data?.message || '儲存草稿失敗', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDrafts = async () => {
    if (!confirm('確定要清除所有整理草稿並回到原始工作紀錄值嗎？')) return;
    setResetting(true);
    try {
      await invoicesApi.clearPrepare(invoiceId);
      setDrafts(new Map());
      setSavedDraftIds(new Set());
      await loadPrepare();
      showToast('已重置整理視窗', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || '重置失敗', 'error');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">載入整理視窗中...</div>;
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-gray-50 -m-4 sm:-m-6">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0 gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">整理視窗 - {invoice?.invoice_no || `#${invoiceId}`}</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">共 {rows.length} 筆關聯工作紀錄；{draftFieldCount} 個草稿欄位</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
          {Object.keys(columnFilters).length > 0 && (
            <button
              type="button"
              onClick={() => setColumnFilters({})}
              className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 whitespace-nowrap"
            >
              重設篩選
            </button>
          )}
          <ColumnCustomizer columns={columnConfigs} onChange={handleColumnConfigChange} onReset={handleReset} onSavePersonal={handleSavePersonal} onSaveDefault={handleSaveDefault} />
          <button
            onClick={handleSaveDrafts}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium whitespace-nowrap"
          >
            {saving ? '儲存中…' : '儲存草稿'}
          </button>
          <button
            onClick={handleResetDrafts}
            disabled={resetting}
            className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
          >
            {resetting ? '重置中…' : '重置'}
          </button>
          <Link href={`/invoices/${invoiceId}`} className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 whitespace-nowrap">返回發票</Link>
          <Link
            href={`/invoices/${invoiceId}/pricing`}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap font-medium"
          >
            下一步
          </Link>
        </div>
      </div>

      {draftFieldCount > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 shrink-0 text-sm text-amber-800">
          已套用草稿覆蓋值，修改過的欄位會以黃色框線標示；儲存草稿不會改動原始工作紀錄。
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-gray-100 shadow-sm">
            <tr>
              <th className="sticky left-0 z-30 w-16 bg-gray-100 px-2 py-2 text-left font-semibold text-gray-700 border-b border-r">ID</th>
              {visibleColumns.map((col: any) => {
                const field = colKeyToField[col.key] || col.key;
                return (
                  <th
                    key={col.key}
                    className={`${col.width || col._width || 'w-28'} bg-gray-100 px-2 py-2 text-left font-semibold text-gray-700 border-b border-r whitespace-nowrap`}
                  >
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => handleSort(col.key)} className="hover:text-blue-600">
                        {col.label}{sortBy === col.key ? (sortOrder === 'ASC' ? ' ↑' : ' ↓') : ''}
                      </button>
                      <ColumnFilter
                        columnKey={col.key}
                        data={rows.map(row => ({ ...row, [col.key]: getDisplayValue(row, field) }))}
                        activeFilters={columnFilters}
                        onFilterChange={handleFilterChange}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white">
            {filteredRows.map(row => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-mono text-gray-600 border-r">#{row.id}</td>
                {visibleColumns.map((col: any) => {
                  const field = colKeyToField[col.key] || col.key;
                  const dirty = isCellDirty(row.id, field);
                  return (
                    <td key={col.key} className={`${dirty ? 'bg-amber-50' : ''} border-r align-top ${col.width || col._width || 'w-28'}`}>
                      {renderCell(row, field)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-10 text-center text-sm text-gray-400">
                  沒有符合條件的工作紀錄
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border-t border-gray-200 px-4 sm:px-6 py-2 text-xs text-gray-500 shrink-0">
        顯示 {filteredRows.length} / {rows.length} 筆。此頁排序與欄位篩選只影響整理視窗顯示，不會影響發票或原始工作紀錄資料。
      </div>

      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`rounded-lg px-4 py-2 text-sm shadow-lg ${toast.type === 'success' ? 'bg-green-600 text-white' : toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
