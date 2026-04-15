'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { paymentOutApi, projectsApi, expensesApi, companiesApi } from '@/lib/api';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import InlineEditDataTable, { InlineColumn } from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';
import { fmtDate, toInputDate } from '@/lib/dateUtils';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PaymentOutPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Filters
  const [projectFilter, setProjectFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Reference data
  const [projects, setProjects] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  // Create form
  const defaultForm = {
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    expense_id: '',
    project_id: '',
    bank_account: '',
    reference_no: '',
    remarks: '',
  };
  const [form, setForm] = useState(defaultForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (projectFilter) params.project_id = projectFilter;
      if (companyFilter) params.company_id = companyFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await paymentOutApi.list(params);
      setData(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, projectFilter, companyFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    projectsApi.list({ limit: 500 }).then(r => setProjects(r.data?.data || [])).catch(() => {});
    expensesApi.list({ limit: 500 }).then(r => setExpenses(r.data?.data || [])).catch(() => {});
    companiesApi.list({ limit: 200 }).then(r => setCompanies(r.data?.data || [])).catch(() => {});
  }, []);

  const projectOptions = useMemo(() =>
    projects.map(p => ({ value: p.id, label: `${p.project_no} ${p.project_name}` })),
    [projects]
  );

  const expenseOptions = useMemo(() =>
    expenses.map(e => ({
      value: e.id,
      label: `#${e.id} ${e.item || e.supplier_name || '未命名'} ${fmt$(e.total_amount)}`,
    })),
    [expenses]
  );

  const handleCreate = async () => {
    if (!form.date || !form.amount) return alert('請填寫日期和金額');
    setCreating(true);
    try {
      await paymentOutApi.create({
        ...form,
        amount: parseFloat(form.amount as string),
        expense_id: form.expense_id ? Number(form.expense_id) : null,
        project_id: form.project_id ? Number(form.project_id) : null,
      });
      setShowCreate(false);
      setForm(defaultForm);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || '建立失敗');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (id: number, updated: any) => {
    const payload: any = { ...updated };
    if (payload.amount !== undefined) payload.amount = parseFloat(payload.amount);
    if (payload.project_id !== undefined) payload.project_id = payload.project_id ? Number(payload.project_id) : null;
    if (payload.expense_id !== undefined) payload.expense_id = payload.expense_id ? Number(payload.expense_id) : null;
    await paymentOutApi.update(id, payload);
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定刪除此付款記錄？')) return;
    await paymentOutApi.delete(id);
    fetchData();
  };

  const columns: InlineColumn[] = [
    {
      key: 'date',
      label: '日期',
      sortable: true,
      editType: 'date',
      render: (v: any) => fmtDate(v),
    },
    {
      key: 'amount',
      label: '金額',
      sortable: true,
      editType: 'number',
      render: (v: any) => <span className="font-mono">{fmt$(v)}</span>,
    },
    {
      key: 'company',
      label: '公司',
      editable: false,
      render: (_: any, row: any) => row.company ? (
        <span className="text-xs text-gray-700">{row.company.name}</span>
      ) : <span className="text-gray-400">-</span>,
    },
    {
      key: 'expense',
      label: '關聯支出',
      editable: false,
      render: (_: any, row: any) => row.expense ? (
        <span className="text-xs">
          #{row.expense.id} {row.expense.item || row.expense.supplier_name || '-'}
        </span>
      ) : row.payroll ? (
        <span className="text-xs text-indigo-600">
          糧單 #{row.payroll.id} {row.payroll.employee?.name_zh || ''}
        </span>
      ) : <span className="text-gray-400">-</span>,
    },
    {
      key: 'project',
      label: '項目',
      editable: false,
      render: (_: any, row: any) => row.project ? (
        <span className="text-xs">{row.project.project_no}</span>
      ) : <span className="text-gray-400">-</span>,
    },
    {
      key: 'bank_account',
      label: '銀行帳戶',
      editType: 'text',
      render: (v: any) => v || <span className="text-gray-400">-</span>,
    },
    {
      key: 'reference_no',
      label: '支票/交易號碼',
      editType: 'text',
      render: (v: any) => v ? <span className="font-mono text-xs">{v}</span> : <span className="text-gray-400">-</span>,
    },
    {
      key: 'remarks',
      label: '備註',
      editType: 'text',
      render: (v: any) => v || <span className="text-gray-400">-</span>,
    },
  ];

  const { columnConfigs, handleColumnConfigChange, handleReset, columnWidths, handleColumnResize } = useColumnConfig('payment-out', columns);

  const hasFilters = !!(projectFilter || companyFilter || dateFrom || dateTo);

  const filters = (
    <div className="flex flex-wrap gap-2 items-center">
      <select
        value={companyFilter}
        onChange={e => { setCompanyFilter(e.target.value); setPage(1); }}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">全部公司</option>
        {companies.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        value={projectFilter}
        onChange={e => { setProjectFilter(e.target.value); setPage(1); }}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">全部項目</option>
        {projectOptions.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <div className="flex items-center gap-1 text-sm">
        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
        <span className="text-gray-400">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </div>
      {hasFilters && (
        <button
          onClick={() => { setProjectFilter(''); setCompanyFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
          className="text-xs text-gray-500 hover:text-red-500"
        >
          清除篩選
        </button>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">付款記錄</h1>
          <p className="text-gray-500 text-sm mt-1">管理所有付款記錄，關聯支出項目</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + 新增付款
        </button>
      </div>

      <InlineEditDataTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        limit={50}
        onPageChange={setPage}
        onSearch={setSearch}
        searchPlaceholder="搜尋付款記錄..."
        filters={filters}
        loading={loading}
        onSave={handleSave}
        onDelete={handleDelete}
        exportFilename="付款記錄"
        columnConfigs={columnConfigs}
        onColumnConfigChange={handleColumnConfigChange}
        onColumnConfigReset={handleReset}
        columnWidths={columnWidths}
        onColumnResize={handleColumnResize}
        onRowClick={(row: any) => router.push(`/payment-out/${row.id}`)}
      />

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增付款記錄" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">金額 *</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="input-field"
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">關聯支出</label>
              <SearchableSelect
                value={form.expense_id ? Number(form.expense_id) : null}
                onChange={(v: any) => setForm({ ...form, expense_id: v || '' })}
                options={expenseOptions}
                placeholder="選擇支出"
                clearable
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">項目</label>
              <SearchableSelect
                value={form.project_id ? Number(form.project_id) : null}
                onChange={(v: any) => setForm({ ...form, project_id: v || '' })}
                options={projectOptions}
                placeholder="選擇項目"
                clearable
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">銀行帳戶</label>
              <input
                type="text"
                value={form.bank_account}
                onChange={e => setForm({ ...form, bank_account: e.target.value })}
                className="input-field"
                placeholder="選填"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">支票/交易號碼</label>
              <input
                type="text"
                value={form.reference_no}
                onChange={e => setForm({ ...form, reference_no: e.target.value })}
                className="input-field"
                placeholder="選填"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input
              type="text"
              value={form.remarks}
              onChange={e => setForm({ ...form, remarks: e.target.value })}
              className="input-field"
              placeholder="選填"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">取消</button>
            <button onClick={handleCreate} disabled={creating} className="btn-primary disabled:opacity-50">
              {creating ? '建立中...' : '建立'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
