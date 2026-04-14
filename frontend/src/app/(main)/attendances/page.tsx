'use client';

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { attendancesApi, employeesApi } from '@/lib/api';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';

// Lazy load MiniMap to avoid SSR issues
const MiniMap = lazy(() => import('@/components/MiniMap'));

const TYPE_LABELS: Record<string, string> = {
  clock_in: '開工',
  clock_out: '收工',
};

const TYPE_BADGE: Record<string, string> = {
  clock_in: 'bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded-full text-xs font-medium',
  clock_out: 'bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full text-xs font-medium',
};

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  no_work_log: '有打卡無工作紀錄',
  no_attendance: '有工作紀錄無打卡',
  shift_mismatch: '班次不一致',
  location_mismatch: '地點不匹配',
};

const ANOMALY_TYPE_BADGE: Record<string, string> = {
  no_work_log: 'bg-amber-100 text-amber-800 border border-amber-200',
  no_attendance: 'bg-red-100 text-red-800 border border-red-200',
  shift_mismatch: 'bg-purple-100 text-purple-800 border border-purple-200',
  location_mismatch: 'bg-orange-100 text-orange-800 border border-orange-200',
};

const DEFAULT_COLUMNS = [
  { key: 'emp_code', label: '員工編號', sortable: true },
  { key: 'employee_name', label: '員工姓名', sortable: true },
  { key: 'role_title', label: '職位' },
  { key: 'date', label: '日期', sortable: true },
  { key: 'type', label: '打卡類型', sortable: true },
  { key: 'is_mid_shift', label: '中直' },
  { key: 'mid_shift_status', label: '中直批核狀態' },
  { key: 'time', label: '時間', sortable: true },
  { key: 'gps', label: 'GPS 位置' },
  { key: 'photo', label: '相片' },
  { key: 'work_notes', label: '工作備註' },
  { key: 'remarks', label: '備註' },
];

export default function AttendancesPage() {
  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<'records' | 'anomalies'>('records');

  // ══════════════════════════════════════════════════════════════
  // Tab 1: 打卡記錄
  // ══════════════════════════════════════════════════════════════
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState('DESC');

  // Filters
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);

  // Map modal state
  const [mapModal, setMapModal] = useState<{
    open: boolean;
    lat: number;
    lng: number;
    address?: string;
    employeeName?: string;
    time?: string;
  }>({ open: false, lat: 0, lng: 0 });

  // Photo modal state
  const [photoModal, setPhotoModal] = useState<{ open: boolean; src: string }>({ open: false, src: '' });

  const { columnConfigs, handleColumnConfigChange, handleReset, columnWidths, handleColumnResize } =
    useColumnConfig('attendances', DEFAULT_COLUMNS);

  useEffect(() => {
    employeesApi.list({ limit: 999, status: 'active' }).then(res => {
      setEmployees(res.data.data || []);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await attendancesApi.list({
        page,
        limit: 20,
        search: search || undefined,
        employee_id: employeeFilter || undefined,
        type: typeFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sortBy,
        sortOrder,
      });
      setData(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch {
      setData([]);
      setTotal(0);
    }
    setLoading(false);
  }, [page, search, employeeFilter, typeFilter, dateFrom, dateTo, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string, order: string) => {
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
  };

  const openMapModal = (row: any) => {
    const employeeName = row.employee?.name_zh || row.employee?.name_en || '';
    const time = row.timestamp
      ? new Date(row.timestamp).toLocaleString('zh-HK', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
      : '';
    setMapModal({
      open: true,
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      address: row.address || undefined,
      employeeName,
      time,
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確認刪除此打卡記錄？')) return;
    try {
      await attendancesApi.delete(id);
      load();
    } catch {
      alert('刪除失敗');
    }
  };

  // Helper: get photo src from row (prefer base64, fallback to photo_url)
  const getPhotoSrc = (row: any): string | null => {
    if (row.attendance_photo_base64) {
      return row.attendance_photo_base64.startsWith('data:')
        ? row.attendance_photo_base64
        : `data:image/jpeg;base64,${row.attendance_photo_base64}`;
    }
    if (row.photo_url) return row.photo_url;
    return null;
  };

  const columns = [
    {
      key: 'emp_code',
      label: '員工編號',
      sortable: true,
      render: (_: any, row: any) => (
        <span className="font-mono text-sm text-gray-700">{row.employee?.emp_code || '-'}</span>
      ),
      exportRender: (_: any, row: any) => row.employee?.emp_code || '',
    },
    {
      key: 'employee_name',
      label: '員工姓名',
      sortable: true,
      render: (_: any, row: any) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.employee?.name_zh || row.employee?.name_en || '-'}</span>
          {row.employee?.employee_is_temporary && (
            <span className="text-[10px] text-amber-600 font-bold">臨時員工</span>
          )}
        </div>
      ),
      exportRender: (_: any, row: any) => row.employee?.name_zh || row.employee?.name_en || '',
    },
    {
      key: 'role_title',
      label: '職位',
      render: (_: any, row: any) => {
        const position = row.employee?.role_title || row.employee?.role || '-';
        return <span className="text-sm text-blue-600 font-medium">{position}</span>;
      },
      exportRender: (_: any, row: any) => row.employee?.role_title || row.employee?.role || '',
    },
    {
      key: 'date',
      label: '日期',
      sortable: true,
      render: (_: any, row: any) => {
        if (!row.timestamp) return '-';
        return fmtDate(row.timestamp);
      },
      exportRender: (_: any, row: any) => row.timestamp ? fmtDate(row.timestamp) : '',
    },
    {
      key: 'type',
      label: '打卡類型',
      sortable: true,
      render: (_: any, row: any) => (
        <span className={TYPE_BADGE[row.type] || 'badge-gray'}>
          {TYPE_LABELS[row.type] || row.type || '-'}
        </span>
      ),
      exportRender: (_: any, row: any) => TYPE_LABELS[row.type] || row.type || '',
    },
    {
      key: 'is_mid_shift',
      label: '中直',
      render: (_: any, row: any) => (
        row.is_mid_shift ? (
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-bold">是</span>
        ) : (
          <span className="text-gray-300 text-xs">否</span>
        )
      ),
      exportRender: (_: any, row: any) => row.is_mid_shift ? '是' : '否',
    },
    {
      key: 'mid_shift_status',
      label: '中直批核狀態',
      render: (_: any, row: any) => {
        if (!row.is_mid_shift) return <span className="text-gray-300 text-xs">未申請</span>;
        if (row.mid_shift_approved) {
          return (
            <div className="flex flex-col">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold border border-green-200">已批核</span>
              <span className="text-[10px] text-gray-500 mt-0.5">{row.mid_shift_approver?.name_zh || '系統'}</span>
            </div>
          );
        }
        return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-bold border border-amber-200">待批核</span>;
      },
      exportRender: (_: any, row: any) => {
        if (!row.is_mid_shift) return '未申請';
        if (row.mid_shift_approved) return `已批核 (${row.mid_shift_approver?.name_zh || '系統'})`;
        return '待批核';
      },
    },
    {
      key: 'time',
      label: '時間',
      sortable: true,
      render: (_: any, row: any) => {
        if (!row.timestamp) return '-';
        const d = new Date(row.timestamp);
        return d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      },
      exportRender: (_: any, row: any) => {
        if (!row.timestamp) return '';
        const d = new Date(row.timestamp);
        return d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      },
    },
    {
      key: 'gps',
      label: 'GPS 位置',
      render: (_: any, row: any) => {
        if (row.latitude && row.longitude) {
          return (
            <div className="space-y-1">
              {row.address && (
                <p className="text-xs text-gray-700 font-medium leading-tight max-w-[200px] truncate" title={row.address}>
                  {'📍'} {row.address}
                </p>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); openMapModal(row); }}
                className="text-blue-600 hover:text-blue-800 hover:underline text-xs flex items-center gap-1 transition-colors"
                title="點擊查看地圖"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                {Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}
              </button>
            </div>
          );
        }
        if (row.address) return <span className="text-xs text-gray-600">{'📍'} {row.address}</span>;
        return <span className="text-gray-400 text-xs">-</span>;
      },
      exportRender: (_: any, row: any) => {
        const parts: string[] = [];
        if (row.address) parts.push(row.address);
        if (row.latitude && row.longitude) parts.push(`${row.latitude}, ${row.longitude}`);
        return parts.join(' | ') || '';
      },
    },
    {
      key: 'photo',
      label: '相片',
      render: (_: any, row: any) => {
        const photoSrc = getPhotoSrc(row);
        if (!photoSrc) return <span className="text-gray-400 text-xs">-</span>;
        return (
          <img
            src={photoSrc}
            alt="打卡相片"
            className="w-10 h-10 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setPhotoModal({ open: true, src: photoSrc }); }}
          />
        );
      },
      exportRender: (_: any, row: any) => row.photo_url || (row.attendance_photo_base64 ? '[base64相片]' : ''),
    },
    {
      key: 'work_notes',
      label: '工作備註',
      render: (_: any, row: any) => (
        <span className="text-sm text-blue-700 font-medium">{row.work_notes || '-'}</span>
      ),
      exportRender: (_: any, row: any) => row.work_notes || '',
    },
    {
      key: 'remarks',
      label: '備註',
      render: (_: any, row: any) => (
        <span className="text-sm text-gray-600">{row.remarks || '-'}</span>
      ),
      exportRender: (_: any, row: any) => row.remarks || '',
    },
    {
      key: '_actions',
      label: '操作',
      render: (_: any, row: any) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
          className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors"
        >
          刪除
        </button>
      ),
      exportRender: () => '',
    },
  ];

  const filters = (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Employee filter */}
      <select
        value={employeeFilter}
        onChange={e => { setEmployeeFilter(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5 min-w-[140px]"
      >
        <option value="">全部員工</option>
        {employees.map((emp: any) => (
          <option key={emp.id} value={emp.id}>
            {emp.emp_code ? `${emp.emp_code} ` : ''}{emp.name_zh || emp.name_en}
          </option>
        ))}
      </select>

      {/* Type filter */}
      <select
        value={typeFilter}
        onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5 min-w-[120px]"
      >
        <option value="">全部類型</option>
        <option value="clock_in">開工</option>
        <option value="clock_out">收工</option>
      </select>

      {/* Date from */}
      <input
        type="date"
        value={dateFrom}
        onChange={e => { setDateFrom(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5"
      />
      <span className="text-gray-400">至</span>
      <input
        type="date"
        value={dateTo}
        onChange={e => { setDateTo(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5"
      />

      <input
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        placeholder="搜尋地址/備註..."
        className="input-field text-sm py-1.5"
      />
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // Tab 2: 異常記錄
  // ══════════════════════════════════════════════════════════════
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [anomalyTotal, setAnomalyTotal] = useState(0);
  const [anomalyPage, setAnomalyPage] = useState(1);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyDateFrom, setAnomalyDateFrom] = useState('');
  const [anomalyDateTo, setAnomalyDateTo] = useState('');
  const [anomalyType, setAnomalyType] = useState('');
  const [anomalyEmployee, setAnomalyEmployee] = useState('');
  const [anomalyStatus, setAnomalyStatus] = useState('unresolved');
  const [scanLoading, setScanLoading] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const loadAnomalies = useCallback(async () => {
    setAnomalyLoading(true);
    try {
      const res = await attendancesApi.anomalies({
        page: anomalyPage,
        limit: 20,
        date_from: anomalyDateFrom || undefined,
        date_to: anomalyDateTo || undefined,
        anomaly_type: anomalyType || undefined,
        employee_id: anomalyEmployee || undefined,
        status: anomalyStatus || undefined,
      });
      setAnomalies(res.data.data || []);
      setAnomalyTotal(res.data.total || 0);
    } catch {
      setAnomalies([]);
      setAnomalyTotal(0);
    }
    setAnomalyLoading(false);
  }, [anomalyPage, anomalyDateFrom, anomalyDateTo, anomalyType, anomalyEmployee, anomalyStatus]);

  useEffect(() => {
    if (activeTab === 'anomalies') loadAnomalies();
  }, [activeTab, loadAnomalies]);

  const handleScan = async () => {
    if (!anomalyDateFrom || !anomalyDateTo) {
      alert('請選擇掃描的日期範圍');
      return;
    }
    setScanLoading(true);
    try {
      const res = await attendancesApi.scanAnomalies({
        date_from: anomalyDateFrom,
        date_to: anomalyDateTo,
      });
      alert(`掃描完成，新增 ${res.data.anomalies_created || 0} 筆異常記錄`);
      loadAnomalies();
    } catch (e: any) {
      alert('掃描失敗: ' + (e?.response?.data?.message || e?.message || '未知錯誤'));
    }
    setScanLoading(false);
  };

  const handleResolve = async (id: number) => {
    setResolvingId(id);
    try {
      await attendancesApi.resolveAnomaly(id, { anomaly_resolved_notes: resolveNotes || undefined });
      setResolveNotes('');
      setResolvingId(null);
      loadAnomalies();
    } catch (e: any) {
      alert('操作失敗: ' + (e?.response?.data?.message || e?.message || '未知錯誤'));
      setResolvingId(null);
    }
  };

  const handleUnresolve = async (id: number) => {
    try {
      await attendancesApi.unresolveAnomaly(id);
      loadAnomalies();
    } catch (e: any) {
      alert('操作失敗: ' + (e?.response?.data?.message || e?.message || '未知錯誤'));
    }
  };

  const anomalyTotalPages = Math.ceil(anomalyTotal / 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">打卡記錄</h1>
      </div>

      {/* ── Tab 切換 ── */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('records')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'records'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            打卡記錄
          </button>
          <button
            onClick={() => setActiveTab('anomalies')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'anomalies'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            異常記錄
            {anomalyTotal > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700">
                {anomalyTotal}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* ══════════ Tab 1: 打卡記錄 ══════════ */}
      {activeTab === 'records' && (
        <>
          <DataTable
            columns={columns}
            data={data}
            loading={loading}
            total={total}
            page={page}
            limit={20}
            onPageChange={setPage}
            onSort={handleSort}
            sortBy={sortBy}
            sortOrder={sortOrder}
            filters={filters}
            columnConfigs={columnConfigs}
            onColumnConfigChange={handleColumnConfigChange}
            onColumnConfigReset={handleReset}
            columnWidths={columnWidths}
            onColumnResize={handleColumnResize}
            exportFilename={`attendances_${new Date().toISOString().split('T')[0]}`}
          />

          {/* Map Modal */}
          <Modal
            isOpen={mapModal.open}
            onClose={() => setMapModal({ ...mapModal, open: false })}
            title="打卡位置"
            size="lg"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm bg-gray-50 p-3 rounded-lg">
                <div>
                  <p className="text-gray-500">員工</p>
                  <p className="font-bold text-gray-900">{mapModal.employeeName}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-500">打卡時間</p>
                  <p className="font-bold text-gray-900">{mapModal.time}</p>
                </div>
              </div>
              {mapModal.address && (
                <div className="text-sm">
                  <p className="text-gray-500 mb-1">詳細地址</p>
                  <p className="text-gray-900 font-medium">{'📍'} {mapModal.address}</p>
                </div>
              )}
              <div className="h-[400px] w-full rounded-xl overflow-hidden border border-gray-200">
                <Suspense fallback={<div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center">載入地圖中...</div>}>
                  <MiniMap latitude={mapModal.lat} longitude={mapModal.lng} />
                </Suspense>
              </div>
              <div className="flex justify-end">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${mapModal.lat},${mapModal.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-sm flex items-center gap-2"
                >
                  在 Google Maps 中查看
                </a>
              </div>
            </div>
          </Modal>

          {/* Photo Modal */}
          <Modal
            isOpen={photoModal.open}
            onClose={() => setPhotoModal({ ...photoModal, open: false })}
            title="打卡相片"
            size="md"
          >
            <div className="flex justify-center">
              <img
                src={photoModal.src}
                alt="打卡相片"
                className="max-w-full max-h-[70vh] rounded-lg shadow-lg border border-gray-100"
              />
            </div>
          </Modal>
        </>
      )}

      {/* ══════════ Tab 2: 異常記錄 ══════════ */}
      {activeTab === 'anomalies' && (
        <div className="space-y-4">
          {/* 篩選與掃描 */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">開始日期</label>
                <input
                  type="date"
                  value={anomalyDateFrom}
                  onChange={e => { setAnomalyDateFrom(e.target.value); setAnomalyPage(1); }}
                  className="input-field text-sm py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                <input
                  type="date"
                  value={anomalyDateTo}
                  onChange={e => { setAnomalyDateTo(e.target.value); setAnomalyPage(1); }}
                  className="input-field text-sm py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">異常類型</label>
                <select
                  value={anomalyType}
                  onChange={e => { setAnomalyType(e.target.value); setAnomalyPage(1); }}
                  className="input-field text-sm py-1.5 min-w-[160px]"
                >
                  <option value="">全部類型</option>
                  {Object.entries(ANOMALY_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">員工</label>
                <select
                  value={anomalyEmployee}
                  onChange={e => { setAnomalyEmployee(e.target.value); setAnomalyPage(1); }}
                  className="input-field text-sm py-1.5 min-w-[140px]"
                >
                  <option value="">全部員工</option>
                  {employees.map((emp: any) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.emp_code ? `${emp.emp_code} ` : ''}{emp.name_zh || emp.name_en}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">狀態</label>
                <select
                  value={anomalyStatus}
                  onChange={e => { setAnomalyStatus(e.target.value); setAnomalyPage(1); }}
                  className="input-field text-sm py-1.5 min-w-[120px]"
                >
                  <option value="all">全部</option>
                  <option value="unresolved">未處理</option>
                  <option value="resolved">已處理</option>
                </select>
              </div>
              <button
                onClick={handleScan}
                disabled={scanLoading || !anomalyDateFrom || !anomalyDateTo}
                className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {scanLoading ? '掃描中...' : '掃描異常'}
              </button>
            </div>
          </div>

          {/* 異常記錄列表 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {anomalyLoading ? (
              <div className="text-center text-gray-400 py-12">載入中...</div>
            ) : anomalies.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">{'✓'}</div>
                <div>沒有異常記錄</div>
                <div className="text-xs mt-1">選擇日期範圍後點擊「掃描異常」以檢查</div>
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">日期</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">員工</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">異常類型</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">描述</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">關聯記錄</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">狀態</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {anomalies.map((a: any) => (
                      <tr key={a.id} className={`hover:bg-gray-50 ${a.anomaly_is_resolved ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {a.anomaly_date ? fmtDate(a.anomaly_date) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-800">{a.employee?.name_zh || '-'}</span>
                            {a.employee?.emp_code && (
                              <span className="text-[10px] text-gray-400 font-mono">{a.employee.emp_code}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ANOMALY_TYPE_BADGE[a.anomaly_type] || 'bg-gray-100 text-gray-700'}`}>
                            {ANOMALY_TYPE_LABELS[a.anomaly_type] || a.anomaly_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[300px]">
                          <span className="line-clamp-2">{a.anomaly_description}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 space-y-0.5">
                          {a.attendance && (
                            <div>
                              <span className="text-teal-600 font-medium">打卡</span> #{a.attendance.id}{' '}
                              {a.attendance.type === 'clock_in' ? '開工' : '收工'}{' '}
                              {a.attendance.timestamp && new Date(a.attendance.timestamp).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                          {a.work_log && (
                            <div>
                              <span className="text-blue-600 font-medium">工作紀錄</span> #{a.work_log.id}{' '}
                              {a.work_log.day_night || ''}{' '}
                              {a.work_log.start_location || ''}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.anomaly_is_resolved ? (
                            <div className="flex flex-col">
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">已處理</span>
                              {a.resolver && (
                                <span className="text-[10px] text-gray-400 mt-0.5">{a.resolver.displayName || a.resolver.username}</span>
                              )}
                              {a.anomaly_resolved_notes && (
                                <span className="text-[10px] text-gray-400 mt-0.5 max-w-[120px] truncate" title={a.anomaly_resolved_notes}>
                                  {a.anomaly_resolved_notes}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">未處理</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.anomaly_is_resolved ? (
                            <button
                              onClick={() => handleUnresolve(a.id)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                            >
                              取消處理
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              {resolvingId === a.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={resolveNotes}
                                    onChange={e => setResolveNotes(e.target.value)}
                                    placeholder="備註（選填）"
                                    className="input-field text-xs py-1 w-32"
                                    onClick={e => e.stopPropagation()}
                                  />
                                  <button
                                    onClick={() => handleResolve(a.id)}
                                    className="text-xs text-white bg-green-600 hover:bg-green-700 px-2 py-1 rounded font-medium"
                                  >
                                    確認
                                  </button>
                                  <button
                                    onClick={() => { setResolvingId(null); setResolveNotes(''); }}
                                    className="text-xs text-gray-500 hover:text-gray-700 px-1 py-1"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setResolvingId(a.id)}
                                  className="text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50 font-medium"
                                >
                                  標記已處理
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 分頁 */}
                <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    共 {anomalyTotal} 筆，第 {anomalyPage}/{anomalyTotalPages || 1} 頁
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAnomalyPage(Math.max(1, anomalyPage - 1))}
                      disabled={anomalyPage <= 1}
                      className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
                    >
                      上一頁
                    </button>
                    <button
                      onClick={() => setAnomalyPage(Math.min(anomalyTotalPages, anomalyPage + 1))}
                      disabled={anomalyPage >= anomalyTotalPages}
                      className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
                    >
                      下一頁
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
