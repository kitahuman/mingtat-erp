'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { companyProfilesApi } from '@/lib/api';
import DocumentUpload from '@/components/DocumentUpload';
import ExpiryBadge from '@/components/ExpiryBadge';
import CustomFieldsBlock from '@/components/CustomFieldsBlock';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function CompanyProfileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    companyProfilesApi.get(Number(params.id)).then(res => {
      setProfile(res.data);
      setForm(res.data);
      setLoading(false);
    }).catch(() => router.push('/company-profiles'));
  };

  useEffect(() => { loadData(); }, [params.id]);

  const handleSave = async () => {
    try {
      const { created_at, updated_at, ...updateData } = form;
      const res = await companyProfilesApi.update(profile.id, updateData);
      setProfile(res.data);
      setForm(res.data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const InfoField = ({ label, value, className = '' }: { label: string; value: any; className?: string }) => (
    <div className={className}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-0.5">{value || '-'}</p>
    </div>
  );

  const EditField = ({ label, field, type = 'text', className = '' }: { label: string; field: string; type?: string; className?: string }) => (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-500 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea value={form[field] || ''} onChange={e => setForm({...form, [field]: e.target.value})} className="input-field" rows={3} />
      ) : (
        <input type={type} value={form[field] || ''} onChange={e => setForm({...form, [field]: e.target.value})} className="input-field" />
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/company-profiles" className="hover:text-primary-600">公司資料</Link><span>/</span><span className="text-gray-900">{profile?.chinese_name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-primary-600 bg-primary-50 px-3 py-1 rounded text-lg font-bold">{profile?.code}</span>
            <h1 className="text-2xl font-bold text-gray-900">{profile?.chinese_name}</h1>
          </div>
          {profile?.english_name && <p className="text-gray-500 mt-1">{profile.english_name}</p>}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <><button onClick={() => { setForm(profile); setEditing(false); }} className="btn-secondary">取消</button><button onClick={handleSave} className="btn-primary">儲存</button></>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Basic Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">基本資料</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="代碼" field="code" />
            <EditField label="公司中文名" field="chinese_name" />
            <EditField label="公司英文名" field="english_name" />
            <EditField label="註冊日期" field="registration_date" />
            <EditField label="公司註冊證明編號" field="cr_number" />
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                <option value="active">有效</option><option value="inactive">停用</option>
              </select>
            </div>
            <EditField label="公司註冊地址" field="registered_address" className="md:col-span-2 lg:col-span-3" />
            <EditField label="董事" field="directors" className="md:col-span-2 lg:col-span-3" />
            <EditField label="股東" field="shareholders" className="md:col-span-2 lg:col-span-3" />
            <EditField label="秘書" field="secretary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoField label="代碼" value={<span className="font-mono font-bold text-primary-600">{profile?.code}</span>} />
            <InfoField label="公司中文名" value={<span className="font-medium">{profile?.chinese_name}</span>} />
            <InfoField label="公司英文名" value={profile?.english_name} />
            <InfoField label="註冊日期" value={profile?.registration_date} />
            <InfoField label="公司註冊證明編號" value={profile?.cr_number} />
            <InfoField label="狀態" value={<span className={profile?.status === 'active' ? 'badge-green' : 'badge-red'}>{profile?.status === 'active' ? '有效' : '停用'}</span>} />
            <InfoField label="公司註冊地址" value={profile?.registered_address} className="md:col-span-2 lg:col-span-3" />
            <InfoField label="董事" value={profile?.directors} className="md:col-span-2 lg:col-span-3" />
            <InfoField label="股東" value={profile?.shareholders} className="md:col-span-2 lg:col-span-3" />
            <InfoField label="秘書" value={profile?.secretary} />
          </div>
        )}
      </div>

      {/* Business Registration */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">商業登記</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="商業登記證號碼" field="br_number" />
            <EditField label="商業登記屆滿日" field="br_expiry_date" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoField label="商業登記證號碼" value={profile?.br_number} />
            <InfoField label="商業登記屆滿日" value={profile?.br_expiry_date ? <ExpiryBadge date={profile.br_expiry_date} showLabel /> : null} />
          </div>
        )}
      </div>

      {/* Subcontractor Registration */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">分包商註冊</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="分包商註冊編號" field="subcontractor_reg_no" />
            <EditField label="分包商註冊日期" field="subcontractor_reg_date" />
            <EditField label="分包商註冊到期日" field="subcontractor_reg_expiry" />
            <EditField label="分包商工種" field="subcontractor_work_types" className="md:col-span-2 lg:col-span-3" />
            <EditField label="分包商專長項目" field="subcontractor_specialties" className="md:col-span-2 lg:col-span-3" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoField label="分包商註冊編號" value={profile?.subcontractor_reg_no} />
            <InfoField label="分包商註冊日期" value={profile?.subcontractor_reg_date} />
            <InfoField label="分包商註冊到期日" value={profile?.subcontractor_reg_expiry ? <ExpiryBadge date={profile.subcontractor_reg_expiry} showLabel /> : null} />
            <InfoField label="分包商工種" value={profile?.subcontractor_work_types} className="md:col-span-2 lg:col-span-3" />
            <InfoField label="分包商專長項目" value={profile?.subcontractor_specialties} className="md:col-span-2 lg:col-span-3" />
          </div>
        )}
      </div>

      {/* Office Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">辦事處資料</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <EditField label="辦事處電話" field="office_phone" />
            <EditField label="辦事處傳真" field="office_fax" />
            <EditField label="辦事處電郵" field="office_email" />
            <EditField label="辦事處地址" field="office_address" className="md:col-span-2 lg:col-span-3" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoField label="辦事處電話" value={profile?.office_phone} />
            <InfoField label="辦事處傳真" value={profile?.office_fax} />
            <InfoField label="辦事處電郵" value={profile?.office_email} />
            <InfoField label="辦事處地址" value={profile?.office_address} className="md:col-span-2 lg:col-span-3" />
          </div>
        )}
      </div>

      {/* Custom Fields */}
      <div className="card mb-6">
        <CustomFieldsBlock module="company" entityId={profile?.id} />
      </div>

      {/* Documents */}
      <div className="card">
        <DocumentUpload entityType="company-profile" entityId={profile?.id} docTypes={['商業登記', '公司註冊', '分包商註冊', '其他']} />
      </div>
    </div>
  );
}
