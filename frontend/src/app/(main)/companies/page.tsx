'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { companiesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';

const typeLabels: Record<string, string> = { internal: '內部公司', client: '客戶', subcontractor: '外判' };

export default function CompaniesPage() {
  const router = useRouter();
  const { hasMinRole } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', name_en: '', company_type: 'internal', internal_prefix: '', contact_person: '', phone: '', address: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await companiesApi.list({ page, limit: 20, search, company_type: typeFilter || undefined });
      setData(res.data.data);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  }, [page, search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await companiesApi.create(form);
      setShowModal(false);
      setForm({ name: '', name_en: '', company_type: 'internal', internal_prefix: '', contact_person: '', phone: '', address: '', description: '' });
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || '建立失敗');
    }
  };

  const columns = [
    { key: 'internal_prefix', label: '代號', className: 'w-20 font-mono font-bold', render: (v: string) => v || '-' },
    { key: 'name', label: '公司名稱', render: (_: any, row: any) => (
      <div>
        <div className="font-medium text-gray-900">{row.name}</div>
        {row.name_en && <div className="text-xs text-gray-500">{row.name_en}</div>}
      </div>
    )},
    { key: 'company_type', label: '類型', render: (v: string) => (
      <span className={v === 'internal' ? 'badge-blue' : v === 'client' ? 'badge-green' : 'badge-yellow'}>
        {typeLabels[v] || v}
      </span>
    ), filterRender: (v: string) => typeLabels[v] || v },
    { key: 'description', label: '說明', className: 'hidden md:table-cell' },
    { key: 'status', label: '狀態', render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : 'badge-red'}>{v === 'active' ? '啟用' : '停用'}</span>
    ), filterRender: (v: string) => v === 'active' ? '啟用' : '停用' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">公司管理</h1>
          <p className="text-gray-500 mt-1">管理集團內部公司、客戶及外判商</p>
        </div>
        {hasMinRole('clerk') && (
          <button onClick={() => setShowModal(true)} className="btn-primary">新增公司</button>
        )}
      </div>

      <div className="card">
        <DataTable
          exportFilename="公司列表"
          columns={columns}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={(s) => { setSearch(s); setPage(1); }}
          searchPlaceholder="搜尋公司名稱或代號..."
          onRowClick={(row) => router.push(`/companies/${row.id}`)}
          loading={loading}
          filters={
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto">
              <option value="">全部類型</option>
              <option value="internal">內部公司</option>
              <option value="client">客戶</option>
              <option value="subcontractor">外判</option>
            </select>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增公司" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">公司名稱 *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">英文名稱</label>
              <input value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">公司類型 *</label>
              <select value={form.company_type} onChange={e => setForm({...form, company_type: e.target.value})} className="input-field">
                <option value="internal">內部公司</option>
                <option value="client">客戶</option>
                <option value="subcontractor">外判</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">公司代號</label>
              <input value={form.internal_prefix} onChange={e => setForm({...form, internal_prefix: e.target.value})} className="input-field" placeholder="如 DCL、DTC" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">聯絡人</label>
              <input value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電話</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
            <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">建立</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
