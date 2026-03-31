'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { partnersApi } from '@/lib/api';
import DocumentUpload from '@/components/DocumentUpload';
import Link from 'next/link';

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

export default function PartnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [partner, setPartner] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    partnersApi.get(Number(params.id)).then(res => { setPartner(res.data); setForm(res.data); setLoading(false); }).catch(() => router.push('/partners'));
  };

  useEffect(() => { loadData(); }, [params.id]);

  const handleSave = async () => {
    try {
      const { created_at, updated_at, ...updateData } = form;
      const res = await partnersApi.update(partner.id, updateData);
      setPartner(res.data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/partners" className="hover:text-primary-600">合作單位管理</Link><span>/</span><span className="text-gray-900">{partner?.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{partner?.name}</h1>
          <p className="text-gray-500">{typeLabels[partner?.partner_type] || partner?.partner_type}</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <><button onClick={() => { setForm(partner); setEditing(false); }} className="btn-secondary">取消</button><button onClick={handleSave} className="btn-primary">儲存</button></>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Basic Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">基本資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">名稱</label><input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">類型</label>
                <select value={form.partner_type} onChange={e => setForm({...form, partner_type: e.target.value})} className="input-field">
                  {partnerTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">聯絡人</label><input value={form.contact_person || ''} onChange={e => setForm({...form, contact_person: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">電話</label><input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">電郵</label><input type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">地址</label><input value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                  <option value="active">合作中</option><option value="inactive">停用</option>
                </select>
              </div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-500 mb-1">備註</label><textarea value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className="input-field" rows={2} /></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">名稱</p><p className="font-medium text-lg">{partner?.name}</p></div>
              <div><p className="text-sm text-gray-500">類型</p><p><span className="badge-blue">{typeLabels[partner?.partner_type] || partner?.partner_type}</span></p></div>
              <div><p className="text-sm text-gray-500">狀態</p><p><span className={partner?.status === 'active' ? 'badge-green' : 'badge-red'}>{partner?.status === 'active' ? '合作中' : '停用'}</span></p></div>
              <div><p className="text-sm text-gray-500">聯絡人</p><p>{partner?.contact_person || '-'}</p></div>
              <div><p className="text-sm text-gray-500">電話</p><p>{partner?.phone || '-'}</p></div>
              <div><p className="text-sm text-gray-500">電郵</p><p>{partner?.email || '-'}</p></div>
              <div className="md:col-span-2"><p className="text-sm text-gray-500">地址</p><p>{partner?.address || '-'}</p></div>
              {partner?.notes && <div className="md:col-span-3"><p className="text-sm text-gray-500">備註</p><p>{partner.notes}</p></div>}
            </>
          )}
        </div>
      </div>

      {/* Documents */}
      <div className="card mb-6">
        <DocumentUpload entityType="partner" entityId={partner?.id} docTypes={['報價單', '發票', '合約', '保險單', '其他']} />
      </div>

      {/* Placeholder for future: related records */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-900 mb-4">相關紀錄</h2>
        <p className="text-gray-400 text-sm py-4 text-center">工作紀錄、報價單、發票等功能將在後續階段開發</p>
      </div>
    </div>
  );
}
