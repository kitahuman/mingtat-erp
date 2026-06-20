'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import DateInput from '@/components/DateInput';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  expensesApi,
  expenseCategoriesApi,
  companiesApi,
  partnersApi,
  employeesApi,
  machineryApi,
  vehiclesApi,
  projectsApi,
  quotationsApi,
  contractsApi,
  fieldOptionsApi,
  bankAccountsApi,
} from '@/lib/api';
import BatchPaymentModal from './BatchPaymentModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import InlineEditDataTable, {
  InlineColumn,
} from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';
import DateRangeFilter from '@/components/DateRangeFilter';
import { useAuth } from '@/lib/auth';

// ── Inline Combobox helper (free-text + searchable) ─────────────────────────
function InlineCombobox({
  value,
  onChange,
  options,
  placeholder = '請選擇或輸入',
}: {
  value: any;
  onChange: (val: any) => void;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}) {
  const { isReadOnly } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');

  const selected = options.find((o) => String(o.value) === String(value ?? ''));
  const displayText = selected
    ? selected.label
    : typeof value === 'string'
      ? value
      : '';

  const filtered = useMemo(() => {
    const q = input.toLowerCase();
    return options
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 30);
  }, [options, input]);

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={open ? input : displayText}
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => {
          setInput('');
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
        onClick={(e) => e.stopPropagation()}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.value);
                setInput(o.label);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [contractFilter, setContractFilter] = useState(() => searchParams.get('contract_id') || '');
  // Date range filter
  const [dateType, setDateType] = useState('date');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});

  // Reference data
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [machineryList, setMachineryList] = useState<any[]>([]);
  const [vehicleList, setVehicleList] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [categoryTree, setCategoryTree] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  // Batch selection + batch payment
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchPayment, setShowBatchPayment] = useState(false);

  // Supplier combobox state
  const [supplierInput, setSupplierInput] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  const defaultForm: any = {
    date: new Date().toISOString().slice(0, 10),
    company_id: '',
    supplier_name: '',
    supplier_partner_id: '',
    expense_receipt_number: '',
    category_id: '',
    _parent_category_id: '',
    employee_id: '',
    item: '',
    total_amount: '',
    payment_status: 'unpaid',
    payment_method: '',
    payment_date: '',
    payment_ref: '',
    remarks: '',
    machine_code: '',
    machinery_id: '',
    vehicle_id: '',
    client_id: '',
    contract_id: '',
    project_id: '',
    quotation_id: '',
    expense_payment_method: 'SELF_PAID',
  };
  const [form, setForm] = useState<any>({ ...defaultForm });

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
    (overrides: Record<string, any> = {}) => {
      const dateParams: Record<string, any> = {};
      if (dateType === 'payment_date') {
        if (dateFrom) dateParams.payment_date_from = dateFrom;
        if (dateTo) dateParams.payment_date_to = dateTo;
      } else {
        if (dateFrom) dateParams.date_from = dateFrom;
        if (dateTo) dateParams.date_to = dateTo;
      }
      return {
        page,
        limit: 20,
        search: search || undefined,
        contract_id: contractFilter || undefined,
        sortBy,
        sortOrder,
        ...dateParams,
        ...buildColumnFilterParams(),
        ...overrides,
      };
    },
    [
      page,
      search,
      contractFilter,
      dateType,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      buildColumnFilterParams,
    ],
  );

  const load = useCallback(() => {
    setLoading(true);
    expensesApi
      .list(buildListParams())
      .then((res) => {
        setData(res.data.data);
        setTotal(res.data.total);
      })
      .finally(() => setLoading(false));
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
      const response = await expensesApi.filterOptions(
        columnKey,
        buildListParams({ page: 1, limit: 20 }),
      );
      return response.data || [];
    },
    [buildListParams],
  );

  useEffect(() => {
    load();
  }, [load]);

  const loadReferenceData = useCallback(() => {
    companiesApi.simple().then((r) => setCompanies(r.data || []));
    partnersApi.simple().then((r) => setPartners(r.data || []));
    employeesApi
      .list({ limit: 9999 })
      .then((r) => setEmployees(r.data.data || []));
    machineryApi
      .list({ limit: 9999 })
      .then((r) =>
        setMachineryList(
          (r.data.data || []).filter((m: any) => m.status === 'active'),
        ),
      );
    vehiclesApi.simple().then((r) => setVehicleList(r.data || []));
    projectsApi.simple().then((r) => setProjects(r.data || []));
    contractsApi.simple().then((r) => setContracts(r.data || [])).catch(() => setContracts([]));
    quotationsApi
      .list({ limit: 9999 })
      .then((r) => setQuotations(r.data.data || []));
    expenseCategoriesApi.getTree().then((r) => setCategoryTree(r.data || []));
    fieldOptionsApi
      .getByCategory('payment_method')
      .then((r) => setPaymentMethods(r.data || []));
    bankAccountsApi
      .simple()
      .then((r) => setBankAccounts(r.data || []))
      .catch(() => setBankAccounts([]));
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);
  useRefetchOnFocus(loadReferenceData);

  // ── Derived option lists ─────────────────────────────────────────────────
  const allSubCategories = useMemo(() => {
    const result: { value: number; label: string }[] = [];
    for (const parent of categoryTree) {
      for (const child of parent.children || []) {
        result.push({
          value: child.id,
          label: `${parent.name} > ${child.name}`,
        });
      }
    }
    return result;
  }, [categoryTree]);

  const companyOptions = useMemo(
    () =>
      companies.map((c: any) => ({
        value: c.id,
        label: c.internal_prefix || c.name,
      })),
    [companies],
  );
  const partnerOptions = useMemo(
    () => partners.map((p: any) => ({ value: p.id, label: p.name })),
    [partners],
  );
  const supplierNameOptions = useMemo(
    () =>
      partners
        .filter((p: any) => p.partner_type === 'supplier')
        .map((p: any) => ({ value: p.name, label: p.name })),
    [partners],
  );
  const employeeOptions = useMemo(
    () => employees.map((e: any) => ({ value: e.id, label: e.name_zh })),
    [employees],
  );
  const equipmentOptions = useMemo(
    () => [
      ...machineryList.map((m: any) => ({
        value: `machinery:${m.id}`,
        label: `${m.machine_code}${m.machine_type ? ` (${m.machine_type})` : ''}`,
      })),
      ...vehicleList.map((v: any) => ({
        value: `vehicle:${v.id}`,
        label: `${v.plate_number} (車輛)`,
      })),
    ],
    [machineryList, vehicleList],
  );
  const projectOptions = useMemo(
    () =>
      projects.map((p: any) => ({
        value: p.id,
        label: `${p.project_no} ${p.project_name || ''}`.trim(),
      })),
    [projects],
  );
  const contractOptions = useMemo(
    () =>
      contracts.map((c: any) => ({
        value: c.id,
        label: `${c.contract_no} ${c.contract_name || ''}`.trim(),
      })),
    [contracts],
  );
  const quotationOptions = useMemo(
    () => quotations.map((q: any) => ({ value: q.id, label: q.quotation_no })),
    [quotations],
  );
  const paymentMethodOptions = useMemo(
    () =>
      paymentMethods
        .filter((m: any) => m.is_active)
        .map((m: any) => ({ value: m.label, label: m.label })),
    [paymentMethods],
  );

  const bankAccountOptions = useMemo(
    () =>
      bankAccounts.map((a: any) => ({
        value: a.id,
        label: `${a.bank_name || ''} - ${a.account_name || ''} (${a.account_no || ''})`,
      })),
    [bankAccounts],
  );

  // ── Batch selection helpers ──────────────────────────────────────────────
  // Only unpaid / partially_paid expenses are selectable for batch payment.
  const isSelectable = useCallback((row: any) => {
    const status = row?.payment_status || 'unpaid';
    return status === 'unpaid' || status === 'partially_paid';
  }, []);

  const selectableRows = useMemo(
    () => data.filter((row) => isSelectable(row)),
    [data, isSelectable],
  );

  const allSelectableSelected = useMemo(
    () =>
      selectableRows.length > 0 &&
      selectableRows.every((row) => selectedIds.has(row.id)),
    [selectableRows, selectedIds],
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected =
        selectableRows.length > 0 &&
        selectableRows.every((row) => next.has(row.id));
      if (allSelected) {
        selectableRows.forEach((row) => next.delete(row.id));
      } else {
        selectableRows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  }, [selectableRows]);

  // Selected expense rows (from currently loaded data) for the batch modal
  const selectedExpenses = useMemo(
    () => data.filter((row) => selectedIds.has(row.id)),
    [data, selectedIds],
  );

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`確定要刪除選取的 ${selectedIds.size} 筆支出嗎？`)) return;
    try {
      for (const id of Array.from(selectedIds)) {
        await expensesApi.delete(id);
      }
      setSelectedIds(new Set());
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message || '批量刪除失敗');
    }
  }, [selectedIds, load]);

  // Filtered partners for supplier combobox
  const filteredPartners = useMemo(() => {
    const suppliers = partners.filter(
      (p: any) => p.partner_type === 'supplier',
    );
    if (!supplierInput) return suppliers.slice(0, 20);
    return suppliers
      .filter(
        (p: any) =>
          p.name.toLowerCase().includes(supplierInput.toLowerCase()) ||
          (p.code &&
            p.code.toLowerCase().includes(supplierInput.toLowerCase())),
      )
      .slice(0, 20);
  }, [partners, supplierInput]);

  const getChildrenForParent = (parentId: string | number) => {
    if (!parentId) return [];
    const parent = categoryTree.find((c: any) => c.id === Number(parentId));
    return parent?.children || [];
  };

  const selectedCategory = useMemo(() => {
    for (const parent of categoryTree) {
      const child = (parent.children || []).find(
        (c: any) => Number(c.id) === Number(form.category_id),
      );
      if (child) return { parent, child };
    }
    return null;
  }, [categoryTree, form.category_id]);

  const selectedCategoryIsPettyCash =
    selectedCategory?.parent?.name === '人事費用' &&
    selectedCategory?.child?.name === '零用金';

  // ── Create handler ───────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedCategoryIsPettyCash && !form.employee_id) {
        alert('零用金支出必須選擇領取員工，系統才可同步建立員工零用金紀錄。');
        return;
      }
      const payload: any = { ...form };
      delete payload._parent_category_id;
      const numericFields = [
        'company_id',
        'supplier_partner_id',
        'category_id',
        'employee_id',
        'machinery_id',
        'vehicle_id',
        'client_id',
        'project_id',
        'quotation_id',
        'contract_id',
      ];
      for (const f of numericFields) {
        payload[f] = payload[f] ? Number(payload[f]) : undefined;
      }
      if (
        payload.payment_status !== 'paid' &&
        payload.payment_status !== 'partially_paid'
      )
        payload.payment_date = undefined;
      else if (!payload.payment_date) delete payload.payment_date;
      if (payload.total_amount)
        payload.total_amount = Number(payload.total_amount);
      // payment_status is already a string, no conversion needed

      await expensesApi.create(payload);
      setShowModal(false);
      setForm({ ...defaultForm });
      setSupplierInput('');
      load();
      loadReferenceData();
    } catch (err: any) {
      alert(err.response?.data?.message || '新增失敗');
    }
  };

  // ── Inline save ──────────────────────────────────────────────────────────
  const handleInlineSave = async (id: number, formData: any) => {
    const payload = { ...formData };
    if (
      typeof payload.machinery_id === 'string' &&
      payload.machinery_id.includes(':')
    ) {
      const [type, id] = payload.machinery_id.split(':');
      if (type === 'machinery') {
        payload.machinery_id = id;
        payload.vehicle_id = null;
        const selectedMachine = machineryList.find(
          (m: any) => Number(m.id) === Number(id),
        );
        payload.machine_code = selectedMachine?.machine_code || '';
      } else if (type === 'vehicle') {
        payload.vehicle_id = id;
        payload.machinery_id = null;
        payload.machine_code = '';
      }
    }
    const numericFields = [
      'company_id',
      'supplier_partner_id',
      'category_id',
      'employee_id',
      'machinery_id',
      'vehicle_id',
      'client_id',
      'project_id',
      'quotation_id',
      'contract_id',
    ];
    for (const f of numericFields) {
      if (f in payload) payload[f] = payload[f] ? Number(payload[f]) : null;
    }
    if ('total_amount' in payload)
      payload.total_amount = Number(payload.total_amount) || 0;
    // payment_status is already a string, no conversion needed
    await expensesApi.update(id, payload);
    load();
    loadReferenceData();
  };

  const handleInlineDelete = async (id: number) => {
    try {
      await expensesApi.delete(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const renderTruncatedText = (value: any, fallback = '-') => {
    const text = value == null || value === '' ? fallback : String(value);
    return (
      <div className="max-w-full truncate" title={text}>
        {text}
      </div>
    );
  };

  // ── Column definitions ───────────────────────────────────────────────────
  const columns: InlineColumn[] = [
    {
      key: 'date',
      label: '日期',
      sortable: true,
      editable: true,
      editType: 'date',
      editRender: (value, onChange) => (
        <DateInput
          value={value}
          onChange={onChange}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      render: (v: any) => fmtDate(v),
    },
    {
      key: 'company_id',
      label: '公司',
      sortable: true,
      editable: true,
      editType: 'select',
      editOptions: companyOptions,
      minWidth: 120,
      render: (_: any, row: any) =>
        renderTruncatedText(row.company?.internal_prefix || row.company?.name),
      filterRender: (_: any, row: any) =>
        row.company?.internal_prefix || row.company?.name || '-',
    },
    {
      key: 'supplier_name',
      label: '供應商',
      sortable: true,
      editable: true,
      editRender: (value: any, onChange: (v: any) => void) => (
        <InlineCombobox
          value={value}
          onChange={onChange}
          options={supplierNameOptions}
          placeholder="搜尋或輸入供應商"
        />
      ),
      minWidth: 190,
      render: (_: any, row: any) =>
        renderTruncatedText(row.supplier?.name || row.supplier_name),
      filterRender: (_: any, row: any) =>
        row.supplier?.name || row.supplier_name || '-',
    },
    {
      key: 'expense_receipt_number',
      label: '單號',
      sortable: true,
      editable: true,
      editType: 'text',
      minWidth: 140,
      render: (v: any) => renderTruncatedText(v),
    },
    {
      key: 'category_id',
      label: '類別',
      sortable: true,
      editable: true,
      editType: 'select',
      editOptions: allSubCategories,
      minWidth: 220,
      render: (_: any, row: any) => {
        if (!row.category) return '-';
        const p = row.category.parent?.name || '';
        return renderTruncatedText(
          p ? `${p} > ${row.category.name}` : row.category.name,
        );
      },
      filterRender: (_: any, row: any) => {
        if (!row.category) return '-';
        const p = row.category.parent?.name || '';
        return p ? `${p} > ${row.category.name}` : row.category.name;
      },
    },
    {
      key: 'employee_id',
      label: '報銷者',
      sortable: true,
      editable: true,
      editRender: (value: any, onChange: (v: any) => void) => (
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={employeeOptions}
          placeholder="搜尋員工..."
        />
      ),
      render: (_: any, row: any) => row.employee?.name_zh || '-',
      filterRender: (_: any, row: any) => row.employee?.name_zh || '-',
    },
    {
      key: 'created_by',
      label: '發佈人',
      sortable: true,
      editable: false,
      render: (_: any, row: any) =>
        row.creator?.displayName || row.creator?.username || '-',
      filterRender: (_: any, row: any) =>
        row.creator?.displayName || row.creator?.username || '-',
    },
    {
      key: 'item',
      label: '項目',
      sortable: true,
      editable: true,
      editType: 'text',
      minWidth: 220,
      render: (v: any) => renderTruncatedText(v),
    },
    {
      key: 'total_amount',
      label: '總金額',
      sortable: true,
      editable: true,
      editType: 'number',
      render: (v: any) =>
        v != null
          ? Number(v).toLocaleString('en', { minimumFractionDigits: 2 })
          : '-',
      exportRender: (v: any) => (v != null ? Number(v).toFixed(2) : ''),
    },
    {
      key: 'payment_status',
      label: '付款狀態',
      sortable: true,
      editable: true,
      editType: 'select',
      editOptions: [
        { value: 'unpaid', label: '未付款' },
        { value: 'partially_paid', label: '部分付款' },
        { value: 'paid', label: '已付款' },
        { value: 'cancelled', label: '取消' },
      ],
      render: (v: any) => {
        const statusMap: Record<string, { label: string; color: string }> = {
          unpaid: { label: '未付款', color: 'bg-yellow-100 text-yellow-700' },
          partially_paid: {
            label: '部分付款',
            color: 'bg-blue-100 text-blue-700',
          },
          paid: { label: '已付款', color: 'bg-green-100 text-green-700' },
          cancelled: { label: '取消', color: 'bg-gray-100 text-gray-500' },
        };
        // Backward compat: if v is boolean (old is_paid), convert
        const key =
          typeof v === 'boolean' ? (v ? 'paid' : 'unpaid') : v || 'unpaid';
        const s = statusMap[key] || statusMap.unpaid;
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}
          >
            {s.label}
          </span>
        );
      },
      exportRender: (v: any) => {
        const map: Record<string, string> = {
          unpaid: '未付款',
          partially_paid: '部分付款',
          paid: '已付款',
          cancelled: '取消',
        };
        return map[v] || (v ? '已付款' : '未付款');
      },
    },
    {
      key: 'payment_method',
      label: '付款方法',
      minWidth: 110,
      sortable: true,
      editable: true,
      editRender: (value: any, onChange: (v: any) => void) => (
        <InlineCombobox
          value={value}
          onChange={onChange}
          options={paymentMethodOptions}
          placeholder="選擇或輸入"
        />
      ),
      render: (v: any, row: any) => v || row?.payment_outs?.[0]?.payment_method || '-',
    },
    {
      key: 'payment_date',
      label: '付款日期',
      sortable: true,
      editable: true,
      editType: 'date',
      editRender: (value, onChange) => (
        <DateInput
          value={value}
          onChange={onChange}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      render: (v: any, row: any) => fmtDate(v || row?.payment_outs?.[0]?.date),
    },
    {
      key: 'payment_ref',
      label: '付款內容',
      sortable: true,
      editable: true,
      editType: 'text',
      minWidth: 180,
      render: (v: any, row: any) => renderTruncatedText(v || row?.payment_outs?.[0]?.reference_no),
    },
    {
      key: 'remarks',
      label: '備註',
      sortable: false,
      editable: true,
      editType: 'text',
      minWidth: 180,
      render: (v: any) => renderTruncatedText(v),
    },
    {
      key: 'machinery_id',
      label: '機號',
      sortable: true,
      editable: true,
      editRender: (_value: any, onChange: (v: any) => void, row: any) => (
        <SearchableSelect
          value={
            row.vehicle_id
              ? `vehicle:${row.vehicle_id}`
              : row.machinery_id
                ? `machinery:${row.machinery_id}`
                : null
          }
          onChange={onChange}
          options={equipmentOptions}
          placeholder="搜尋機號或車牌..."
        />
      ),
      render: (_: any, row: any) =>
        row.vehicle?.plate_number ||
        row.machinery?.machine_code ||
        row.machine_code ||
        '-',
      filterRender: (_: any, row: any) =>
        row.vehicle?.plate_number ||
        row.machinery?.machine_code ||
        row.machine_code ||
        '-',
    },
    {
      key: 'client_id',
      label: '客戶',
      sortable: true,
      editable: true,
      editRender: (value: any, onChange: (v: any) => void) => (
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={partnerOptions}
          placeholder="搜尋客戶..."
        />
      ),
      minWidth: 150,
      render: (_: any, row: any) => renderTruncatedText(row.client?.name),
      filterRender: (_: any, row: any) => row.client?.name || '-',
    },
    {
      key: 'contract_id',
      label: '合約',
      sortable: true,
      editable: true,
      editRender: (value: any, onChange: (v: any) => void) => (
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={contractOptions}
          placeholder="搜尋合約..."
        />
      ),
      render: (_: any, row: any) => row.contract?.contract_no || '-',
      filterRender: (_: any, row: any) => row.contract?.contract_no || '-',
    },
    {
      key: 'project_id',
      label: '工程編號',
      sortable: true,
      editable: true,
      editRender: (value: any, onChange: (v: any) => void) => (
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={projectOptions}
          placeholder="搜尋工程..."
        />
      ),
      render: (_: any, row: any) => row.project?.project_no || '-',
      filterRender: (_: any, row: any) => row.project?.project_no || '-',
    },
    {
      key: 'quotation_id',
      label: '報價單',
      sortable: true,
      editable: true,
      editRender: (value: any, onChange: (v: any) => void) => (
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={quotationOptions}
          placeholder="搜尋報價單..."
        />
      ),
      render: (_: any, row: any) => row.quotation?.quotation_no || '-',
      filterRender: (_: any, row: any) => row.quotation?.quotation_no || '-',
    },
    {
      key: 'expense_payment_method',
      label: '付款類型',
      sortable: true,
      editable: true,
      editType: 'select',
      editOptions: [
        { value: 'SELF_PAID', label: '本人代付' },
        { value: 'COMPANY_PAID', label: '公司付款' },
      ],
      render: (v: any) => {
        if (!v)
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              本人代付
            </span>
          );
        return v === 'COMPANY_PAID' ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            公司付款
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            本人代付
          </span>
        );
      },
      exportRender: (v: any) =>
        v === 'COMPANY_PAID' ? '公司付款' : '本人代付',
    },
    {
      key: 'source',
      label: '來源',
      sortable: true,
      editable: false,
      render: (v: any) => {
        const sourceMap: Record<string, { label: string; color: string }> = {
          MANUAL: { label: '手動輸入', color: 'bg-gray-100 text-gray-600' },
          PURCHASE: { label: '採購', color: 'bg-blue-100 text-blue-700' },
          PAYROLL: { label: '薪資', color: 'bg-purple-100 text-purple-700' },
          SUBCON: { label: '分判', color: 'bg-orange-100 text-orange-700' },
          CONTRA: { label: '對沖', color: 'bg-yellow-100 text-yellow-700' },
          ERP: { label: 'ERP', color: 'bg-green-100 text-green-700' },
          employee_portal: {
            label: '員工報銷',
            color: 'bg-blue-100 text-blue-700',
          },
        };
        const info = sourceMap[v] || {
          label: v || '-',
          color: 'bg-gray-100 text-gray-600',
        };
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}
          >
            {info.label}
          </span>
        );
      },
      filterRender: (v: any) => {
        const m: Record<string, string> = {
          MANUAL: '手動輸入',
          PURCHASE: '採購',
          PAYROLL: '薪資',
          SUBCON: '分判',
          CONTRA: '對沖',
          ERP: 'ERP',
          employee_portal: '員工報銷',
        };
        return m[v] || v || '-';
      },
      exportRender: (v: any) => {
        const m: Record<string, string> = {
          MANUAL: '手動輸入',
          PURCHASE: '採購',
          PAYROLL: '薪資',
          SUBCON: '分判',
          CONTRA: '對沖',
          ERP: 'ERP',
          employee_portal: '員工報銷',
        };
        return m[v] || v || '-';
      },
    },
  ];

  const {
    columnConfigs,
    columnWidths,
    visibleColumns,
    handleColumnConfigChange,
    handleReset,
    handleSavePersonal,
    handleSaveDefault,
    handleColumnResize,
  } = useColumnConfig('expenses', columns);

  // Checkbox selection column — kept OUTSIDE columnConfig so it is always first,
  // never hidden, and never shown in the column customizer panel.
  const selectColumn: InlineColumn = {
    key: '_select',
    label: '',
    sortable: false,
    editable: false,
    filterable: false,
    className: 'w-10 text-center',
    headerRender: () => (
      <input
        type="checkbox"
        className="cursor-pointer"
        checked={allSelectableSelected}
        onChange={toggleSelectAll}
        onClick={(e) => e.stopPropagation()}
        title="全選/取消全選（僅未付款/部分付款）"
      />
    ),
    onCellClick: (e) => e.stopPropagation(),
    render: (_v: any, row: any) => {
      if (!isSelectable(row)) return null;
      return (
        <input
          type="checkbox"
          className="cursor-pointer"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          onClick={(e) => e.stopPropagation()}
        />
      );
    },
  };
  const tableColumns = isReadOnly()
    ? (visibleColumns as any)
    : [selectColumn, ...(visibleColumns as any)];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">支出管理</h1>
          <p className="text-gray-500 text-sm mt-1">
            管理公司各項支出記錄，點擊行可查看詳情
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          新增支出
        </button>
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="支出管理列表"
          columns={tableColumns}
          actions={
            !isReadOnly() && selectedIds.size > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  已選 {selectedIds.size} 筆
                </span>
                <button
                  type="button"
                  onClick={() => setShowBatchPayment(true)}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                >
                  批量付款
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100"
                >
                  批量刪除
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  取消選取
                </button>
              </div>
            ) : undefined
          }
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
          limit={20}
          onPageChange={setPage}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
          searchPlaceholder="搜尋項目、供應商、單號、付款內容..."
          searchInputClassName="min-w-[250px] sm:min-w-[320px]"
          loading={loading}
          serverSideFilter
          columnFilters={columnFilters}
          onColumnFilterChange={handleColumnFilterChange}
          onFetchFilterOptions={handleFetchFilterOptions}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => {
            setSortBy(f);
            setSortOrder(o);
          }}
          onSave={handleInlineSave}
          onDelete={handleInlineDelete}
          onRowClick={(row) => window.open(`/expenses/${row.id}`, '_blank')}
          filters={
            <DateRangeFilter
              dateTypeOptions={[
                { value: 'date', label: '支出日期' },
                { value: 'payment_date', label: '付款日期' },
              ]}
              dateType={dateType}
              onDateTypeChange={(v) => {
                setDateType(v);
                setPage(1);
              }}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onRangeChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
                setPage(1);
              }}
            />
          }
        />
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="新增支出"
        size="xl"
      >
        <form
          onSubmit={handleCreate}
          className="space-y-4 max-h-[75vh] overflow-y-auto p-1"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日期 *
              </label>
              <DateInput
                value={form.date}
                onChange={(value) => setForm({ ...form, date: value })}
                className="input-field"
                required
              />
            </div>
            {/* Company */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                公司
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
                    {c.internal_prefix || c.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Supplier combobox */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                供應商
              </label>
              <input
                type="text"
                value={
                  form.supplier_partner_id
                    ? partners.find(
                        (p: any) => p.id === Number(form.supplier_partner_id),
                      )?.name || supplierInput
                    : supplierInput || form.supplier_name
                }
                onChange={(e) => {
                  setSupplierInput(e.target.value);
                  setForm({
                    ...form,
                    supplier_name: e.target.value,
                    supplier_partner_id: '',
                  });
                  setShowSupplierDropdown(true);
                }}
                onFocus={() => setShowSupplierDropdown(true)}
                onBlur={() =>
                  setTimeout(() => setShowSupplierDropdown(false), 200)
                }
                className="input-field"
                placeholder="輸入或選擇供應商"
              />
              {showSupplierDropdown && filteredPartners.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredPartners.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setForm({
                          ...form,
                          supplier_partner_id: p.id,
                          supplier_name: p.name,
                        });
                        setSupplierInput(p.name);
                        setShowSupplierDropdown(false);
                      }}
                    >
                      {p.name} {p.code ? `(${p.code})` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Receipt number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                單號
              </label>
              <input
                type="text"
                value={form.expense_receipt_number}
                onChange={(e) =>
                  setForm({ ...form, expense_receipt_number: e.target.value })
                }
                className="input-field"
                placeholder="輸入單號"
              />
            </div>
            {/* Category cascading */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                大類別
              </label>
              <select
                value={form._parent_category_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    _parent_category_id: e.target.value,
                    category_id: '',
                  })
                }
                className="input-field"
              >
                <option value="">請選擇大類別</option>
                {categoryTree.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                子類別
              </label>
              <select
                value={form.category_id}
                onChange={(e) =>
                  setForm({ ...form, category_id: e.target.value })
                }
                className="input-field"
                disabled={!form._parent_category_id}
              >
                <option value="">請選擇子類別</option>
                {getChildrenForParent(form._parent_category_id).map(
                  (c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ),
                )}
              </select>
            </div>
            {/* Employee (報銷者) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                報銷者
              </label>
              <SearchableSelect
                value={form.employee_id || null}
                onChange={(v) => setForm({ ...form, employee_id: v })}
                options={employeeOptions}
                placeholder="搜尋員工..."
                className="w-full"
              />
              {selectedCategoryIsPettyCash && (
                <p className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1">
                  此支出會記錄為「員工領取零用金」，必須選擇領取員工；新增後會同步增加該員工的零用金餘額。
                </p>
              )}
            </div>
            {/* Item */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                項目
              </label>
              <input
                type="text"
                value={form.item}
                onChange={(e) => setForm({ ...form, item: e.target.value })}
                className="input-field"
              />
            </div>
            {/* Total Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                總金額
              </label>
              <input
                type="number"
                step="0.01"
                value={form.total_amount}
                onChange={(e) =>
                  setForm({ ...form, total_amount: e.target.value })
                }
                className="input-field"
              />
            </div>
            {/* Payment Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                付款狀態
              </label>
              <select
                value={form.payment_status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    payment_status: e.target.value,
                    payment_date:
                      e.target.value === 'paid' ||
                      e.target.value === 'partially_paid'
                        ? form.payment_date
                        : '',
                  })
                }
                className="input-field"
              >
                <option value="unpaid">未付款</option>
                <option value="partially_paid">部分付款</option>
                <option value="paid">已付款</option>
                <option value="cancelled">取消</option>
              </select>
            </div>
            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                付款方法
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="payment-methods-list"
                  value={form.payment_method}
                  onChange={(e) =>
                    setForm({ ...form, payment_method: e.target.value })
                  }
                  className="input-field"
                  placeholder="選擇或輸入付款方法"
                />
                <datalist id="payment-methods-list">
                  {paymentMethodOptions.map((o) => (
                    <option key={o.value} value={String(o.value)} />
                  ))}
                </datalist>
              </div>
            </div>
            {/* Payment Date */}
            {(form.payment_status === 'paid' ||
              form.payment_status === 'partially_paid') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  付款日期
                </label>
                <DateInput
                  value={form.payment_date}
                  onChange={(value) =>
                    setForm({ ...form, payment_date: value })
                  }
                  className="input-field"
                />
              </div>
            )}
            {/* Payment Ref */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                付款內容（支票號碼/交易號碼）
              </label>
              <input
                type="text"
                value={form.payment_ref}
                onChange={(e) =>
                  setForm({ ...form, payment_ref: e.target.value })
                }
                className="input-field"
              />
            </div>
            {/* Machinery */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                機號
              </label>
              <SearchableSelect
                value={
                  form.vehicle_id
                    ? `vehicle:${form.vehicle_id}`
                    : form.machinery_id
                      ? `machinery:${form.machinery_id}`
                      : null
                }
                onChange={(v) => {
                  if (!v) {
                    setForm({
                      ...form,
                      machinery_id: '',
                      vehicle_id: '',
                      machine_code: '',
                    });
                    return;
                  }
                  const [type, rawId] = String(v).split(':');
                  if (type === 'machinery') {
                    const m = machineryList.find(
                      (item: any) => Number(item.id) === Number(rawId),
                    );
                    setForm({
                      ...form,
                      machinery_id: rawId,
                      vehicle_id: '',
                      machine_code: m?.machine_code || '',
                    });
                  } else if (type === 'vehicle') {
                    setForm({
                      ...form,
                      machinery_id: '',
                      vehicle_id: rawId,
                      machine_code: '',
                    });
                  }
                }}
                options={equipmentOptions}
                placeholder="搜尋機號或車牌..."
                className="w-full"
              />
            </div>
            {/* Client */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                客戶
              </label>
              <SearchableSelect
                value={form.client_id || null}
                onChange={(v) => setForm({ ...form, client_id: v })}
                options={partnerOptions}
                placeholder="搜尋客戶..."
                className="w-full"
              />
            </div>
            {/* Project */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                工程編號
              </label>
              <SearchableSelect
                value={form.project_id || null}
                onChange={(v) => setForm({ ...form, project_id: v })}
                options={projectOptions}
                placeholder="搜尋工程..."
                className="w-full"
              />
            </div>
            {/* Quotation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                報價單
              </label>
              <SearchableSelect
                value={form.quotation_id || null}
                onChange={(v) => setForm({ ...form, quotation_id: v })}
                options={quotationOptions}
                placeholder="搜尋報價單..."
                className="w-full"
              />
            </div>
            {/* Expense Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                付款類型
              </label>
              <select
                value={form.expense_payment_method}
                onChange={(e) =>
                  setForm({ ...form, expense_payment_method: e.target.value })
                }
                className="input-field"
              >
                <option value="SELF_PAID">
                  本人代付（員工墊付，公司報銷）
                </option>
                <option value="COMPANY_PAID">公司付款（公司直接支付）</option>
              </select>
            </div>
            {/* Remarks */}
            <div className="md:col-span-2">
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
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="btn-secondary"
            >
              取消
            </button>
            <button type="submit" className="btn-primary">
              確認新增
            </button>
          </div>
        </form>
      </Modal>

      {/* Batch Payment Modal */}
      <BatchPaymentModal
        isOpen={showBatchPayment}
        onClose={() => setShowBatchPayment(false)}
        expenses={selectedExpenses as any}
        bankAccountOptions={bankAccountOptions}
        companyOptions={companyOptions}
        paymentMethodOptions={paymentMethodOptions}
        onSuccess={() => {
          setSelectedIds(new Set());
          load();
        }}
      />
    </div>
  );
}
