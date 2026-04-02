'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  expensesApi,
  expenseCategoriesApi,
  companiesApi,
  employeesApi,
  machineryApi,
  projectsApi,
  quotationsApi,
  fieldOptionsApi,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';

// ─── Helpers ────────────────────────────────────────────────────────────────
function Badge({ paid }: { paid: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${paid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
      {paid ? '✓ 已付款' : '○ 待付款'}
    </span>
  );
}

export default function EmployeeExpensePage() {
  const { user } = useAuth();

  // My claims list
  const [claims, setClaims] = useState<any[]>([]);
  const [claimsTotal, setClaimsTotal] = useState(0);
  const [claimsPage, setClaimsPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Reference data
  const [companies, setCompanies] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [machineryList, setMachineryList] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [categoryTree, setCategoryTree] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const defaultForm = {
    date: new Date().toISOString().slice(0, 10),
    company_id: '',
    _parent_category_id: '',
    category_id: '',
    item: '',
    total_amount: '',
    payment_method: '',
    payment_ref: '',
    remarks: '',
    machinery_id: '',
    project_id: '',
    quotation_id: '',
    // Items
    items: [] as { description: string; quantity: string; unit_price: string; amount: string }[],
  };
  const [form, setForm] = useState<any>({ ...defaultForm });

  // Find current employee record matching logged-in user
  const [myEmployeeId, setMyEmployeeId] = useState<number | null>(null);

  const loadClaims = () => {
    setLoading(true);
    const params: any = { page: claimsPage, limit: 10, sortBy: 'date', sortOrder: 'DESC' };
    if (myEmployeeId) params.employee_id = myEmployeeId;
    expensesApi.list(params)
      .then(r => { setClaims(r.data.data || []); setClaimsTotal(r.data.total || 0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (myEmployeeId !== null) loadClaims();
  }, [myEmployeeId, claimsPage]);

  useEffect(() => {
    companiesApi.simple().then(r => setCompanies(r.data || []));
    employeesApi.list({ limit: 9999 }).then(r => {
      const list = r.data.data || [];
      setEmployees(list);
      // Try to match current user to an employee record by username
      if (user?.username) {
        const match = list.find((e: any) =>
          e.name_zh === user.username || e.name_en === user.username ||
          (e.user_id && e.user_id === user.id)
        );
        setMyEmployeeId(match?.id ?? null);
      } else {
        setMyEmployeeId(null);
      }
    });
    machineryApi.list({ limit: 9999 }).then(r => setMachineryList(r.data.data || []));
    projectsApi.simple().then(r => setProjects(r.data || []));
    quotationsApi.list({ limit: 9999 }).then(r => setQuotations(r.data.data || []));
    expenseCategoriesApi.getTree().then(r => setCategoryTree(r.data || []));
    fieldOptionsApi.getByCategory('payment_method').then(r => setPaymentMethods(r.data || []));
  }, [user]);

  const getChildrenForParent = (parentId: string | number) => {
    if (!parentId) return [];
    const parent = categoryTree.find((c: any) => c.id === Number(parentId));
    return parent?.children || [];
  };

  const machineryOptions = useMemo(() => machineryList.map((m: any) => ({ value: m.id, label: `${m.machine_code}${m.machine_type ? ` (${m.machine_type})` : ''}` })), [machineryList]);
  const projectOptions = useMemo(() => projects.map((p: any) => ({ value: p.id, label: `${p.project_no} ${p.project_name || ''}`.trim() })), [projects]);
  const quotationOptions = useMemo(() => quotations.map((q: any) => ({ value: q.id, label: q.quotation_no })), [quotations]);
  const paymentMethodOptions = useMemo(() => paymentMethods.filter((m: any) => m.is_active).map((m: any) => ({ value: m.label, label: m.label })), [paymentMethods]);

  const calcAmount = (qty: string, up: string) => {
    const q = parseFloat(qty) || 0;
    const u = parseFloat(up) || 0;
    return (q * u).toFixed(2);
  };

  const addItemRow = () => setForm((f: any) => ({ ...f, items: [...f.items, { description: '', quantity: '1', unit_price: '', amount: '' }] }));
  const removeItemRow = (idx: number) => setForm((f: any) => ({ ...f, items: f.items.filter((_: any, i: number) => i !== idx) }));
  const updateItemRow = (idx: number, field: string, val: string) => {
    setForm((f: any) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: val };
      if (field === 'quantity' || field === 'unit_price') {
        items[idx].amount = calcAmount(
          field === 'quantity' ? val : items[idx].quantity,
          field === 'unit_price' ? val : items[idx].unit_price,
        );
      }
      return { ...f, items };
    });
  };

  const itemsTotal = useMemo(() => form.items.reduce((s: number, i: any) => s + (parseFloat(i.amount) || 0), 0), [form.items]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Determine employee_id: prefer matched, else let admin assign
      const employeeId = myEmployeeId || undefined;

      const payload: any = {
        date: form.date,
        company_id: form.company_id ? Number(form.company_id) : undefined,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        employee_id: employeeId,
        item: form.item,
        total_amount: itemsTotal > 0 ? itemsTotal : (parseFloat(form.total_amount) || 0),
        payment_method: form.payment_method || undefined,
        payment_ref: form.payment_ref || undefined,
        remarks: form.remarks || undefined,
        machinery_id: form.machinery_id ? Number(form.machinery_id) : undefined,
        project_id: form.project_id ? Number(form.project_id) : undefined,
        quotation_id: form.quotation_id ? Number(form.quotation_id) : undefined,
        is_paid: false,
      };

      const created = await expensesApi.create(payload);
      const newId = created.data.id;

      // Create line items if any
      for (const item of form.items) {
        if (!item.description.trim()) continue;
        const qty = parseFloat(item.quantity) || 1;
        const up = parseFloat(item.unit_price) || 0;
        const amt = item.amount ? parseFloat(item.amount) : qty * up;
        await expensesApi.createItem(newId, { description: item.description, quantity: qty, unit_price: up, amount: amt });
      }

      setForm({ ...defaultForm });
      setShowForm(false);
      loadClaims();
      alert('報銷申請已提交！');
    } catch (err: any) {
      alert(err.response?.data?.message || '提交失敗，請重試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">費用報銷</h1>
          <p className="text-gray-500 text-sm mt-1">提交費用報銷申請，查看審批狀態</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          {showForm ? '取消' : '+ 新增報銷'}
        </button>
      </div>

      {/* Claim Form */}
      {showForm && (
        <div className="card border-2 border-blue-100">
          <h2 className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">新增費用報銷申請</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" required />
              </div>
              {/* Company */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">公司</label>
                <select value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })} className="input-field">
                  <option value="">請選擇</option>
                  {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
                </select>
              </div>
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">大類別</label>
                <select value={form._parent_category_id} onChange={e => setForm({ ...form, _parent_category_id: e.target.value, category_id: '' })} className="input-field">
                  <option value="">請選擇</option>
                  {categoryTree.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">子類別</label>
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className="input-field" disabled={!form._parent_category_id}>
                  <option value="">請選擇</option>
                  {getChildrenForParent(form._parent_category_id).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {/* Item */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">項目描述 *</label>
                <input type="text" value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} className="input-field" placeholder="簡述費用用途" required />
              </div>
              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">付款方法</label>
                <input type="text" list="portal-payment-methods" value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="input-field" placeholder="選擇或輸入" />
                <datalist id="portal-payment-methods">
                  {paymentMethodOptions.map(o => <option key={String(o.value)} value={String(o.value)} />)}
                </datalist>
              </div>
              {/* Payment Ref */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">付款參考（收據/支票號碼）</label>
                <input type="text" value={form.payment_ref} onChange={e => setForm({ ...form, payment_ref: e.target.value })} className="input-field" />
              </div>
              {/* Machinery */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">相關機號</label>
                <SearchableSelect value={form.machinery_id || null} onChange={v => setForm({ ...form, machinery_id: v })} options={machineryOptions} placeholder="搜尋機號..." />
              </div>
              {/* Project */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">相關工程</label>
                <SearchableSelect value={form.project_id || null} onChange={v => setForm({ ...form, project_id: v })} options={projectOptions} placeholder="搜尋工程..." />
              </div>
              {/* Remarks */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="input-field" rows={2} placeholder="補充說明..." />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">費用明細</label>
                <button type="button" onClick={addItemRow} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ 新增明細</button>
              </div>
              {form.items.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left py-2 px-3 font-medium">描述</th>
                        <th className="text-right py-2 px-2 font-medium w-16">數量</th>
                        <th className="text-right py-2 px-2 font-medium w-24">單價</th>
                        <th className="text-right py-2 px-2 font-medium w-24">金額</th>
                        <th className="py-2 px-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item: any, idx: number) => (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="py-1.5 px-3">
                            <input type="text" value={item.description} onChange={e => updateItemRow(idx, 'description', e.target.value)} className="input-field text-sm" placeholder="描述" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" step="0.001" value={item.quantity} onChange={e => updateItemRow(idx, 'quantity', e.target.value)} className="input-field text-sm text-right" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" step="0.01" value={item.unit_price} onChange={e => updateItemRow(idx, 'unit_price', e.target.value)} className="input-field text-sm text-right" placeholder="0.00" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" step="0.01" value={item.amount} onChange={e => updateItemRow(idx, 'amount', e.target.value)} className="input-field text-sm text-right" placeholder="自動" />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button type="button" onClick={() => removeItemRow(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={3} className="py-2 px-3 text-right text-sm font-semibold text-gray-700">合計</td>
                        <td className="py-2 px-2 text-right text-sm font-bold text-gray-900">HK$ {itemsTotal.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {form.items.length === 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">總金額 (HK$)</label>
                  <input type="number" step="0.01" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} className="input-field" placeholder="0.00" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => { setShowForm(false); setForm({ ...defaultForm }); }} className="btn-secondary">取消</button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? '提交中...' : '提交報銷申請'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* My Claims List */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
          我的報銷記錄
          {claimsTotal > 0 && <span className="ml-2 text-sm font-normal text-gray-500">共 {claimsTotal} 筆</span>}
        </h2>

        {loading ? (
          <div className="py-8 text-center text-gray-400">載入中...</div>
        ) : claims.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            <p className="text-lg mb-1">尚無報銷記錄</p>
            <p className="text-sm">點擊「新增報銷」提交第一筆費用申請</p>
          </div>
        ) : (
          <div className="space-y-3">
            {claims.map((claim: any) => {
              const categoryLabel = claim.category
                ? claim.category.parent ? `${claim.category.parent.name} > ${claim.category.name}` : claim.category.name
                : null;
              return (
                <div key={claim.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{claim.item || '無項目描述'}</span>
                        {categoryLabel && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{categoryLabel}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                        <span>{fmtDate(claim.date)}</span>
                        {claim.company && <span>{claim.company.internal_prefix || claim.company.name}</span>}
                        {claim.payment_method && <span>付款：{claim.payment_method}</span>}
                        {claim.payment_ref && <span>參考：{claim.payment_ref}</span>}
                        {claim.project && <span>工程：{claim.project.project_no}</span>}
                      </div>
                      {claim.remarks && <p className="text-xs text-gray-400 mt-1 truncate">{claim.remarks}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">HK$ {Number(claim.total_amount).toLocaleString('en', { minimumFractionDigits: 2 })}</p>
                      <div className="mt-1"><Badge paid={claim.is_paid} /></div>
                    </div>
                  </div>
                  {claim.items && claim.items.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">費用明細 ({claim.items.length} 項)</p>
                      <div className="space-y-0.5">
                        {claim.items.map((item: any) => (
                          <div key={item.id} className="flex justify-between text-xs text-gray-600">
                            <span>{item.description}</span>
                            <span>HK$ {Number(item.amount).toLocaleString('en', { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {claimsTotal > 10 && (
          <div className="flex justify-center gap-2 mt-4 pt-4 border-t border-gray-100">
            <button onClick={() => setClaimsPage(p => Math.max(1, p - 1))} disabled={claimsPage === 1} className="btn-secondary text-sm px-3 py-1 disabled:opacity-40">上一頁</button>
            <span className="text-sm text-gray-500 self-center">第 {claimsPage} 頁 / 共 {Math.ceil(claimsTotal / 10)} 頁</span>
            <button onClick={() => setClaimsPage(p => p + 1)} disabled={claimsPage >= Math.ceil(claimsTotal / 10)} className="btn-secondary text-sm px-3 py-1 disabled:opacity-40">下一頁</button>
          </div>
        )}
      </div>
    </div>
  );
}
