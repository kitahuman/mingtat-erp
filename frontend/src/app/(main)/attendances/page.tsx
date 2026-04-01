'use client';
import { useState, useEffect, useCallback } from 'react';
import { attendancesApi, employeesApi } from '@/lib/api';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import DataTable from '@/components/DataTable';
import { fmtDate } from '@/lib/dateUtils';

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
            <a
              href={`https://maps.google.com/?q=${row.latitude},${row.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-xs"
            >
              {Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}
            </a>
          );
        }
        if (row.address) return <span className="text-xs text-gray-600">{row.address}</span>;
        return <span className="text-gray-400 text-xs">-</span>;
      },
      exportRender: (_: any, row: any) => {
        if (row.latitude && row.longitude) return `${row.latitude}, ${row.longitude}`;
        return row.address || '';
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
    </div>
  );
}
