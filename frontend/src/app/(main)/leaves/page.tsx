'use client';
import { useState, useEffect, useCallback } from 'react';
import { leavesApi, employeesApi } from '@/lib/api';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import DataTable from '@/components/DataTable';
import { fmtDate } from '@/lib/dateUtils';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: '病假',
  annual: '年假',
  unpaid: '無薪假',
  other: '其他',
};

const LEAVE_TYPE_BADGE: Record<string, string> = {
  sick: 'bg-orange-100 text-orange-800 border border-orange-200 px-2 py-0.5 rounded-full text-xs font-medium',
  annual: 'bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full text-xs font-medium',
  unpaid: 'bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded-full text-xs font-medium',
  other: 'bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full text-xs font-medium',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待審批',
  approved: '已批准',
  rejected: '已拒絕',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded-full text-xs font-medium',
  approved: 'bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded-full text-xs font-medium',
  rejected: 'bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 rounded-full text-xs font-medium',
};

const DEFAULT_COLUMNS = [
  { key: 'emp_code', label: '員工編號', sortable: true },
  { key: 'employee_name', label: '員工姓名', sortable: true },
  { key: 'leave_type', label: '請假類型', sortable: true },
  { key: 'date_from', label: '開始日期', sortable: true },
  { key: 'date_to', label: '結束日期', sortable: true },
  { key: 'days', label: '天數', sortable: true },
  { key: 'status', label: '狀態', sortable: true },
  { key: 'reason', label: '原因' },
  { key: 'remarks', label: '備註' },
  { key: '_actions', label: '操作' },
];

export default function LeavesPage() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');

  // Filters
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);

  // Reject modal
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');

  const { columnConfigs, handleColumnConfigChange, handleReset, columnWidths, handleColumnResize } =
    useColumnConfig('leaves', DEFAULT_COLUMNS);

  useEffect(() => {
    employeesApi.list({ limit: 999, status: 'active' }).then(res => {
      setEmployees(res.data.data || []);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await leavesApi.list({
        page,
        limit: 20,
        search: search || undefined,
        employee_id: employeeFilter || undefined,
        leave_type: leaveTypeFilter || undefined,
        status: statusFilter || undefined,
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
  }, [page, search, employeeFilter, leaveTypeFilter, statusFilter, dateFrom, dateTo, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string, order: string) => {
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
  };

  const handleApprove = async (id: number) => {
    if (!confirm('確認批准此請假申請？')) return;
    try {
      await leavesApi.approve(id);
      load();
    } catch {
      alert('操作失敗');
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectId) return;
    try {
      await leavesApi.reject(rejectId, rejectRemarks);
      setRejectId(null);
      setRejectRemarks('');
      load();
    } catch {
      alert('操作失敗');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確認刪除此請假記錄？')) return;
    try {
      await leavesApi.delete(id);
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
      key: 'leave_type',
      label: '請假類型',
      sortable: true,
      render: (_: any, row: any) => (
        <span className={LEAVE_TYPE_BADGE[row.leave_type] || 'badge-gray'}>
          {LEAVE_TYPE_LABELS[row.leave_type] || row.leave_type || '-'}
        </span>
      ),
      exportRender: (_: any, row: any) => LEAVE_TYPE_LABELS[row.leave_type] || row.leave_type || '',
    },
    {
      key: 'date_from',
      label: '開始日期',
      sortable: true,
      render: (_: any, row: any) => row.date_from ? fmtDate(row.date_from) : '-',
      exportRender: (_: any, row: any) => row.date_from ? fmtDate(row.date_from) : '',
    },
    {
      key: 'date_to',
      label: '結束日期',
      sortable: true,
      render: (_: any, row: any) => row.date_to ? fmtDate(row.date_to) : '-',
      exportRender: (_: any, row: any) => row.date_to ? fmtDate(row.date_to) : '',
    },
    {
      key: 'days',
      label: '天數',
      sortable: true,
      render: (_: any, row: any) => (
        <span className="font-medium text-gray-800">{row.days != null ? `${row.days} 天` : '-'}</span>
      ),
      exportRender: (_: any, row: any) => row.days != null ? String(row.days) : '',
    },
    {
      key: 'status',
      label: '狀態',
      sortable: true,
      render: (_: any, row: any) => (
        <span className={STATUS_BADGE[row.status] || 'badge-gray'}>
          {STATUS_LABELS[row.status] || row.status || '-'}
        </span>
      ),
      exportRender: (_: any, row: any) => STATUS_LABELS[row.status] || row.status || '',
    },
    {
      key: 'reason',
      label: '原因',
      render: (_: any, row: any) => (
        <span className="text-sm text-gray-600 max-w-[200px] truncate block" title={row.reason}>
          {row.reason || '-'}
        </span>
      ),
      exportRender: (_: any, row: any) => row.reason || '',
    },
    {
      key: 'remarks',
      label: '備註',
      render: (_: any, row: any) => (
        <span className="text-sm text-gray-500 max-w-[150px] truncate block" title={row.remarks}>
          {row.remarks || '-'}
        </span>
      ),
      exportRender: (_: any, row: any) => row.remarks || '',
    },
    {
      key: '_actions',
      label: '操作',
      render: (_: any, row: any) => (
        <div className="flex gap-1.5 items-center">
          {row.status === 'pending' && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleApprove(row.id); }}
                className="text-green-600 hover:text-green-800 text-xs px-2 py-1 rounded hover:bg-green-50 border border-green-200 transition-colors"
              >
                批准
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setRejectId(row.id); setRejectRemarks(''); }}
                className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 border border-red-200 transition-colors"
              >
                拒絕
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
            className="text-gray-400 hover:text-red-600 text-xs px-1.5 py-1 rounded hover:bg-red-50 transition-colors"
            title="刪除"
          >
            ✕
          </button>
        </div>
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

      {/* Leave type filter */}
      <select
        value={leaveTypeFilter}
        onChange={e => { setLeaveTypeFilter(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5 min-w-[110px]"
      >
        <option value="">全部類型</option>
        <option value="sick">病假</option>
        <option value="annual">年假</option>
        <option value="unpaid">無薪假</option>
        <option value="other">其他</option>
      </select>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5 min-w-[110px]"
      >
        <option value="">全部狀態</option>
        <option value="pending">待審批</option>
        <option value="approved">已批准</option>
        <option value="rejected">已拒絕</option>
      </select>

      {/* Date range */}
      <input
        type="date"
        value={dateFrom}
        onChange={e => { setDateFrom(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5"
      />
      <span className="text-gray-400 text-sm">至</span>
      <input
        type="date"
        value={dateTo}
        onChange={e => { setDateTo(e.target.value); setPage(1); }}
        className="input-field text-sm py-1.5"
      />

      {/* Clear filters */}
      {(employeeFilter || leaveTypeFilter || statusFilter || dateFrom || dateTo) && (
        <button
          onClick={() => {
            setEmployeeFilter(''); setLeaveTypeFilter(''); setStatusFilter('');
            setDateFrom(''); setDateTo(''); setPage(1);
          }}
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
        <h1 className="text-2xl font-bold text-gray-900">請假紀錄</h1>
        <p className="text-sm text-gray-500 mt-1">員工請假申請管理（病假 / 年假）</p>
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
        exportFilename="請假紀錄"
        columnConfigs={columnConfigs}
        onColumnConfigChange={handleColumnConfigChange}
        onColumnConfigReset={handleReset}
        columnWidths={columnWidths}
        onColumnResize={handleColumnResize}
      />

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">拒絕請假申請</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">拒絕原因（選填）</label>
              <textarea
                value={rejectRemarks}
                onChange={e => setRejectRemarks(e.target.value)}
                className="input-field"
                rows={3}
                placeholder="請輸入拒絕原因..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setRejectId(null); setRejectRemarks(''); }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleRejectConfirm}
                className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
              >
                確認拒絕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
