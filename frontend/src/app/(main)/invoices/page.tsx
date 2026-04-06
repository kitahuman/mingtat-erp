'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { invoicesApi, partnersApi, companiesApi, projectsApi, quotationsApi } from '@/lib/api';
import ClientContractCombobox from '@/components/ClientContractCombobox';
import { fmtDate } from '@/lib/dateUtils';
import Modal from '@/components/Modal';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const defaultItem = () => ({ item_name: '', description: '', quantity: 1, unit: 'JOB', unit_price: 0 });
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

export default function InvoicesPage() {
  const router = useRouter();
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

  // Reference data
  const [partners, setPartners] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>({ ...defaultForm });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (statusFilter) params.status = statusFilter;
      if (clientFilter) params.client_id = clientFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (search) params.search = search;
      const res = await invoicesApi.list(params);
      setData(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, clientFilter, dateFrom, dateTo, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    partnersApi.simple().then(res => setPartners(res.data || []));
    companiesApi.simple().then(res => setCompanies(res.data || []));
    projectsApi.list({ limit: 500 }).then(res => setProjects(res.data?.data || res.data || []));
    quotationsApi.list({ limit: 500 }).then(res => setQuotations(res.data?.data || res.data || []));
  }, []);

  const clientPartners = partners.filter((p: any) => p.partner_type === 'client');

  const handleCreate = async () => {
    if (!form.company_id) { alert('請選擇公司'); return; }
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
        other_charges: form.other_charges.filter((c: any) => c.name && Number(c.amount) !== 0),
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
      setShowCreate(false);
      setForm({ ...defaultForm });
      router.push(`/invoices/${res.data.id}`);
    } catch (err: any) {
      alert(err.response?.data?.message || '建立失敗');
    } finally {
      setCreating(false);
    }
  };

  // Items helpers
  const addItem = () => setForm({ ...form, items: [...form.items, defaultItem()] });
  const removeItem = (idx: number) => setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) });
  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };

  // Other charges helpers
  const addCharge = () => setForm({ ...form, other_charges: [...form.other_charges, defaultCharge()] });
  const removeCharge = (idx: number) => setForm({ ...form, other_charges: form.other_charges.filter((_: any, i: number) => i !== idx) });
  const updateCharge = (idx: number, field: string, value: any) => {
    const charges = [...form.other_charges];
    charges[idx] = { ...charges[idx], [field]: value };
    setForm({ ...form, other_charges: charges });
  };

  const itemAmount = (item: any) => (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  const formSubtotal = (form.items || []).reduce((sum: number, item: any) => sum + itemAmount(item), 0);
  const formRetention = formSubtotal * (Number(form.retention_rate) || 0) / 100;
  const formOtherTotal = (form.other_charges || []).reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
  const formTotal = formSubtotal - formRetention + formOtherTotal;

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">發票管理</h1>
          <p className="text-gray-500 mt-1">共 {total} 張發票</p>
        </div>
        <button
          onClick={() => { setForm({ ...defaultForm, company_id: companies[0]?.id || '' }); setShowCreate(true); }}
          className="btn-primary"
        >
          新增發票
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">搜尋</label>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="發票編號、客戶、合約..." className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">狀態</label>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field">
              {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">客戶</label>
            <select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setPage(1); }} className="input-field">
              <option value="">全部客戶</option>
              {clientPartners.map((p: any) => <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日期（從）</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日期（至）</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="input-field" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">發票編號</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">發票名稱</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">到期日</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">客戶</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">客戶合約</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">關聯報價單</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">總額</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">已收</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">未收</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">狀態</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">載入中...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">暫無發票記錄</td></tr>
            ) : data.map((inv: any) => (
              <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/invoices/${inv.id}`)}>
                <td className="px-4 py-3 text-sm font-mono font-medium text-primary-600">{inv.invoice_no}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{inv.invoice_title || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(inv.date)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(inv.due_date)}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{inv.client?.code ? `${inv.client.code} - ${inv.client.name}` : (inv.client?.name || '-')}</td>
                <td className="px-4 py-3 text-sm font-mono text-indigo-600">{inv.client_contract_no || '-'}</td>
                <td className="px-4 py-3 text-sm font-mono text-gray-500">{inv.quotation?.quotation_no || '-'}</td>
                <td className="px-4 py-3 text-sm text-right font-medium">{fmt$(inv.total_amount)}</td>
                <td className="px-4 py-3 text-sm text-right text-green-600">{fmt$(inv.paid_amount)}</td>
                <td className="px-4 py-3 text-sm text-right text-red-600">{fmt$(inv.outstanding)}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_LABELS[inv.status] || inv.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-gray-500">第 {page} / {totalPages} 頁，共 {total} 筆</div>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-sm disabled:opacity-50">上一頁</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-secondary text-sm disabled:opacity-50">下一頁</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <Modal isOpen={showCreate} title="新增發票" onClose={() => setShowCreate(false)} size="xl">
          <div className="space-y-5">
            {/* Row 1: Company, Client */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">公司 <span className="text-red-500">*</span></label>
                <select value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })} className="input-field">
                  <option value="">請選擇</option>
                  {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
                <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="input-field">
                  <option value="">— 無 —</option>
                  {clientPartners.map((p: any) => <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Invoice Title, Client Contract No */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">發票名稱</label>
                <input type="text" value={form.invoice_title} onChange={e => setForm({ ...form, invoice_title: e.target.value })} className="input-field" placeholder="例如：2026年4月工程費用" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">客戶合約</label>
                <ClientContractCombobox
                  value={form.client_contract_no}
                  onChange={(val) => setForm({ ...form, client_contract_no: val || '' })}
                />
              </div>
            </div>

            {/* Row 3: Date, Due Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">發票日期</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">到期日</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="input-field" />
              </div>
            </div>

            {/* Row 4: Project, Quotation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">工程項目</label>
                <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} className="input-field">
                  <option value="">— 無 —</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">關聯報價單</label>
                <select value={form.quotation_id} onChange={e => setForm({ ...form, quotation_id: e.target.value })} className="input-field">
                  <option value="">— 無 —</option>
                  {quotations.map((q: any) => <option key={q.id} value={q.id}>{q.quotation_no}{q.project_name ? ` - ${q.project_name}` : ''}</option>)}
                </select>
              </div>
            </div>

            {/* Row 5: Retention Rate, Payment Terms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">保留金 (%)</label>
                <input type="number" value={form.retention_rate} onChange={e => setForm({ ...form, retention_rate: e.target.value })} className="input-field" min="0" max="100" step="0.01" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">付款條件</label>
                <input type="text" value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} className="input-field" placeholder="例如：30天內付款" />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="input-field" rows={2} />
            </div>

            {/* Invoice Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">發票項目</label>
                <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:text-primary-700">+ 新增項目</button>
              </div>
              <div className="space-y-3">
                {form.items.map((item: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">項目標題</label>}
                        <input type="text" value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)} className="input-field text-sm" placeholder="項目標題（選填）" />
                      </div>
                      <div className="w-8 flex items-end pb-1">
                        <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-sm" title="刪除">✕</button>
                      </div>
                    </div>
                    <div>
                      <input type="text" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="input-field text-sm" placeholder="項目描述（選填）" />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">數量</label>
                        <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="input-field text-sm text-right" min="0" step="0.01" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">單位</label>
                        <input type="text" value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">單價</label>
                        <input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} className="input-field text-sm text-right" min="0" step="0.01" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">金額</label>
                        <div className="input-field text-sm text-right bg-gray-50">{fmt$(itemAmount(item))}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Other Charges */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">其他費用</label>
                <button type="button" onClick={addCharge} className="text-sm text-primary-600 hover:text-primary-700">+ 新增費用</button>
              </div>
              {form.other_charges.length > 0 && (
                <div className="space-y-2">
                  {form.other_charges.map((charge: any, idx: number) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input type="text" value={charge.name} onChange={e => updateCharge(idx, 'name', e.target.value)} className="input-field text-sm flex-1" placeholder="費用名稱（如：油費、維修費）" />
                      <input type="number" value={charge.amount} onChange={e => updateCharge(idx, 'amount', e.target.value)} className="input-field text-sm w-32 text-right" placeholder="金額（可負數）" step="0.01" />
                      <button type="button" onClick={() => removeCharge(idx)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
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
              {form.other_charges.filter((c: any) => c.name).map((c: any, i: number) => (
                <div key={i} className="flex justify-between text-blue-600">
                  <span>{c.name}</span>
                  <span>{Number(c.amount) >= 0 ? '+' : ''}{fmt$(c.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 font-bold text-gray-900">
                <span>總額</span>
                <span className="text-lg">{fmt$(formTotal)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">取消</button>
              <button onClick={handleCreate} disabled={creating} className="btn-primary disabled:opacity-50">
                {creating ? '建立中...' : '建立發票'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
