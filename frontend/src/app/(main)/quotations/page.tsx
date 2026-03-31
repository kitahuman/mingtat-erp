'use client';
import { useState, useEffect } from 'react';
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

const UNIT_OPTIONS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];

export default function QuotationsPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

  // Create form
  const [form, setForm] = useState<any>({
    company_id: '', client_id: '', quotation_date: new Date().toISOString().slice(0, 10),
    project_name: '', project_no: '', validity_period: '本報價有效期為30天',
    payment_terms: '上單後30天內付款', exclusions: '', remarks: '',
    items: [{ description: '', quantity: 0, unit: 'JOB', unit_price: 0, remarks: '' }],
  });

  const load = () => {
    setLoading(true);
    quotationsApi.list({ page, limit: 20, search, status: statusFilter || undefined, sortBy, sortOrder })
      .then(res => { setData(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, search, statusFilter, sortBy, sortOrder]);
  useEffect(() => {
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
  }, []);

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { description: '', quantity: 0, unit: 'JOB', unit_price: 0, remarks: '' }] });
  };
  const removeItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) });
  };
  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };

  const totalAmount = form.items.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);

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
      setForm({
        company_id: '', client_id: '', quotation_date: new Date().toISOString().slice(0, 10),
        project_name: '', project_no: '', validity_period: '本報價有效期為30天',
        payment_terms: '上單後30天內付款', exclusions: '', remarks: '',
        items: [{ description: '', quantity: 0, unit: 'JOB', unit_price: 0, remarks: '' }],
      });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '新增失敗'); }
  };

  const columns = [
    { key: 'quotation_no', label: '報價單號', sortable: true, render: (v: any) => <span className="font-mono font-bold text-primary-600">{v}</span> },
    { key: 'company', label: '開立公司', render: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || '-' },
    { key: 'client', label: '客戶', render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'quotation_date', label: '日期', sortable: true },
    { key: 'project_name', label: '工程名稱', render: (v: any) => <span className="max-w-[200px] truncate block">{v || '-'}</span> },
    { key: 'total_amount', label: '總金額', sortable: true, className: 'text-right', render: (v: any) => <span className="font-mono">${Number(v).toLocaleString()}</span> },
    { key: 'status', label: '狀態', render: (v: any) => <span className={statusColors[v] || 'badge-gray'}>{statusLabels[v] || v}</span>, filterRender: (v: any) => statusLabels[v] || v },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">工程報價單</h1>
          <p className="text-gray-500 text-sm mt-1">管理工程報價單，支援自動編號</p>
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
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto">
              <option value="">全部狀態</option>
              <option value="draft">草稿</option>
              <option value="sent">已發送</option>
              <option value="accepted">已接受</option>
              <option value="rejected">已拒絕</option>
            </select>
          }
        />
      </div>

      {/* Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增工程報價單" size="xl">
        <form onSubmit={handleCreate} className="space-y-4">
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
              <select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} className="input-field">
                <option value="">請選擇（可選）</option>
                {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
              <input type="date" value={form.quotation_date} onChange={e => setForm({...form, quotation_date: e.target.value})} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">工程編號</label>
              <input value={form.project_no} onChange={e => setForm({...form, project_no: e.target.value})} className="input-field" placeholder="例如 PA13114" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">工程名稱 *</label>
              <input value={form.project_name} onChange={e => setForm({...form, project_name: e.target.value})} className="input-field" required placeholder="例如 機場東面機場路Site6鋪人造草皮工程" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">報價明細</label>
              <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:underline">+ 新增項目</button>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-2 py-2 text-left w-8">#</th>
                    <th className="px-2 py-2 text-left min-w-[200px]">項目描述</th>
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
                      <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1"><input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="input-field text-sm" placeholder="項目描述" /></td>
                      <td className="px-2 py-1"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="input-field text-sm text-right" /></td>
                      <td className="px-2 py-1">
                        <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="input-field text-sm">
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1"><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} className="input-field text-sm text-right" /></td>
                      <td className="px-2 py-1 text-right font-mono">${((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)).toLocaleString()}</td>
                      <td className="px-2 py-1">
                        {form.items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-lg">×</button>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">其他備註</label>
              <textarea value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={2} />
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
