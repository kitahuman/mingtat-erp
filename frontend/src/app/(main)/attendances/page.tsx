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
  { key: 'role_title', label: '職位' },
  { key: 'date', label: '日期', sortable: true },
  { key: 'type', label: '打卡類型', sortable: true },
  { key: 'is_mid_shift', label: '中直' },
  { key: 'time', label: '時間', sortable: true },
  { key: 'gps', label: 'GPS 位置' },
  { key: 'photo', label: '相片' },
  { key: 'work_notes', label: '工作備註' },
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
      render: (_: any, row: any) => (
        <span className="text-sm text-blue-600 font-medium">{row.employee?.role_title || '-'}</span>
      ),
      exportRender: (_: any, row: any) => row.employee?.role_title || '',
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
            title="點擊放大查看"
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">打卡記錄</h1>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        onPageChange={setPage}
        onSort={handleSort}
        sortBy={sortBy}
        sortOrder={sortOrder}
        filters={filters}
        columnConfigs={columnConfigs}
        onColumnConfigChange={handleColumnConfigChange}
        onResetColumns={handleReset}
        columnWidths={columnWidths}
        onColumnResize={handleColumnResize}
        exportFilename={`attendances_${new Date().toISOString().split('T')[0]}`}
      />

      {/* Map Modal */}
      <Modal
        open={mapModal.open}
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
              <MiniMap lat={mapModal.lat} lng={mapModal.lng} />
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
        open={photoModal.open}
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
    </div>
  );
}
