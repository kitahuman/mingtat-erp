'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { partnersApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';

const partnerTypes = [
  { value: 'client', label: '客戶' },
  { value: 'supplier', label: '供應商' },
  { value: 'subcontractor', label: '判頭/街車' },
  { value: 'insurance', label: '保險公司' },
  { value: 'repair_shop', label: '維修廠' },
  { value: 'other', label: '其他' },
];

const typeLabels: Record<string, string> = {
  client: '客戶', supplier: '供應商', subcontractor: '判頭/街車',
  insurance: '保險公司', repair_shop: '維修廠', other: '其他'
};

export default function PartnersPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({
    name: '', partner_type: 'client', contact_person: '', phone: '',
    email: '', address: '', notes: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await partnersApi.list({ page, limit: 20, search, partner_type: typeFilter || undefined });
      setData(res.data.data);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  }, [page, search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await partnersApi.create(form);
      setShowModal(false);
      setForm({ name: '', partner_type: 'client', contact_person: '', phone: '', email: '', address: '', notes: '' });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '建立失敗'); }
  };

  const columns = [
    { key: 'name', label: '名稱', render: (v: string) => <span className="font-medium">{v}</span> },
    { key: 'partner_type', label: '類型', render: (v: string) => {
      const colors: Record<string, string> = {
        client: 'badge-blue', supplier: 'badge-green', subcontractor: 'badge-yellow',
        insurance: 'badge-purple', repair_shop: 'badge-gray', other: 'badge-gray'
      };
      return <span className={colors[v] || 'badge-gray'}>{typeLabels[v] || v}</span>;
    }},
    { key: 'contact_person', label: '聯絡人', render: (v: string) => v || '-' },
    { key: 'phone', label: '電話', render: (v: string) => v || '-' },
    { key: 'email', label: '電郵', render: (v: string) => v || '-' },
    { key: 'status', label: '狀態', render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : 'badge-red'}>{v === 'active' ? '合作中' : '停用'}</span>
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">合作單位管理</h1>
          <p className="text-gray-500 mt-1">管理客戶、供應商、判頭及其他合作夥伴</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">新增合作單位</button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={(s) => { setSearch(s); setPage(1); }}
          searchPlaceholder="搜尋名稱、聯絡人或電話..."
          onRowClick={(row) => router.push(`/partners/${row.id}`)}
          loading={loading}
          filters={
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto">
              <option value="">全部類型</option>
              {partnerTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增合作單位" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">名稱 *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">類型 *</label>
              <select value={form.partner_type} onChange={e => setForm({...form, partner_type: e.target.value})} className="input-field">
                {partnerTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">聯絡人</label><input value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">電話</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">電郵</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">地址</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input-field" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">建立</button></div>
        </form>
      </Modal>
    </div>
  );
}
