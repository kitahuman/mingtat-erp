'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { employeesApi, companiesApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';

const roleLabels: Record<string, string> = { admin: '管理', driver: '司機', operator: '機手', worker: '雜工' };
const roleOptions = [
  { value: 'driver', label: '司機' },
  { value: 'operator', label: '機手' },
  { value: 'worker', label: '雜工' },
  { value: 'admin', label: '管理' },
];

export default function EmployeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState(searchParams.get('company_id') || '');
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({ name_zh: '', name_en: '', role: 'worker', phone: '', company_id: '', emp_code: '', join_date: '' });

  useEffect(() => { companiesApi.simple().then(res => setCompanies(res.data)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await employeesApi.list({ page, limit: 20, search, role: roleFilter || undefined, company_id: companyFilter || undefined });
      setData(res.data.data);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  }, [page, search, roleFilter, companyFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await employeesApi.create({ ...form, company_id: Number(form.company_id) });
      setShowModal(false);
      setForm({ name_zh: '', name_en: '', role: 'worker', phone: '', company_id: '', emp_code: '', join_date: '' });
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || '建立失敗');
    }
  };

  const columns = [
    { key: 'emp_code', label: '編號', className: 'w-20 font-mono', render: (v: string) => v || '-' },
    { key: 'name_zh', label: '姓名', render: (_: any, row: any) => (
      <div><div className="font-medium text-gray-900">{row.name_zh}</div>{row.name_en && <div className="text-xs text-gray-500">{row.name_en}</div>}</div>
    )},
    { key: 'role', label: '職位', render: (v: string) => (
      <span className={v === 'admin' ? 'badge-blue' : v === 'driver' ? 'badge-green' : v === 'operator' ? 'badge-yellow' : 'badge-gray'}>
        {roleLabels[v] || v}
      </span>
    )},
    { key: 'company', label: '所屬公司', className: 'hidden md:table-cell', render: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-' },
    { key: 'phone', label: '電話', className: 'hidden lg:table-cell', render: (v: string) => v || '-' },
    { key: 'status', label: '狀態', render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : 'badge-red'}>{v === 'active' ? '在職' : '離職'}</span>
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">員工管理</h1>
          <p className="text-gray-500 mt-1">管理所有員工資料、薪資設定及調動紀錄</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">新增員工</button>
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
          searchPlaceholder="搜尋姓名、編號或電話..."
          onRowClick={(row) => router.push(`/employees/${row.id}`)}
          loading={loading}
          filters={
            <div className="flex gap-2">
              <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部職位</option>
                {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部公司</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增員工" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">中文姓名 *</label><input value={form.name_zh} onChange={e => setForm({...form, name_zh: e.target.value})} className="input-field" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">英文姓名</label><input value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">員工編號</label><input value={form.emp_code} onChange={e => setForm({...form, emp_code: e.target.value})} className="input-field" placeholder="如 E001" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">職位 *</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="input-field">
                {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">所屬公司 *</label>
              <select value={form.company_id} onChange={e => setForm({...form, company_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">電話</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">入職日期</label><input type="date" value={form.join_date} onChange={e => setForm({...form, join_date: e.target.value})} className="input-field" /></div>
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
