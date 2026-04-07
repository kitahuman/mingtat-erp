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

const DEFAULT_COLUMNS = [
  { key: 'emp_code', label: '員工編號', sortable: true },
  { key: 'employee_name', label: '員工姓名', sortable: true },
  { key: 'date', label: '日期', sortable: true },
  { key: 'type', label: '打卡類型', sortable: true },
  { key: 'time', label: '時間', sortable: true },
  { key: 'gps', label: 'GPS 位置' },
  { key: 'photo', label: '相片' },
  { key: 'remarks', label: '備註' },
];

export default function AttendancesPage() {
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
        <span className="font-medium">{row.employee?.name_zh || row.employee?.name_en || '-'}</span>
      ),
      exportRender: (_: any, row: any) => row.employee?.name_zh || row.employee?.name_en || '',
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
                  📍 {row.address}
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
        if (row.address) return <span className="text-xs text-gray-600">📍 {row.address}</span>;
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
        if (!row.photo_url) return <span className="text-gray-400 text-xs">-</span>;
        return (
          <a href={row.photo_url} target="_blank" rel="noopener noreferrer">
            <img
              src={row.photo_url}
              alt="打卡相片"
              className="w-10 h-10 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity"
            />
          </a>
        );
      },
      exportRender: (_: any, row: any) => row.photo_url || '',
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
        placeholder="開始日期"
      />
      <span className="text-gray-400 text-sm">至</span>
      {/* Date to */}
      <input
        type="date"
        value={dateTo}
        onChange={e => { setDateTo(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5"
        placeholder="結束日期"
      />

      {/* Clear filters */}
      {(employeeFilter || typeFilter || dateFrom || dateTo) && (
        <button
          onClick={() => { setEmployeeFilter(''); setTypeFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          清除篩選
        </button>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">打卡紀錄</h1>
        <p className="text-sm text-gray-500 mt-1">員工開工 / 收工打卡記錄管理</p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        limit={20}
        onPageChange={setPage}
        onSearch={(s) => { setSearch(s); setPage(1); }}
        searchPlaceholder="搜尋員工姓名、編號..."
        filters={filters}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        exportFilename="打卡紀錄"
        columnConfigs={columnConfigs}
        onColumnConfigChange={handleColumnConfigChange}
        onColumnConfigReset={handleReset}
        columnWidths={columnWidths}
        onColumnResize={handleColumnResize}
      />

      {/* Map Modal */}
      <Modal
        isOpen={mapModal.open}
        onClose={() => setMapModal({ ...mapModal, open: false })}
        title="打卡位置地圖"
        size="lg"
      >
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            {mapModal.employeeName && (
              <p className="text-sm font-medium text-gray-800">
                👤 {mapModal.employeeName}
              </p>
            )}
            {mapModal.time && (
              <p className="text-xs text-gray-500">🕐 {mapModal.time}</p>
            )}
            {mapModal.address && (
              <p className="text-sm text-gray-700">📍 {mapModal.address}</p>
            )}
            <p className="text-xs text-gray-400 font-mono">
              {mapModal.lat.toFixed(6)}, {mapModal.lng.toFixed(6)}
            </p>
          </div>

          {mapModal.open && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ height: '350px' }}>
                  <div className="text-gray-400 text-sm">載入地圖中...</div>
                </div>
              }
            >
              <MiniMap
                latitude={mapModal.lat}
                longitude={mapModal.lng}
                height="350px"
                zoom={16}
              />
            </Suspense>
          )}

          <div className="flex justify-end">
            <a
              href={`https://www.google.com/maps?q=${mapModal.lat},${mapModal.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
            >
              在 Google Maps 中開啟
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </Modal>
    </div>
  );
}
