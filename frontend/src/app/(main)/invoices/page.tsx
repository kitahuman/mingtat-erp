'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePageState } from '@/hooks/usePageState';
import DateInput from '@/components/DateInput';
import DataTable from '@/components/DataTable';
import { useRouter } from 'next/navigation';
import {
  invoicesApi,
  invoiceStatementsApi,
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

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthRange = (monthOffset: number) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
  return {
    from: toDateInputValue(start),
    to: toDateInputValue(end),
  };
};

type InvoiceListColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  minWidth?: number;
  headerRender?: () => any;
  render?: (value: any, invoice: any) => any;
  filterRender?: (value: any, invoice: any) => string;
};

const INVOICE_CELL_PADDING = 'px-4';

const getClientDisplayName = (client?: any) => {
  if (!client) return '-';
  return client.code || client.partner_code || client.short_name || client.name || '-';
};

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
    key: 'company',
    label: '公司',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} font-mono text-gray-700`,
    minWidth: 90,
    render: (_: any, inv: any) => inv.company?.internal_prefix || '-',
    filterRender: (_: any, inv: any) => inv.company?.internal_prefix || '-',
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
    render: (_: any, inv: any) => getClientDisplayName(inv.client),
    filterRender: (_: any, inv: any) => getClientDisplayName(inv.client),
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
    key: 'retention_amount',
    label: 'Retention',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-right text-orange-600`,
    minWidth: 130,
    render: (v: any) => (Number(v) > 0 ? fmt$(v) : '-'),
    filterRender: (v: any) => (Number(v) > 0 ? fmt$(v) : '-'),
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
    key: 'creator',
    label: '發佈人',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-gray-700`,
    minWidth: 120,
    render: (_: any, inv: any) =>
      inv.creator?.displayName || inv.creator?.username || '-',
    filterRender: (_: any, inv: any) =>
      inv.creator?.displayName || inv.creator?.username || '-',
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
  {
    key: 'created_at',
    label: '建立日期',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-gray-500`,
    minWidth: 120,
    render: (v: any) => fmtDate(v),
    filterRender: (v: any) => fmtDate(v),
  },
  {
    key: 'updated_at',
    label: '修改日期',
    sortable: true,
    className: `${INVOICE_CELL_PADDING} text-gray-500`,
    minWidth: 120,
    render: (v: any) => fmtDate(v),
    filterRender: (v: any) => fmtDate(v),
  },
];

export default function InvoicesPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [invoiceTab, setInvoiceTab] = useState<'invoices' | 'void' | 'statements'>('invoices');
  const [statementRecords, setStatementRecords] = useState<any[]>([]);
  const [statementRecordsTotal, setStatementRecordsTotal] = useState(0);
  const [statementRecordsLoading, setStatementRecordsLoading] = useState(false);
  const [aggregateTotals, setAggregateTotals] = useState({
    totalAmount: 0,
    paidAmount: 0,
    outstanding: 0,
  });

  const { pageState, saveState, clearState } = usePageState({
    page: 1,
    search: '',
    statusFilter: '',
    clientFilter: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'created_at',
    sortOrder: 'DESC',
    columnFilters: {},
  });

  const { page, search, statusFilter, clientFilter, dateFrom, dateTo, sortBy, sortOrder, columnFilters = {} } = pageState;

  const activeColumnFilters = useMemo<Record<string, Set<string>>>(
    () => Object.fromEntries(
      Object.entries(columnFilters).map(([key, values]) => [key, new Set(values)]),
    ),
    [columnFilters],
  );

  // Helper to update state and save it
  const setPage = (newPage: number) => saveState((prev) => ({ ...prev, page: newPage }));
  const setSearch = (newSearch: string) => saveState((prev) => ({ ...prev, search: newSearch }));
  const setStatusFilter = (newStatusFilter: string) => saveState((prev) => ({ ...prev, statusFilter: newStatusFilter }));
  const setClientFilter = (newClientFilter: string) => saveState((prev) => ({ ...prev, clientFilter: newClientFilter }));
  const setDateFrom = (newDateFrom: string) => saveState((prev) => ({ ...prev, dateFrom: newDateFrom }));
  const setDateTo = (newDateTo: string) => saveState((prev) => ({ ...prev, dateTo: newDateTo }));
  const setSortBy = (newSortBy: string) => saveState((prev) => ({ ...prev, sortBy: newSortBy }));
  const setSortOrder = (newSortOrder: string) => saveState((prev) => ({ ...prev, sortOrder: newSortOrder as 'ASC' | 'DESC' }));
  const setColumnFilters = (newColumnFilters: Record<string, string[]>) => saveState((prev) => ({ ...prev, columnFilters: newColumnFilters }));
  const setColumnFiltersFromSets = (newColumnFilters: Record<string, Set<string>>) => {
    const serializableFilters = Object.fromEntries(
      Object.entries(newColumnFilters).map(([key, values]) => [key, Array.from(values)]),
    );
    setColumnFilters(serializableFilters);
  };

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

  // Invoice statement selection flow
  const selectAllInvoicesRef = useRef<HTMLInputElement>(null);
  const [selectedInvoiceRows, setSelectedInvoiceRows] = useState<Record<number, any>>({});
  const [showStatementCreate, setShowStatementCreate] = useState(false);
  const [creatingStatement, setCreatingStatement] = useState(false);
  const [statementForm, setStatementForm] = useState({
    statement_title: '',
    company_id: '',
    client_id: '',
    period_start: '',
    period_end: '',
  });

  const buildColumnFilterParams = useCallback(
    (filters: Record<string, string[]> = columnFilters) => {
      const params: Record<string, string> = {};
      Object.entries(filters).forEach(([key, values]) => {
        params[`filter_${key}`] =
          values.length > 0 ? JSON.stringify(values) : '__NO_MATCH__';
      });
      return params;
    },
    [columnFilters],
  );

  const buildListParams = useCallback(
    (overrides: Record<string, any> = {}, { skipColumnFilters = false }: { skipColumnFilters?: boolean } = {}) => ({
      page,
      limit: 50,
      status: invoiceTab === 'void' ? 'void' : statusFilter || undefined,
      status_ne: invoiceTab === 'void' ? undefined : 'void',
      invoice_type:
        invoiceTab === 'invoices'
          ? 'invoice'
          : invoiceTab === 'statements'
            ? 'statement'
            : undefined,
      client_id: clientFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      search: search || undefined,
      sortBy,
      sortOrder,
      ...(skipColumnFilters ? {} : buildColumnFilterParams()),
      ...overrides,
    }),
    [
      page,
      invoiceTab,
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

  const buildStatementRecordParams = useCallback(
    () => ({
      page,
      limit: 50,
      client_id: clientFilter || undefined,
      period_from: dateFrom || undefined,
      period_to: dateTo || undefined,
      search: search || undefined,
      sortBy: 'created_at',
      sortOrder: 'DESC',
    }),
    [page, clientFilter, dateFrom, dateTo, search],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setStatementRecordsLoading(invoiceTab === 'statements');
    try {
      const [invoiceRes, statementRes] = await Promise.all([
        invoicesApi.list(buildListParams()),
        invoiceTab === 'statements'
          ? invoiceStatementsApi.list(buildStatementRecordParams())
          : Promise.resolve(null),
      ]);
      setData(invoiceRes.data?.data || []);
      setTotal(invoiceRes.data?.total || 0);
      setAggregateTotals({
        totalAmount: Number(invoiceRes.data?.sum_total_amount) || 0,
        paidAmount: Number(invoiceRes.data?.sum_paid_amount) || 0,
        outstanding: Number(invoiceRes.data?.sum_outstanding) || 0,
      });
      if (statementRes) {
        setStatementRecords(statementRes.data?.data || []);
        setStatementRecordsTotal(statementRes.data?.total || 0);
      } else {
        setStatementRecords([]);
        setStatementRecordsTotal(0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setStatementRecordsLoading(false);
    }
  }, [buildListParams, buildStatementRecordParams, invoiceTab]);

  const handleColumnFilterChange = useCallback(
    (filters: Record<string, Set<string>>) => {
      setColumnFiltersFromSets(filters);
      setPage(1);
    },
    [],
  );

  const handleFetchFilterOptions = useCallback(
    async (columnKey: string) => {
      const response = await invoicesApi.filterOptions(
        columnKey,
        buildListParams({ page: 1, limit: 50 }, { skipColumnFilters: true }),
      );
      return response.data || [];
    },
    [buildListParams],
  );

  const applyDateShortcut = (monthOffset: number) => {
    const { from, to } = getMonthRange(monthOffset);
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
  };

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
    const companyId = params.get('company_id') || '';
    const clientId = params.get('client_id') || '';
    const clientContractNo = params.get('client_contract_no') || '';
    const invoiceTitle = params.get('invoice_title') || '';

    setWorkLogIdsFromQuery(ids);
    setShowCreate(true);
    setForm((prev) => ({
      ...prev,
      company_id: companyId || prev.company_id,
      client_id: clientId || prev.client_id,
      client_contract_no: clientContractNo || prev.client_contract_no,
      invoice_title: invoiceTitle || prev.invoice_title || '工作紀錄發票',
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

  const selectedInvoices = useMemo(
    () => Object.values(selectedInvoiceRows),
    [selectedInvoiceRows],
  );
  const selectedInvoiceIds = useMemo(
    () => selectedInvoices.map((invoice: any) => Number(invoice.id)),
    [selectedInvoices],
  );
  const selectableVisibleInvoices = useMemo(() => data, [data]);
  const selectedVisibleInvoiceCount = useMemo(
    () =>
      selectableVisibleInvoices.filter((invoice: any) =>
        selectedInvoiceIds.includes(Number(invoice.id)),
      ).length,
    [selectableVisibleInvoices, selectedInvoiceIds],
  );
  const allVisibleInvoicesSelected =
    selectableVisibleInvoices.length > 0 &&
    selectedVisibleInvoiceCount === selectableVisibleInvoices.length;
  const someVisibleInvoicesSelected =
    selectedVisibleInvoiceCount > 0 && !allVisibleInvoicesSelected;

  useEffect(() => {
    if (selectAllInvoicesRef.current) {
      selectAllInvoicesRef.current.indeterminate = someVisibleInvoicesSelected;
    }
  }, [someVisibleInvoicesSelected]);

  const selectedInvoiceTotals = useMemo(() => {
    return selectedInvoices.reduce(
      (totals: { totalAmount: number; paidAmount: number; outstanding: number }, invoice: any) => {
        const totalAmount = Number(invoice.total_amount) || 0;
        const paidAmount = Number(invoice.paid_amount) || 0;
        const outstanding = invoice.outstanding !== undefined && invoice.outstanding !== null
          ? Number(invoice.outstanding) || 0
          : totalAmount - paidAmount;
        return {
          totalAmount: totals.totalAmount + totalAmount,
          paidAmount: totals.paidAmount + paidAmount,
          outstanding: totals.outstanding + outstanding,
        };
      },
      { totalAmount: 0, paidAmount: 0, outstanding: 0 },
    );
  }, [selectedInvoices]);
  const invoiceTotalsSummary = selectedInvoices.length > 0
    ? selectedInvoiceTotals
    : aggregateTotals;

  const toggleVisibleInvoiceSelection = (checked: boolean) => {
    setSelectedInvoiceRows((prev) => {
      const next = { ...prev };
      selectableVisibleInvoices.forEach((invoice: any) => {
        if (checked) {
          next[invoice.id] = invoice;
        } else {
          delete next[invoice.id];
        }
      });
      return next;
    });
  };

  const toggleInvoiceSelection = (invoice: any, checked: boolean) => {
    setSelectedInvoiceRows((prev) => {
      const next = { ...prev };
      if (checked) {
        next[invoice.id] = invoice;
      } else {
        delete next[invoice.id];
      }
      return next;
    });
  };

  const openStatementCreate = () => {
    if (selectedInvoices.length === 0) return;
    const first = selectedInvoices[0] as any;
    const hasMismatch = selectedInvoices.some(
      (invoice: any) =>
        !invoice.company_id ||
        !invoice.client_id ||
        invoice.company_id !== first.company_id ||
        invoice.client_id !== first.client_id,
    );
    if (!first.company_id || !first.client_id || hasMismatch) {
      alert('請只選擇同一公司及同一客戶的發票來建立發票清單');
      return;
    }
    const dates = selectedInvoices
      .map((invoice: any) => (invoice.date ? String(invoice.date).slice(0, 10) : ''))
      .filter(Boolean)
      .sort();
    setStatementForm({
      statement_title: '',
      company_id: first.company_id ? String(first.company_id) : '',
      client_id: first.client_id ? String(first.client_id) : '',
      period_start: dates[0] || '',
      period_end: dates[dates.length - 1] || '',
    });
    setShowStatementCreate(true);
  };

  const handleBatchVoid = async () => {
    if (selectedInvoiceIds.length === 0) {
      alert('請先選擇發票');
      return;
    }
    if (!confirm(`確定要將 ${selectedInvoiceIds.length} 張發票標記為已作廢？`)) return;
    try {
      await invoicesApi.batchVoid(selectedInvoiceIds);
      setSelectedInvoiceRows({});
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || '批量作廢失敗');
    }
  };

  const handleBatchMoveToStatement = async () => {
    if (selectedInvoiceIds.length === 0) {
      alert('請先選擇發票');
      return;
    }
    if (!confirm(`確定要將 ${selectedInvoiceIds.length} 張發票移入發票清單？`)) return;
    try {
      await invoicesApi.batchMoveToStatement(selectedInvoiceIds);
      setSelectedInvoiceRows({});
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || '移入發票清單失敗');
    }
  };

  const handleCreateStatement = async () => {
    if (selectedInvoiceIds.length === 0) {
      alert('請先選擇發票');
      return;
    }
    setCreatingStatement(true);
    try {
      const payload = {
        invoice_ids: selectedInvoiceIds,
        statement_title: statementForm.statement_title || undefined,
        company_id: statementForm.company_id ? Number(statementForm.company_id) : undefined,
        client_id: statementForm.client_id ? Number(statementForm.client_id) : undefined,
        period_start: statementForm.period_start || undefined,
        period_end: statementForm.period_end || undefined,
      };
      const res = await invoiceStatementsApi.create(payload);
      setShowStatementCreate(false);
      setSelectedInvoiceRows({});
      router.push(`/invoice-statements/${res.data.id}`);
    } catch (err: any) {
      alert(err.response?.data?.message || '建立發票清單失敗');
    } finally {
      setCreatingStatement(false);
    }
  };

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
  const pageReadOnly = isReadOnly('invoices');
  const visibleStatusOptions = useMemo(
    () => invoiceTab === 'void'
      ? STATUS_OPTIONS.filter((option) => option.value === 'void')
      : STATUS_OPTIONS.filter((option) => option.value !== 'void'),
    [invoiceTab],
  );
  const invoiceColumnsWithTotals = useMemo(
    () => INVOICE_COLUMNS.map((column) => {
      const amountHeaderConfig: Record<string, { value: number; className: string }> = {
        total_amount: { value: invoiceTotalsSummary.totalAmount, className: 'text-gray-700' },
        paid_amount: { value: invoiceTotalsSummary.paidAmount, className: 'text-green-700' },
        outstanding: { value: invoiceTotalsSummary.outstanding, className: 'text-red-700' },
      };
      const config = amountHeaderConfig[column.key];
      if (!config) return column;
      return {
        ...column,
        headerRender: () => (
          <div className="flex flex-col items-end leading-tight">
            <span>{column.label}</span>
            <span className={`mt-1 text-xs font-medium ${config.className}`}>
              {fmt$(config.value)}
            </span>
          </div>
        ),
      };
    }),
    [invoiceTotalsSummary],
  );

  const invoiceColumnsWithSelection = useMemo(
    () => [
      {
        key: '_statement_select',
        label: '選取',
        headerRender: () => (
          <div className="flex items-center justify-center gap-1" title="選取／取消選取目前頁面所有可選發票">
            <input
              ref={selectAllInvoicesRef}
              type="checkbox"
              checked={allVisibleInvoicesSelected}
              disabled={pageReadOnly || selectableVisibleInvoices.length === 0}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                toggleVisibleInvoiceSelection(e.target.checked);
              }}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span>選取</span>
          </div>
        ),
        filterable: false,
        className: 'px-3 text-center',
        minWidth: 70,
        render: (_: any, invoice: any) => {
          const isSelected = selectedInvoiceIds.includes(Number(invoice.id));
          return (
            <input
              type="checkbox"
              checked={isSelected}
              disabled={pageReadOnly}
              title="選取以建立發票清單"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                toggleInvoiceSelection(invoice, e.target.checked);
              }}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
            />
          );
        },
        filterRender: () => '',
      },
      ...invoiceColumnsWithTotals,
    ],
    [
      allVisibleInvoicesSelected,
      pageReadOnly,
      selectableVisibleInvoices.length,
      selectedInvoiceIds,
      invoiceColumnsWithTotals,
    ],
  );

  const {
    columnConfigs,
    columnWidths,
    visibleColumns,
    handleColumnConfigChange,
    handleReset,
    handleSavePersonal,
    handleSaveDefault,
    handleColumnResize,
  } = useColumnConfig('invoices', invoiceColumnsWithSelection);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">發票管理</h1>
          <p className="text-gray-500 mt-1">
            {invoiceTab === 'statements'
              ? `共 ${total} 張已移入清單發票，另有 ${statementRecordsTotal} 份發票清單`
              : `共 ${total} 張發票`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedInvoices.length > 0 && !pageReadOnly && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">已選 {selectedInvoices.length} 張</span>
              <button onClick={handleBatchVoid} className="btn-secondary">
                批量作廢
              </button>
              <button onClick={handleBatchMoveToStatement} className="btn-secondary">
                移入發票清單
              </button>
              <button onClick={openStatementCreate} className="btn-secondary">
                新增發票清單
              </button>
            </div>
          )}
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
      </div>

      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-6" aria-label="發票管理分頁">
          <button
            type="button"
            onClick={() => {
              setInvoiceTab('invoices');
              setStatusFilter('');
              setSelectedInvoiceRows({});
              setPage(1);
            }}
            className={`border-b-2 px-1 pb-3 text-sm ${invoiceTab === 'invoices'
              ? 'border-primary-600 font-semibold text-primary-600'
              : 'border-transparent font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            發票
          </button>
          <button
            type="button"
            onClick={() => {
              setInvoiceTab('void');
              setStatusFilter('');
              setSelectedInvoiceRows({});
              setPage(1);
            }}
            className={`border-b-2 px-1 pb-3 text-sm ${invoiceTab === 'void'
              ? 'border-primary-600 font-semibold text-primary-600'
              : 'border-transparent font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            已作廢
          </button>
          <button
            type="button"
            onClick={() => {
              setInvoiceTab('statements');
              setStatusFilter('');
              setSelectedInvoiceRows({});
              setPage(1);
            }}
            className={`border-b-2 px-1 pb-3 text-sm ${invoiceTab === 'statements'
              ? 'border-primary-600 font-semibold text-primary-600'
              : 'border-transparent font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            發票清單
          </button>
        </nav>
      </div>

      {/* Filters */}
      <div className="card mb-4">
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
              value={invoiceTab === 'void' ? 'void' : statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              disabled={invoiceTab === 'void'}
              className="input-field disabled:bg-gray-100 disabled:text-gray-500"
            >
              {visibleStatusOptions.map((opt) => (
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
          <div className="flex items-end gap-2 pb-1">
            <button
              type="button"
              onClick={() => applyDateShortcut(0)}
              className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            >
              本月
            </button>
            <button
              type="button"
              onClick={() => applyDateShortcut(-1)}
              className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            >
              上月
            </button>
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
            onColumnConfigSavePersonal={handleSavePersonal}
            onColumnConfigSaveDefault={handleSaveDefault}
          columnWidths={columnWidths}
          onColumnResize={handleColumnResize}
          data={data}
          total={total}
          page={page}
          limit={50}
          onPageChange={setPage}
          onRowClick={(row) => window.open(`/invoices/${row.id}`, '_blank')}
          loading={loading}
          serverSideFilter
          columnFilters={activeColumnFilters}
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

      {invoiceTab === 'statements' && (
        <div className="card mt-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">已產生發票清單</h2>
              <p className="text-sm text-gray-500">
                顯示由新版清單功能產生的 InvoiceStatement 記錄，共 {statementRecordsTotal} 份。
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/invoice-statements')}
              className="btn-secondary"
            >
              管理發票清單
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">清單編號</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">標題</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">客戶</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">期間</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">發票數量</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">總金額</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {statementRecordsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">載入中...</td>
                  </tr>
                ) : statementRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">沒有已產生的發票清單</td>
                  </tr>
                ) : (
                  statementRecords.map((statement: any) => (
                    <tr
                      key={statement.id}
                      onClick={() => router.push(`/invoice-statements/${statement.id}`)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-mono font-medium text-primary-600">{statement.statement_no || '-'}</td>
                      <td className="px-4 py-3 text-gray-900">{statement.statement_title || '-'}</td>
                      <td className="px-4 py-3 text-gray-900">
                        {statement.client?.code ? `${statement.client.code} - ${statement.client.name}` : statement.client?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {fmtDate(statement.statement_period_start)} 至 {fmtDate(statement.statement_period_end)}
                      </td>
                      <td className="px-4 py-3 text-right">{Number(statement.statement_invoice_count || 0)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmt$(statement.statement_total_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statement.statement_status === 'issued' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                          {statement.statement_status === 'issued' ? '已發出' : statement.statement_status === 'draft' ? '草稿' : statement.statement_status || '-'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Invoice Statement Modal */}
      {showStatementCreate && (
        <Modal
          isOpen={showStatementCreate}
          title="新增發票清單"
          onClose={() => setShowStatementCreate(false)}
          size="xl"
        >
          <div className="space-y-5">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              已選擇 {selectedInvoices.length} 張發票。發票清單會先以草稿建立，建立後會前往詳情頁讓你補充標題、其他收費及備註。
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">公司</label>
                <select
                  value={statementForm.company_id}
                  onChange={(e) => setStatementForm({ ...statementForm, company_id: e.target.value })}
                  className="input-field"
                >
                  <option value="">請選擇</option>
                  {companies.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
                <SearchableSelect
                  value={statementForm.client_id || ''}
                  onChange={(val) => setStatementForm({ ...statementForm, client_id: val ? String(val) : '' })}
                  options={clientPartners.map((p: any) => ({
                    value: String(p.id),
                    label: p.code ? `${p.code} - ${p.name}` : p.name,
                  }))}
                  placeholder="搜尋客戶..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">期間開始</label>
                <DateInput
                  value={statementForm.period_start}
                  onChange={(value) => setStatementForm({ ...statementForm, period_start: value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">期間結束</label>
                <DateInput
                  value={statementForm.period_end}
                  onChange={(value) => setStatementForm({ ...statementForm, period_end: value })}
                  className="input-field"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">清單標題</label>
                <input
                  type="text"
                  value={statementForm.statement_title}
                  onChange={(e) => setStatementForm({ ...statementForm, statement_title: e.target.value })}
                  className="input-field"
                  placeholder="可留空，建立後亦可於詳情頁修改"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">已選發票</h3>
                <button type="button" onClick={() => setSelectedInvoiceRows({})} className="text-sm text-gray-500 hover:text-gray-700">清除選取</button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">發票編號</th>
                      <th className="px-3 py-2 text-left">日期</th>
                      <th className="px-3 py-2 text-left">發票名稱</th>
                      <th className="px-3 py-2 text-left">狀態</th>
                      <th className="px-3 py-2 text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {selectedInvoices.map((invoice: any) => (
                      <tr key={invoice.id}>
                        <td className="px-3 py-2 font-mono text-primary-600">{invoice.invoice_no}</td>
                        <td className="px-3 py-2 text-gray-600">{fmtDate(invoice.date)}</td>
                        <td className="px-3 py-2">{invoice.invoice_title || '-'}</td>
                        <td className="px-3 py-2">{STATUS_LABELS[invoice.status] || invoice.status || '-'}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmt$(invoice.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button onClick={() => setShowStatementCreate(false)} className="btn-secondary">取消</button>
              <button onClick={handleCreateStatement} disabled={creatingStatement || selectedInvoices.length === 0} className="btn-primary disabled:opacity-50">
                {creatingStatement ? '建立中...' : '建立發票清單'}
              </button>
            </div>
          </div>
        </Modal>
      )}

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
                <SearchableSelect
                  value={form.quotation_id || ''}
                  onChange={(val) =>
                    setForm({ ...form, quotation_id: val ? String(val) : '' })
                  }
                  options={quotations.map((q: any) => {
                    const projectName = q.project_name || q.project?.project_name || q.contract_name;
                    return {
                      value: String(q.id),
                      label: `${q.quotation_no}${projectName ? ` - ${projectName}` : ''}`,
                    };
                  })}
                  placeholder="搜尋報價單..."
                />
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
