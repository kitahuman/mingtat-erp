'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { partnersApi } from '@/lib/api';
import DocumentUpload from '@/components/DocumentUpload';
import CustomFieldsBlock from '@/components/CustomFieldsBlock';
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

const SUBSIDIARY_OPTIONS = ['DCL', 'DTC', 'DDL', 'DTL', 'MCL', '卓嵐'];

function SubsidiaryTags({ values }: { values: string[] | string | null }) {
  if (!values) return <span className="text-gray-400">-</span>;
  const arr = Array.isArray(values) ? values : (typeof values === 'string' ? values.split(',').filter(Boolean) : []);
  if (arr.length === 0) return <span className="text-gray-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {arr.map((s: string) => (
        <span key={s} className="inline-block px-2 py-0.5 text-xs rounded-full bg-primary-50 text-primary-700 border border-primary-200">{s.trim()}</span>
      ))}
    </div>
  );
}

export default function PartnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [partner, setPartner] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    partnersApi.get(Number(params.id)).then(res => {
      const data = res.data;
      // Ensure subsidiaries is always an array
      if (data.subsidiaries && typeof data.subsidiaries === 'string') {
        data.subsidiaries = data.subsidiaries.split(',').filter(Boolean).map((s: string) => s.trim());
      }
      if (!data.subsidiaries) data.subsidiaries = [];
      setPartner(data);
      setForm(data);
      setLoading(false);
    }).catch(() => router.push('/partners'));
  };

  useEffect(() => { loadData(); }, [params.id]);

  const handleSave = async () => {
    try {
      const { created_at, updated_at, ...updateData } = form;
      const res = await partnersApi.update(partner.id, updateData);
      const data = res.data;
      if (data.subsidiaries && typeof data.subsidiaries === 'string') {
        data.subsidiaries = data.subsidiaries.split(',').filter(Boolean).map((s: string) => s.trim());
      }
      if (!data.subsidiaries) data.subsidiaries = [];
      setPartner(data);
      setForm(data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const toggleSubsidiary = (val: string) => {
    const subs = form.subsidiaries || [];
    if (subs.includes(val)) {
      setForm({ ...form, subsidiaries: subs.filter((s: string) => s !== val) });
    } else {
      setForm({ ...form, subsidiaries: [...subs, val] });
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const InfoField = ({ label, value, className = '' }: { label: string; value: any; className?: string }) => (
    <div className={className}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-0.5">{value || '-'}</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/partners" className="hover:text-primary-600">合作單位管理</Link><span>/</span><span className="text-gray-900">{partner?.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{partner?.name}</h1>
            {partner?.code && <span className="text-lg text-gray-500">({partner.code})</span>}
            {partner?.english_code && <span className="font-mono text-primary-600 bg-primary-50 px-2 py-0.5 rounded text-sm">{partner.english_code}</span>}
          </div>
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
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium text-gray-500 mb-1">代碼</label><input value={form.code || ''} onChange={e => setForm({...form, code: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">英文代碼</label><input value={form.english_code || ''} onChange={e => setForm({...form, english_code: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">類型</label>
                <select value={form.partner_type} onChange={e => setForm({...form, partner_type: e.target.value})} className="input-field">
                  {partnerTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">名稱</label><input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">簡稱</label><input value={form.short_name || ''} onChange={e => setForm({...form, short_name: e.target.value})} className="input-field" placeholder="用於糧單顯示" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">英文名稱</label><input value={form.name_en || ''} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                  <option value="active">合作中</option><option value="inactive">停用</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_subsidiary || false} onChange={e => setForm({...form, is_subsidiary: e.target.checked})} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" id="is_subsidiary" />
              <label htmlFor="is_subsidiary" className="text-sm font-medium text-gray-700 cursor-pointer">是旗下公司</label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">業務往來旗下公司</label>
              <div className="flex flex-wrap gap-2">
                {SUBSIDIARY_OPTIONS.map(opt => (
                  <label key={opt} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-sm transition-colors ${
                    (form.subsidiaries || []).includes(opt)
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={(form.subsidiaries || []).includes(opt)}
                      onChange={() => toggleSubsidiary(opt)}
                      className="sr-only"
                    />
                    {(form.subsidiaries || []).includes(opt) && <span>&#10003;</span>}
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoField label="代碼" value={partner?.code} />
            <InfoField label="英文代碼" value={partner?.english_code ? <span className="font-mono text-primary-600">{partner.english_code}</span> : null} />
            <InfoField label="類型" value={<span className="badge-blue">{typeLabels[partner?.partner_type] || partner?.partner_type}</span>} />
            <InfoField label="名稱" value={<span className="font-medium text-lg">{partner?.name}</span>} />
            <InfoField label="簡稱" value={partner?.short_name} />
            <InfoField label="英文名稱" value={partner?.name_en} />
            <InfoField label="狀態" value={<span className={partner?.status === 'active' ? 'badge-green' : 'badge-red'}>{partner?.status === 'active' ? '合作中' : '停用'}</span>} />
            <InfoField label="旗下公司" value={partner?.is_subsidiary ? <span className="badge-blue">是</span> : '否'} />
            <div className="md:col-span-2">
              <p className="text-sm text-gray-500">業務往來旗下公司</p>
              <div className="mt-1"><SubsidiaryTags values={partner?.subsidiaries} /></div>
            </div>
          </div>
        )}
      </div>

      {/* Contact Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">聯絡資料</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-500 mb-1">聯絡人</label><input value={form.contact_person || ''} onChange={e => setForm({...form, contact_person: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">電話</label><input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">手提電話</label><input value={form.mobile || ''} onChange={e => setForm({...form, mobile: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">電郵</label><input type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">傳真</label><input value={form.fax || ''} onChange={e => setForm({...form, fax: e.target.value})} className="input-field" /></div>
            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-500 mb-1">地址</label><input value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} className="input-field" /></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoField label="聯絡人" value={partner?.contact_person} />
            <InfoField label="電話" value={partner?.phone} />
            <InfoField label="手提電話" value={partner?.mobile} />
            <InfoField label="電郵" value={partner?.email} />
            <InfoField label="傳真" value={partner?.fax} />
            <div className="md:col-span-2"><InfoField label="地址" value={partner?.address} /></div>
          </div>
        )}
      </div>

      {/* Bank & Invoice Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">銀行及發票資料</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-500 mb-1">銀行名</label><input value={form.bank_name || ''} onChange={e => setForm({...form, bank_name: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">銀行賬戶</label><input value={form.bank_account || ''} onChange={e => setForm({...form, bank_account: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">發票標題</label><input value={form.invoice_title || ''} onChange={e => setForm({...form, invoice_title: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">發票描述</label><input value={form.invoice_description || ''} onChange={e => setForm({...form, invoice_description: e.target.value})} className="input-field" /></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoField label="銀行名" value={partner?.bank_name} />
            <InfoField label="銀行賬戶" value={partner?.bank_account} />
            <InfoField label="發票標題" value={partner?.invoice_title} />
            <InfoField label="發票描述" value={partner?.invoice_description} />
          </div>
        )}
      </div>

      {/* Remarks */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">備註</h2>
        {editing ? (
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-500 mb-1">報價備註</label><textarea value={form.quotation_remarks || ''} onChange={e => setForm({...form, quotation_remarks: e.target.value})} className="input-field" rows={4} /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">發票備註</label><textarea value={form.invoice_remarks || ''} onChange={e => setForm({...form, invoice_remarks: e.target.value})} className="input-field" rows={4} /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">其他備註</label><textarea value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className="input-field" rows={3} /></div>
          </div>
        ) : (
          <div className="space-y-4">
            {partner?.quotation_remarks && (
              <div><p className="text-sm text-gray-500 mb-1">報價備註</p><p className="whitespace-pre-wrap text-sm bg-gray-50 rounded-lg p-3">{partner.quotation_remarks}</p></div>
            )}
            {partner?.invoice_remarks && (
              <div><p className="text-sm text-gray-500 mb-1">發票備註</p><p className="whitespace-pre-wrap text-sm bg-gray-50 rounded-lg p-3">{partner.invoice_remarks}</p></div>
            )}
            {partner?.notes && (
              <div><p className="text-sm text-gray-500 mb-1">其他備註</p><p className="whitespace-pre-wrap text-sm bg-gray-50 rounded-lg p-3">{partner.notes}</p></div>
            )}
            {!partner?.quotation_remarks && !partner?.invoice_remarks && !partner?.notes && (
              <p className="text-gray-400 text-sm">暫無備註</p>
            )}
          </div>
        )}
      </div>

      {/* Custom Fields */}
      <div className="card mb-6">
        <CustomFieldsBlock module="partner" entityId={partner?.id} />
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
