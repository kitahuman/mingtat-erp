'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { machineryApi, companiesApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';

const machineTypes = ['挖掘機', '裝載機', '鉸接式自卸卡車', '履帶式裝載機', '推土機', '壓路機'];

export default function MachineryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState(searchParams.get('owner_company_id') || '');
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({ machine_code: '', machine_type: '挖掘機', brand: '', model: '', tonnage: '', serial_number: '', owner_company_id: '', inspection_cert_expiry: '' });

  useEffect(() => { companiesApi.simple().then(res => setCompanies(res.data)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await machineryApi.list({ page, limit: 20, search, machine_type: typeFilter || undefined, owner_company_id: companyFilter || undefined });
      setData(res.data.data);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  }, [page, search, typeFilter, companyFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await machineryApi.create({ ...form, owner_company_id: Number(form.owner_company_id), tonnage: form.tonnage ? Number(form.tonnage) : null });
      setShowModal(false);
      setForm({ machine_code: '', machine_type: '挖掘機', brand: '', model: '', tonnage: '', serial_number: '', owner_company_id: '', inspection_cert_expiry: '' });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '建立失敗'); }
  };

  function isExpiringSoon(date: string | null) {
    if (!date) return false;
    const diff = (new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff >= 0;
  }
  function isExpired(date: string | null) {
    if (!date) return false;
    return new Date(date) < new Date();
  }

  const columns = [
    { key: 'machine_code', label: '編號', className: 'font-mono font-bold' },
    { key: 'machine_type', label: '類型', render: (v: string) => v || '-' },
    { key: 'brand', label: '品牌', render: (v: string) => v || '-' },
    { key: 'model', label: '型號', render: (v: string) => v || '-' },
    { key: 'tonnage', label: '噸數', render: (v: number) => v ? `${v}T` : '-' },
    { key: 'owner_company', label: '所屬公司', className: 'hidden md:table-cell', render: (_: any, row: any) => row.owner_company?.internal_prefix || '-' },
    { key: 'inspection_cert_expiry', label: '驗機紙到期', className: 'hidden lg:table-cell', render: (v: string) => {
      if (!v) return <span className="text-gray-400">-</span>;
      if (isExpired(v)) return <span className="text-red-600 font-medium">{v}</span>;
      if (isExpiringSoon(v)) return <span className="text-yellow-600 font-medium">{v}</span>;
      return v;
    }},
    { key: 'status', label: '狀態', render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : v === 'maintenance' ? 'badge-yellow' : 'badge-red'}>{v === 'active' ? '使用中' : v === 'maintenance' ? '維修中' : '停用'}</span>
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">機械管理</h1>
          <p className="text-gray-500 mt-1">管理所有機械設備資料及過戶紀錄</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">新增機械</button>
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
          searchPlaceholder="搜尋編號、品牌或型號..."
          onRowClick={(row) => router.push(`/machinery/${row.id}`)}
          loading={loading}
          filters={
            <div className="flex gap-2">
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部類型</option>
                {machineTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部公司</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增機械" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">機械編號 *</label><input value={form.machine_code} onChange={e => setForm({...form, machine_code: e.target.value})} className="input-field" placeholder="如 DC23" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">類型 *</label>
              <select value={form.machine_type} onChange={e => setForm({...form, machine_type: e.target.value})} className="input-field">
                {machineTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">品牌</label><input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">型號</label><input value={form.model} onChange={e => setForm({...form, model: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">噸數</label><input type="number" step="0.1" value={form.tonnage} onChange={e => setForm({...form, tonnage: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">序號</label><input value={form.serial_number} onChange={e => setForm({...form, serial_number: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">所屬公司 *</label>
              <select value={form.owner_company_id} onChange={e => setForm({...form, owner_company_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">驗機紙到期日</label><input type="date" value={form.inspection_cert_expiry} onChange={e => setForm({...form, inspection_cert_expiry: e.target.value})} className="input-field" /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">建立</button></div>
        </form>
      </Modal>
    </div>
  );
}
