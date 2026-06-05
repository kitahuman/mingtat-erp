'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import DateInput from '@/components/DateInput';
import DataTable from '@/components/DataTable';
import { useRouter } from 'next/navigation';
import {
  invoicesApi,
  partnersApi,
  companiesApi,
  projectsApi,
  quotationsApi,
  fieldOptionsApi,
} from '@/lib/api';
import ClientContractCombobox from '@/components/ClientContractCombobox';
import SearchableSelect from '@/components/SearchableSelect';
import { fmtDate } from '@/lib/dateUtils';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { useColumnConfig } from '@/hooks/useColumnConfig';

const fmt$ = (v: any) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_OPTIONS = [
  { value: '', label: '全部狀態' },
  { value: 'draft', label: '草稿' },
  { value: 'issued', label: '已開立' },
  { value: 'partially_paid', label: '部分收款' },
  { value: 'paid', label: '已收清' },
  { value: 'void', label: '已作廢' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  issued: '已開立',
  partially_paid: '部分收款',
  paid: '已收清',
  void: '已作廢',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  issued: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
};

const buildDefaultInvoiceTitle = (date?: string, contractNo?: string) => {
  if (!date || !contractNo) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月份 - ${contractNo}`;
};

const defaultItem = () => ({
  item_name: '',
  description: '',
  quantity: 1,
  unit: 'JOB',
  unit_price: 0,
});
const defaultCharge = () => ({ name: '', amount: 0 });

const defaultForm = {
  date: new Date().toISOString().slice(0, 10),
  due_date: '',
  company_id: '',
  client_id: '',
  project_id: '',
  quotation_id: '',
  invoice_title: '',
  client_contract_no: '',
  retention_rate: 0,
  payment_terms: '',
  remarks: '',
  items: [defaultItem()],
  other_charges: [] as { name: string; amount: number }[],
};

type InvoiceListColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  minWidth?: number;
  render?: (value: any, invoice: any) => any;
  filterRender?: (value: any, invoice: any) => string;
};

const INVOICE_CELL_PADDING = 'px-4';

const INVOICE_COLUMNS: InvoiceListColumn[] = [
  {
    key: 'invoice_no',
    label: '發票編號',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} font-mono font-medium text-primary-600`,
    minWidth: 150,
    render: (v: any) => v || '-',
    filterRender: (v: any) => v || '-',
  },
  {
    key: 'invoice_title',
    label: '發票名稱',
    sortable: true,
    className: INVOICE_CELL_PADDING,
    minWidth: 200,
    render: (v: any) => v || '-',
    filterRender: (v: any) => v || '-',
  },
  {
    key: 'date',
    label: '日期',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-gray-600`,
    minWidth: 120,
    render: (v: any) => fmtDate(v),
    filterRender: (v: any) => fmtDate(v),
  },
  {
    key: 'due_date',
    label: '到期日',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-gray-600`,
    minWidth: 120,
    render: (v: any) => fmtDate(v),
    filterRender: (v: any) => fmtDate(v),
  },
  {
    key: 'client',
    label: '客戶',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-gray-900`,
    minWidth: 150,
    render: (_: any, inv: any) =>
      inv.client?.code
        ? `${inv.client.code} - ${inv.client.name}`
        : inv.client?.name || '-',
    filterRender: (_: any, inv: any) =>
      inv.client?.code
        ? `${inv.client.code} - ${inv.client.name}`
        : inv.client?.name || '-',
  },
  {
    key: 'client_contract_no',
    label: '客戶合約',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} font-mono text-indigo-600`,
    minWidth: 150,
    render: (v: any) => v || '-',
    filterRender: (v: any) => v || '-',
  },
  {
    key: 'quotation',
    label: '關聯報價單',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} font-mono text-gray-500`,
    minWidth: 150,
    render: (_: any, inv: any) => inv.quotation?.quotation_no || '-',
    filterRender: (_: any, inv: any) => inv.quotation?.quotation_no || '-',
  },
  {
    key: 'total_amount',
    label: '總額',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-right font-medium`,
    minWidth: 130,
    render: (v: any) => fmt$(v),
    filterRender: (v: any) => fmt$(v),
  },
  {
    key: 'paid_amount',
    label: '已收',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-right text-green-600`,
    minWidth: 130,
    render: (v: any) => fmt$(v),
    filterRender: (v: any) => fmt$(v),
  },
  {
    key: 'outstanding',
    label: '未收',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-right text-red-600`,
    minWidth: 130,
    render: (v: any) => fmt$(v),
    filterRender: (v: any) => fmt$(v),
  },
  {
    key: 'status',
    label: '狀態',
    sortable: true,
    className: INVOICE_CELL_PADDING,
    minWidth: 110,
    render: (v: any) => (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[v] || 'bg-gray-100 text-gray-700'}`}
      >
        {STATUS_LABELS[v] || v || '-'}
      </span>
    ),
    filterRender: (v: any) => STATUS_LABELS[v] || v || '-',
  },
];

export default function InvoicesPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [columnFilters, setColumnFilters] = useState<
    Record<string, Set<string>>
  >({});

  // Reference data
  const [partners, setPartners] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>({ ...defaultForm });
  const autoInvoiceTitleRef = useRef('');
  const [workLogIdsFromQuery, setWorkLogIdsFromQuery] = useState<number[]>([]);

  const buildColumnFilterParams = useCallback(
    (filters: Record<string, Set<string>> = columnFilters) => {
      const params: Record<string, string> = {};
      Object.entries(filters).forEach(([key, values]) => {
        params[`filter_${key}`] =
          values.size > 0 ? JSON.stringify(Array.from(values)) : '__NO_MATCH__';
      });
      return params;
    },
    [columnFilters],
  );

  const buildListParams = useCallback(
    (overrides: Record<string, any> = {}) => ({
      page,
      limit: 50,
      status: statusFilter || undefined,
      client_id: clientFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      search: search || undefined,
      sortBy,
      sortOrder,
      ...buildColumnFilterParams(),
      ...overrides,
    }),
    [
      page,
      statusFilter,
      clientFilter,
      dateFrom,
      dateTo,
      search,
      sortBy,
      sortOrder,
      buildColumnFilterParams,
    ],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicesApi.list(buildListParams());
      setData(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [buildListParams]);

  const handleColumnFilterChange = useCallback(
    (filters: Record<string, Set<string>>) => {
      setColumnFilters(filters);
      setPage(1);
    },
    [],
  );

  const handleFetchFilterOptions = useCallback(
    async (columnKey: string) => {
      const response = await invoicesApi.filterOptions(
        columnKey,
        buildListParams({ page: 1, limit: 50 }),
      );
      return response.data || [];
    },
    [buildListParams],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    partnersApi.simple().then((res) => setPartners(res.data || []));
    companiesApi.simple().then((res) => setCompanies(res.data || []));
    projectsApi
      .list({ limit: 500 })
      .then((res) => setProjects(res.data?.data || res.data || []));
    quotationsApi
      .list({ limit: 500 })
      .then((res) => setQuotations(res.data?.data || res.data || []));
    fieldOptionsApi
      .getByCategory('wage_unit')
      .then((res) =>
        setUnitOptions((res.data || []).map((o: any) => o.label || o.value)),
      )
      .catch(() => setUnitOptions([]));
  }, []);

  useRefetchOnFocus(() => {
    partnersApi.simple().then((res) => setPartners(res.data || []));
    companiesApi.simple().then((res) => setCompanies(res.data || []));
    projectsApi
      .list({ limit: 500 })
      .then((res) => setProjects(res.data?.data || res.data || []));
    quotationsApi
      .list({ limit: 500 })
      .then((res) => setQuotations(res.data?.data || res.data || []));
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workLogIdsParam = params.get('work_log_ids') || '';
    if (!workLogIdsParam) return;
    const ids = workLogIdsParam
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    setWorkLogIdsFromQuery(ids);
    setShowCreate(true);
    setForm((prev) => ({
      ...prev,
      invoice_title: prev.invoice_title || '工作紀錄發票',
    }));
  }, []);

  useEffect(() => {
    const title = buildDefaultInvoiceTitle(
      form.date,
      form.client_contract_no,
    );
    if (!title) return;

    setForm((prev: any) => {
      if (prev.invoice_title && prev.invoice_title !== autoInvoiceTitleRef.current) {
        return prev;
      }
      if (prev.invoice_title === title) {
        return prev;
      }
      autoInvoiceTitleRef.current = title;
      return { ...prev, invoice_title: title };
    });
  }, [form.date, form.client_contract_no]);

  const clientPartners = partners.filter(
    (p: any) => p.partner_type === 'client',
  );

  const handleCreate = async () => {
    if (!form.company_id) {
      alert('請選擇公司');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        date: form.date,
        due_date: form.due_date || undefined,
        company_id: Number(form.company_id),
        client_id: form.client_id ? Number(form.client_id) : undefined,
        project_id: form.project_id ? Number(form.project_id) : undefined,
        quotation_id: form.quotation_id ? Number(form.quotation_id) : undefined,
        invoice_title: form.invoice_title || undefined,
        client_contract_no: form.client_contract_no || undefined,
        retention_rate: Number(form.retention_rate) || 0,
        payment_terms: form.payment_terms || undefined,
        remarks: form.remarks || undefined,
        other_charges: form.other_charges.filter(
          (c: any) => c.name && Number(c.amount) !== 0,
        ),
        items: form.items.map((item: any, idx: number) => ({
          item_name: item.item_name || undefined,
          description: item.description || undefined,
          quantity: Number(item.quantity) || 0,
          unit: item.unit || undefined,
          unit_price: Number(item.unit_price) || 0,
          sort_order: idx + 1,
        })),
      };
      const res = await invoicesApi.create(payload);
      if (workLogIdsFromQuery.length > 0) {
        await invoicesApi.linkWorkLogs(res.data.id, workLogIdsFromQuery);
      }
      setShowCreate(false);
      autoInvoiceTitleRef.current = '';
      setForm({ ...defaultForm });
      router.push(`/invoices/${res.data.id}`);
    } catch (err: any) {
      alert(err.response?.data?.message || '建立失敗');
    } finally {
      setCreating(false);
    }
  };

  // Items helpers
  const addItem = () =>
    setForm({ ...form, items: [...form.items, defaultItem()] });
  const removeItem = (idx: number) =>
    setForm({
      ...form,
      items: form.items.filter((_: any, i: number) => i !== idx),
    });
  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };

  // Other charges helpers
  const addCharge = () =>
    setForm({
      ...form,
      other_charges: [...form.other_charges, defaultCharge()],
    });
  const removeCharge = (idx: number) =>
    setForm({
      ...form,
      other_charges: form.other_charges.filter(
        (_: any, i: number) => i !== idx,
      ),
    });
  const updateCharge = (idx: number, field: string, value: any) => {
    const charges = [...form.other_charges];
    charges[idx] = { ...charges[idx], [field]: value };
    setForm({ ...form, other_charges: charges });
  };

  const itemAmount = (item: any) =>
    (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  const formSubtotal = (form.items || []).reduce(
    (sum: number, item: any) => sum + itemAmount(item),
    0,
  );
  const formRetention =
    (formSubtotal * (Number(form.retention_rate) || 0)) / 100;
  const formOtherTotal = (form.other_charges || []).reduce(
    (sum: number, c: any) => sum + (Number(c.amount) || 0),
    0,
  );
  const formTotal = formSubtotal - formRetention + formOtherTotal;

  const {
    columnConfigs,
    columnWidths,
    visibleColumns,
    handleColumnConfigChange,
    handleReset,
    handleColumnResize,
  } = useColumnConfig('invoices', INVOICE_COLUMNS);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">發票管理</h1>
          <p className="text-gray-500 mt-1">共 {total} 張發票</p>
        </div>
        <button
          onClick={() => {
            autoInvoiceTitleRef.current = '';
            setForm({ ...defaultForm, company_id: companies[0]?.id || '' });
            setShowCreate(true);
          }}
          className="btn-primary"
        >
          新增發票
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              搜尋
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="發票編號、客戶、合約..."
              className="input-field"
            />
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
              className="input-field"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              客戶
            </label>
            <select
              value={clientFilter}
              onChange={(e) => {
                setClientFilter(e.target.value);
                setPage(1);
              }}
              className="input-field"
            >
              <option value="">全部客戶</option>
              {clientPartners.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} - ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              日期（從）
            </label>
            <DateInput
              value={dateFrom}
              onChange={(value) => {
                setDateFrom(value);
                setPage(1);
              }}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              日期（至）
            </label>
            <DateInput
              value={dateTo}
              onChange={(value) => {
                setDateTo(value);
                setPage(1);
              }}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <DataTable
          exportFilename="發票列表"
          columns={visibleColumns as any}
          columnConfigs={columnConfigs}
          onColumnConfigChange={handleColumnConfigChange}
          onColumnConfigReset={handleReset}
          columnWidths={columnWidths}
          onColumnResize={handleColumnResize}
          data={data}
          total={total}
          page={page}
          limit={50}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/invoices/${row.id}`)}
          loading={loading}
          serverSideFilter
          columnFilters={columnFilters}
          onColumnFilterChange={handleColumnFilterChange}
          onFetchFilterOptions={handleFetchFilterOptions}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(field, order) => {
            setSortBy(field);
            setSortOrder(order);
            setPage(1);
          }}
        />
      </div>

      {/* Create Modal */}
      {showCreate && (
        <Modal
          isOpen={showCreate}
          title="新增發票"
          onClose={() => setShowCreate(false)}
          size="xl"
        >
          <div className="space-y-5">
            {workLogIdsFromQuery.length > 0 && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
                建立後會以「只關聯」模式自動連結 {workLogIdsFromQuery.length}{' '}
                筆已選工作紀錄，不會自動計算發票項目或價錢。
              </div>
            )}
            {/* Row 1: Company, Client */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  公司 <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.company_id}
                  onChange={(e) =>
                    setForm({ ...form, company_id: e.target.value })
                  }
                  className="input-field"
                >
                  <option value="">請選擇</option>
                  {companies.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  客戶
                </label>
                <SearchableSelect
                  value={form.client_id || ''}
                  onChange={(val) =>
                    setForm({ ...form, client_id: val ? String(val) : '' })
                  }
                  options={clientPartners.map((p: any) => ({
                    value: String(p.id),
                    label: p.code ? `${p.code} - ${p.name}` : p.name,
                  }))}
                  placeholder="搜尋客戶..."
                />
              </div>
            </div>

            {/* Row 2: Invoice Title, Client Contract No */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  發票名稱
                </label>
                <input
                  type="text"
                  value={form.invoice_title}
                  onChange={(e) =>
                    setForm({ ...form, invoice_title: e.target.value })
                  }
                  className="input-field"
                  placeholder="例如：2026年4月工程費用"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  客戶合約
                </label>
                <ClientContractCombobox
                  value={form.client_contract_no}
                  onChange={(val) =>
                    setForm({ ...form, client_contract_no: val || '' })
                  }
                />
              </div>
            </div>

            {/* Row 3: Date, Due Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  發票日期
                </label>
                <DateInput
                  value={form.date}
                  onChange={(value) => setForm({ ...form, date: value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  到期日
                </label>
                <DateInput
                  value={form.due_date}
                  onChange={(value) => setForm({ ...form, due_date: value })}
                  className="input-field"
                />
              </div>
            </div>

            {/* Row 4: Project, Quotation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  工程項目
                </label>
                <select
                  value={form.project_id}
                  onChange={(e) =>
                    setForm({ ...form, project_id: e.target.value })
                  }
                  className="input-field"
                >
                  <option value="">— 無 —</option>
                  {projects.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.project_no} - {p.project_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  關聯報價單
                </label>
                <select
                  value={form.quotation_id}
                  onChange={(e) =>
                    setForm({ ...form, quotation_id: e.target.value })
                  }
                  className="input-field"
                >
                  <option value="">— 無 —</option>
                  {quotations.map((q: any) => (
                    <option key={q.id} value={q.id}>
                      {q.quotation_no}
                      {q.project_name ? ` - ${q.project_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 5: Retention Rate, Payment Terms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  保留金 (%)
                </label>
                <input
                  type="number"
                  value={form.retention_rate}
                  onChange={(e) =>
                    setForm({ ...form, retention_rate: e.target.value })
                  }
                  className="input-field"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  付款條件
                </label>
                <input
                  type="text"
                  value={form.payment_terms}
                  onChange={(e) =>
                    setForm({ ...form, payment_terms: e.target.value })
                  }
                  className="input-field"
                  placeholder="例如：30天內付款"
                />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                備註
              </label>
              <textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                className="input-field"
                rows={2}
              />
            </div>

            {/* Invoice Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  發票項目
                </label>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  + 新增項目
                </button>
              </div>
              <div className="space-y-3">
                {form.items.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex gap-2">
                      <div className="flex-1">
                        {idx === 0 && (
                          <label className="block text-xs text-gray-500 mb-1">
                            項目標題
                          </label>
                        )}
                        <input
                          type="text"
                          value={item.item_name}
                          onChange={(e) =>
                            updateItem(idx, 'item_name', e.target.value)
                          }
                          className="input-field text-sm"
                          placeholder="項目標題（選填）"
                        />
                      </div>
                      <div className="w-8 flex items-end pb-1">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-red-400 hover:text-red-600 text-sm"
                          title="刪除"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(idx, 'description', e.target.value)
                        }
                        className="input-field text-sm"
                        placeholder="項目描述（選填）"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          數量
                        </label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(idx, 'quantity', e.target.value)
                          }
                          className="input-field text-sm text-right"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          單位
                        </label>
                        <select
                          value={item.unit || ''}
                          onChange={(e) =>
                            updateItem(idx, 'unit', e.target.value)
                          }
                          className="input-field text-sm"
                        >
                          <option value="">—</option>
                          {unitOptions.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          單價
                        </label>
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) =>
                            updateItem(idx, 'unit_price', e.target.value)
                          }
                          className="input-field text-sm text-right"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          金額
                        </label>
                        <div className="input-field text-sm text-right bg-gray-50">
                          {fmt$(itemAmount(item))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Other Charges */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  其他費用
                </label>
                <button
                  type="button"
                  onClick={addCharge}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  + 新增費用
                </button>
              </div>
              {form.other_charges.length > 0 && (
                <div className="space-y-2">
                  {form.other_charges.map((charge: any, idx: number) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={charge.name}
                        onChange={(e) =>
                          updateCharge(idx, 'name', e.target.value)
                        }
                        className="input-field text-sm flex-1"
                        placeholder="費用名稱（如：油費、維修費）"
                      />
                      <input
                        type="number"
                        value={charge.amount}
                        onChange={(e) =>
                          updateCharge(idx, 'amount', e.target.value)
                        }
                        className="input-field text-sm w-32 text-right"
                        placeholder="金額（可負數）"
                        step="0.01"
                      />
                      <button
                        type="button"
                        onClick={() => removeCharge(idx)}
                        className="text-red-400 hover:text-red-600 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals Summary */}
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">小計</span>
                <span className="font-medium">{fmt$(formSubtotal)}</span>
              </div>
              {Number(form.retention_rate) > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>保留金 ({form.retention_rate}%)</span>
                  <span>- {fmt$(formRetention)}</span>
                </div>
              )}
              {form.other_charges
                .filter((c: any) => c.name)
                .map((c: any, i: number) => (
                  <div key={i} className="flex justify-between text-blue-600">
                    <span>{c.name}</span>
                    <span>
                      {Number(c.amount) >= 0 ? '+' : ''}
                      {fmt$(c.amount)}
                    </span>
                  </div>
                ))}
              <div className="flex justify-between border-t pt-1 font-bold text-gray-900">
                <span>總額</span>
                <span className="text-lg">{fmt$(formTotal)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
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
                {creating ? '建立中...' : '建立發票'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
