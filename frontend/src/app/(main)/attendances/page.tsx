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
  clock_in: '\u958b\u5de5',
  clock_out: '\u6536\u5de5',
};

const TYPE_BADGE: Record<string, string> = {
  clock_in: 'bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded-full text-xs font-medium',
  clock_out: 'bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full text-xs font-medium',
};

const DEFAULT_COLUMNS = [
  { key: 'emp_code', label: '\u54e1\u5de5\u7de8\u865f', sortable: true },
  { key: 'employee_name', label: '\u54e1\u5de5\u59d3\u540d', sortable: true },
  { key: 'date', label: '\u65e5\u671f', sortable: true },
  { key: 'type', label: '\u6253\u5361\u985e\u578b', sortable: true },
  { key: 'time', label: '\u6642\u9593', sortable: true },
  { key: 'gps', label: 'GPS \u4f4d\u7f6e' },
  { key: 'photo', label: '\u76f8\u7247' },
  { key: 'remarks', label: '\u5099\u8a3b' },
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
    if (!confirm('\u78ba\u8a8d\u522a\u9664\u6b64\u6253\u5361\u8a18\u9304\uff1f')) return;
    try {
      await attendancesApi.delete(id);
      load();
    } catch {
      alert('\u522a\u9664\u5931\u6557');
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
      label: '\u54e1\u5de5\u7de8\u865f',
      sortable: true,
      render: (_: any, row: any) => (
        <span className="font-mono text-sm text-gray-700">{row.employee?.emp_code || '-'}</span>
      ),
      exportRender: (_: any, row: any) => row.employee?.emp_code || '',
    },
    {
      key: 'employee_name',
      label: '\u54e1\u5de5\u59d3\u540d',
      sortable: true,
      render: (_: any, row: any) => (
        <span className="font-medium">{row.employee?.name_zh || row.employee?.name_en || '-'}</span>
      ),
      exportRender: (_: any, row: any) => row.employee?.name_zh || row.employee?.name_en || '',
    },
    {
      key: 'date',
      label: '\u65e5\u671f',
      sortable: true,
      render: (_: any, row: any) => {
        if (!row.timestamp) return '-';
        return fmtDate(row.timestamp);
      },
      exportRender: (_: any, row: any) => row.timestamp ? fmtDate(row.timestamp) : '',
    },
    {
      key: 'type',
      label: '\u6253\u5361\u985e\u578b',
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
      label: '\u6642\u9593',
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
      label: 'GPS \u4f4d\u7f6e',
      render: (_: any, row: any) => {
        if (row.latitude && row.longitude) {
          return (
            <div className="space-y-1">
              {row.address && (
                <p className="text-xs text-gray-700 font-medium leading-tight max-w-[200px] truncate" title={row.address}>
                  {'\u{1F4CD}'} {row.address}
                </p>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); openMapModal(row); }}
                className="text-blue-600 hover:text-blue-800 hover:underline text-xs flex items-center gap-1 transition-colors"
                title="\u9ede\u64ca\u67e5\u770b\u5730\u5716"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                {Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}
              </button>
            </div>
          );
        }
        if (row.address) return <span className="text-xs text-gray-600">{'\u{1F4CD}'} {row.address}</span>;
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
      label: '\u76f8\u7247',
      render: (_: any, row: any) => {
        const photoSrc = getPhotoSrc(row);
        if (!photoSrc) return <span className="text-gray-400 text-xs">-</span>;
        return (
          <img
            src={photoSrc}
            alt="\u6253\u5361\u76f8\u7247"
            className="w-10 h-10 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setPhotoModal({ open: true, src: photoSrc }); }}
            title="\u9ede\u64ca\u653e\u5927\u67e5\u770b"
          />
        );
      },
      exportRender: (_: any, row: any) => row.photo_url || (row.attendance_photo_base64 ? '[base64\u76f8\u7247]' : ''),
    },
    {
      key: 'remarks',
      label: '\u5099\u8a3b',
      render: (_: any, row: any) => (
        <span className="text-sm text-gray-600">{row.remarks || '-'}</span>
      ),
      exportRender: (_: any, row: any) => row.remarks || '',
    },
    {
      key: '_actions',
      label: '\u64cd\u4f5c',
      render: (_: any, row: any) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
          className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors"
        >
          \u522a\u9664
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
        <option value="">\u5168\u90e8\u54e1\u5de5</option>
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
        <option value="">\u5168\u90e8\u985e\u578b</option>
        <option value="clock_in">\u958b\u5de5</option>
        <option value="clock_out">\u6536\u5de5</option>
      </select>

      {/* Date from */}
      <input
        type="date"
        value={dateFrom}
        onChange={e => { setDateFrom(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5"
        placeholder="\u958b\u59cb\u65e5\u671f"
      />
      <span className="text-gray-400 text-sm">\u81f3</span>
      {/* Date to */}
      <input
        type="date"
        value={dateTo}
        onChange={e => { setDateTo(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5"
        placeholder="\u7d50\u675f\u65e5\u671f"
      />

      {/* Clear filters */}
      {(employeeFilter || typeFilter || dateFrom || dateTo) && (
        <button
          onClick={() => { setEmployeeFilter(''); setTypeFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          \u6e05\u9664\u7be9\u9078
        </button>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">\u6253\u5361\u7d00\u9304</h1>
        <p className="text-sm text-gray-500 mt-1">\u54e1\u5de5\u958b\u5de5 / \u6536\u5de5\u6253\u5361\u8a18\u9304\u7ba1\u7406</p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        limit={20}
        onPageChange={setPage}
        onSearch={(s) => { setSearch(s); setPage(1); }}
        searchPlaceholder="\u641c\u5c0b\u54e1\u5de5\u59d3\u540d\u3001\u7de8\u865f..."
        filters={filters}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        exportFilename="\u6253\u5361\u7d00\u9304"
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
        title="\u6253\u5361\u4f4d\u7f6e\u5730\u5716"
        size="lg"
      >
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            {mapModal.employeeName && (
              <p className="text-sm font-medium text-gray-800">
                {'\u{1F464}'} {mapModal.employeeName}
              </p>
            )}
            {mapModal.time && (
              <p className="text-xs text-gray-500">{'\u{1F550}'} {mapModal.time}</p>
            )}
            {mapModal.address && (
              <p className="text-sm text-gray-700">{'\u{1F4CD}'} {mapModal.address}</p>
            )}
            <p className="text-xs text-gray-400 font-mono">
              {mapModal.lat.toFixed(6)}, {mapModal.lng.toFixed(6)}
            </p>
          </div>

          {mapModal.open && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ height: '350px' }}>
                  <div className="text-gray-400 text-sm">\u8f09\u5165\u5730\u5716\u4e2d...</div>
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
              \u5728 Google Maps \u4e2d\u958b\u555f
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </Modal>

      {/* Photo Modal */}
      {photoModal.open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
          onClick={() => setPhotoModal({ open: false, src: '' })}
        >
          <div className="relative max-w-2xl max-h-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPhotoModal({ open: false, src: '' })}
              className="absolute -top-10 right-0 text-white text-2xl hover:text-gray-300 transition-colors"
              aria-label="\u95dc\u9589"
            >
              &times;
            </button>
            <img
              src={photoModal.src}
              alt="\u6253\u5361\u76f8\u7247"
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
