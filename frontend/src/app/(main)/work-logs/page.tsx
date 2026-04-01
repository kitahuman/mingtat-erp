'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  workLogsApi, companyProfilesApi, partnersApi,
  quotationsApi, employeesApi, usersApi, fieldOptionsApi,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import WorkLogRow from './WorkLogRow';
import SearchableSelect from './SearchableSelect';
import { STATUS_OPTIONS } from './constants';
import ExportButton from '@/components/ExportButton';
import CsvImportModal from '@/components/CsvImportModal';

interface Option { value: string | number; label: string; _raw?: any; }

const LIMIT_OPTIONS = [25, 50, 100];

const COLUMNS = [
  { key: 'id',               label: 'ID',       width: 'w-12' },
  { key: 'publisher',        label: '發佈人',    width: 'w-20' },
  { key: 'status',           label: '狀態',      width: 'w-20' },
  { key: 'scheduled_date',   label: '約定日期',  width: 'w-24' },
  { key: 'service_type',     label: '服務類型',  width: 'w-24' },
  { key: 'company',          label: '公司',      width: 'w-20' },
  { key: 'client',           label: '客戶公司',  width: 'w-32' },
  { key: 'quotation',        label: '合約',      width: 'w-28' },
  { key: 'employee',         label: '員工',      width: 'w-20' },
  { key: 'machine_type',     label: '機種',      width: 'w-20' },
  { key: 'equipment_number', label: '機號',      width: 'w-24' },
  { key: 'tonnage',          label: '噸數',      width: 'w-16' },
  { key: 'day_night',        label: '日夜班',    width: 'w-14' },
  { key: 'start_location',   label: '起點',      width: 'w-28' },
  { key: 'start_time',       label: '起點時間',  width: 'w-16' },
  { key: 'end_location',     label: '終點',      width: 'w-28' },
  { key: 'end_time',         label: '終點時間',  width: 'w-16' },
  { key: 'quantity',         label: '數量',      width: 'w-16' },
  { key: 'unit',             label: '工資單位',  width: 'w-16' },
  { key: 'ot_quantity',      label: 'OT數量',    width: 'w-16' },
  { key: 'ot_unit',          label: 'OT單位',    width: 'w-16' },
  { key: 'goods_quantity',   label: '商品數量',  width: 'w-16' },
  { key: 'receipt_no',       label: '入帳票編號', width: 'w-24' },
  { key: 'work_order_no',    label: '單號',      width: 'w-24' },
  { key: 'is_confirmed',     label: '已確認',    width: 'w-14' },
  { key: 'is_paid',          label: '已付款',    width: 'w-14' },
  { key: 'remarks',          label: '備註',      width: 'w-32' },
];

export default function WorkLogsPage() {
  const { user } = useAuth();

  // ── Reference data ──────────────────────────────────────────
  const [companyProfiles, setCompanyProfiles] = useState<Option[]>([]);
  const [clients, setClients]                 = useState<Option[]>([]);
  const [contracts, setContracts]             = useState<Option[]>([]);
  const [employees, setEmployees]             = useState<Option[]>([]);
  const [users, setUsers]                     = useState<Option[]>([]);
  const [fieldOptions, setFieldOptions]       = useState<Record<string, Option[]>>({});

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
  const [filterContract,  setFilterContract]  = useState<string | number | null>(null);
  const [filterEmployee,  setFilterEmployee]  = useState<string | number | null>(null);
  const [filterEquipment, setFilterEquipment] = useState('');
  const [filterDateFrom,  setFilterDateFrom]  = useState('');
  const [filterDateTo,    setFilterDateTo]    = useState('');

  // ── Editing ─────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [newRow, setNewRow]       = useState<any | null>(null);

  // ── Selection ───────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const totalPages = Math.ceil(total / limit);

  // ── Load reference data ─────────────────────────────────────
  useEffect(() => {
    Promise.all([
      companyProfilesApi.simple(),
      partnersApi.simple(),
      quotationsApi.list({ limit: 500 }),
      employeesApi.list({ limit: 500, status: 'active' }),
      usersApi.list({ limit: 200 }),
      fieldOptionsApi.getAll(),
    ]).then(([cp, pt, qt, em, us, fo]) => {
      setCompanyProfiles((cp.data || []).map((c: any) => ({ value: c.id, label: c.code + ' ' + c.chinese_name })));
      setClients((pt.data || []).map((p: any) => ({ value: p.id, label: p.name, _raw: p })));
      setContracts(((qt.data?.data) || []).map((q: any) => ({ value: q.id, label: q.quotation_no, _raw: q })));
      setEmployees((em.data?.data || []).map((e: any) => ({ value: e.id, label: e.name_zh })));
      setUsers((us.data?.data || us.data || []).map((u: any) => ({ value: u.id, label: u.displayName || u.username })));
      // Map field options to Option[] format
      const grouped: Record<string, Option[]> = {};
      for (const [cat, opts] of Object.entries(fo.data || {})) {
        grouped[cat] = (opts as any[]).map((o: any) => ({ value: o.label, label: o.label }));
      }
      setFieldOptions(grouped);
    }).catch(console.error);
  }, []);

  // ── Load work logs ──────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page, limit,
        sortBy: 'scheduled_date', sortOrder: 'DESC',
      };
      if (filterPublisher) params.publisher_id     = filterPublisher;
      if (filterStatus)    params.status           = filterStatus;
      if (filterCompany)   params.company_profile_id = filterCompany;
      if (filterClient)    params.client_id        = filterClient;
      if (filterContract)  params.quotation_id     = filterContract;
      if (filterEmployee)  params.employee_id      = filterEmployee;
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
      filterContract, filterEmployee, filterEquipment, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Actions ─────────────────────────────────────────────────
  const handleAddNew = () => {
    setNewRow({
      status: 'editing',
      publisher_id: user?.id,
      scheduled_date: new Date().toISOString().split('T')[0],
    });
    setEditingId('new');
  };

  const handleSave = async (data: any) => {
    try {
      if (editingId === 'new') {
        await workLogsApi.create(data);
      } else {
        await workLogsApi.update(Number(editingId), data);
      }
      setEditingId(null);
      setNewRow(null);
      await fetchLogs();
    } catch (e: any) {
      alert('儲存失敗：' + (e.response?.data?.message || e.message));
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setNewRow(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定刪除此記錄？')) return;
    await workLogsApi.remove(id);
    await fetchLogs();
  };

  const handleDuplicate = async (id: number) => {
    await workLogsApi.duplicate(id);
    await fetchLogs();
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`確定刪除選取的 ${selected.size} 筆記錄？`)) return;
    await workLogsApi.bulkDelete(Array.from(selected));
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
    setFilterPublisher(null); setFilterStatus(null);  setFilterCompany(null);
    setFilterClient(null);    setFilterContract(null); setFilterEmployee(null);
    setFilterEquipment('');   setFilterDateFrom('');   setFilterDateTo('');
    setPage(1);
  };

  const hasFilters = !!(filterPublisher || filterStatus || filterCompany || filterClient ||
    filterContract || filterEmployee || filterEquipment || filterDateFrom || filterDateTo);

  // shared props for WorkLogRow
  const rowProps = {
    companyProfiles,
    clients,
    quotations: contracts,   // prop name stays "quotations" in WorkLogRow; label is "合約" in UI
    employees,
    users,
    fieldOptions,
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 -m-4 sm:-m-6">
      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">工作記錄</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {total} 筆記錄</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-sm text-gray-600">已選 {selected.size} 筆</span>
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
          <ExportButton
            columns={COLUMNS.map(col => ({ key: col.key, label: col.label, exportRender: (val: any, row: any) => {
              if (col.key === 'publisher') return row.publisher?.displayName || row.publisher?.username || '';
              if (col.key === 'company') return row.company_profile?.code || '';
              if (col.key === 'client') return row.client?.name || '';
              if (col.key === 'quotation') return row.quotation?.quotation_no || '';
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
            disabled={editingId !== null}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            ＋ 新增記錄
          </button>
          <CsvImportModal module="work-logs" onImportComplete={fetchLogs} />
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0">
        <div className="flex flex-wrap gap-2 items-end">
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
                options={companyProfiles} placeholder="全部" />
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
        <table className="border-collapse text-xs" style={{ minWidth: '2400px' }}>
          <thead className="sticky top-0 z-20 bg-gray-100 border-b-2 border-gray-300">
            <tr>
              {/* Checkbox – sticky left */}
              <th className="sticky left-0 z-30 bg-gray-100 px-2 py-2 border-r border-gray-300 w-8">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
                  onChange={e => toggleSelectAll(e.target.checked)}
                  className="cursor-pointer"
                />
              </th>
              {/* ID – sticky */}
              <th className="sticky left-8 z-30 bg-gray-100 px-2 py-2 border-r border-gray-300 w-12 text-left font-semibold text-gray-600">
                ID
              </th>
              {/* 發佈人 – sticky */}
              <th className="sticky left-20 z-30 bg-gray-100 px-2 py-2 border-r border-gray-300 w-20 text-left font-semibold text-gray-600">
                發佈人
              </th>
              {/* 狀態 – sticky */}
              <th className="sticky left-40 z-30 bg-gray-100 px-2 py-2 border-r border-gray-300 w-20 text-left font-semibold text-gray-600">
                狀態
              </th>
              {/* Scrollable columns */}
              {COLUMNS.slice(3).map(col => (
                <th key={col.key}
                  className={`px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap ${col.width}`}>
                  {col.label}
                </th>
              ))}
              {/* 操作 – sticky right */}
              <th className="sticky right-0 z-30 bg-gray-100 px-2 py-2 border-l border-gray-300 w-28 text-left font-semibold text-gray-600">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {/* New row at top */}
            {editingId === 'new' && newRow && (
              <WorkLogRow
                key="new"
                row={newRow}
                isEditing={true}
                isNew={true}
                isSelected={false}
                onSelect={() => {}}
                onEdit={() => {}}
                onSave={handleSave}
                onCancel={handleCancel}
                onDuplicate={() => {}}
                onDelete={() => {}}
                {...rowProps}
              />
            )}

            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 3} className="text-center py-12 text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    載入中…
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 && editingId !== 'new' ? (
              <tr>
                <td colSpan={COLUMNS.length + 3} className="text-center py-12 text-gray-400">
                  {hasFilters ? '沒有符合篩選條件的記錄' : '尚無工作記錄，點擊「新增記錄」開始'}
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <WorkLogRow
                  key={row.id}
                  row={row}
                  isEditing={editingId === row.id}
                  isNew={false}
                  isSelected={selected.has(row.id)}
                  onSelect={checked => toggleSelect(row.id, checked)}
                  onEdit={() => { if (editingId !== row.id) setEditingId(row.id); }}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  onDuplicate={() => handleDuplicate(row.id)}
                  onDelete={() => handleDelete(row.id)}
                  {...rowProps}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ───────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">每頁顯示</span>
          <select
            value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
            className="px-2 py-1 text-sm border border-gray-300 rounded"
          >
            {LIMIT_OPTIONS.map(l => <option key={l} value={l}>{l} 筆</option>)}
          </select>
          <span className="text-sm text-gray-500">
            第 {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} 筆，共 {total} 筆
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">‹ 上一頁</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 5)       p = i + 1;
            else if (page <= 3)        p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else                       p = page - 2 + i;
            return (
              <button key={p} onClick={() => setPage(p)}
                className={`px-3 py-1 text-sm border rounded ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}>
                {p}
              </button>
            );
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">下一頁 ›</button>
          <button onClick={() => setPage(totalPages)} disabled={page >= totalPages}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50">»</button>
        </div>
      </div>
    </div>
  );
}
