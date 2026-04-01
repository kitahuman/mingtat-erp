'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  expensesApi,
  expenseCategoriesApi,
  companiesApi,
  partnersApi,
  employeesApi,
  machineryApi,
  projectsApi,
  quotationsApi,
} from '@/lib/api';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';

export default function ExpensesPage() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Reference data
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [machineryList, setMachineryList] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [categoryTree, setCategoryTree] = useState<any[]>([]);

  // Supplier combobox
  const [supplierInput, setSupplierInput] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  const defaultForm: any = {
    date: new Date().toISOString().slice(0, 10),
    company_id: '',
    supplier_name: '',
    supplier_partner_id: '',
    category_id: '',
    _parent_category_id: '',
    employee_id: '',
    item: '',
    total_amount: '',
    paid_amount: '',
    payment_date: '',
    payment_ref: '',
    remarks: '',
    machine_code: '',
    machinery_id: '',
    client_id: '',
    contract_id: '',
    project_id: '',
    quotation_id: '',
  };
  const [form, setForm] = useState<any>({ ...defaultForm });

  const load = () => {
    setLoading(true);
    expensesApi
      .list({
        page,
        limit: 20,
        search,
        company_id: companyFilter || undefined,
        category_id: categoryFilter || undefined,
        sortBy,
        sortOrder,
      })
      .then((res) => {
        setData(res.data.data);
        setTotal(res.data.total);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, search, companyFilter, categoryFilter, sortBy, sortOrder]);

  useEffect(() => {
    companiesApi.simple().then((res) => setCompanies(res.data || []));
    partnersApi.simple().then((res) => setPartners(res.data || []));
    employeesApi.list({ limit: 9999 }).then((res) => setEmployees(res.data.data || []));
    machineryApi.list({ limit: 9999 }).then((res) => setMachineryList(res.data.data || []));
    projectsApi.simple().then((res) => setProjects(res.data || []));
    quotationsApi.list({ limit: 9999 }).then((res) => setQuotations(res.data.data || []));
    expenseCategoriesApi.getTree().then((res) => setCategoryTree(res.data || []));
  }, []);

  // Build flat sub-category options for inline edit
  const allSubCategories = useMemo(() => {
    const result: { value: number; label: string; parentId: number; parentName: string }[] = [];
    for (const parent of categoryTree) {
      for (const child of parent.children || []) {
        result.push({ value: child.id, label: `${parent.name} > ${child.name}`, parentId: parent.id, parentName: parent.name });
      }
    }
    return result;
  }, [categoryTree]);

  const companyOptions = companies.map((c: any) => ({ value: c.id, label: c.internal_prefix || c.name }));
  const partnerOptions = partners.map((p: any) => ({ value: p.id, label: p.name }));
  const employeeOptions = employees.map((e: any) => ({ value: e.id, label: e.name_zh }));
  const machineryOptions = machineryList.map((m: any) => ({ value: m.id, label: m.machine_code }));
  const projectOptions = projects.map((p: any) => ({ value: p.id, label: `${p.project_no} ${p.project_name}` }));
  const quotationOptions = quotations.map((q: any) => ({ value: q.id, label: q.quotation_no }));
  const categoryOptions = allSubCategories.map((c) => ({ value: c.value, label: c.label }));

  // Filtered partners for supplier combobox
  const filteredPartners = useMemo(() => {
    if (!supplierInput) return partners.slice(0, 20);
    return partners.filter((p: any) =>
      p.name.toLowerCase().includes(supplierInput.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(supplierInput.toLowerCase()))
    ).slice(0, 20);
  }, [partners, supplierInput]);

  // Get children for a selected parent category
  const getChildrenForParent = (parentId: string | number) => {
    if (!parentId) return [];
    const parent = categoryTree.find((c: any) => c.id === Number(parentId));
    return parent?.children || [];
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { ...form };
      delete payload._parent_category_id;
      // Normalize
      if (payload.company_id) payload.company_id = Number(payload.company_id);
      else delete payload.company_id;
      if (payload.supplier_partner_id) payload.supplier_partner_id = Number(payload.supplier_partner_id);
      else delete payload.supplier_partner_id;
      if (payload.category_id) payload.category_id = Number(payload.category_id);
      else delete payload.category_id;
      if (payload.employee_id) payload.employee_id = Number(payload.employee_id);
      else delete payload.employee_id;
      if (payload.machinery_id) payload.machinery_id = Number(payload.machinery_id);
      else delete payload.machinery_id;
      if (payload.client_id) payload.client_id = Number(payload.client_id);
      else delete payload.client_id;
      if (payload.project_id) payload.project_id = Number(payload.project_id);
      else delete payload.project_id;
      if (payload.quotation_id) payload.quotation_id = Number(payload.quotation_id);
      else delete payload.quotation_id;
      if (payload.contract_id) payload.contract_id = Number(payload.contract_id);
      else delete payload.contract_id;
      if (!payload.payment_date) delete payload.payment_date;
      if (payload.total_amount) payload.total_amount = Number(payload.total_amount);
      if (payload.paid_amount) payload.paid_amount = Number(payload.paid_amount);

      await expensesApi.create(payload);
      setShowModal(false);
      setForm({ ...defaultForm });
      setSupplierInput('');
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || '新增失敗');
    }
  };

  const handleInlineSave = async (id: number, formData: any) => {
    const payload = { ...formData };
    // Normalize numeric FKs
    const numericFields = ['company_id', 'supplier_partner_id', 'category_id', 'employee_id', 'machinery_id', 'client_id', 'project_id', 'quotation_id', 'contract_id'];
    for (const f of numericFields) {
      if (f in payload) {
        payload[f] = payload[f] ? Number(payload[f]) : null;
      }
    }
    if ('total_amount' in payload) payload.total_amount = Number(payload.total_amount) || 0;
    if ('paid_amount' in payload) payload.paid_amount = Number(payload.paid_amount) || 0;
    await expensesApi.update(id, payload);
    load();
  };

  const handleInlineDelete = async (id: number) => {
    try {
      await expensesApi.delete(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const columns = [
    {
      key: 'date',
      label: '日期',
      sortable: true,
      editable: true,
      editType: 'date' as const,
      render: (v: any) => fmtDate(v),
    },
    {
      key: 'company_id',
      label: '公司',
      sortable: true,
      editable: true,
      editType: 'select' as const,
      editOptions: companyOptions,
      render: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-',
      filterRender: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-',
    },
    {
      key: 'supplier_name',
      label: '供應商',
      sortable: true,
      editable: true,
      editType: 'text' as const,
      render: (_: any, row: any) => {
        if (row.supplier) return row.supplier.name;
        return row.supplier_name || '-';
      },
      filterRender: (_: any, row: any) => row.supplier?.name || row.supplier_name || '-',
    },
    {
      key: 'category_id',
      label: '類別',
      sortable: true,
      editable: true,
      editType: 'select' as const,
      editOptions: categoryOptions,
      render: (_: any, row: any) => {
        if (!row.category) return '-';
        const parentName = row.category.parent?.name || '';
        return parentName ? `${parentName} > ${row.category.name}` : row.category.name;
      },
      filterRender: (_: any, row: any) => {
        if (!row.category) return '-';
        const parentName = row.category.parent?.name || '';
        return parentName ? `${parentName} > ${row.category.name}` : row.category.name;
      },
    },
    {
      key: 'employee_id',
      label: '員工(claim)',
      sortable: true,
      editable: true,
      editType: 'select' as const,
      editOptions: employeeOptions,
      render: (_: any, row: any) => row.employee?.name_zh || '-',
      filterRender: (_: any, row: any) => row.employee?.name_zh || '-',
    },
    {
      key: 'item',
      label: '項目',
      sortable: true,
      editable: true,
      editType: 'text' as const,
    },
    {
      key: 'total_amount',
      label: '總金額',
      sortable: true,
      editable: true,
      editType: 'number' as const,
      render: (v: any) => v != null ? Number(v).toLocaleString('en', { minimumFractionDigits: 2 }) : '-',
      exportRender: (v: any) => v != null ? Number(v).toFixed(2) : '',
    },
    {
      key: 'paid_amount',
      label: '已付款',
      sortable: true,
      editable: true,
      editType: 'number' as const,
      render: (v: any) => v != null ? Number(v).toLocaleString('en', { minimumFractionDigits: 2 }) : '-',
      exportRender: (v: any) => v != null ? Number(v).toFixed(2) : '',
    },
    {
      key: 'payment_date',
      label: '付款日期',
      sortable: true,
      editable: true,
      editType: 'date' as const,
      render: (v: any) => fmtDate(v),
    },
    {
      key: 'payment_ref',
      label: '付款內容',
      sortable: true,
      editable: true,
      editType: 'text' as const,
    },
    {
      key: 'remarks',
      label: '備註',
      sortable: false,
      editable: true,
      editType: 'text' as const,
    },
    {
      key: 'machinery_id',
      label: '機號',
      sortable: true,
      editable: true,
      editType: 'select' as const,
      editOptions: machineryOptions,
      render: (_: any, row: any) => row.machinery?.machine_code || row.machine_code || '-',
      filterRender: (_: any, row: any) => row.machinery?.machine_code || row.machine_code || '-',
    },
    {
      key: 'client_id',
      label: '客戶',
      sortable: true,
      editable: true,
      editType: 'select' as const,
      editOptions: partnerOptions,
      render: (_: any, row: any) => row.client?.name || '-',
      filterRender: (_: any, row: any) => row.client?.name || '-',
    },
    {
      key: 'contract_id',
      label: '合約',
      sortable: true,
      editable: true,
      editType: 'text' as const,
      render: (v: any) => v || '-',
    },
    {
      key: 'project_id',
      label: '工程編號',
      sortable: true,
      editable: true,
      editType: 'select' as const,
      editOptions: projectOptions,
      render: (_: any, row: any) => row.project ? `${row.project.project_no}` : '-',
      filterRender: (_: any, row: any) => row.project?.project_no || '-',
    },
    {
      key: 'quotation_id',
      label: '報價單',
      sortable: true,
      editable: true,
      editType: 'select' as const,
      editOptions: quotationOptions,
      render: (_: any, row: any) => row.quotation?.quotation_no || '-',
      filterRender: (_: any, row: any) => row.quotation?.quotation_no || '-',
    },
  ];

  const {
    columnConfigs,
    columnWidths,
    visibleColumns,
    handleColumnConfigChange,
    handleReset,
    handleColumnResize,
  } = useColumnConfig('expenses', columns);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">支出管理</h1>
          <p className="text-gray-500 text-sm mt-1">管理公司各項支出記錄</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowModal(true)} className="btn-primary">
            新增支出
          </button>
        </div>
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="支出記錄列表"
          columns={visibleColumns as any}
          columnConfigs={columnConfigs}
          onColumnConfigChange={handleColumnConfigChange}
          onColumnConfigReset={handleReset}
          columnWidths={columnWidths}
          onColumnResize={handleColumnResize}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={setSearch}
          searchPlaceholder="搜尋項目、供應商、付款內容、備註..."
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => {
            setSortBy(f);
            setSortOrder(o);
          }}
          onSave={handleInlineSave}
          onDelete={handleInlineDelete}
          filters={
            <div className="flex gap-2 flex-wrap">
              <select
                value={companyFilter}
                onChange={(e) => {
                  setCompanyFilter(e.target.value);
                  setPage(1);
                }}
                className="input-field w-auto"
              >
                <option value="">全部公司</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.internal_prefix || c.name}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="input-field w-auto"
              >
                <option value="">全部類別</option>
                {categoryTree.map((parent: any) => (
                  <optgroup key={parent.id} label={parent.name}>
                    {(parent.children || []).map((child: any) => (
                      <option key={child.id} value={child.id}>
                        {child.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          }
        />
      </div>

      {/* Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增支出" size="xl">
        <form onSubmit={handleCreate} className="space-y-4 max-h-[75vh] overflow-y-auto p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="input-field"
                required
              />
            </div>
            {/* Company */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">公司</label>
              <select
                value={form.company_id}
                onChange={(e) => setForm({ ...form, company_id: e.target.value })}
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
            {/* Supplier (combobox) */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">供應商</label>
              <input
                type="text"
                value={form.supplier_partner_id ? partners.find((p: any) => p.id === Number(form.supplier_partner_id))?.name || supplierInput : supplierInput || form.supplier_name}
                onChange={(e) => {
                  setSupplierInput(e.target.value);
                  setForm({ ...form, supplier_name: e.target.value, supplier_partner_id: '' });
                  setShowSupplierDropdown(true);
                }}
                onFocus={() => setShowSupplierDropdown(true)}
                onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
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
                        setForm({ ...form, supplier_partner_id: p.id, supplier_name: p.name });
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
            {/* Category: parent then child */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">大類別</label>
              <select
                value={form._parent_category_id}
                onChange={(e) => setForm({ ...form, _parent_category_id: e.target.value, category_id: '' })}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">子類別</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="input-field"
                disabled={!form._parent_category_id}
              >
                <option value="">請選擇子類別</option>
                {getChildrenForParent(form._parent_category_id).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Employee (claim) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">員工(claim)</label>
              <select
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                className="input-field"
              >
                <option value="">請選擇</option>
                {employees.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.name_zh}
                  </option>
                ))}
              </select>
            </div>
            {/* Item */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">項目</label>
              <input
                type="text"
                value={form.item}
                onChange={(e) => setForm({ ...form, item: e.target.value })}
                className="input-field"
              />
            </div>
            {/* Total Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">總金額</label>
              <input
                type="number"
                step="0.01"
                value={form.total_amount}
                onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                className="input-field"
              />
            </div>
            {/* Paid Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">已付款</label>
              <input
                type="number"
                step="0.01"
                value={form.paid_amount}
                onChange={(e) => setForm({ ...form, paid_amount: e.target.value })}
                className="input-field"
              />
            </div>
            {/* Payment Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">付款日期</label>
              <input
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                className="input-field"
              />
            </div>
            {/* Payment Ref */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">付款內容 (支票號碼/交易號碼)</label>
              <input
                type="text"
                value={form.payment_ref}
                onChange={(e) => setForm({ ...form, payment_ref: e.target.value })}
                className="input-field"
              />
            </div>
            {/* Machinery */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">機號</label>
              <select
                value={form.machinery_id}
                onChange={(e) => {
                  const mid = e.target.value;
                  const m = machineryList.find((m: any) => m.id === Number(mid));
                  setForm({ ...form, machinery_id: mid, machine_code: m?.machine_code || '' });
                }}
                className="input-field"
              >
                <option value="">請選擇</option>
                {machineryList.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.machine_code} {m.machine_type ? `(${m.machine_type})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {/* Client */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
              <select
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                className="input-field"
              >
                <option value="">請選擇</option>
                {partners.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Project */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">工程編號</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                className="input-field"
              >
                <option value="">請選擇</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.project_no} {p.project_name}
                  </option>
                ))}
              </select>
            </div>
            {/* Quotation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">報價單</label>
              <select
                value={form.quotation_id}
                onChange={(e) => setForm({ ...form, quotation_id: e.target.value })}
                className="input-field"
              >
                <option value="">請選擇</option>
                {quotations.map((q: any) => (
                  <option key={q.id} value={q.id}>
                    {q.quotation_no}
                  </option>
                ))}
              </select>
            </div>
            {/* Remarks */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                className="input-field"
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
              取消
            </button>
            <button type="submit" className="btn-primary">
              確認新增
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
