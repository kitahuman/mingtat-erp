'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  workLogsApi, companiesApi, partnersApi,
  contractsApi, quotationsApi, employeesApi, usersApi, fieldOptionsApi,
  vehiclesApi, machineryApi, subconFleetDriversApi,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import EditableCell from './EditableCell';
import SearchableSelect from './SearchableSelect';
import { STATUS_OPTIONS, STATUS_COLORS, getStatusLabel, getEquipmentSource } from './constants';
import ExportButton from '@/components/ExportButton';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import ColumnCustomizer from '@/components/ColumnCustomizer';
import BatchEditDialog from './BatchEditDialog';
import { fmtDate } from '@/lib/dateUtils';

interface Option { value: string | number; label: string; _raw?: any; shortLabel?: string; }

const LIMIT_OPTIONS = [25, 50, 100];

const COLUMNS = [
  { key: 'publisher',        label: '發佈人',    width: 'w-24' },
  { key: 'status',           label: '狀態',      width: 'w-20' },
  { key: 'scheduled_date',   label: '約定日期',  width: 'w-28' },
  { key: 'service_type',     label: '服務類型',  width: 'w-28' },
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
  { key: 'is_confirmed',     label: '已確認',    width: 'w-20' },
  { key: 'is_paid',          label: '已付款',    width: 'w-20' },
  { key: 'remarks',          label: '備註',      width: 'w-36' },
];

export default function WorkLogsPage() {
  const { user } = useAuth();

  // ── Reference data ──────────────────────────────────────────
  const [companies, setCompanies] = useState<Option[]>([]);
  const [clients, setClients]                 = useState<Option[]>([]);
  const [contracts, setContracts]             = useState<Option[]>([]);
  const [quotations, setQuotations]           = useState<Option[]>([]);
  const [employees, setEmployees]             = useState<Option[]>([]);
  const [users, setUsers]                     = useState<Option[]>([]);
  const [fieldOptions, setFieldOptions]       = useState<Record<string, Option[]>>({});
  const [allEquipment, setAllEquipment]       = useState<Option[]>([]);

  // ── List state ──────────────────────────────────────────────
  const [rows, setRows]   = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage]   = useState(1);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(false);

  // ── Filters ─────────────────────────────────────────────────
  const [filterPublisher, setFilterPublisher] = useState<string | number | null>(null);
  const [filterStatus,    setFilterStatus]    = useState<string | number | null>(null);
  const [filterCompany,   setFilterCompany]   = useState<string | number | null>(null);
  const [filterClient,    setFilterClient]    = useState<string | number | null>(null);
  const [filterQuotation, setFilterQuotation] = useState<string | number | null>(null);
  const [filterContract,  setFilterContract]  = useState<string | number | null>(null);
  const [filterEmployee,  setFilterEmployee]  = useState<string | number | null>(null);
  const [filterEquipment, setFilterEquipment] = useState('');
  const [filterDateFrom,  setFilterDateFrom]  = useState('');
  const [filterDateTo,    setFilterDateTo]    = useState('');

  // ── Dirty tracking (Airtable-style) ─────────────────────────
  // dirtyRows: Map<rowId, { field: newValue, ... }> — only stores changed fields
  const [dirtyRows, setDirtyRows] = useState<Map<number, Record<string, any>>>(new Map());
  const [saving, setSaving] = useState(false);

  // ── New row ─────────────────────────────────────────────────
  const [newRow, setNewRow] = useState<any | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  // ── Selection ───────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchEditOpen, setBatchEditOpen] = useState(false);

  // ── Edit lock ───────────────────────────────────────────────
  const [lockInfo, setLockInfo] = useState<{ locked: boolean; lockedBy?: string; isMe?: boolean } | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  } = useColumnConfig('work-logs', COLUMNS.map(c => ({ key: c.key, label: c.label })));

  // ── Load reference data ─────────────────────────────────────
  useEffect(() => {
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
    ]).then(([cp, pt, qt, qo, em, us, fo, veh, mach, subconFleet]) => {
      setCompanies((cp.data || []).map((c: any) => ({ value: c.id, label: c.internal_prefix ? c.internal_prefix + ' ' + c.name : c.name })));
      setClients((pt.data || []).map((p: any) => ({ value: p.id, label: p.name, _raw: p, shortLabel: p.code || p.name })));
      setContracts((qt.data || []).map((c: any) => ({ value: c.id, label: c.contract_no + (c.contract_name ? ' ' + c.contract_name : ''), _raw: c })));
      const qoData = qo.data?.data || qo.data || [];
      setQuotations(qoData.map((q: any) => ({ value: q.id, label: q.quotation_no + (q.contract_name ? ' ' + q.contract_name : ''), _raw: q })));
      const employeeList = (em.data?.data || []).map((e: any) => ({
        value: `emp_${e.id}`,
        label: e.name_zh,
        _raw: e
      }));
      const partnerList = (pt.data || [])
        .filter((p: any) => p.partner_type === 'subcontractor')
        .map((p: any) => ({
          value: `part_${p.id}`,
          label: `(街車) ${p.name}`,
          _raw: p
        }));
      setEmployees([...employeeList, ...partnerList]);
      setUsers((us.data?.data || us.data || []).map((u: any) => ({ value: u.id, label: u.displayName || u.username })));
      const grouped: Record<string, Option[]> = {};
      for (const [cat, opts] of Object.entries(fo.data || {})) {
        grouped[cat] = (opts as any[]).map((o: any) => ({ value: o.label, label: o.label }));
      }
      setFieldOptions(grouped);
      const equipList = [
        ...(veh.data || []),
        ...(mach.data || []),
        ...(subconFleet.data || []),
      ];
      setAllEquipment(equipList);
    }).catch(console.error);
  }, []);

  // ── Load work logs ──────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page, limit,
        sortBy: 'created_at', sortOrder: 'DESC',
      };
      if (filterPublisher) params.publisher_id     = filterPublisher;
      if (filterStatus)    params.status           = filterStatus;
      if (filterCompany)   params.company_id = filterCompany;
      if (filterClient)    params.client_id        = filterClient;
      if (filterQuotation) params.quotation_id     = filterQuotation;
      if (filterContract)  params.contract_id      = filterContract;
      if (filterEmployee && typeof filterEmployee === 'string') {
        if (filterEmployee.startsWith('emp_')) {
          params.employee_id = Number(filterEmployee.replace('emp_', ''));
        } else if (filterEmployee.startsWith('part_')) {
          params.client_id = Number(filterEmployee.replace('part_', ''));
        }
      }
      if (filterEquipment) params.equipment_number = filterEquipment;
      if (filterDateFrom)  params.date_from        = filterDateFrom;
      if (filterDateTo)    params.date_to          = filterDateTo;

      const res = await workLogsApi.list(params);
      setRows(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterPublisher, filterStatus, filterCompany, filterClient,
      filterQuotation, filterContract, filterEmployee, filterEquipment, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Edit lock management ────────────────────────────────────
  const lockKey = `work-logs-page-${page}`;

  useEffect(() => {
    // Check lock status on page load
    workLogsApi.editLockStatus(lockKey).then(res => {
      setLockInfo(res.data);
    }).catch(() => {});
  }, [lockKey]);

  const acquireLock = useCallback(async () => {
    try {
      const res = await workLogsApi.editLockAcquire(lockKey);
      if (res.data.acquired) {
        setLockInfo({ locked: true, isMe: true });
        // Start heartbeat
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          workLogsApi.editLockHeartbeat(lockKey).catch(() => {});
        }, 60_000); // every 60s
        return true;
      } else {
        setLockInfo({ locked: true, lockedBy: res.data.lockedBy, isMe: false });
        return false;
      }
    } catch {
      return true; // If lock API fails, allow editing anyway
    }
  }, [lockKey]);

  const releaseLock = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    workLogsApi.editLockRelease(lockKey).catch(() => {});
    setLockInfo(null);
  }, [lockKey]);

  // Release lock on unmount
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      workLogsApi.editLockRelease(lockKey).catch(() => {});
    };
  }, [lockKey]);

  // ── Dirty tracking ─────────────────────────────────────────
  const setCellValue = useCallback(async (rowId: number, field: string, value: any) => {
    // Acquire lock on first edit
    if (!hasDirty && !lockInfo?.isMe) {
      const ok = await acquireLock();
      if (!ok) {
        alert(`此頁正在被 ${lockInfo?.lockedBy || '其他用戶'} 編輯中，請稍後再試。`);
        return;
      }
    }

    setDirtyRows(prev => {
      const next = new Map(prev);
      const existing = next.get(rowId) || {};
      const originalRow = rows.find(r => r.id === rowId);

      // Check if value is same as original — if so, remove from dirty
      let originalValue = originalRow?.[field];
      // Normalize for comparison
      if (field === 'scheduled_date' && originalValue) {
        originalValue = typeof originalValue === 'string' ? originalValue.split('T')[0] : originalValue;
      }
      if (field === 'employee_id' && originalValue) {
        originalValue = `emp_${originalValue}`;
      }

      const isSameAsOriginal = String(value ?? '') === String(originalValue ?? '');

      if (isSameAsOriginal) {
        const { [field]: _, ...rest } = existing;
        if (Object.keys(rest).length === 0) {
          next.delete(rowId);
        } else {
          next.set(rowId, rest);
        }
      } else {
        next.set(rowId, { ...existing, [field]: value });
      }
      return next;
    });
  }, [rows, hasDirty, lockInfo, acquireLock]);

  // Get the effective value for a cell (dirty value or original)
  const getCellValue = (row: any, field: string): any => {
    const dirty = dirtyRows.get(row.id);
    if (dirty && field in dirty) return dirty[field];
    if (field === 'employee_id' && row.employee_id) return `emp_${row.employee_id}`;
    if (field === 'scheduled_date' && row.scheduled_date) {
      return typeof row.scheduled_date === 'string' ? row.scheduled_date.split('T')[0] : row.scheduled_date;
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
        // Strip employee_id prefix
        if ('employee_id' in payload) {
          if (typeof payload.employee_id === 'string') {
            if (payload.employee_id.startsWith('emp_')) {
              payload.employee_id = Number(payload.employee_id.replace('emp_', ''));
            } else if (payload.employee_id.startsWith('part_')) {
              payload.employee_id = null;
            }
          }
        }
        changes.push({ id, data: payload });
      }
      const res = await workLogsApi.bulkSave(changes);
      const result = res.data;
      if (result.failed > 0) {
        const failedIds = result.results.filter((r: any) => !r.success).map((r: any) => r.id);
        alert(`已儲存 ${result.saved} 筆，${result.failed} 筆失敗（ID: ${failedIds.join(', ')}）`);
        // Remove only successfully saved rows from dirty
        setDirtyRows(prev => {
          const next = new Map(prev);
          for (const r of result.results) {
            if (r.success) next.delete(r.id);
          }
          return next;
        });
      } else {
        setDirtyRows(new Map());
      }
      await fetchLogs();
      releaseLock();
    } catch (e: any) {
      alert('儲存失敗：' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    if (!confirm('確定放棄所有未儲存的修改？')) return;
    setDirtyRows(new Map());
    releaseLock();
  };

  // ── Page change with unsaved warning ────────────────────────
  const changePage = (newPage: number) => {
    if (hasDirty) {
      if (!confirm('有未儲存的修改，切換分頁將會丟失。確定要繼續嗎？')) return;
      setDirtyRows(new Map());
      releaseLock();
    }
    setPage(newPage);
  };

  const changeLimit = (newLimit: number) => {
    if (hasDirty) {
      if (!confirm('有未儲存的修改，切換每頁筆數將會丟失。確定要繼續嗎？')) return;
      setDirtyRows(new Map());
      releaseLock();
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
      if (field === 'employee_id' && typeof value === 'string' && value.startsWith('part_')) {
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
    if (!confirm('確定刪除此記錄？')) return;
    try {
      await workLogsApi.remove(id);
      // Remove from dirty if present
      setDirtyRows(prev => { const n = new Map(prev); n.delete(id); return n; });
      await fetchLogs();
    } catch (e: any) {
      alert('刪除失敗：' + (e.response?.data?.message || e.message));
    }
  };

  const handleDuplicate = async (id: number) => {
    const res = await workLogsApi.duplicate(id);
    await fetchLogs();
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`確定刪除選取的 ${selected.size} 筆記錄？`)) return;
    await workLogsApi.bulkDelete(Array.from(selected));
    setSelected(new Set());
    await fetchLogs();
  };

  const handleBulkUpdateSuccess = async () => {
    setSelected(new Set());
    await fetchLogs();
  };

  const handleBulkConfirm = async () => {
    if (selected.size === 0) return;
    await workLogsApi.bulkConfirm(Array.from(selected));
    setSelected(new Set());
    await fetchLogs();
  };

  const handleBulkUnconfirm = async () => {
    if (selected.size === 0) return;
    if (!confirm(`確定取消確認選取的 ${selected.size} 筆記錄？`)) return;
    await workLogsApi.bulkUnconfirm(Array.from(selected));
    setSelected(new Set());
    await fetchLogs();
  };

  const toggleSelect = (id: number, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelected(new Set(rows.map(r => r.id)));
    else setSelected(new Set());
  };

  const resetFilters = () => {
    if (hasDirty && !confirm('有未儲存的修改，重設篩選將會丟失。確定要繼續嗎？')) return;
    setDirtyRows(new Map());
    setFilterPublisher(null); setFilterStatus(null);  setFilterCompany(null);
    setFilterClient(null);    setFilterQuotation(null); setFilterContract(null); setFilterEmployee(null);
    setFilterEquipment('');   setFilterDateFrom('');   setFilterDateTo('');
    setPage(1);
  };

  const hasFilters = !!(filterPublisher || filterStatus || filterCompany || filterClient ||
    filterQuotation || filterContract || filterEmployee || filterEquipment || filterDateFrom || filterDateTo);

  // ── Helper: get display value for relation fields ───────────
  const getDisplayValue = (row: any, field: string): string => {
    const dirty = dirtyRows.get(row.id);
    // If dirty, resolve display from options
    if (dirty && field in dirty) {
      const val = dirty[field];
      if (field === 'status') return getStatusLabel(val) || val || '—';
      if (field === 'company_id') return companies.find(o => o.value === val)?.label || '—';
      if (field === 'client_id') {
        const found = clients.find(o => o.value === val) as any;
        return found ? (found.shortLabel || found.label) : '—';
      }
      if (field === 'quotation_id') return quotations.find(o => o.value === val)?.label || '—';
      if (field === 'contract_id') return contracts.find(o => o.value === val)?.label || '—';
      if (field === 'employee_id') return employees.find(o => String(o.value) === String(val))?.label || '—';
      if (field === 'scheduled_date') return val ? fmtDate(val) : '—';
      if (field === 'is_mid_shift' || field === 'is_confirmed' || field === 'is_paid') return val ? '✓' : '—';
      return val != null && val !== '' ? String(val) : '—';
    }
    // Original value display
    if (field === 'status') return getStatusLabel(row.status) || '—';
    if (field === 'company_id') return row.company?.name || row.company_profile?.code || '—';
    if (field === 'client_id') return row.unverified_client_name || row.client?.code || row.client?.name || '—';
    if (field === 'quotation_id') return row.quotation?.quotation_no || '—';
    if (field === 'contract_id') return row.contract?.contract_no || '—';
    if (field === 'employee_id') return row.employee?.name_zh || '—';
    if (field === 'scheduled_date') return row.scheduled_date ? fmtDate(row.scheduled_date) : '—';
    if (field === 'is_mid_shift' || field === 'is_confirmed' || field === 'is_paid') return row[field] ? '✓' : '—';
    return row[field] != null && row[field] !== '' ? String(row[field]) : '—';
  };

  // ── Filtered quotations/contracts by client ─────────────────
  const getFilteredQuotations = (row: any): Option[] => {
    const clientId = getCellValue(row, 'client_id');
    if (!clientId) return quotations;
    return quotations.filter((q: any) => {
      const qData = q._raw;
      return !qData || qData.client_id === clientId || qData.client_id === Number(clientId);
    });
  };

  const getFilteredContracts = (row: any): Option[] => {
    const clientId = getCellValue(row, 'client_id');
    if (!clientId) return contracts;
    return contracts.filter((c: any) => {
      const cData = c._raw;
      return !cData || cData.client_id === clientId || cData.client_id === Number(clientId);
    });
  };

  // ── Render editable cell ────────────────────────────────────
  const renderCell = (row: any, field: string) => {
    const val = getCellValue(row, field);
    const dirty = isCellDirty(row.id, field);
    const display = getDisplayValue(row, field);
    const isLocked = lockInfo?.locked && !lockInfo?.isMe;

    const onChange = (v: any) => {
      // When client changes, also clear quotation and contract
      if (field === 'client_id') {
        setCellValue(row.id, 'client_id', v);
        setCellValue(row.id, 'quotation_id', null);
        setCellValue(row.id, 'contract_id', null);
      } else if (field === 'employee_id' && typeof v === 'string' && v.startsWith('part_')) {
        setCellValue(row.id, 'employee_id', v);
        setCellValue(row.id, 'client_id', Number(v.replace('part_', '')));
      } else {
        setCellValue(row.id, field, v);
      }
    };

    switch (field) {
      case 'status':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={STATUS_OPTIONS} isDirty={dirty} disabled={!!isLocked} />;
      case 'scheduled_date':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="date" isDirty={dirty} disabled={!!isLocked} />;
      case 'service_type':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['service_type'] || []} isDirty={dirty} disabled={!!isLocked} />;
      case 'company_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={companies} isDirty={dirty} disabled={!!isLocked} />;
      case 'client_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={clients} isDirty={dirty} disabled={!!isLocked} />;
      case 'quotation_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={getFilteredQuotations(row)} isDirty={dirty} disabled={!!isLocked} />;
      case 'contract_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={getFilteredContracts(row)} isDirty={dirty} disabled={!!isLocked} />;
      case 'client_contract_no':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox_create" options={fieldOptions['client_contract_no'] || []} createCategory="client_contract_no" isDirty={dirty} disabled={!!isLocked} />;
      case 'employee_id':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="select" options={employees} isDirty={dirty} disabled={!!isLocked} />;
      case 'machine_type':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['machine_type'] || []} isDirty={dirty} disabled={!!isLocked} />;
      case 'equipment_number':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={allEquipment} isDirty={dirty} disabled={!!isLocked} />;
      case 'tonnage':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['tonnage'] || []} isDirty={dirty} disabled={!!isLocked} />;
      case 'day_night':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['day_night'] || []} isDirty={dirty} disabled={!!isLocked} />;
      case 'start_location':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox_create" options={fieldOptions['location'] || []} createCategory="location" isDirty={dirty} disabled={!!isLocked} />;
      case 'end_location':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox_create" options={fieldOptions['location'] || []} createCategory="location" isDirty={dirty} disabled={!!isLocked} />;
      case 'start_time':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="time" isDirty={dirty} disabled={!!isLocked} />;
      case 'end_time':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="time" isDirty={dirty} disabled={!!isLocked} />;
      case 'quantity':
      case 'ot_quantity':
      case 'goods_quantity':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="number" isDirty={dirty} disabled={!!isLocked} />;
      case 'unit':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['wage_unit'] || []} isDirty={dirty} disabled={!!isLocked} />;
      case 'ot_unit':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="combobox" options={fieldOptions['wage_unit'] || []} isDirty={dirty} disabled={!!isLocked} />;
      case 'is_mid_shift':
      case 'is_confirmed':
      case 'is_paid':
        return <EditableCell value={val} onChange={onChange} type="checkbox" isDirty={dirty} disabled={!!isLocked} />;
      case 'receipt_no':
      case 'work_order_no':
      case 'remarks':
        return <EditableCell value={val} displayValue={display} onChange={onChange} type="text" isDirty={dirty} disabled={!!isLocked} />;
      default:
        return <EditableCell value={val} displayValue={display} onChange={() => {}} type="readonly" />;
    }
  };

  // ── Render new row cell ─────────────────────────────────────
  const renderNewCell = (field: string) => {
    if (!newRow) return null;
    const val = newRow[field] ?? null;
    const onChange = (v: any) => setNewRowField(field, v);

    switch (field) {
      case 'status':
        return <EditableCell value={val} onChange={onChange} type="select" options={STATUS_OPTIONS} />;
      case 'scheduled_date':
        return <EditableCell value={val} onChange={onChange} type="date" />;
      case 'service_type':
        return <EditableCell value={val} onChange={onChange} type="combobox" options={fieldOptions['service_type'] || []} />;
      case 'company_id':
        return <EditableCell value={val} onChange={onChange} type="select" options={companies} />;
      case 'client_id':
        return <EditableCell value={val} onChange={onChange} type="select" options={clients} />;
      case 'quotation_id':
        return <EditableCell value={val} onChange={onChange} type="select" options={quotations} />;
      case 'contract_id':
        return <EditableCell value={val} onChange={onChange} type="select" options={contracts} />;
      case 'client_contract_no':
        return <EditableCell value={val} onChange={onChange} type="combobox_create" options={fieldOptions['client_contract_no'] || []} createCategory="client_contract_no" />;
      case 'employee_id':
        return <EditableCell value={val} onChange={onChange} type="select" options={employees} />;
      case 'machine_type':
        return <EditableCell value={val} onChange={onChange} type="combobox" options={fieldOptions['machine_type'] || []} />;
      case 'equipment_number':
        return <EditableCell value={val} onChange={onChange} type="combobox" options={allEquipment} />;
      case 'tonnage':
        return <EditableCell value={val} onChange={onChange} type="combobox" options={fieldOptions['tonnage'] || []} />;
      case 'day_night':
        return <EditableCell value={val} onChange={onChange} type="combobox" options={fieldOptions['day_night'] || []} />;
      case 'start_location':
        return <EditableCell value={val} onChange={onChange} type="combobox_create" options={fieldOptions['location'] || []} createCategory="location" />;
      case 'end_location':
        return <EditableCell value={val} onChange={onChange} type="combobox_create" options={fieldOptions['location'] || []} createCategory="location" />;
      case 'start_time':
      case 'end_time':
        return <EditableCell value={val} onChange={onChange} type="time" />;
      case 'quantity':
      case 'ot_quantity':
      case 'goods_quantity':
        return <EditableCell value={val} onChange={onChange} type="number" />;
      case 'unit':
      case 'ot_unit':
        return <EditableCell value={val} onChange={onChange} type="combobox" options={fieldOptions['wage_unit'] || []} />;
      case 'is_mid_shift':
      case 'is_confirmed':
      case 'is_paid':
        return <EditableCell value={val} onChange={onChange} type="checkbox" />;
      case 'receipt_no':
      case 'work_order_no':
      case 'remarks':
        return <EditableCell value={val} onChange={onChange} type="text" />;
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
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 -m-4 sm:-m-6">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0 gap-2">
        <div className="shrink-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">工作記錄</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">共 {total} 筆記錄</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
          {/* Dirty indicator + save */}
          {hasDirty && (
            <>
              <span className="text-sm text-amber-600 font-medium">
                {dirtyRows.size} 筆未儲存
              </span>
              <button onClick={handleSaveAll} disabled={saving}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium">
                {saving ? '儲存中…' : '💾 全部儲存'}
              </button>
              <button onClick={handleDiscardChanges}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                放棄修改
              </button>
            </>
          )}
          {selected.size > 0 && (
            <>
              <span className="text-sm text-gray-600">已選 {selected.size} 筆</span>
              <button onClick={() => setBatchEditOpen(true)}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                批量編輯
              </button>
              <button onClick={handleBulkConfirm}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">
                批量確認
              </button>
              <button onClick={handleBulkUnconfirm}
                className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700">
                取消確認
              </button>
              <button onClick={handleBulkDelete}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700">
                批量刪除
              </button>
            </>
          )}
          <ColumnCustomizer
            columns={columnConfigs}
            onChange={handleColumnConfigChange}
            onReset={handleReset}
          />
          <ExportButton
            columns={COLUMNS.map(col => ({ key: col.key, label: col.label, exportRender: (val: any, row: any) => {
              if (col.key === 'publisher') return row.publisher?.displayName || row.publisher?.username || '';
              if (col.key === 'company') return row.company?.name || row.company_profile?.code || '';
              if (col.key === 'client') return row.client?.name || '';
              if (col.key === 'quotation') return row.quotation?.quotation_no || '';
              if (col.key === 'contract') return row.contract?.contract_no || '';
              if (col.key === 'employee') return row.employee?.name_zh || '';
              if (col.key === 'is_confirmed') return val ? '是' : '否';
              if (col.key === 'is_paid') return val ? '是' : '否';
              return val != null ? String(val) : '';
            }}))}
            data={rows}
            filename="工作記錄"
          />
          <button
            onClick={handleAddNew}
            disabled={!!newRow}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            ＋ 新增記錄
          </button>
          <CsvImportModal module="work-logs" onImportComplete={fetchLogs} />
        </div>
      </div>

      {/* ── Batch Edit Dialog ──────────────────────────────────── */}
      <BatchEditDialog
        open={batchEditOpen}
        onClose={() => setBatchEditOpen(false)}
        selectedRows={rows.filter(r => selected.has(r.id))}
        onSuccess={handleBulkUpdateSuccess}
        companies={companies}
        clients={clients}
        quotations={quotations}
        contracts={contracts}
        employees={employees}
        fieldOptions={fieldOptions}
        allEquipment={allEquipment}
      />

      {/* ── Edit Lock Banner ── */}
      {lockInfo?.locked && !lockInfo?.isMe && (
        <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 py-2.5 shrink-0 flex items-center gap-3">
          <span className="text-red-500 text-lg">🔒</span>
          <p className="text-sm text-red-800 font-medium">
            <span className="font-bold">{lockInfo.lockedBy}</span> 正在編輯此頁，您目前只能檢視。
          </p>
        </div>
      )}

      {/* ── Unverified Client Banner ── */}
      {(() => {
        const unverifiedCount = rows.filter(r => r.unverified_client_name).length;
        if (unverifiedCount === 0) return null;
        return (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 shrink-0 flex items-center gap-3">
            <span className="text-amber-600 text-lg">⚠️</span>
            <p className="text-sm text-amber-800 font-medium">
              有 <span className="font-bold text-amber-900">{unverifiedCount}</span> 筆記錄包含未確認客戶，請盡快處理（已用黃色標示）
            </p>
          </div>
        );
      })()}

      {/* ── Filters ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0 overflow-x-auto">
        <div className="flex gap-2 items-end" style={{ minWidth: 'max-content' }}>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">發佈人</label>
            <div className="w-28">
              <SearchableSelect value={filterPublisher}
                onChange={v => { setFilterPublisher(v); setPage(1); }}
                options={users} placeholder="全部" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">狀態</label>
            <div className="w-24">
              <SearchableSelect value={filterStatus}
                onChange={v => { setFilterStatus(v); setPage(1); }}
                options={STATUS_OPTIONS} placeholder="全部" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">公司</label>
            <div className="w-28">
              <SearchableSelect value={filterCompany}
                onChange={v => { setFilterCompany(v); setPage(1); }}
                options={companies} placeholder="全部" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">客戶公司</label>
            <div className="w-36">
              <SearchableSelect value={filterClient}
                onChange={v => { setFilterClient(v); setPage(1); }}
                options={clients} placeholder="全部" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">報價單</label>
            <div className="w-32">
              <SearchableSelect value={filterQuotation}
                onChange={v => { setFilterQuotation(v); setPage(1); }}
                options={quotations} placeholder="全部" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">合約</label>
            <div className="w-32">
              <SearchableSelect value={filterContract}
                onChange={v => { setFilterContract(v); setPage(1); }}
                options={contracts} placeholder="全部" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">員工</label>
            <div className="w-28">
              <SearchableSelect value={filterEmployee}
                onChange={v => { setFilterEmployee(v); setPage(1); }}
                options={employees} placeholder="全部" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">機號</label>
            <input
              type="text"
              value={filterEquipment}
              onChange={e => { setFilterEquipment(e.target.value); setPage(1); }}
              placeholder="車牌/機號"
              className="w-24 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">日期從</label>
            <input type="date" value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
              className="w-32 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">日期至</label>
            <input type="date" value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
              className="w-32 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500" />
          </div>
          {hasFilters && (
            <button onClick={resetFilters}
              className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 self-end">
              清除篩選
            </button>
          )}
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: '2800px' }}>
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
                  checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
                  onChange={e => toggleSelectAll(e.target.checked)}
                  className="cursor-pointer"
                />
              </th>
              {/* ID – scrollable */}
              <th className="px-2 py-2 border-r border-gray-300 w-12 text-left font-semibold text-gray-600">
                ID
              </th>
              {/* Visible COLUMNS in user-defined order */}
              {(visibleColumns as any[]).map((col: any) => (
                <th key={col.key}
                  className={`px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap ${col.width}`}>
                  {col.label}
                </th>
              ))}
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
                <td className="sticky left-0 z-10 bg-green-50 px-2 py-1.5 border-r border-green-200 w-10 text-center text-green-600 font-bold text-xs">★</td>
                {/* Checkbox */}
                <td className="sticky left-10 z-10 bg-green-50 px-2 py-1.5 border-r border-green-200 w-8" />
                {/* ID */}
                <td className="px-2 py-1.5 border-r border-green-200 w-12 text-green-600 font-bold">NEW</td>
                {/* Visible COLUMNS in user-defined order */}
                {(visibleColumns as any[]).map((col: any) => {
                  const field = colKeyToField[col.key] || col.key;
                  // publisher is readonly
                  if (col.key === 'publisher') {
                    return (
                      <td key={col.key} className={`${col.width} px-2 py-1.5 text-gray-500 text-xs`}>
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
                    <button onClick={handleSaveNew} disabled={savingNew}
                      className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                      {savingNew ? '…' : '💾'}
                    </button>
                    <button onClick={() => setNewRow(null)}
                      className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {loading ? (
              <tr>
                <td colSpan={(visibleColumns as any[]).length + 3} className="text-center py-12 text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    載入中…
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 && !newRow ? (
              <tr>
                <td colSpan={(visibleColumns as any[]).length + 3} className="text-center py-12 text-gray-400">
                  {hasFilters ? '沒有符合篩選條件的記錄' : '尚無工作記錄，點擊「新增記錄」開始'}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => {
                const rowDirty = dirtyRows.has(row.id);
                const hasUnverifiedClient = !!row.unverified_client_name;
                const rowBg = rowDirty ? 'bg-amber-50' : hasUnverifiedClient ? 'bg-amber-50' : 'bg-white';
                const rowNum = (page - 1) * limit + rowIndex + 1;

                return (
                  <tr key={row.id}
                    className={`border-b border-gray-100 text-xs ${
                      rowDirty ? 'bg-amber-50' : hasUnverifiedClient ? 'bg-amber-50' : 'hover:bg-blue-50/30'
                    }`}
                  >
                    {/* 行數編號 - sticky left */}
                    <td className={`sticky left-0 z-10 ${rowBg} px-2 py-0 border-r border-gray-200 w-10 text-center text-gray-400 font-mono select-none`}>
                      {rowNum}
                    </td>
                    {/* Checkbox - sticky */}
                    <td className={`sticky left-10 z-10 ${rowBg} px-2 py-0 border-r border-gray-200 w-8`}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={e => toggleSelect(row.id, e.target.checked)} className="cursor-pointer" />
                    </td>
                    {/* ID - scrollable */}
                    <td className="px-2 py-0 border-r border-gray-200 w-12 text-gray-400 font-mono">
                      {row.id}
                    </td>
                    {/* Visible COLUMNS in user-defined order */}
                    {(visibleColumns as any[]).map((col: any) => {
                      const field = colKeyToField[col.key] || col.key;
                      // publisher is readonly display
                      if (col.key === 'publisher') {
                        return (
                          <td key={col.key} className={`${col.width} px-2 py-0 text-gray-600 text-xs`}>
                            {row.publisher?.displayName || row.publisher?.username || '—'}
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
                    <td className={`sticky right-0 z-10 ${rowBg} px-1 py-0 border-l border-gray-200 w-20`}>
                      <div className="flex gap-0.5">
                        <button onClick={() => handleDuplicate(row.id)} className="px-1 py-0.5 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100" title="複製">📋</button>
                        <button onClick={() => handleDelete(row.id)} className="px-1 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100" title="刪除">🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Bottom bar: Save + Pagination ────────────────────── */}
      <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {hasDirty && (
            <button onClick={handleSaveAll} disabled={saving}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium">
              {saving ? '儲存中…' : `💾 儲存 ${dirtyRows.size} 筆修改`}
            </button>
          )}
          <span className="text-sm text-gray-600">每頁顯示</span>
          <select
            value={limit}
            onChange={e => changeLimit(Number(e.target.value))}
            className="px-2 py-1 text-sm border border-gray-300 rounded"
          >
            {LIMIT_OPTIONS.map(l => <option key={l} value={l}>{l} 筆</option>)}
          </select>
          <span className="text-sm text-gray-500">
            第 {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} 筆，共 {total} 筆
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => changePage(1)} disabled={page === 1}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">«</button>
          <button onClick={() => changePage(Math.max(1, page - 1))} disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">‹ 上一頁</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 5)       p = i + 1;
            else if (page <= 3)        p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else                       p = page - 2 + i;
            return (
              <button key={p} onClick={() => changePage(p)}
                className={`px-3 py-1 text-sm border rounded ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}>
                {p}
              </button>
            );
          })}
          <button onClick={() => changePage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">下一頁 ›</button>
          <button onClick={() => changePage(totalPages)} disabled={page >= totalPages}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">»</button>
        </div>
      </div>
    </div>
  );
}
