'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { paymentInApi, projectsApi, contractsApi, bankAccountsApi } from '@/lib/api';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import InlineEditDataTable, { InlineColumn } from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_IN_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: '未收款', color: 'bg-yellow-100 text-yellow-700' },
  partially_paid: { label: '部分收款', color: 'bg-blue-100 text-blue-700' },
  paid: { label: '已收款', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '取消', color: 'bg-gray-100 text-gray-500' },
};

const SOURCE_TYPE_OPTIONS = [
  { value: 'payment_certificate', label: 'Payment Certificate' },
  { value: 'invoice', label: '發票' },
  { value: 'retention_release', label: '扣留金釋放' },
  { value: 'other', label: '其他收入' },
];

const SOURCE_TYPE_LABELS: Record<string, string> = {
  payment_certificate: 'Payment Certificate',
  invoice: '發票',
  retention_release: '扣留金釋放',
  other: '其他收入',
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  payment_certificate: 'bg-green-100 text-green-700',
  invoice: 'bg-blue-100 text-blue-700',
  retention_release: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function PaymentInPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [contractFilter, setContractFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Reference data
  const [projects, setProjects] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  // Create form
  const defaultForm = {
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    source_type: 'other',
    source_ref_id: '',
    project_id: '',
    contract_id: '',
    bank_account_id: '',
    reference_no: '',
    payment_in_status: 'unpaid',
    remarks: '',
  };
  const [form, setForm] = useState(defaultForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (statusFilter) params.payment_in_status = statusFilter;
      if (sourceFilter) params.source_type = sourceFilter;
      if (projectFilter) params.project_id = projectFilter;
      if (contractFilter) params.contract_id = contractFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await paymentInApi.list(params);
      setData(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, sourceFilter, projectFilter, contractFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    projectsApi.list({ limit: 500 }).then(r => setProjects(r.data?.data || [])).catch(() => {});
    contractsApi.list({ limit: 500 }).then(r => setContracts(r.data?.data || [])).catch(() => {});
    bankAccountsApi.simple().then(r => setBankAccounts(r.data || [])).catch(() => {});
  }, []);

  const projectOptions = useMemo(() =>
    projects.map(p => ({ value: p.id, label: `${p.project_no} ${p.project_name}` })),
    [projects]
  );

  const contractOptions = useMemo(() =>
    contracts.map(c => ({ value: c.id, label: `${c.contract_no} ${c.contract_name}` })),
    [contracts]
  );

  const bankAccountOptions = useMemo(() =>
    bankAccounts.map(ba => ({
      value: ba.id,
      label: `${ba.bank_name} - ${ba.account_name} (${ba.account_no})`,
    })),
    [bankAccounts]
  );

  const handleCreate = async () => {
    if (!form.date || !form.amount) return alert('請填寫日期和金額');
    setCreating(true);
    try {
      await paymentInApi.create({
        ...form,
        amount: parseFloat(form.amount as string),
        project_id: form.project_id ? Number(form.project_id) : null,
        contract_id: form.contract_id ? Number(form.contract_id) : null,
        source_ref_id: form.source_ref_id ? Number(form.source_ref_id) : null,
        bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : null,
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
    if (payload.contract_id !== undefined) payload.contract_id = payload.contract_id ? Number(payload.contract_id) : null;
    if (payload.bank_account_id !== undefined) payload.bank_account_id = payload.bank_account_id ? Number(payload.bank_account_id) : null;
    await paymentInApi.update(id, payload);
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定刪除此收款記錄？')) return;
    await paymentInApi.delete(id);
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
      key: 'source_type',
      label: '來源類型',
      editType: 'select',
      editOptions: SOURCE_TYPE_OPTIONS,
      render: (v: any) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_TYPE_COLORS[v] || 'bg-gray-100 text-gray-700'}`}>
          {SOURCE_TYPE_LABELS[v] || v}
        </span>
      ),
    },
    {
      key: 'contract',
      label: '合約',
      editable: false,
      render: (_: any, row: any) => row.contract ? (
        <span className="text-xs">{row.contract.contract_no}</span>
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
      key: 'bank_account_id',
      label: '銀行帳戶',
      editType: 'select',
      editOptions: [{ value: '', label: '（未指定）' }, ...bankAccountOptions],
      render: (_: any, row: any) => row.bank_account ? (
        <span className="text-xs">{row.bank_account.bank_name} - {row.bank_account.account_no}</span>
      ) : <span className="text-gray-400">-</span>,
    },
    {
      key: 'reference_no',
      label: '支票/交易號碼',
      editType: 'text',
      render: (v: any) => v ? <span className="font-mono text-xs">{v}</span> : <span className="text-gray-400">-</span>,
    },
    {
      key: 'payment_in_status',
      label: '狀態',
      editType: 'select',
      editOptions: [
        { value: 'unpaid', label: '未收款' },
        { value: 'partially_paid', label: '部分收款' },
        { value: 'paid', label: '已收款' },
        { value: 'cancelled', label: '取消' },
      ],
      render: (v: any) => {
        const s = PAYMENT_IN_STATUS_MAP[v] || PAYMENT_IN_STATUS_MAP.unpaid;
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
            {s.label}
          </span>
        );
      },
    },
    {
      key: 'remarks',
      label: '備註',
      editType: 'text',
      render: (v: any) => v || <span className="text-gray-400">-</span>,
    },
  ];

  const { columnConfigs, handleColumnConfigChange, handleReset, columnWidths, handleColumnResize } = useColumnConfig('payment-in', columns);

  const filters = (
    <div className="flex flex-wrap gap-2 items-center">
      <select
        value={statusFilter}
        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">全部狀態</option>
        <option value="unpaid">未收款</option>
        <option value="partially_paid">部分收款</option>
        <option value="paid">已收款</option>
        <option value="cancelled">取消</option>
      </select>
      <select
        value={sourceFilter}
        onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">全部來源</option>
        {SOURCE_TYPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        value={contractFilter}
        onChange={e => { setContractFilter(e.target.value); setPage(1); }}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">全部合約</option>
        {contractOptions.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
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
      {(statusFilter || sourceFilter || projectFilter || contractFilter || dateFrom || dateTo) && (
        <button
          onClick={() => { setStatusFilter(''); setSourceFilter(''); setProjectFilter(''); setContractFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
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
          <h1 className="text-2xl font-bold text-gray-900">收款記錄</h1>
          <p className="text-gray-500 text-sm mt-1">管理所有收款記錄，包括 Payment Certificate、扣留金釋放及其他收入</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + 新增收款
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
        searchPlaceholder="搜尋收款記錄..."
        filters={filters}
        loading={loading}
        onSave={handleSave}
        onDelete={handleDelete}
        onRowClick={(row: any) => router.push(`/payment-in/${row.id}`)}
        exportFilename="收款記錄"
        columnConfigs={columnConfigs}
        onColumnConfigChange={handleColumnConfigChange}
        onColumnConfigReset={handleReset}
        columnWidths={columnWidths}
        onColumnResize={handleColumnResize}
      />

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增收款記錄" size="lg">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">來源類型</label>
              <select
                value={form.source_type}
                onChange={e => setForm({ ...form, source_type: e.target.value })}
                className="input-field"
              >
                {SOURCE_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">來源參考 ID</label>
              <input
                type="number"
                value={form.source_ref_id}
                onChange={e => setForm({ ...form, source_ref_id: e.target.value })}
                className="input-field"
                placeholder="選填"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合約</label>
              <SearchableSelect
                value={form.contract_id ? Number(form.contract_id) : null}
                onChange={(v: any) => setForm({ ...form, contract_id: v || '' })}
                options={contractOptions}
                placeholder="選擇合約"
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
              <SearchableSelect
                value={form.bank_account_id ? Number(form.bank_account_id) : null}
                onChange={(v: any) => setForm({ ...form, bank_account_id: v || '' })}
                options={bankAccountOptions}
                placeholder="選擇銀行帳戶"
                clearable
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
              <select
                value={form.payment_in_status}
                onChange={e => setForm({ ...form, payment_in_status: e.target.value })}
                className="input-field"
              >
                <option value="unpaid">未收款</option>
                <option value="partially_paid">部分收款</option>
                <option value="paid">已收款</option>
                <option value="cancelled">取消</option>
              </select>
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
