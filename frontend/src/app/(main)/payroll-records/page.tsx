'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { payrollApi, companiesApi, employeesApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import { fmtDate } from '@/lib/dateUtils';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';

const STATUS_LABELS: Record<string, string> = {
  preparing: '準備中',
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
};
const STATUS_COLORS: Record<string, string> = {
  preparing: 'bg-amber-100 text-amber-800',
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
};

export default function PayrollRecordsPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [loading, setLoading] = useState(true);

  // Filters
  const [period, setPeriod] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [totals, setTotals] = useState<any>(null);

  useEffect(() => {
    companiesApi.simple().then((res) => setCompanies(res.data));
    employeesApi
      .list({ limit: 999 })
      .then((res) => setEmployees(res.data.data || []));
  }, []);

  useRefetchOnFocus(() => {
    companiesApi.simple().then((res) => setCompanies(res.data));
    employeesApi
      .list({ limit: 999 })
      .then((res) => setEmployees(res.data.data || []));
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit, sortBy, sortOrder };
      if (period) params.period = period;
      if (companyId) params.company_id = companyId;
      if (statusFilter) params.status = statusFilter;
      if (employeeId) params.employee_id = employeeId;
      if (search) params.search = search;

      const res = await payrollApi.list(params);
      setData(res.data.data);
      setTotal(res.data.total);
      setTotals({
        base_amount: res.data.sum_base_amount || 0,
        allowance_total: res.data.sum_allowance_total || 0,
        ot_total: res.data.sum_ot_total || 0,
        commission_total: res.data.sum_commission_total || 0,
        mpf_deduction: res.data.sum_mpf_deduction || 0,
        adjustment_total: res.data.sum_adjustment_total || 0,
        net_amount: res.data.sum_net_amount || 0,
      });
      setSelectedIds(new Set());
      setSelectAll(false);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [
    page,
    period,
    companyId,
    statusFilter,
    employeeId,
    search,
    sortBy,
    sortOrder,
  ]);

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIds(new Set(data.map((row: any) => row.row_id || String(row.id))));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
    setSelectAll(newSelected.size === data.length && data.length > 0);
  };

  const getDisplayTotals = () => {
    if (selectedIds.size > 0) {
      // Calculate totals for selected items
      const selectedData = data.filter((row: any) => selectedIds.has(row.row_id || String(row.id)));
      return {
        base_amount: selectedData.reduce((sum: number, row: any) => sum + Number(row.base_amount || 0), 0),
        allowance_total: selectedData.reduce((sum: number, row: any) => sum + Number(row.allowance_total || 0), 0),
        ot_total: selectedData.reduce((sum: number, row: any) => sum + Number(row.ot_total || 0), 0),
        commission_total: selectedData.reduce((sum: number, row: any) => sum + Number(row.commission_total || 0), 0),
        mpf_deduction: selectedData.reduce((sum: number, row: any) => sum + Number(row.mpf_deduction || 0), 0),
        adjustment_total: selectedData.reduce((sum: number, row: any) => sum + Number(row.adjustment_total || 0), 0),
        net_amount: selectedData.reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0),
      };
    }
    return totals;
  };

  const displayTotals = getDisplayTotals();

  const columns = [
    {
      key: 'select',
      label: '',
      headerRender: () => (
        <input
          type="checkbox"
          checked={selectAll}
          onChange={(e) => handleSelectAll(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300"
        />
      ),
      render: (_v: any, row: any) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.row_id || String(row.id))}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            handleSelectRow(row.row_id || String(row.id), e.target.checked);
          }}
          className="w-4 h-4 rounded border-gray-300"
        />
      ),
      className: 'w-12',
    },
    { key: 'period', label: '月份', sortable: true },
    {
      key: 'employee',
      label: '員工',
      render: (_v: any, row: any) => (
        <div>
          <div className="font-medium">{row.employee?.name_zh}</div>
          <div className="text-xs text-gray-500">{row.employee?.emp_code}</div>
        </div>
      ),
    },
    {
      key: 'company',
      label: '公司',
      render: (_v: any, row: any) =>
        row.employee?.company?.internal_prefix ||
        row.employee?.company?.name ||
        '-',
    },
    {
      key: 'salary_type',
      label: '類型',
      render: (_v: any, row: any) =>
        row.salary_type === 'daily' ? '日薪' : '月薪',
    },
    {
      key: 'base_amount',
      label: `底薪 ${displayTotals ? `$${Number(displayTotals.base_amount).toLocaleString()}` : ''}`,
      render: (_v: any, row: any) =>
        `$${Number(row.base_amount).toLocaleString()}`,
      className: 'text-right font-mono',
    },
    {
      key: 'allowance_total',
      label: `津貼 ${displayTotals ? `$${Number(displayTotals.allowance_total).toLocaleString()}` : ''}`,
      render: (_v: any, row: any) =>
        `$${Number(row.allowance_total).toLocaleString()}`,
      className: 'text-right font-mono',
    },
    {
      key: 'ot_total',
      label: `OT ${displayTotals ? `$${Number(displayTotals.ot_total).toLocaleString()}` : ''}`,
      render: (_v: any, row: any) =>
        `$${Number(row.ot_total).toLocaleString()}`,
      className: 'text-right font-mono',
    },
    {
      key: 'mpf_deduction',
      label: `強積金 ${displayTotals ? `-$${Number(displayTotals.mpf_deduction).toLocaleString()}` : ''}`,
      render: (_v: any, row: any) => (
        <span className="text-red-600">
          -${Number(row.mpf_deduction).toLocaleString()}
        </span>
      ),
      className: 'text-right font-mono',
    },
    {
      key: 'net_amount',
      label: `淨額 ${displayTotals ? `$${Number(displayTotals.net_amount).toLocaleString()}` : ''}`,
      sortable: true,
      render: (_v: any, row: any) => (
        <span className="font-bold">
          ${Number(row.net_amount).toLocaleString()}
        </span>
      ),
      className: 'text-right font-mono',
    },
    {
      key: 'status',
      label: '狀態',
      render: (_v: any, row: any) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || ''}`}
        >
          {STATUS_LABELS[row.status] || row.status}
        </span>
      ),
    },
    {
      key: 'publisher',
      label: '發佈人',
      render: (_v: any, row: any) => row.publisher_name || '-',
    },
    {
      key: 'payment_date',
      label: '付款日期',
      render: (_v: any, row: any) => fmtDate(row.payment_date),
    },
    {
      key: 'cheque_number',
      label: '支票號碼',
      render: (_v: any, row: any) => row.cheque_number || '-',
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">糧單記錄</h1>
          <p className="text-sm text-gray-500">查看所有糧單歷史記錄</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              月份
            </label>
            <input
              type="month"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPage(1);
              }}
              className="input-field w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              公司
            </label>
            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setPage(1);
              }}
              className="input-field w-48"
            >
              <option value="">全部公司</option>
              {companies.map((cp: any) => (
                <option key={cp.id} value={cp.id}>
                  {cp.internal_prefix ? cp.internal_prefix + ' - ' : ''}
                  {cp.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              員工
            </label>
            <select
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setPage(1);
              }}
              className="input-field w-48"
            >
              <option value="">全部員工</option>
              {employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name_zh} ({emp.emp_code || emp.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              狀態
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="input-field w-36"
            >
              <option value="">全部</option>
              <option value="preparing">準備中</option>
              <option value="draft">草稿</option>
              <option value="confirmed">已確認</option>
              <option value="paid">已付款</option>
            </select>
          </div>
          {(period || companyId || employeeId || statusFilter) && (
            <button
              onClick={() => {
                setPeriod('');
                setCompanyId('');
                setEmployeeId('');
                setStatusFilter('');
                setPage(1);
              }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              清除篩選
            </button>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="card mb-4 bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-700">
            已選擇 {selectedIds.size} 項糧單
          </p>
        </div>
      )}

      <DataTable
        exportFilename="糧單記錄"
        columns={columns}
        data={data}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onSearch={(s) => {
          setSearch(s);
          setPage(1);
        }}
        searchPlaceholder="搜尋員工姓名/編號..."
        onRowClick={(row) => {
          if (row.record_type === 'ai_session' && row.ai_session_id) {
            router.push(`/payroll/ai-reconcile/${row.ai_session_id}`);
            return;
          }
          router.push(`/payroll/${row.id}`);
        }}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={(key, order) => {
          setSortBy(key);
          setSortOrder(order as 'ASC' | 'DESC');
        }}
      />
    </div>
  );
}
