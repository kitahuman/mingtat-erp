'use client';
import { useState, useEffect, useCallback } from 'react';
import DateInput from '@/components/DateInput';
import { useParams, useRouter } from 'next/navigation';
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
  fieldOptionsApi,
} from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';
import PaymentOutBlock from '@/components/payment/PaymentOutBlock';
import { useAuth } from '@/lib/auth';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import AttachmentUpload from '@/components/AttachmentUpload';
import Modal from '@/components/Modal';

// ─── Helpers ────────────────────────────────────────────────────────────────
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </dt>
      <dd className="text-sm text-gray-900">
        {children || <span className="text-gray-400">—</span>}
      </dd>
    </div>
  );
}

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: '未付款', color: 'bg-yellow-100 text-yellow-700' },
  partially_paid: { label: '部分付款', color: 'bg-blue-100 text-blue-700' },
  paid: { label: '已付款', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '取消', color: 'bg-gray-100 text-gray-500' },
};

function PaymentStatusBadge({ status }: { status: string }) {
  const s = PAYMENT_STATUS_MAP[status] || PAYMENT_STATUS_MAP.unpaid;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.color}`}
    >
      {s.label}
    </span>
  );
}

type OtherCharge = { name: string; amount: number | string };

function normalizeOtherCharges(value: any): OtherCharge[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((charge) => ({
      name: String(charge?.name || ''),
      amount: charge?.amount ?? '',
    }))
    .filter((charge) => charge.name.trim() || charge.amount !== '');
}

function calcOtherChargesTotal(charges: OtherCharge[]) {
  return charges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0);
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString('en', { minimumFractionDigits: 2 });
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const expenseId = Number(id);

  const { isReadOnly } = useAuth();
  const [expense, setExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState('');

  // Reference data
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [machineryList, setMachineryList] = useState<any[]>([]);
  const [vehicleList, setVehicleList] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [categoryTree, setCategoryTree] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [unitOptions, setUnitOptions] = useState<any[]>([]);

  // Items state
  const [itemForm, setItemForm] = useState({
    description: '',
    quantity: '1',
    unit: '',
    unit_price: '',
    amount: '',
  });
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemForm, setEditingItemForm] = useState<any>({});
  const [itemSaving, setItemSaving] = useState(false);

  const loadExpense = useCallback(() => {
    setLoading(true);
    expensesApi
      .get(expenseId)
      .then((r) => {
        setExpense(r.data);
        setForm(toForm(r.data));
      })
      .catch(() => setError('無法載入支出管理記錄'))
      .finally(() => setLoading(false));
  }, [expenseId]);

  useEffect(() => {
    loadExpense();
  }, [loadExpense]);

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
    quotationsApi
      .list({ limit: 9999 })
      .then((r) => setQuotations(r.data.data || []));
    expenseCategoriesApi.getTree().then((r) => setCategoryTree(r.data || []));
    fieldOptionsApi
      .getByCategory('payment_method')
      .then((r) => setPaymentMethods(r.data || []));
    fieldOptionsApi
      .getByCategory('wage_unit')
      .then((r) =>
        setUnitOptions(
          (r.data || []).filter((o: any) => o.is_active !== false),
        ),
      );
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);
  useRefetchOnFocus(loadReferenceData);

  function toForm(e: any) {
    const otherCharges = normalizeOtherCharges(e.other_charges);
    const otherChargesAmount = calcOtherChargesTotal(otherCharges);
    const itemSubtotal = Array.isArray(e.items) && e.items.length > 0
      ? e.items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
      : null;
    const detailSubtotal = itemSubtotal !== null
      ? itemSubtotal
      : e.total_amount != null
        ? Math.round((Number(e.total_amount) - otherChargesAmount) * 100) / 100
        : '';

    return {
      date: e.date ? e.date.slice(0, 10) : '',
      company_id: e.company_id || '',
      supplier_name: e.supplier?.name || e.supplier_name || '',
      supplier_partner_id: e.supplier_partner_id || '',
      expense_receipt_number: e.expense_receipt_number || '',
      category_id: e.category_id || '',
      _parent_category_id:
        e.category?.parent_id || e.category?.parent?.id || '',
      employee_id: e.employee_id || '',
      item: e.item || '',
      total_amount: detailSubtotal,
      other_charges: otherCharges,
      payment_status: e.payment_status || (e.is_paid ? 'paid' : 'unpaid'),
      payment_date: e.payment_date ? e.payment_date.slice(0, 10) : '',
      remarks: e.remarks || '',
      machine_code: e.machine_code || '',
      machinery_id: e.machinery_id || '',
      vehicle_id: e.vehicle_id || '',
      client_id: e.client_id || '',
      contract_id: e.contract_id || '',
      project_id: e.project_id || '',
      quotation_id: e.quotation_id || '',
      expense_payment_method: e.expense_payment_method || 'SELF_PAID',
    };
  }

  const handleSave = async () => {
    setSaving(true);
    try {
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
        payload[f] = payload[f] ? Number(payload[f]) : null;
      }
      payload.other_charges = normalizeOtherCharges(payload.other_charges)
        .map((charge) => ({
          name: charge.name.trim(),
          amount: Number(charge.amount) || 0,
        }))
        .filter((charge) => charge.name);
      if (items.length > 0) {
        payload.total_amount = itemsTotal;
      } else if (payload.total_amount !== '') {
        payload.total_amount = Number(payload.total_amount);
      }
      if (
        payload.payment_status !== 'paid' &&
        payload.payment_status !== 'partially_paid'
      )
        payload.payment_date = null;
      await expensesApi.update(expenseId, payload);
      await loadExpense();
      loadReferenceData();
      setEditMode(false);
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const getChildrenForParent = (parentId: string | number) => {
    if (!parentId) return [];
    const parent = categoryTree.find((c: any) => c.id === Number(parentId));
    return parent?.children || [];
  };

  const companyOptions = companies.map((c: any) => ({
    value: c.id,
    label: c.internal_prefix || c.name,
  }));
  const supplierOptions = partners
    .filter((p: any) => p.partner_type === 'supplier')
    .map((p: any) => ({ value: p.id, label: p.name }));
  const partnerOptions = partners.map((p: any) => ({
    value: p.id,
    label: p.name,
  }));
  const employeeOptions = employees.map((e: any) => ({
    value: e.id,
    label: e.name_zh,
  }));
  const equipmentOptions = [
    ...machineryList.map((m: any) => ({
      value: `machinery:${m.id}`,
      label: `${m.machine_code}${m.machine_type ? ` (${m.machine_type})` : ''}`,
    })),
    ...vehicleList.map((v: any) => ({
      value: `vehicle:${v.id}`,
      label: `${v.plate_number} (車輛)`,
    })),
  ];
  const projectOptions = projects.map((p: any) => ({
    value: p.id,
    label: `${p.project_no} ${p.project_name || ''}`.trim(),
  }));
  const formatQuotationLabel = (q: any) => {
    if (!q) return '';
    const parts = [
      q.quotation_no,
      q.client?.name,
      q.project?.project_no || q.project_name,
    ].filter(Boolean);
    return parts.join(' · ');
  };
  const quotationOptions = quotations.map((q: any) => ({
    value: q.id,
    label: formatQuotationLabel(q),
  }));
  const unitSelectOptions = unitOptions.map((o: any) => ({
    value: o.value || o.label || o.name,
    label: o.label || o.value || o.name,
  }));

  // ── Items ──────────────────────────────────────────────────────────────────
  const calcItemAmount = (qty: string, up: string) => {
    const q = parseFloat(qty) || 0;
    const u = parseFloat(up) || 0;
    return (q * u).toFixed(2);
  };

  const handleAddItem = async () => {
    if (!itemForm.description.trim()) return alert('請輸入描述');
    setItemSaving(true);
    try {
      const qty = parseFloat(itemForm.quantity) || 1;
      const up = parseFloat(itemForm.unit_price) || 0;
      const amt = itemForm.amount ? parseFloat(itemForm.amount) : qty * up;
      await expensesApi.createItem(expenseId, {
        description: itemForm.description,
        quantity: qty,
        unit: itemForm.unit || null,
        unit_price: up,
        amount: amt,
      });
      setItemForm({
        description: '',
        quantity: '1',
        unit: '',
        unit_price: '',
        amount: '',
      });
      await loadExpense();
    } catch (err: any) {
      alert(err.response?.data?.message || '新增細項失敗');
    } finally {
      setItemSaving(false);
    }
  };

  const handleUpdateItem = async (itemId: number) => {
    setItemSaving(true);
    try {
      const qty = parseFloat(editingItemForm.quantity) || 1;
      const up = parseFloat(editingItemForm.unit_price) || 0;
      const amt = editingItemForm.amount
        ? parseFloat(editingItemForm.amount)
        : qty * up;
      await expensesApi.updateItem(expenseId, itemId, {
        description: editingItemForm.description,
        quantity: qty,
        unit: editingItemForm.unit || null,
        unit_price: up,
        amount: amt,
      });
      setEditingItemId(null);
      await loadExpense();
    } catch (err: any) {
      alert(err.response?.data?.message || '更新細項失敗');
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm('確定刪除此細項？')) return;
    try {
      await expensesApi.deleteItem(expenseId, itemId);
      await loadExpense();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除細項失敗');
    }
  };

  const handleDeleteExpense = async () => {
    setDeleting(true);
    try {
      await expensesApi.delete(expenseId);
      router.push('/expenses');
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除支出失敗');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        載入中...
      </div>
    );
  if (error)
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        {error}
      </div>
    );
  if (!expense) return null;

  const categoryLabel = expense.category
    ? expense.category.parent
      ? `${expense.category.parent.name} > ${expense.category.name}`
      : expense.category.name
    : '—';

  const items: any[] = expense.items || [];
  const itemsTotal = items.reduce(
    (sum: number, i: any) => sum + Number(i.amount),
    0,
  );
  const persistedOtherCharges = normalizeOtherCharges(expense.other_charges);
  const formOtherCharges = normalizeOtherCharges(form.other_charges);
  const activeOtherCharges = editMode ? formOtherCharges : persistedOtherCharges;
  const activeOtherChargesTotal = calcOtherChargesTotal(activeOtherCharges);
  const subtotalAmount = items.length > 0
    ? itemsTotal
    : editMode
      ? Number(form.total_amount) || 0
      : Number(expense.total_amount || 0) - calcOtherChargesTotal(persistedOtherCharges);
  const calculatedGrandTotal = Math.round((subtotalAmount + activeOtherChargesTotal) * 100) / 100;

  const updateOtherCharge = (
    index: number,
    field: 'name' | 'amount',
    value: string,
  ) => {
    setForm({
      ...form,
      other_charges: formOtherCharges.map((charge, i) =>
        i === index ? { ...charge, [field]: value } : charge,
      ),
    });
  };

  const addOtherCharge = () => {
    setForm({
      ...form,
      other_charges: [...formOtherCharges, { name: '', amount: '' }],
    });
  };

  const removeOtherCharge = (index: number) => {
    setForm({
      ...form,
      other_charges: formOtherCharges.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm"
          >
            ← 返回
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              支出管理詳情 #{expense.id}
            </h1>
            <p className="text-gray-500 text-sm">
              {fmtDate(expense.date)} · {expense.item || '無項目描述'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PaymentStatusBadge
            status={
              expense.payment_status || (expense.is_paid ? 'paid' : 'unpaid')
            }
          />
          {editMode ? (
            <>
              <button
                onClick={() => {
                  setEditMode(false);
                  setForm(toForm(expense));
                }}
                className="btn-secondary text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary text-sm"
              >
                {saving ? '儲存中...' : '儲存'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditMode(true)}
                className="btn-primary text-sm"
              >
                編輯
              </button>
              {!isReadOnly('expenses') && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                >
                  刪除
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Basic Info Card */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
          基本資料
        </h2>
        {editMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                日期 *
              </label>
              <DateInput
                value={form.date}
                onChange={(v) => setForm({ ...form, date: v })}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                公司
              </label>
              <select
                value={form.company_id}
                onChange={(e) =>
                  setForm({ ...form, company_id: e.target.value })
                }
                className="input-field text-sm"
              >
                <option value="">請選擇</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.internal_prefix || c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                供應商
              </label>
              <input
                list="expense-detail-supplier-options"
                type="text"
                value={form.supplier_name || ''}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  const supplier = supplierOptions.find(
                    (p: any) => p.label === rawValue,
                  );
                  setForm({
                    ...form,
                    supplier_name: rawValue,
                    supplier_partner_id: supplier?.value || '',
                  });
                }}
                className="input-field text-sm"
                placeholder="搜尋或輸入供應商..."
              />
              <datalist id="expense-detail-supplier-options">
                {supplierOptions.map((p: any) => (
                  <option key={p.value} value={p.label} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                單號
              </label>
              <input
                type="text"
                value={form.expense_receipt_number || ''}
                onChange={(e) =>
                  setForm({ ...form, expense_receipt_number: e.target.value })
                }
                className="input-field text-sm"
                placeholder="輸入單號"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
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
                className="input-field text-sm"
              >
                <option value="">請選擇</option>
                {categoryTree.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                子類別
              </label>
              <select
                value={form.category_id}
                onChange={(e) =>
                  setForm({ ...form, category_id: e.target.value })
                }
                className="input-field text-sm"
                disabled={!form._parent_category_id}
              >
                <option value="">請選擇</option>
                {getChildrenForParent(form._parent_category_id).map(
                  (c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                報銷者
              </label>
              <SearchableSelect
                value={form.employee_id || null}
                onChange={(v) => setForm({ ...form, employee_id: v })}
                options={employeeOptions}
                placeholder="搜尋員工..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
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
                className="input-field text-sm"
              >
                <option value="unpaid">未付款</option>
                <option value="partially_paid">部分付款</option>
                <option value="paid">已付款</option>
                <option value="cancelled">取消</option>
              </select>
            </div>
            {(form.payment_status === 'paid' ||
              form.payment_status === 'partially_paid') && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  付款日期
                </label>
                <DateInput
                  value={form.payment_date}
                  onChange={(v) => setForm({ ...form, payment_date: v })}
                  className="input-field text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                明細小計
              </label>
              <input
                type="number"
                step="0.01"
                value={items.length > 0 ? itemsTotal.toFixed(2) : form.total_amount}
                onChange={(e) =>
                  setForm({ ...form, total_amount: e.target.value })
                }
                className="input-field text-sm"
                disabled={items.length > 0}
              />
              {items.length > 0 && (
                <p className="mt-1 text-[11px] text-gray-400">
                  已有細項時，小計由細項合計自動計算。
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
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
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                客戶
              </label>
              <SearchableSelect
                value={form.client_id || null}
                onChange={(v) => setForm({ ...form, client_id: v })}
                options={partnerOptions}
                placeholder="搜尋客戶..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                工程編號
              </label>
              <SearchableSelect
                value={form.project_id || null}
                onChange={(v) => setForm({ ...form, project_id: v })}
                options={projectOptions}
                placeholder="搜尋工程..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                客戶報價單
              </label>
              <SearchableSelect
                value={form.quotation_id || null}
                onChange={(v) => setForm({ ...form, quotation_id: v })}
                options={quotationOptions}
                placeholder="搜尋客戶報價單..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                付款類型
              </label>
              <select
                value={form.expense_payment_method}
                onChange={(e) =>
                  setForm({ ...form, expense_payment_method: e.target.value })
                }
                className="input-field text-sm"
              >
                <option value="SELF_PAID">本人代付</option>
                <option value="COMPANY_PAID">公司付款</option>
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                備註
              </label>
              <textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                className="input-field text-sm"
                rows={2}
              />
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <Field label="日期">{fmtDate(expense.date)}</Field>
            <Field label="公司">
              {expense.company?.internal_prefix || expense.company?.name}
            </Field>
            <Field label="供應商">
              {expense.supplier?.name || expense.supplier_name}
            </Field>
            <Field label="單號">{expense.expense_receipt_number}</Field>
            <Field label="類別">{categoryLabel}</Field>
            <Field label="報銷者">{expense.employee?.name_zh}</Field>
            <Field label="發佈人">
              {expense.creator?.displayName || expense.creator?.username}
            </Field>
            <Field label="項目">{expense.item}</Field>
            <Field label="總金額">
              <span className="font-semibold text-base">
                HK${' '}
                {formatMoney(calculatedGrandTotal)}
              </span>
            </Field>
            <Field label="付款狀態">
              <PaymentStatusBadge
                status={
                  expense.payment_status ||
                  (expense.is_paid ? 'paid' : 'unpaid')
                }
              />
            </Field>
            <Field label="付款類型">
              {expense.expense_payment_method === 'COMPANY_PAID' ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  公司付款
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                  本人代付
                </span>
              )}
            </Field>
            <Field label="機號">
              {expense.vehicle?.plate_number ||
                expense.machinery?.machine_code ||
                expense.machine_code}
            </Field>
            <Field label="客戶">{expense.client?.name}</Field>
            <Field label="工程編號">{expense.project?.project_no}</Field>
            <Field label="客戶報價單">
              {formatQuotationLabel(expense.quotation)}
            </Field>
            <Field label="合約">{expense.contract_id}</Field>
            {expense.source && expense.source !== 'MANUAL' && (
              <Field label="來源">
                {expense.source}
                {expense.source_ref_id ? ` #${expense.source_ref_id}` : ''}
              </Field>
            )}
            {expense.remarks && (
              <div className="col-span-2 md:col-span-3 lg:col-span-4">
                <Field label="備註">{expense.remarks}</Field>
              </div>
            )}
          </dl>
        )}
      </div>

      {/* Line Items Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">支出細項</h2>
          <span className="text-sm text-gray-500">
            共 {items.length} 項 · 合計 HK${' '}
            {itemsTotal.toLocaleString('en', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Items table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                <th className="text-left py-2 pr-3 font-medium w-1/2">描述</th>
                <th className="text-right py-2 px-3 font-medium w-20">數量</th>
                <th className="text-left py-2 px-3 font-medium w-24">單位</th>
                <th className="text-right py-2 px-3 font-medium w-28">單價</th>
                <th className="text-right py-2 px-3 font-medium w-28">金額</th>
                <th className="py-2 pl-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  {editingItemId === item.id ? (
                    <>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={editingItemForm.description}
                          onChange={(e) =>
                            setEditingItemForm({
                              ...editingItemForm,
                              description: e.target.value,
                            })
                          }
                          className="input-field text-sm w-full"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.001"
                          value={editingItemForm.quantity}
                          onChange={(e) => {
                            const q = e.target.value;
                            setEditingItemForm({
                              ...editingItemForm,
                              quantity: q,
                              amount: calcItemAmount(
                                q,
                                editingItemForm.unit_price,
                              ),
                            });
                          }}
                          className="input-field text-sm text-right w-full"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={editingItemForm.unit || ''}
                          onChange={(e) =>
                            setEditingItemForm({
                              ...editingItemForm,
                              unit: e.target.value,
                            })
                          }
                          className="input-field text-sm w-full"
                        >
                          <option value="">—</option>
                          {unitSelectOptions.map((o: any) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          value={editingItemForm.unit_price}
                          onChange={(e) => {
                            const u = e.target.value;
                            setEditingItemForm({
                              ...editingItemForm,
                              unit_price: u,
                              amount: calcItemAmount(
                                editingItemForm.quantity,
                                u,
                              ),
                            });
                          }}
                          className="input-field text-sm text-right w-full"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          value={editingItemForm.amount}
                          onChange={(e) =>
                            setEditingItemForm({
                              ...editingItemForm,
                              amount: e.target.value,
                            })
                          }
                          className="input-field text-sm text-right w-full"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleUpdateItem(item.id)}
                            disabled={itemSaving}
                            className="text-xs text-green-600 hover:text-green-800 font-medium"
                          >
                            儲存
                          </button>
                          <button
                            onClick={() => setEditingItemId(null)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            取消
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2.5 pr-3 text-gray-800">
                        {item.description}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600">
                        {Number(item.quantity)}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {item.unit || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600">
                        {Number(item.unit_price) > 0
                          ? Number(item.unit_price).toLocaleString('en', {
                              minimumFractionDigits: 2,
                            })
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-gray-800">
                        HK${' '}
                        {Number(item.amount).toLocaleString('en', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 pl-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingItemId(item.id);
                              setEditingItemForm({
                                description: item.description,
                                quantity: String(Number(item.quantity)),
                                unit: item.unit || '',
                                unit_price: String(Number(item.unit_price)),
                                amount: String(Number(item.amount)),
                              });
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-6 text-center text-gray-400 text-sm"
                  >
                    尚未新增細項
                  </td>
                </tr>
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td
                    colSpan={4}
                    className="py-2.5 pr-3 text-right text-sm font-semibold text-gray-700"
                  >
                    合計
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm font-bold text-gray-900">
                    HK${' '}
                    {itemsTotal.toLocaleString('en', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-600">明細小計</span>
            <span className="font-semibold text-gray-900">HK$ {formatMoney(subtotalAmount)}</span>
          </div>

          <div className="space-y-2 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">附加項目</span>
              {editMode && !isReadOnly && (
                <button
                  type="button"
                  onClick={addOtherCharge}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  + 新增附加項目
                </button>
              )}
            </div>

            {editMode ? (
              formOtherCharges.length > 0 ? (
                <div className="space-y-2">
                  {formOtherCharges.map((charge, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={charge.name}
                        onChange={(e) => updateOtherCharge(index, 'name', e.target.value)}
                        className="input-field text-sm col-span-6 md:col-span-7"
                        placeholder="項目名稱"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={charge.amount}
                        onChange={(e) => updateOtherCharge(index, 'amount', e.target.value)}
                        className="input-field text-sm col-span-4 md:col-span-3 text-right"
                        placeholder="金額"
                      />
                      <button
                        type="button"
                        onClick={() => removeOtherCharge(index)}
                        className="col-span-2 text-xs text-red-500 hover:text-red-700 text-right"
                      >
                        刪除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">沒有附加項目。可加入正數加項或負數扣減。</p>
              )
            ) : activeOtherCharges.length > 0 ? (
              <div className="space-y-1">
                {activeOtherCharges.map((charge, index) => (
                  <div key={index} className="flex items-center justify-between text-sm text-gray-600">
                    <span>{charge.name}</span>
                    <span className={Number(charge.amount) < 0 ? 'text-red-600' : 'text-gray-700'}>
                      HK$ {formatMoney(Number(charge.amount) || 0)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">沒有附加項目</p>
            )}

            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>附加項目合計</span>
              <span className={activeOtherChargesTotal < 0 ? 'text-red-600 font-semibold' : 'font-semibold text-gray-800'}>
                HK$ {formatMoney(activeOtherChargesTotal)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-sm font-bold text-gray-700">總金額</span>
            <span className="text-base font-bold text-gray-900">HK$ {formatMoney(calculatedGrandTotal)}</span>
          </div>
        </div>

        {/* Add item form */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            新增細項
          </p>
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs text-gray-500 mb-1">描述 *</label>
              <input
                type="text"
                value={itemForm.description}
                onChange={(e) =>
                  setItemForm({ ...itemForm, description: e.target.value })
                }
                className="input-field text-sm"
                placeholder="細項描述"
              />
            </div>
            <div className="col-span-6 md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">數量</label>
              <input
                type="number"
                step="0.001"
                value={itemForm.quantity}
                onChange={(e) => {
                  const q = e.target.value;
                  setItemForm({
                    ...itemForm,
                    quantity: q,
                    amount: calcItemAmount(q, itemForm.unit_price),
                  });
                }}
                className="input-field text-sm"
              />
            </div>
            <div className="col-span-6 md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">單位</label>
              <select
                value={itemForm.unit}
                onChange={(e) =>
                  setItemForm({ ...itemForm, unit: e.target.value })
                }
                className="input-field text-sm"
              >
                <option value="">—</option>
                {unitSelectOptions.map((o: any) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-6 md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">單價</label>
              <input
                type="number"
                step="0.01"
                value={itemForm.unit_price}
                onChange={(e) => {
                  const u = e.target.value;
                  setItemForm({
                    ...itemForm,
                    unit_price: u,
                    amount: calcItemAmount(itemForm.quantity, u),
                  });
                }}
                className="input-field text-sm"
                placeholder="0.00"
              />
            </div>
            <div className="col-span-6 md:col-span-1">
              <label className="block text-xs text-gray-500 mb-1">金額</label>
              <input
                type="number"
                step="0.01"
                value={itemForm.amount}
                onChange={(e) =>
                  setItemForm({ ...itemForm, amount: e.target.value })
                }
                className="input-field text-sm"
                placeholder="自動計算"
              />
            </div>
            <div className="col-span-12 md:col-span-1">
              <button
                onClick={handleAddItem}
                disabled={itemSaving || !itemForm.description.trim()}
                className="btn-primary text-sm w-full"
              >
                新增
              </button>
            </div>
          </div>
        </div>
      </div>

      <AttachmentUpload entityType="expense" entityId={expenseId} title="支出文件" readOnly={isReadOnly('expenses')} />

      {/* Payment Records Block */}
      <PaymentOutBlock
        sourceType="expense"
        sourceRefId={expenseId}
        totalAmount={Number(expense.total_amount) || 0}
        onStatusChange={loadExpense}
      />

      {/* Meta info */}
      <div className="text-xs text-gray-400 text-right">
        建立時間：{new Date(expense.created_at).toLocaleString('zh-HK')} ·
        最後更新：{new Date(expense.updated_at).toLocaleString('zh-HK')}
      </div>

      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => !deleting && setShowDeleteConfirm(false)}
        title="確認刪除支出"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            確定要刪除此支出記錄嗎？刪除後記錄會移至垃圾筒，可在垃圾筒中還原。
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDeleteExpense}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? '刪除中...' : '確認刪除'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
