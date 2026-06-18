'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  paymentInApi,
  projectsApi,
  contractsApi,
  bankAccountsApi,
  fieldOptionsApi,
  paymentInSourceTypesApi,
  partnersApi,
} from '@/lib/api';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import InlineEditDataTable, {
  InlineColumn,
} from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';
import DateInput from '@/components/DateInput';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import PaymentMatchModal from '@/components/PaymentMatchModal';

const fmt$ = (v: any) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_IN_STATUS_MAP: Record<string, { label: string; color: string }> =
  {
    unpaid: { label: '未收款', color: 'bg-yellow-100 text-yellow-700' },
    partially_paid: { label: '部分收款', color: 'bg-blue-100 text-blue-700' },
    paid: { label: '已收款', color: 'bg-green-100 text-green-700' },
    cancelled: { label: '取消', color: 'bg-gray-100 text-gray-500' },
  };

// Fallback labels/colors for source types (used when dynamic data not yet loaded)
const SOURCE_TYPE_COLORS: Record<string, string> = {
  payment_certificate: 'bg-green-100 text-green-700',
  invoice: 'bg-blue-100 text-blue-700',
  retention_release: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-700',
};

/** Helper: get payer display name from a PaymentIn record */
function getPayerDisplay(row: any): string {
  if (row.payer_partner) return row.payer_partner.name;
  if (row.payer_name) return row.payer_name;
  if (row.project?.client) return row.project.client.name;
  if (row.allocations?.[0]?.invoice?.client) return row.allocations[0].invoice.client.name;
  return '';
}

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
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  // Match modal
  const [matchModal, setMatchModal] = useState<{ id: number; amount: number; date: string } | null>(null);
  // Reference data
  const [projects, setProjects] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [sourceTypes, setSourceTypes] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

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
    payment_method: '',
    payment_in_status: 'unpaid',
    remarks: '',
    payer_partner_id: '',
    payer_name: '',
  };
  const [form, setForm] = useState(defaultForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50, sortBy, sortOrder };
      if (statusFilter) params.payment_in_status = statusFilter;
      if (sourceFilter) params.source_type = sourceFilter;
      if (projectFilter) params.project_id = projectFilter;
      if (contractFilter) params.contract_id = contractFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      // Apply column filters
      Object.entries(columnFilters).forEach(([key, values]) => {
        if (values.size > 0) params[`filter_${key}`] = Array.from(values).join(',');
      });
      if (amountMin) params.filter_amount_min = amountMin;
      if (amountMax) params.filter_amount_max = amountMax;
      const res = await paymentInApi.list(params);
      setData(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    statusFilter,
    sourceFilter,
    projectFilter,
    contractFilter,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
    columnFilters,
    amountMin,
    amountMax,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadReferenceData = useCallback(() => {
    projectsApi
      .list({ limit: 500 })
      .then((r) => setProjects(r.data?.data || []))
      .catch(() => {});
    contractsApi
      .list({ limit: 500 })
      .then((r) => setContracts(r.data?.data || []))
      .catch(() => {});
    bankAccountsApi
      .simple()
      .then((r) => setBankAccounts(r.data || []))
      .catch(() => {});
    fieldOptionsApi
      .getByCategory('payment_method')
      .then((r) => setPaymentMethods(r.data || []))
      .catch(() => {});
    paymentInSourceTypesApi
      .list()
      .then((r) => setSourceTypes(r.data || []))
      .catch(() => {});
    partnersApi
      .simple()
      .then((r) => setPartners(r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useRefetchOnFocus(loadReferenceData);

  const projectOptions = useMemo(
    () =>
      projects.map((p) => ({
        value: p.id,
        label: `${p.project_no} ${p.project_name}`,
      })),
    [projects],
  );

  const contractOptions = useMemo(
    () =>
      contracts.map((c) => ({
        value: c.id,
        label: `${c.contract_no} ${c.contract_name}`,
      })),
    [contracts],
  );

  const bankAccountOptions = useMemo(
    () =>
      bankAccounts.map((ba) => ({
        value: ba.id,
        label: `${ba.bank_name} - ${ba.account_name} (${ba.account_no})`,
      })),
    [bankAccounts],
  );

  const paymentMethodOptions = useMemo(
    () =>
      paymentMethods
        .filter((m: any) => m.is_active)
        .map((m: any) => ({ value: m.label, label: m.label })),
    [paymentMethods],
  );

  const sourceTypeOptions = useMemo(
    () => sourceTypes.map((st: any) => ({ value: st.code, label: st.label })),
    [sourceTypes],
  );

  const sourceTypeLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    sourceTypes.forEach((st: any) => { m[st.code] = st.label; });
    return m;
  }, [sourceTypes]);

  const partnerOptions = useMemo(
    () => partners.map((p: any) => ({ value: p.id, label: `${p.code || ''} ${p.name}`.trim() })),
    [partners],
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
        bank_account_id: form.bank_account_id
          ? Number(form.bank_account_id)
          : null,
        payment_method: form.payment_method || null,
        payer_partner_id: form.payer_partner_id ? Number(form.payer_partner_id) : null,
        payer_name: form.payer_name || null,
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
    if (payload.amount !== undefined)
      payload.amount = parseFloat(payload.amount);
    if (payload.project_id !== undefined)
      payload.project_id = payload.project_id
        ? Number(payload.project_id)
        : null;
    if (payload.contract_id !== undefined)
      payload.contract_id = payload.contract_id
        ? Number(payload.contract_id)
        : null;
    if (payload.bank_account_id !== undefined)
      payload.bank_account_id = payload.bank_account_id
        ? Number(payload.bank_account_id)
        : null;
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
      filterable: false,
      render: (v: any) => <span className="font-mono">{fmt$(v)}</span>,
    },
    {
      key: 'source_type',
      label: '來源類型',
      editType: 'select',
      editOptions: sourceTypeOptions.length > 0 ? sourceTypeOptions : [{ value: 'other', label: '其他收入' }],
      render: (v: any) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_TYPE_COLORS[v] || 'bg-gray-100 text-gray-700'}`}
        >
          {sourceTypeLabelMap[v] || v}
        </span>
      ),
    },
    {
      key: 'payer',
      label: '付款方',
      editable: false,
      render: (_: any, row: any) => {
        const display = getPayerDisplay(row);
        return display ? (
          <span className="text-xs">{display}</span>
        ) : (
          <span className="text-gray-400">-</span>
        );
      },
    },
    {
      key: 'company',
      label: '公司',
      editable: false,
      render: (_: any, row: any) => {
        const prefix =
          row.bank_account?.company?.internal_prefix ||
          row.allocations?.[0]?.invoice?.company?.internal_prefix;
        const name =
          row.bank_account?.company?.name ||
          row.allocations?.[0]?.invoice?.company?.name;
        const display = prefix || name;
        return display ? (
          <span className="text-xs font-medium">{display}</span>
        ) : (
          <span className="text-gray-400">-</span>
        );
      },
    },
    {
      key: 'contract',
      label: '合約',
      editable: false,
      render: (_: any, row: any) =>
        row.contract ? (
          <span className="text-xs">{row.contract.contract_no}</span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: 'project',
      label: '項目',
      editable: false,
      render: (_: any, row: any) =>
        row.project ? (
          <span className="text-xs">{row.project.project_no}</span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: 'bank_account_id',
      label: '銀行帳戶',
      editType: 'select',
      editOptions: [{ value: '', label: '（未指定）' }, ...bankAccountOptions],
      render: (_: any, row: any) =>
        row.bank_account ? (
          <span className="text-xs">
            {row.bank_account.bank_name} - {row.bank_account.account_no}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: 'payment_method',
      label: '收款方式',
      editType: 'select',
      editOptions: [
        { value: '', label: '（未指定）' },
        ...paymentMethodOptions,
      ],
      render: (v: any) =>
        v ? (
          <span className="text-xs">{v}</span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: 'reference_no',
      label: '支票/交易號碼',
      editType: 'text',
      render: (v: any) =>
        v ? (
          <span className="font-mono text-xs">{v}</span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
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
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}
          >
            {s.label}
          </span>
        );
      },
    },
    {
      key: 'deductions_total',
      label: '扣減',
      editable: false,
      render: (_: any, row: any) => {
        const total = (row.deductions || []).reduce(
          (s: number, d: any) => s + Number(d.payment_in_deduction_amount || 0),
          0,
        );
        return total > 0 ? (
          <span className="font-mono text-orange-600 text-xs">{fmt$(total)}</span>
        ) : (
          <span className="text-gray-400">-</span>
        );
      },
    },
    {
      key: 'remarks',
      label: '備註',
      editType: 'text',
      render: (v: any) => v || <span className="text-gray-400">-</span>,
    },
    {
      key: 'is_reconciled',
      label: '對帳',
      _width: 80,
      editable: false,
      filterable: false,
      render: (v: any, row: any) => v ? (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 text-xs" title="已配對">✓</span>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setMatchModal({ id: row.id, amount: Number(row.amount), date: row.date }); }}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          配對
        </button>
      ),
    },
  ];

  const {
    columnConfigs,
    handleColumnConfigChange,
    handleReset,
    columnWidths,
    handleColumnResize,
    handleSavePersonal,
    handleSaveDefault,
  } = useColumnConfig('payment-in', columns);

  const filters = (
    <div className="flex flex-wrap gap-2 items-center">
      <select
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value);
          setPage(1);
        }}
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
        onChange={(e) => {
          setSourceFilter(e.target.value);
          setPage(1);
        }}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">全部來源</option>
        {sourceTypeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={contractFilter}
        onChange={(e) => {
          setContractFilter(e.target.value);
          setPage(1);
        }}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">全部合約</option>
        {contractOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={projectFilter}
        onChange={(e) => {
          setProjectFilter(e.target.value);
          setPage(1);
        }}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">全部項目</option>
        {projectOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1 text-sm">
        <DateInput
          value={dateFrom}
          onChange={(val) => {
            setDateFrom(val || '');
            setPage(1);
          }}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
        <span className="text-gray-400">~</span>
        <DateInput
          value={dateTo}
          onChange={(val) => {
            setDateTo(val || '');
            setPage(1);
          }}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex items-center gap-1 text-sm">
        <span className="text-gray-500 text-xs">金額</span>
        <input
          type="number"
          step="0.01"
          placeholder="最小"
          value={amountMin}
          onChange={(e) => { setAmountMin(e.target.value); setPage(1); }}
          className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
        <span className="text-gray-400">~</span>
        <input
          type="number"
          step="0.01"
          placeholder="最大"
          value={amountMax}
          onChange={(e) => { setAmountMax(e.target.value); setPage(1); }}
          className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </div>
      {(statusFilter ||
        sourceFilter ||
        projectFilter ||
        contractFilter ||
        dateFrom ||
        dateTo ||
        amountMin ||
        amountMax) && (
        <button
          onClick={() => {
            setStatusFilter('');
            setSourceFilter('');
            setProjectFilter('');
            setContractFilter('');
            setDateFrom('');
            setDateTo('');
            setAmountMin('');
            setAmountMax('');
            setPage(1);
          }}
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
          <p className="text-gray-500 text-sm mt-1">
            管理所有收款記錄，包括 Payment Certificate、扣留金釋放及其他收入
          </p>
        </div>
        {!isReadOnly() && (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            + 新增收款
          </button>
        )}
      </div>

      <InlineEditDataTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        limit={50}
        onPageChange={setPage}
        loading={loading}
        onRowClick={(row) => router.push(`/payment-in/${row.id}`)}
        onSave={isReadOnly() ? undefined : handleSave}
        onDelete={isReadOnly() ? undefined : handleDelete}
        sortBy={sortBy}
        sortOrder={sortOrder as 'ASC' | 'DESC'}
        onSort={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
          setPage(1);
        }}
        filters={filters}
        columnConfigs={columnConfigs}
        onColumnConfigChange={handleColumnConfigChange}
        onColumnConfigReset={handleReset}
            onColumnConfigSavePersonal={handleSavePersonal}
            onColumnConfigSaveDefault={handleSaveDefault}
        columnWidths={columnWidths}
        onColumnResize={handleColumnResize}
        serverSideFilter={true}
        columnFilters={columnFilters}
        onColumnFilterChange={(f) => { setColumnFilters(f); setPage(1); }}
        onFetchFilterOptions={async (col) => {
          const res = await paymentInApi.filterOptions(col);
          return Array.isArray(res.data) ? res.data : [];
        }}
      />

      {/* Payment Match Modal */}
      {matchModal && (
        <PaymentMatchModal
          isOpen={!!matchModal}
          onClose={() => setMatchModal(null)}
          recordType="payment_in"
          recordId={matchModal.id}
          recordAmount={matchModal.amount}
          recordDate={matchModal.date}
          onSuccess={fetchData}
        />
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="新增收款記錄"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日期 *
              </label>
              <DateInput
                value={form.date}
                onChange={(val) => setForm({ ...form, date: val || '' })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                金額 *
              </label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="input-field"
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                來源類型
              </label>
              <select
                value={form.source_type}
                onChange={(e) =>
                  setForm({ ...form, source_type: e.target.value })
                }
                className="input-field"
              >
                {sourceTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                來源參考 ID
              </label>
              <input
                type="number"
                value={form.source_ref_id}
                onChange={(e) =>
                  setForm({ ...form, source_ref_id: e.target.value })
                }
                className="input-field"
                placeholder="選填"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                合約
              </label>
              <SearchableSelect
                value={form.contract_id ? Number(form.contract_id) : null}
                onChange={(v: any) =>
                  setForm({ ...form, contract_id: v || '' })
                }
                options={contractOptions}
                placeholder="選擇合約"
                clearable
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                項目
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                銀行帳戶
              </label>
              <SearchableSelect
                value={
                  form.bank_account_id ? Number(form.bank_account_id) : null
                }
                onChange={(v: any) =>
                  setForm({ ...form, bank_account_id: v || '' })
                }
                options={bankAccountOptions}
                placeholder="選擇銀行帳戶"
                clearable
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                收款方式
              </label>
              <SearchableSelect
                value={form.payment_method || null}
                onChange={(v: any) =>
                  setForm({ ...form, payment_method: v || '' })
                }
                options={paymentMethodOptions}
                placeholder="選擇收款方式"
                clearable
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                支票/交易號碼
              </label>
              <input
                type="text"
                value={form.reference_no}
                onChange={(e) =>
                  setForm({ ...form, reference_no: e.target.value })
                }
                className="input-field"
                placeholder="選填"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                狀態
              </label>
              <select
                value={form.payment_in_status}
                onChange={(e) =>
                  setForm({ ...form, payment_in_status: e.target.value })
                }
                className="input-field"
              >
                <option value="unpaid">未收款</option>
                <option value="partially_paid">部分收款</option>
                <option value="paid">已收款</option>
                <option value="cancelled">取消</option>
              </select>
            </div>
          </div>
          {/* Payer field - show when source_type is NOT invoice/payment_certificate */}
          {form.source_type !== 'invoice' && form.source_type !== 'payment_certificate' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  付款方（合作單位）
                </label>
                <SearchableSelect
                  value={form.payer_partner_id ? Number(form.payer_partner_id) : null}
                  onChange={(v: any) => setForm({ ...form, payer_partner_id: v || '', payer_name: '' })}
                  options={partnerOptions}
                  placeholder="選擇合作單位"
                  clearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  付款方（自由輸入）
                </label>
                <input
                  type="text"
                  value={form.payer_name}
                  onChange={(e) => setForm({ ...form, payer_name: e.target.value, payer_partner_id: '' })}
                  className="input-field"
                  placeholder="或直接輸入付款方名稱"
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              備註
            </label>
            <input
              type="text"
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              className="input-field"
              placeholder="選填"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowCreate(false)}
              className="btn-secondary"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary disabled:opacity-50"
            >
              {creating ? '建立中...' : '建立'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
