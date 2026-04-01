'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { payrollApi, companyProfilesApi, employeesApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import { fmtDate } from '@/lib/dateUtils';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
};
const STATUS_COLORS: Record<string, string> = {
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
  const [companyProfileId, setCompanyProfileId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [companyProfiles, setCompanyProfiles] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    companyProfilesApi.simple().then(res => setCompanyProfiles(res.data));
    employeesApi.list({ limit: 999 }).then(res => setEmployees(res.data.data || []));
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit, sortBy, sortOrder };
      if (period) params.period = period;
      if (companyProfileId) params.company_profile_id = companyProfileId;
      if (statusFilter) params.status = statusFilter;
      if (employeeId) params.employee_id = employeeId;
      if (search) params.search = search;

      const res = await payrollApi.list(params);
      setData(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [page, period, companyProfileId, statusFilter, employeeId, search, sortBy, sortOrder]);

  const columns = [
    { key: 'period', label: '月份', sortable: true },
    { key: 'employee', label: '員工', render: (_v: any, row: any) => (
      <div>
        <div className="font-medium">{row.employee?.name_zh}</div>
        <div className="text-xs text-gray-500">{row.employee?.emp_code}</div>
      </div>
    )},
    { key: 'company', label: '公司', render: (_v: any, row: any) => row.employee?.company?.internal_prefix || row.employee?.company?.name || '-' },
    { key: 'salary_type', label: '類型', render: (_v: any, row: any) => row.salary_type === 'daily' ? '日薪' : '月薪' },
    { key: 'base_amount', label: '底薪', render: (_v: any, row: any) => `$${Number(row.base_amount).toLocaleString()}`, className: 'text-right font-mono' },
    { key: 'allowance_total', label: '津貼', render: (_v: any, row: any) => `$${Number(row.allowance_total).toLocaleString()}`, className: 'text-right font-mono' },
    { key: 'ot_total', label: 'OT', render: (_v: any, row: any) => `$${Number(row.ot_total).toLocaleString()}`, className: 'text-right font-mono' },
    { key: 'mpf_deduction', label: '強積金', render: (_v: any, row: any) => <span className="text-red-600">-${Number(row.mpf_deduction).toLocaleString()}</span>, className: 'text-right font-mono' },
    { key: 'net_amount', label: '淨額', sortable: true, render: (_v: any, row: any) => <span className="font-bold">${Number(row.net_amount).toLocaleString()}</span>, className: 'text-right font-mono' },
    { key: 'status', label: '狀態', render: (_v: any, row: any) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || ''}`}>
        {STATUS_LABELS[row.status] || row.status}
      </span>
    )},
    { key: 'payment_date', label: '付款日期', render: (_v: any, row: any) => fmtDate(row.payment_date) },
    { key: 'cheque_number', label: '支票號碼', render: (_v: any, row: any) => row.cheque_number || '-' },
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
            <label className="block text-xs font-medium text-gray-500 mb-1">月份</label>
            <input
              type="month"
              value={period}
              onChange={e => { setPeriod(e.target.value); setPage(1); }}
              className="input-field w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">公司</label>
            <select
              value={companyProfileId}
              onChange={e => { setCompanyProfileId(e.target.value); setPage(1); }}
              className="input-field w-48"
            >
              <option value="">全部公司</option>
              {companyProfiles.map((cp: any) => (
                <option key={cp.id} value={cp.id}>{cp.code} - {cp.chinese_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">員工</label>
            <select
              value={employeeId}
              onChange={e => { setEmployeeId(e.target.value); setPage(1); }}
              className="input-field w-48"
            >
              <option value="">全部員工</option>
              {employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>{emp.name_zh} ({emp.emp_code || emp.id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">狀態</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="input-field w-36"
            >
              <option value="">全部</option>
              <option value="draft">草稿</option>
              <option value="confirmed">已確認</option>
              <option value="paid">已付款</option>
            </select>
          </div>
          {(period || companyProfileId || employeeId || statusFilter) && (
            <button
              onClick={() => { setPeriod(''); setCompanyProfileId(''); setEmployeeId(''); setStatusFilter(''); setPage(1); }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              清除篩選
            </button>
          )}
        </div>
      </div>

      <DataTable
          exportFilename="糧單記錄"
        columns={columns}
        data={data}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onSearch={(s) => { setSearch(s); setPage(1); }}
        searchPlaceholder="搜尋員工姓名/編號..."
        onRowClick={(row) => router.push(`/payroll/${row.id}`)}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={(key, order) => { setSortBy(key); setSortOrder(order as 'ASC' | 'DESC'); }}
      />
    </div>
  );
}
