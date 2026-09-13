'use client';
import { usePageState } from '@/hooks/usePageState';

import { useState, useEffect, useCallback, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { payrollApi, companiesApi, employeesApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import type { ColumnConfig } from '@/components/ColumnCustomizer';
import { fmtDate } from '@/lib/dateUtils';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { useColumnConfig } from '@/hooks/useColumnConfig';

const STATUS_LABELS: Record<string, string> = {
  preparing: '準備中',
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
  partially_paid: '部分付款',
};
const STATUS_COLORS: Record<string, string> = {
  preparing: 'bg-amber-100 text-amber-800',
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  partially_paid: 'bg-orange-100 text-orange-800',
};

type PayrollRecordRow = {
  id: number;
  row_id?: string;
  record_type?: string;
  ai_session_id?: number;
  status?: string;
  period?: string;
  base_amount?: number | string | null;
  allowance_total?: number | string | null;
  ot_total?: number | string | null;
  commission_total?: number | string | null;
  mpf_deduction?: number | string | null;
  mpf_employer?: number | string | null;
  mpf_relevant_income?: number | string | null;
  mpf_plan?: string | null;
  mpf_days?: number | string | null;
  adjustment_total?: number | string | null;
  net_amount?: number | string | null;
  employee?: {
    name_zh?: string;
    emp_code?: string;
    mpf_plan?: string | null;
    company?: { internal_prefix?: string; name?: string };
  };
  salary_type?: string;
  publisher_name?: string | null;
  payment_date?: string | null;
  cheque_number?: string | null;
  created_at?: string | null;
};

type CompanyOption = {
  id: number | string;
  internal_prefix?: string | null;
  name?: string | null;
};

type EmployeeOption = {
  id: number | string;
  name_zh?: string | null;
  emp_code?: string | number | null;
};

type PayrollTotals = {
  base_amount: number;
  allowance_total: number;
  ot_total: number;
  commission_total: number;
  mpf_deduction: number;
  mpf_employer: number;
  adjustment_total: number;
  net_amount: number;
};

type PayrollBulkDeleteResult = {
  deleted: number;
  skipped: number;
  skippedIds: number[];
};

const PAYROLL_RECORDS_COLUMNS_STORAGE_KEY = 'payroll-records-columns';

const DEFAULT_COLUMN_CONFIGS: ColumnConfig[] = [
  { key: 'period', label: '月份', visible: true, order: 0 },
  { key: 'employee', label: '員工', visible: true, order: 1 },
  { key: 'mpf_plan', label: '強積金計劃公司', visible: true, order: 2 },
  { key: 'company', label: '公司', visible: true, order: 3 },
  { key: 'salary_type', label: '類型', visible: true, order: 4 },
  { key: 'base_amount', label: '底薪', visible: true, order: 5 },
  { key: 'allowance_total', label: '津貼', visible: true, order: 6 },
  { key: 'ot_total', label: 'OT', visible: true, order: 7 },
  { key: 'mpf_relevant_income', label: 'MPF薪金', visible: true, order: 8 },
  { key: 'mpf_deduction', label: '強積金（僱員）', visible: true, order: 9 },
  { key: 'mpf_employer', label: '強積金（僱主）', visible: true, order: 10 },
  { key: 'net_amount', label: '淨額', visible: true, order: 11 },
  { key: 'status', label: '狀態', visible: true, order: 12 },
  { key: 'publisher', label: '發佈人', visible: true, order: 13 },
  { key: 'payment_date', label: '付款日期', visible: true, order: 14 },
  { key: 'cheque_number', label: '支票號碼', visible: true, order: 15 },
  { key: 'created_at', label: '建立日期', visible: true, order: 16 },
];

const normalizeColumnConfigs = (configs: ColumnConfig[] | null): ColumnConfig[] => {
  if (!configs) return DEFAULT_COLUMN_CONFIGS;

  const savedByKey = new Map(configs.map((config) => [config.key, config]));
  return DEFAULT_COLUMN_CONFIGS.map((defaultConfig) => {
    const savedConfig = savedByKey.get(defaultConfig.key);
    return {
      ...defaultConfig,
      visible: savedConfig?.visible ?? defaultConfig.visible,
      order: savedConfig?.order ?? defaultConfig.order,
      width: savedConfig?.width,
    };
  }).sort((a, b) => a.order - b.order)
    .map((config, index) => ({ ...config, order: index }));
};

const mpfPlanLabel = (plan?: string | null) => {
  if (plan === 'industry') return '東亞（行業計劃）';
  if (plan === 'exempt_age65') return '過65歲, 不用供';
  if (plan === 'manulife') return '宏利';
  if (plan === 'aia') return 'AIA';
  return plan || '未設定';
};

const loadColumnConfigs = (): ColumnConfig[] => {
  if (typeof window === 'undefined') return DEFAULT_COLUMN_CONFIGS;

  try {
    const saved = window.localStorage.getItem(PAYROLL_RECORDS_COLUMNS_STORAGE_KEY);
    if (!saved) return DEFAULT_COLUMN_CONFIGS;
    return normalizeColumnConfigs(JSON.parse(saved) as ColumnConfig[]);
  } catch {
    return DEFAULT_COLUMN_CONFIGS;
  }
};

export default function PayrollRecordsPage() {
  const router = useRouter();
  const [data, setData] = useState<PayrollRecordRow[]>([]);
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
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // Server-side column filters
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [totals, setTotals] = useState<PayrollTotals | null>(null);
  const [generatingMpfExpense, setGeneratingMpfExpense] = useState(false);
  const {
    columnConfigs,
    handleColumnConfigChange,
    handleReset: handleColumnConfigReset,
    handleSavePersonal: handleColumnConfigSavePersonal,
    handleSaveDefault: handleColumnConfigSaveDefault,
  } = useColumnConfig('payroll-records', DEFAULT_COLUMN_CONFIGS);

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
      const params: Record<string, string | number> = { page, limit, sortBy, sortOrder };
      if (period) params.period = period;
      if (companyId) params.company_id = companyId;
      if (statusFilter) params.status = statusFilter;
      if (employeeId) params.employee_id = employeeId;
      if (search) params.search = search;
      // 欄頂篩選（server-side）
      Object.entries(columnFilters).forEach(([key, values]) => {
        if (values.size > 0) {
          params[`filter_${key}`] = JSON.stringify(Array.from(values));
        } else {
          params[`filter_${key}`] = '__NO_MATCH__';
        }
      });

      const res = await payrollApi.list(params);
      setData(res.data.data);
      setTotal(res.data.total);
      setTotals({
        base_amount: res.data.sum_base_amount || 0,
        allowance_total: res.data.sum_allowance_total || 0,
        ot_total: res.data.sum_ot_total || 0,
        commission_total: res.data.sum_commission_total || 0,
        mpf_deduction: res.data.sum_mpf_deduction || 0,
        mpf_employer: res.data.sum_mpf_employer || 0,
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
    columnFilters,
  ]);

  const handleColumnFilterChange = useCallback((filters: Record<string, Set<string>>) => {
    setColumnFilters(filters);
    setPage(1);
  }, []);

  const handleFetchFilterOptions = useCallback(async (columnKey: string): Promise<string[]> => {
    const params: Record<string, string | number> = {};
    if (period) params.period = period;
    if (companyId) params.company_id = companyId;
    if (statusFilter) params.status = statusFilter;
    if (employeeId) params.employee_id = employeeId;
    if (search) params.search = search;
    // 加入現有 column filters（排除當前欄位，後端亦會再次排除作雙重保障）
    Object.entries(columnFilters).forEach(([key, values]) => {
      if (key !== columnKey && values.size > 0) {
        params[`filter_${key}`] = JSON.stringify(Array.from(values));
      }
    });
    const res = await payrollApi.filterOptions(columnKey, params);
    return Array.isArray(res.data) ? res.data : [];
  }, [period, companyId, statusFilter, employeeId, search, columnFilters]);

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIds(new Set(data.map((row) => row.row_id || String(row.id))));
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
      const selectedData = data.filter((row) => selectedIds.has(row.row_id || String(row.id)));
      return {
        base_amount: selectedData.reduce((sum: number, row) => sum + Number(row.base_amount || 0), 0),
        allowance_total: selectedData.reduce((sum: number, row) => sum + Number(row.allowance_total || 0), 0),
        ot_total: selectedData.reduce((sum: number, row) => sum + Number(row.ot_total || 0), 0),
        commission_total: selectedData.reduce((sum: number, row) => sum + Number(row.commission_total || 0), 0),
        mpf_deduction: selectedData.reduce((sum: number, row) => sum + Number(row.mpf_deduction || 0), 0),
        mpf_employer: selectedData.reduce((sum: number, row) => sum + Number(row.mpf_employer || 0), 0),
        adjustment_total: selectedData.reduce((sum: number, row) => sum + Number(row.adjustment_total || 0), 0),
        net_amount: selectedData.reduce((sum: number, row) => sum + Number(row.net_amount || 0), 0),
      };
    }
    return totals;
  };

  const displayTotals = getDisplayTotals();

  const handleBulkDelete = async () => {
    const selectedPayrollRows = data.filter((row) => selectedIds.has(row.row_id || String(row.id)) && row.record_type !== 'ai_session');
    const ids = selectedPayrollRows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
    const nonPayrollCount = selectedIds.size - ids.length;

    if (ids.length === 0) {
      alert('沒有可刪除的糧單記錄。');
      return;
    }

    const confirmed = window.confirm(`確定批量刪除 ${ids.length} 筆糧單？只有草稿或準備中狀態會被刪除。`);
    if (!confirmed) return;

    try {
      const res = await payrollApi.bulkDelete(ids);
      const result = res.data as PayrollBulkDeleteResult;
      const skipped = result.skipped + nonPayrollCount;
      alert(`已刪除 ${result.deleted} 筆，跳過 ${skipped} 筆（非草稿/準備中狀態）`);
      setSelectedIds(new Set());
      setSelectAll(false);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('批量刪除失敗，請稍後再試。');
    }
  };

  const handleGenerateMpfEmployerExpense = async () => {
    const selectedPayrollRows = data.filter((row) => selectedIds.has(row.row_id || String(row.id)) && row.record_type !== 'ai_session');
    const ids = selectedPayrollRows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);

    if (ids.length === 0) {
      alert('沒有可生成強積金支出的糧單記錄。');
      return;
    }

    setGeneratingMpfExpense(true);
    try {
      const res = await payrollApi.generateMpfEmployerExpense(ids);
      const expenseId = res.data?.expense_id || res.data?.expense?.id;
      if (!expenseId) {
        alert('已生成強積金支出，但無法取得支出紀錄 ID。');
        await loadData();
        return;
      }
      setSelectedIds(new Set());
      setSelectAll(false);
      router.push(`/expenses/${expenseId}`);
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.message || '生成強積金支出失敗，請稍後再試。');
    } finally {
      setGeneratingMpfExpense(false);
    }
  };

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
      render: (_v: unknown, row: PayrollRecordRow) => (
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
      onCellClick: (e: MouseEvent<HTMLTableCellElement>) => e.stopPropagation(),
      className: 'w-12 px-5 py-4',
    },
    { key: 'period', label: '月份', sortable: true },
    {
      key: 'employee',
      label: '員工',
      render: (_v: unknown, row: PayrollRecordRow) => (
        <div>
          <div className="font-medium">{row.employee?.name_zh}</div>
          <div className="text-xs text-gray-500">{row.employee?.emp_code}</div>
        </div>
      ),
      filterRender: (_v: unknown, row: PayrollRecordRow) => {
        if (!row.employee) return '-';
        return `${row.employee.name_zh} (${row.employee.emp_code})`;
      },
    },
    {
      key: 'mpf_plan',
      label: '強積金計劃公司',
      render: (_v: unknown, row: PayrollRecordRow) => mpfPlanLabel(row.employee?.mpf_plan),
      filterRender: (_v: unknown, row: PayrollRecordRow) => mpfPlanLabel(row.employee?.mpf_plan),
    },
    {
      key: 'company',
      label: '公司',
      render: (_v: unknown, row: PayrollRecordRow) =>
        row.employee?.company?.internal_prefix ||
        row.employee?.company?.name ||
        '-',
      filterRender: (_v: unknown, row: PayrollRecordRow) =>
        row.employee?.company?.internal_prefix ||
        row.employee?.company?.name ||
        '-',
    },
    {
      key: 'salary_type',
      label: '類型',
      render: (_v: unknown, row: PayrollRecordRow) =>
        row.salary_type === 'daily' ? '日薪' : '月薪',
      filterRender: (_v: unknown, row: PayrollRecordRow) =>
        row.salary_type === 'daily' ? '日薪' : '月薪',
    },
    {
      key: 'base_amount',
      label: `底薪 ${displayTotals ? `$${Number(displayTotals.base_amount).toLocaleString()}` : ''}`,
      render: (_v: unknown, row: PayrollRecordRow) =>
        `$${Number(row.base_amount).toLocaleString()}`,
      className: 'text-right font-mono',
    },
    {
      key: 'allowance_total',
      label: `津貼 ${displayTotals ? `$${Number(displayTotals.allowance_total).toLocaleString()}` : ''}`,
      render: (_v: unknown, row: PayrollRecordRow) =>
        `$${Number(row.allowance_total).toLocaleString()}`,
      className: 'text-right font-mono',
    },
    {
      key: 'ot_total',
      label: `OT ${displayTotals ? `$${Number(displayTotals.ot_total).toLocaleString()}` : ''}`,
      render: (_v: unknown, row: PayrollRecordRow) =>
        `$${Number(row.ot_total).toLocaleString()}`,
      className: 'text-right font-mono',
    },
    {
      key: 'mpf_relevant_income',
      label: 'MPF薪金',
      render: (_v: unknown, row: PayrollRecordRow) => {
        const income = row.mpf_relevant_income;
        if (income === null || income === undefined) return '-';
        const plan = row.mpf_plan ?? row.employee?.mpf_plan;
        if (plan === 'industry') {
          const days = row.mpf_days;
          return `$${Number(income).toLocaleString()} (${days != null ? days : '-'}天)`;
        }
        return `$${Number(income).toLocaleString()}`;
      },
      filterRender: (_v: unknown, row: PayrollRecordRow) => {
        const income = row.mpf_relevant_income;
        if (income === null || income === undefined) return '-';
        const plan = row.mpf_plan ?? row.employee?.mpf_plan;
        if (plan === 'industry') {
          const days = row.mpf_days;
          return `$${Number(income).toLocaleString()} (${days != null ? days : '-'}天)`;
        }
        return `$${Number(income).toLocaleString()}`;
      },
      className: 'text-right font-mono',
    },
    {
      key: 'mpf_deduction',
      label: `強積金（僱員） ${displayTotals ? `-$${Number(displayTotals.mpf_deduction).toLocaleString()}` : ''}`,
      render: (_v: unknown, row: PayrollRecordRow) => (
        <span className="text-red-600">
          -${Number(row.mpf_deduction).toLocaleString()}
        </span>
      ),
      className: 'text-right font-mono',
    },
    {
      key: 'mpf_employer',
      label: `強積金（僱主） ${displayTotals ? `$${Number(displayTotals.mpf_employer).toLocaleString()}` : ''}`,
      render: (_v: unknown, row: PayrollRecordRow) => (
        <span className="text-blue-600">
          ${Number(row.mpf_employer || 0).toLocaleString()}
        </span>
      ),
      className: 'text-right font-mono',
    },
    {
      key: 'net_amount',
      label: `淨額 ${displayTotals ? `$${Number(displayTotals.net_amount).toLocaleString()}` : ''}`,
      sortable: true,
      render: (_v: unknown, row: PayrollRecordRow) => (
        <span className="font-bold">
          ${Number(row.net_amount).toLocaleString()}
        </span>
      ),
      className: 'text-right font-mono',
    },
    {
      key: 'status',
      label: '狀態',
      render: (_v: unknown, row: PayrollRecordRow) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || ''}`}
        >
          {STATUS_LABELS[row.status] || row.status}
        </span>
      ),
      filterRender: (_v: unknown, row: PayrollRecordRow) => STATUS_LABELS[row.status] || row.status || '-',
    },
    {
      key: 'publisher',
      label: '發佈人',
      render: (_v: unknown, row: PayrollRecordRow) => row.publisher_name || '-',
      filterRender: (_v: unknown, row: PayrollRecordRow) => row.publisher_name || '-',
    },
    {
      key: 'payment_date',
      label: '付款日期',
      render: (_v: unknown, row: PayrollRecordRow) => fmtDate(row.payment_date),
    },
    {
      key: 'cheque_number',
      label: '支票號碼',
      render: (_v: unknown, row: PayrollRecordRow) => row.cheque_number || '-',
    },
    {
      key: 'created_at',
      label: '建立日期',
      sortable: true,
      render: (_v: unknown, row: PayrollRecordRow) => fmtDate(row.created_at),
    },
  ];

  const fixedColumns = columns.filter((column) => column.key === 'select');
  const configurableColumns = columnConfigs
    .filter((config) => config.visible)
    .map((config) => columns.find((column) => column.key === config.key))
    .filter((column): column is (typeof columns)[number] => Boolean(column));
  const visibleColumns = [...fixedColumns, ...configurableColumns];

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
              {companies.map((cp) => (
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
              {employees.map((emp) => (
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
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-700">
            已選擇 {selectedIds.size} 項糧單
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleGenerateMpfEmployerExpense()}
              disabled={generatingMpfExpense}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generatingMpfExpense ? '生成中...' : '生成強積金支出'}
            </button>
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              批量刪除
            </button>
          </div>
        </div>
      )}

      <DataTable
        exportFilename="糧單記錄"
        columns={visibleColumns}
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
            window.open(`/payroll/ai-reconcile/${row.ai_session_id}`, '_blank');
            return;
          }
          window.open(`/payroll/${row.id}`, '_blank');
        }}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={(key, order) => {
          setSortBy(key);
          setSortOrder(order as 'ASC' | 'DESC');
        }}
        columnConfigs={columnConfigs}
        onColumnConfigChange={handleColumnConfigChange}
        onColumnConfigReset={handleColumnConfigReset}
        onColumnConfigSavePersonal={handleColumnConfigSavePersonal}
        onColumnConfigSaveDefault={handleColumnConfigSaveDefault}
        serverSideFilter
        columnFilters={columnFilters}
        onColumnFilterChange={handleColumnFilterChange}
        onFetchFilterOptions={handleFetchFilterOptions}
      />
    </div>
  );
}
