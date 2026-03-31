'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { quotationsApi, companiesApi, partnersApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';

const statusLabels: Record<string, string> = {
  draft: '草稿', sent: '已發送', accepted: '已接受', rejected: '已拒絕',
};
const statusColors: Record<string, string> = {
  draft: 'badge-gray', sent: 'badge-blue', accepted: 'badge-green', rejected: 'badge-red',
};
const typeLabels: Record<string, string> = {
  project: '工程報價', rental: '租賃/運輸報價',
};

const PROJECT_UNITS = ['JOB','M','M2','M3','工','噸','次','個','件','公斤'];
const RENTAL_UNITS = ['車','天','晚','噸','小時','月','次','兩周'];
const ALL_UNITS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];

// Searchable client dropdown component
function ClientSearchSelect({ value, onChange, partners }: { value: string; onChange: (v: string) => void; partners: any[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const clientPartners = partners.filter((p: any) => p.partner_type === 'client');
  const filtered = clientPartners.filter((p: any) =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())
  );
  const selected = clientPartners.find((p: any) => String(p.id) === String(value));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`input-field text-left flex items-center justify-between w-full ${open ? 'border-primary-500 ring-1 ring-primary-300' : ''}`}>
        <span className={selected ? '' : 'text-gray-400'}>{selected ? (selected.code ? `${selected.code} - ${selected.name}` : selected.name) : '請選擇（可選）'}</span>
        <span className="text-gray-400 ml-2">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜尋客戶名稱或代碼..." className="input-field text-sm" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button type="button" className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${!value ? 'bg-primary-50 text-primary-700' : ''}`}
              onMouseDown={() => { onChange(''); setOpen(false); setSearch(''); }}>
              <span className="text-gray-400">— 不選擇 —</span>
            </button>
            {filtered.map((p: any) => (
              <button key={p.id} type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${String(p.id) === String(value) ? 'bg-primary-50 text-primary-700 font-medium' : ''}`}
                onMouseDown={() => { onChange(String(p.id)); setOpen(false); setSearch(''); }}>
                {p.code ? `${p.code} - ${p.name}` : p.name}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">無結果</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuotationsPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

  // Create form
  const defaultForm = {
    quotation_type: 'project',
    company_id: '', client_id: '', quotation_date: new Date().toISOString().slice(0, 10),
    contract_name: '', project_name: '',
    validity_period: '本報價有效期為30天',
    payment_terms: '上單後30天內付款', exclusions: '',
    external_remark: '', internal_remark: '',
    items: [{ item_name: '', item_description: '', quantity: 0, unit: 'JOB', unit_price: 0, remarks: '' }],
  };
  const [form, setForm] = useState<any>({ ...defaultForm });

  const load = () => {
    setLoading(true);
    quotationsApi.list({
      page, limit: 20, search,
      status: statusFilter || undefined,
      quotation_type: typeFilter || undefined,
      sortBy, sortOrder,
    }).then(res => { setData(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, search, statusFilter, typeFilter, sortBy, sortOrder]);
  useEffect(() => {
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
  }, []);

  const unitOptions = form.quotation_type === 'rental' ? RENTAL_UNITS : PROJECT_UNITS;

  const addItem = () => {
    const defaultUnit = form.quotation_type === 'rental' ? '天' : 'JOB';
    setForm({ ...form, items: [...form.items, { item_name: '', item_description: '', quantity: 0, unit: defaultUnit, unit_price: 0, remarks: '' }] });
  };
  const removeItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) });
  };
  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };

  // Rate Only: quantity is 0 or empty
  const isRateOnly = (item: any) => !item.quantity || Number(item.quantity) === 0;
  const itemAmount = (item: any) => isRateOnly(item) ? 0 : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  const totalAmount = form.items.reduce((sum: number, item: any) => sum + itemAmount(item), 0);

  const handleTypeChange = (newType: string) => {
    const defaultUnit = newType === 'rental' ? '天' : 'JOB';
    setForm({
      ...form,
      quotation_type: newType,
      project_name: newType === 'rental' ? '' : form.project_name,
      items: form.items.map((item: any) => ({ ...item, unit: defaultUnit })),
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        company_id: Number(form.company_id),
        client_id: form.client_id ? Number(form.client_id) : null,
        items: form.items.map((item: any, idx: number) => ({
          ...item,
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          sort_order: idx + 1,
        })),
      };
      await quotationsApi.create(payload);
      setShowModal(false);
      setForm({ ...defaultForm });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '新增失敗'); }
  };

  const columns = [
    { key: 'quotation_no', label: '報價單號', sortable: true, render: (v: any) => <span className="font-mono font-bold text-primary-600">{v}</span> },
    { key: 'quotation_type', label: '類型', render: (v: any) => (
      <span className={v === 'project' ? 'badge-blue' : 'badge-purple'}>
        {typeLabels[v] || v}
      </span>
    ), filterRender: (v: any) => typeLabels[v] || v },
    { key: 'company', label: '開立公司', render: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || '-' },
    { key: 'client', label: '客戶', render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'contract_name', label: '合約名稱', render: (v: any) => <span className="max-w-[150px] truncate block">{v || '-'}</span> },
    { key: 'quotation_date', label: '日期', sortable: true },
    { key: 'project_name', label: '工程/服務名稱', render: (v: any) => <span className="max-w-[200px] truncate block">{v || '-'}</span> },
    { key: 'project', label: '工程項目', render: (_: any, row: any) => row.project ? (
      <span className="text-primary-600 font-mono text-xs">{row.project.project_no}</span>
    ) : '-' },
    { key: 'total_amount', label: '總金額', sortable: true, className: 'text-right', render: (v: any) => <span className="font-mono">${Number(v).toLocaleString()}</span> },
    { key: 'status', label: '狀態', render: (v: any) => <span className={statusColors[v] || 'badge-gray'}>{statusLabels[v] || v}</span>, filterRender: (v: any) => statusLabels[v] || v },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">報價單</h1>
          <p className="text-gray-500 text-sm mt-1">管理工程報價單及租賃/運輸報價單</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">新增報價單</button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={setSearch}
          searchPlaceholder="搜尋報價單號、工程名稱、客戶..."
          onRowClick={(row) => router.push(`/quotations/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => { setSortBy(f); setSortOrder(o); }}
          filters={
            <div className="flex gap-2">
              <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部類型</option>
                <option value="project">工程報價</option>
                <option value="rental">租賃/運輸報價</option>
              </select>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部狀態</option>
                <option value="draft">草稿</option>
                <option value="sent">已發送</option>
                <option value="accepted">已接受</option>
                <option value="rejected">已拒絕</option>
              </select>
            </div>
          }
        />
      </div>

      {/* Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增報價單" size="xl">
        <form onSubmit={handleCreate} className="space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">報價單類型 *</label>
            <div className="flex gap-3">
              <button type="button" onClick={() => handleTypeChange('project')}
                className={`flex-1 p-3 rounded-lg border-2 text-left transition-all ${form.quotation_type === 'project' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-bold text-sm">工程報價單</p>
                <p className="text-xs text-gray-500 mt-1">一次性工程項目報價</p>
              </button>
              <button type="button" onClick={() => handleTypeChange('rental')}
                className={`flex-1 p-3 rounded-lg border-2 text-left transition-all ${form.quotation_type === 'rental' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-bold text-sm">租賃/運輸報價單</p>
                <p className="text-xs text-gray-500 mt-1">持續性標準定價 (Rate Only)</p>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開立公司 *</label>
              <select value={form.company_id} onChange={e => setForm({...form, company_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
              <ClientSearchSelect value={form.client_id} onChange={v => setForm({...form, client_id: v})} partners={partners} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
              <input type="date" value={form.quotation_date} onChange={e => setForm({...form, quotation_date: e.target.value})} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合約名稱</label>
              <input value={form.contract_name} onChange={e => setForm({...form, contract_name: e.target.value})} className="input-field" placeholder="例如 2025年度運輸服務合約" />
            </div>
            {form.quotation_type === 'project' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">工程名稱 *</label>
                <input value={form.project_name} onChange={e => setForm({...form, project_name: e.target.value})} className="input-field" required placeholder="例如 機場東面機場路Site6鋪人造草皮工程" />
              </div>
            )}
            {form.quotation_type === 'rental' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">服務說明</label>
                <input value={form.project_name} onChange={e => setForm({...form, project_name: e.target.value})} className="input-field" placeholder="例如 運輸服務報價" />
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                {form.quotation_type === 'project' ? '報價明細' : '費率明細'}
              </label>
              <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:underline">+ 新增項目</button>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-2 py-2 text-left w-8">#</th>
                    <th className="px-2 py-2 text-left min-w-[220px]">項目名稱 / 描述</th>
                    <th className="px-2 py-2 text-right w-24">數量</th>
                    <th className="px-2 py-2 text-left w-24">單位</th>
                    <th className="px-2 py-2 text-right w-28">單價</th>
                    <th className="px-2 py-2 text-right w-28">金額</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="px-2 py-1 text-gray-500 align-top pt-2">{idx + 1}</td>
                      <td className="px-2 py-1">
                        <input value={item.item_name || ''} onChange={e => updateItem(idx, 'item_name', e.target.value)} className="input-field text-sm mb-1" placeholder="項目名稱（短）" />
                        <textarea value={item.item_description || ''} onChange={e => updateItem(idx, 'item_description', e.target.value)} className="input-field text-sm text-xs" rows={2} placeholder="項目描述（可多行）" />
                      </td>
                      <td className="px-2 py-1 align-top pt-2"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="input-field text-sm text-right" /></td>
                      <td className="px-2 py-1 align-top pt-2">
                        <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="input-field text-sm">
                          {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1 align-top pt-2"><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} className="input-field text-sm text-right" /></td>
                      <td className="px-2 py-1 text-right font-mono align-top pt-2">
                        {isRateOnly(item) ? <span className="text-orange-600 text-xs font-semibold">Rate Only</span> : `$${itemAmount(item).toLocaleString()}`}
                      </td>
                      <td className="px-2 py-1 align-top pt-2">
                        {form.items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-lg">&times;</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={5} className="px-2 py-2 text-right">總金額：</td>
                    <td className="px-2 py-2 text-right font-mono text-primary-600">${totalAmount.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Remarks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">有效期</label>
              <input value={form.validity_period} onChange={e => setForm({...form, validity_period: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">付款條件</label>
              <input value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})} className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">除外責任</label>
              <textarea value={form.exclusions} onChange={e => setForm({...form, exclusions: e.target.value})} className="input-field" rows={2} placeholder="例如：不包括處理費及入帳" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">報價單備註（對外）</label>
              <textarea value={form.external_remark} onChange={e => setForm({...form, external_remark: e.target.value})} className="input-field" rows={2} placeholder="顯示在報價單 PDF 上，給客戶看" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">內部備註 <span className="text-xs text-gray-400 font-normal">（不顯示在 PDF）</span></label>
              <textarea value={form.internal_remark} onChange={e => setForm({...form, internal_remark: e.target.value})} className="input-field" rows={2} placeholder="僅系統內部可見" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">新增報價單</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
