'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  expensesApi,
  expenseCategoriesApi,
  companiesApi,
  partnersApi,
  employeesApi,
  machineryApi,
  projectsApi,
  quotationsApi,
  fieldOptionsApi,
} from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

// ─── Helpers ────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{children || <span className="text-gray-400">—</span>}</dd>
    </div>
  );
}

function Badge({ paid }: { paid: boolean }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${paid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
      {paid ? '✓ 已付款' : '○ 未付款'}
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const expenseId = Number(id);

  const [expense, setExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState('');

  // Reference data
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [machineryList, setMachineryList] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [categoryTree, setCategoryTree] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  // Items state
  const [itemForm, setItemForm] = useState({ description: '', quantity: '1', unit_price: '', amount: '' });
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemForm, setEditingItemForm] = useState<any>({});
  const [itemSaving, setItemSaving] = useState(false);

  // Attachment state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const loadExpense = useCallback(() => {
    setLoading(true);
    expensesApi.get(expenseId)
      .then(r => {
        setExpense(r.data);
        setForm(toForm(r.data));
      })
      .catch(() => setError('無法載入支出管理記錄'))
      .finally(() => setLoading(false));
  }, [expenseId]);

  useEffect(() => { loadExpense(); }, [loadExpense]);

  useEffect(() => {
    companiesApi.simple().then(r => setCompanies(r.data || []));
    partnersApi.simple().then(r => setPartners(r.data || []));
    employeesApi.list({ limit: 9999 }).then(r => setEmployees(r.data.data || []));
    machineryApi.list({ limit: 9999 }).then(r => setMachineryList(r.data.data || []));
    projectsApi.simple().then(r => setProjects(r.data || []));
    quotationsApi.list({ limit: 9999 }).then(r => setQuotations(r.data.data || []));
    expenseCategoriesApi.getTree().then(r => setCategoryTree(r.data || []));
    fieldOptionsApi.getByCategory('payment_method').then(r => setPaymentMethods(r.data || []));
  }, []);

  function toForm(e: any) {
    return {
      date: e.date ? e.date.slice(0, 10) : '',
      company_id: e.company_id || '',
      supplier_name: e.supplier_name || '',
      supplier_partner_id: e.supplier_partner_id || '',
      category_id: e.category_id || '',
      _parent_category_id: e.category?.parent_id || e.category?.parent?.id || '',
      employee_id: e.employee_id || '',
      item: e.item || '',
      total_amount: e.total_amount != null ? Number(e.total_amount) : '',
      is_paid: Boolean(e.is_paid),
      payment_method: e.payment_method || '',
      payment_date: e.payment_date ? e.payment_date.slice(0, 10) : '',
      payment_ref: e.payment_ref || '',
      remarks: e.remarks || '',
      machine_code: e.machine_code || '',
      machinery_id: e.machinery_id || '',
      client_id: e.client_id || '',
      contract_id: e.contract_id || '',
      project_id: e.project_id || '',
      quotation_id: e.quotation_id || '',
    };
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { ...form };
      delete payload._parent_category_id;
      const numericFields = ['company_id', 'supplier_partner_id', 'category_id', 'employee_id', 'machinery_id', 'client_id', 'project_id', 'quotation_id', 'contract_id'];
      for (const f of numericFields) {
        payload[f] = payload[f] ? Number(payload[f]) : null;
      }
      if (!payload.payment_date) payload.payment_date = null;
      if (payload.total_amount !== '') payload.total_amount = Number(payload.total_amount);
      payload.is_paid = Boolean(payload.is_paid);
      await expensesApi.update(expenseId, payload);
      await loadExpense();
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

  const companyOptions = companies.map((c: any) => ({ value: c.id, label: c.internal_prefix || c.name }));
  const partnerOptions = partners.map((p: any) => ({ value: p.id, label: p.name }));
  const employeeOptions = employees.map((e: any) => ({ value: e.id, label: e.name_zh }));
  const machineryOptions = machineryList.map((m: any) => ({ value: m.id, label: `${m.machine_code}${m.machine_type ? ` (${m.machine_type})` : ''}` }));
  const projectOptions = projects.map((p: any) => ({ value: p.id, label: `${p.project_no} ${p.project_name || ''}`.trim() }));
  const quotationOptions = quotations.map((q: any) => ({ value: q.id, label: q.quotation_no }));
  const paymentMethodOptions = paymentMethods.filter((m: any) => m.is_active).map((m: any) => ({ value: m.label, label: m.label }));

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
      await expensesApi.createItem(expenseId, { description: itemForm.description, quantity: qty, unit_price: up, amount: amt });
      setItemForm({ description: '', quantity: '1', unit_price: '', amount: '' });
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
      const amt = editingItemForm.amount ? parseFloat(editingItemForm.amount) : qty * up;
      await expensesApi.updateItem(expenseId, itemId, { description: editingItemForm.description, quantity: qty, unit_price: up, amount: amt });
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

  // ── Attachments ────────────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await expensesApi.uploadAttachment(expenseId, file);
      }
      await loadExpense();
    } catch (err: any) {
      alert(err.response?.data?.message || '上載失敗');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: number, fileName: string) => {
    if (!confirm(`確定刪除附件「${fileName}」？`)) return;
    try {
      await expensesApi.deleteAttachment(expenseId, attachmentId);
      await loadExpense();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除附件失敗');
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const isImage = (mime?: string) => mime?.startsWith('image/');

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">載入中...</div>;
  if (error) return <div className="flex items-center justify-center h-64 text-red-500">{error}</div>;
  if (!expense) return null;

  const categoryLabel = expense.category
    ? expense.category.parent
      ? `${expense.category.parent.name} > ${expense.category.name}`
      : expense.category.name
    : '—';

  const items: any[] = expense.items || [];
  const attachments: any[] = expense.attachments || [];
  const itemsTotal = items.reduce((sum: number, i: any) => sum + Number(i.amount), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm">
            ← 返回
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">支出管理詳情 #{expense.id}</h1>
            <p className="text-gray-500 text-sm">{fmtDate(expense.date)} · {expense.item || '無項目描述'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge paid={expense.is_paid} />
          {editMode ? (
            <>
              <button onClick={() => { setEditMode(false); setForm(toForm(expense)); }} className="btn-secondary text-sm">取消</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? '儲存中...' : '儲存'}</button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)} className="btn-primary text-sm">編輯</button>
          )}
        </div>
      </div>

      {/* Basic Info Card */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">基本資料</h2>
        {editMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">日期 *</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">公司</label>
              <select value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })} className="input-field text-sm">
                <option value="">請選擇</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">供應商</label>
              <input type="text" value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value, supplier_partner_id: '' })} className="input-field text-sm" placeholder="輸入供應商名稱" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">大類別</label>
              <select value={form._parent_category_id} onChange={e => setForm({ ...form, _parent_category_id: e.target.value, category_id: '' })} className="input-field text-sm">
                <option value="">請選擇</option>
                {categoryTree.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">子類別</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className="input-field text-sm" disabled={!form._parent_category_id}>
                <option value="">請選擇</option>
                {getChildrenForParent(form._parent_category_id).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">報銷者</label>
              <SearchableSelect value={form.employee_id || null} onChange={v => setForm({ ...form, employee_id: v })} options={employeeOptions} placeholder="搜尋員工..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">項目</label>
              <input type="text" value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">總金額</label>
              <input type="number" step="0.01" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} className="input-field text-sm" />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input type="checkbox" id="edit-is-paid" checked={form.is_paid} onChange={e => setForm({ ...form, is_paid: e.target.checked })} className="w-4 h-4 accent-green-600 cursor-pointer" />
              <label htmlFor="edit-is-paid" className="text-sm font-medium text-gray-700 cursor-pointer">已付款</label>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">付款方法</label>
              <input type="text" list="edit-payment-methods" value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="input-field text-sm" placeholder="選擇或輸入" />
              <datalist id="edit-payment-methods">
                {paymentMethodOptions.map(o => <option key={String(o.value)} value={String(o.value)} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">付款日期</label>
              <input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">付款內容</label>
              <input type="text" value={form.payment_ref} onChange={e => setForm({ ...form, payment_ref: e.target.value })} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">機號</label>
              <SearchableSelect value={form.machinery_id || null} onChange={v => setForm({ ...form, machinery_id: v })} options={machineryOptions} placeholder="搜尋機號..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">客戶</label>
              <SearchableSelect value={form.client_id || null} onChange={v => setForm({ ...form, client_id: v })} options={partnerOptions} placeholder="搜尋客戶..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">工程編號</label>
              <SearchableSelect value={form.project_id || null} onChange={v => setForm({ ...form, project_id: v })} options={projectOptions} placeholder="搜尋工程..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">報價單</label>
              <SearchableSelect value={form.quotation_id || null} onChange={v => setForm({ ...form, quotation_id: v })} options={quotationOptions} placeholder="搜尋報價單..." />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">備註</label>
              <textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="input-field text-sm" rows={2} />
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <Field label="日期">{fmtDate(expense.date)}</Field>
            <Field label="公司">{expense.company?.internal_prefix || expense.company?.name}</Field>
            <Field label="供應商">{expense.supplier?.name || expense.supplier_name}</Field>
            <Field label="類別">{categoryLabel}</Field>
            <Field label="報銷者">{expense.employee?.name_zh}</Field>
            <Field label="項目">{expense.item}</Field>
            <Field label="總金額">
              <span className="font-semibold text-base">HK$ {Number(expense.total_amount).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
            </Field>
            <Field label="付款狀態"><Badge paid={expense.is_paid} /></Field>
            <Field label="付款方法">{expense.payment_method}</Field>
            <Field label="付款日期">{fmtDate(expense.payment_date)}</Field>
            <Field label="付款內容">{expense.payment_ref}</Field>
            <Field label="機號">{expense.machinery?.machine_code || expense.machine_code}</Field>
            <Field label="客戶">{expense.client?.name}</Field>
            <Field label="工程編號">{expense.project?.project_no}</Field>
            <Field label="報價單">{expense.quotation?.quotation_no}</Field>
            <Field label="合約">{expense.contract_id}</Field>
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
          <span className="text-sm text-gray-500">共 {items.length} 項 · 合計 HK$ {itemsTotal.toLocaleString('en', { minimumFractionDigits: 2 })}</span>
        </div>

        {/* Items table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                <th className="text-left py-2 pr-3 font-medium w-1/2">描述</th>
                <th className="text-right py-2 px-3 font-medium w-20">數量</th>
                <th className="text-right py-2 px-3 font-medium w-28">單價</th>
                <th className="text-right py-2 px-3 font-medium w-28">金額</th>
                <th className="py-2 pl-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  {editingItemId === item.id ? (
                    <>
                      <td className="py-2 pr-3">
                        <input type="text" value={editingItemForm.description} onChange={e => setEditingItemForm({ ...editingItemForm, description: e.target.value })} className="input-field text-sm w-full" />
                      </td>
                      <td className="py-2 px-3">
                        <input type="number" step="0.001" value={editingItemForm.quantity} onChange={e => { const q = e.target.value; setEditingItemForm({ ...editingItemForm, quantity: q, amount: calcItemAmount(q, editingItemForm.unit_price) }); }} className="input-field text-sm text-right w-full" />
                      </td>
                      <td className="py-2 px-3">
                        <input type="number" step="0.01" value={editingItemForm.unit_price} onChange={e => { const u = e.target.value; setEditingItemForm({ ...editingItemForm, unit_price: u, amount: calcItemAmount(editingItemForm.quantity, u) }); }} className="input-field text-sm text-right w-full" />
                      </td>
                      <td className="py-2 px-3">
                        <input type="number" step="0.01" value={editingItemForm.amount} onChange={e => setEditingItemForm({ ...editingItemForm, amount: e.target.value })} className="input-field text-sm text-right w-full" />
                      </td>
                      <td className="py-2 pl-3">
                        <div className="flex gap-1">
                          <button onClick={() => handleUpdateItem(item.id)} disabled={itemSaving} className="text-xs text-green-600 hover:text-green-800 font-medium">儲存</button>
                          <button onClick={() => setEditingItemId(null)} className="text-xs text-gray-500 hover:text-gray-700">取消</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2.5 pr-3 text-gray-800">{item.description}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{Number(item.quantity)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{Number(item.unit_price) > 0 ? Number(item.unit_price).toLocaleString('en', { minimumFractionDigits: 2 }) : '—'}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-gray-900">HK$ {Number(item.amount).toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 pl-3">
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingItemId(item.id); setEditingItemForm({ description: item.description, quantity: String(Number(item.quantity)), unit_price: String(Number(item.unit_price)), amount: String(Number(item.amount)) }); }} className="text-xs text-blue-600 hover:text-blue-800">編輯</button>
                          <button onClick={() => handleDeleteItem(item.id)} className="text-xs text-red-500 hover:text-red-700">刪除</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400 text-sm">尚未新增細項</td></tr>
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="py-2.5 pr-3 text-right text-sm font-semibold text-gray-700">合計</td>
                  <td className="py-2.5 px-3 text-right text-sm font-bold text-gray-900">HK$ {itemsTotal.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Add item form */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">新增細項</p>
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 md:col-span-5">
              <label className="block text-xs text-gray-500 mb-1">描述 *</label>
              <input type="text" value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} className="input-field text-sm" placeholder="細項描述" />
            </div>
            <div className="col-span-4 md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">數量</label>
              <input type="number" step="0.001" value={itemForm.quantity} onChange={e => { const q = e.target.value; setItemForm({ ...itemForm, quantity: q, amount: calcItemAmount(q, itemForm.unit_price) }); }} className="input-field text-sm" />
            </div>
            <div className="col-span-4 md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">單價</label>
              <input type="number" step="0.01" value={itemForm.unit_price} onChange={e => { const u = e.target.value; setItemForm({ ...itemForm, unit_price: u, amount: calcItemAmount(itemForm.quantity, u) }); }} className="input-field text-sm" placeholder="0.00" />
            </div>
            <div className="col-span-4 md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">金額</label>
              <input type="number" step="0.01" value={itemForm.amount} onChange={e => setItemForm({ ...itemForm, amount: e.target.value })} className="input-field text-sm" placeholder="自動計算" />
            </div>
            <div className="col-span-12 md:col-span-1">
              <button onClick={handleAddItem} disabled={itemSaving || !itemForm.description.trim()} className="btn-primary text-sm w-full">新增</button>
            </div>
          </div>
        </div>
      </div>

      {/* Attachments Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">附件文件</h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            {uploading ? '上載中...' : '+ 上載文件'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {attachments.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <p className="text-gray-400 text-sm">點擊或拖放文件到此處上載</p>
            <p className="text-gray-300 text-xs mt-1">支持圖片、PDF、Word、Excel 等格式，單個文件最大 20MB</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {attachments.map((att: any) => (
              <div key={att.id} className="border border-gray-200 rounded-lg p-3 flex items-start gap-3 hover:border-gray-300 transition-colors">
                {/* Preview */}
                {isImage(att.mime_type) ? (
                  <a href={`${API_BASE}${att.file_url}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <img src={`${API_BASE}${att.file_url}`} alt={att.file_name} className="w-12 h-12 object-cover rounded border border-gray-200" />
                  </a>
                ) : (
                  <div className="w-12 h-12 bg-gray-100 rounded border border-gray-200 flex items-center justify-center shrink-0">
                    <span className="text-xl">{att.mime_type?.includes('pdf') ? '📄' : att.mime_type?.includes('sheet') || att.mime_type?.includes('excel') ? '📊' : '📎'}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <a href={`${API_BASE}${att.file_url}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-800 truncate block" title={att.file_name}>
                    {att.file_name}
                  </a>
                  <p className="text-xs text-gray-400 mt-0.5">{formatFileSize(att.file_size)} · {fmtDate(att.uploaded_at)}</p>
                </div>
                <button onClick={() => handleDeleteAttachment(att.id, att.file_name)} className="shrink-0 text-gray-300 hover:text-red-500 transition-colors text-lg leading-none">×</button>
              </div>
            ))}
            {/* Add more button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-3 flex items-center justify-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors min-h-[80px]"
            >
              <span className="text-gray-400 text-sm">+ 新增文件</span>
            </div>
          </div>
        )}
      </div>

      {/* Meta info */}
      <div className="text-xs text-gray-400 text-right">
        建立時間：{new Date(expense.created_at).toLocaleString('zh-HK')} · 最後更新：{new Date(expense.updated_at).toLocaleString('zh-HK')}
      </div>
    </div>
  );
}
