'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { companiesApi } from '@/lib/api';
import Link from 'next/link';

const typeLabels: Record<string, string> = { internal: '內部公司', client: '客戶', subcontractor: '外判' };
const roleLabels: Record<string, string> = { admin: '管理', driver: '司機', operator: '機手', worker: '雜工' };

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [company, setCompany] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    companiesApi.get(Number(params.id)).then(res => {
      setCompany(res.data);
      setForm(res.data);
      setLoading(false);
    }).catch(() => { router.push('/companies'); });
  }, [params.id, router]);

  const handleSave = async () => {
    try {
      const { employees, vehicles, machinery, created_at, updated_at, ...updateData } = form;
      const res = await companiesApi.update(company.id, updateData);
      setCompany(res.data);
      setEditing(false);
    } catch (err: any) {
      alert(err.response?.data?.message || '更新失敗');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/companies" className="hover:text-primary-600">公司管理</Link>
        <span>/</span>
        <span className="text-gray-900">{company?.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{company?.name}</h1>
          <p className="text-gray-500">{company?.name_en}</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => { setForm(company); setEditing(false); }} className="btn-secondary">取消</button>
              <button onClick={handleSave} className="btn-primary">儲存</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Company Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">公司資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">公司名稱</label><input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">英文名稱</label><input value={form.name_en || ''} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">公司代號</label><input value={form.internal_prefix || ''} onChange={e => setForm({...form, internal_prefix: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">類型</label>
                <select value={form.company_type} onChange={e => setForm({...form, company_type: e.target.value})} className="input-field">
                  <option value="internal">內部公司</option><option value="client">客戶</option><option value="subcontractor">外判</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">聯絡人</label><input value={form.contact_person || ''} onChange={e => setForm({...form, contact_person: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">電話</label><input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-500 mb-1">地址</label><input value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                  <option value="active">啟用</option><option value="inactive">停用</option>
                </select>
              </div>
              <div className="md:col-span-3"><label className="block text-sm font-medium text-gray-500 mb-1">說明</label><textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} /></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">公司代號</p><p className="font-mono font-bold text-lg">{company?.internal_prefix || '-'}</p></div>
              <div><p className="text-sm text-gray-500">類型</p><p><span className={company?.company_type === 'internal' ? 'badge-blue' : 'badge-green'}>{typeLabels[company?.company_type] || company?.company_type}</span></p></div>
              <div><p className="text-sm text-gray-500">狀態</p><p><span className={company?.status === 'active' ? 'badge-green' : 'badge-red'}>{company?.status === 'active' ? '啟用' : '停用'}</span></p></div>
              <div><p className="text-sm text-gray-500">聯絡人</p><p>{company?.contact_person || '-'}</p></div>
              <div><p className="text-sm text-gray-500">電話</p><p>{company?.phone || '-'}</p></div>
              <div><p className="text-sm text-gray-500">地址</p><p>{company?.address || '-'}</p></div>
              <div className="md:col-span-3"><p className="text-sm text-gray-500">說明</p><p>{company?.description || '-'}</p></div>
            </>
          )}
        </div>
      </div>

      {/* Related Employees */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">旗下員工 ({company?.employees?.length || 0})</h2>
          <Link href={`/employees?company_id=${company?.id}`} className="text-sm text-primary-600 hover:underline">查看全部</Link>
        </div>
        {company?.employees?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">編號</th><th className="px-3 py-2 text-left">姓名</th><th className="px-3 py-2 text-left">職位</th><th className="px-3 py-2 text-left">狀態</th></tr></thead>
              <tbody>
                {company.employees.slice(0, 10).map((emp: any) => (
                  <tr key={emp.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/employees/${emp.id}`)}>
                    <td className="px-3 py-2 font-mono">{emp.emp_code}</td>
                    <td className="px-3 py-2 font-medium">{emp.name_zh}</td>
                    <td className="px-3 py-2">{roleLabels[emp.role] || emp.role}</td>
                    <td className="px-3 py-2"><span className={emp.status === 'active' ? 'badge-green' : 'badge-red'}>{emp.status === 'active' ? '在職' : '離職'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {company.employees.length > 10 && <p className="text-sm text-gray-500 mt-2 text-center">...及其他 {company.employees.length - 10} 名員工</p>}
          </div>
        ) : <p className="text-gray-500 text-sm">暫無員工</p>}
      </div>

      {/* Related Vehicles */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">旗下車輛 ({company?.vehicles?.length || 0})</h2>
          <Link href={`/vehicles?owner_company_id=${company?.id}`} className="text-sm text-primary-600 hover:underline">查看全部</Link>
        </div>
        {company?.vehicles?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">車牌</th><th className="px-3 py-2 text-left">車型</th><th className="px-3 py-2 text-left">噸數</th><th className="px-3 py-2 text-left">狀態</th></tr></thead>
              <tbody>
                {company.vehicles.slice(0, 10).map((v: any) => (
                  <tr key={v.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/vehicles/${v.id}`)}>
                    <td className="px-3 py-2 font-mono font-bold">{v.plate_number}</td>
                    <td className="px-3 py-2">{v.vehicle_type || '-'}</td>
                    <td className="px-3 py-2">{v.tonnage ? `${v.tonnage}T` : '-'}</td>
                    <td className="px-3 py-2"><span className={v.status === 'active' ? 'badge-green' : 'badge-red'}>{v.status === 'active' ? '使用中' : '停用'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-gray-500 text-sm">暫無車輛</p>}
      </div>

      {/* Related Machinery */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">旗下機械 ({company?.machinery?.length || 0})</h2>
          <Link href={`/machinery?owner_company_id=${company?.id}`} className="text-sm text-primary-600 hover:underline">查看全部</Link>
        </div>
        {company?.machinery?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">編號</th><th className="px-3 py-2 text-left">品牌</th><th className="px-3 py-2 text-left">型號</th><th className="px-3 py-2 text-left">噸數</th></tr></thead>
              <tbody>
                {company.machinery.slice(0, 10).map((m: any) => (
                  <tr key={m.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/machinery/${m.id}`)}>
                    <td className="px-3 py-2 font-mono font-bold">{m.machine_code}</td>
                    <td className="px-3 py-2">{m.brand || '-'}</td>
                    <td className="px-3 py-2">{m.model || '-'}</td>
                    <td className="px-3 py-2">{m.tonnage ? `${m.tonnage}T` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-gray-500 text-sm">暫無機械</p>}
      </div>
    </div>
  );
}
