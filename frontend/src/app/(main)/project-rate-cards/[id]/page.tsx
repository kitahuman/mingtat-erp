'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { rateCardsApi, companiesApi, partnersApi, projectsApi } from '@/lib/api';
import AuditHistory from '@/components/AuditHistory';
import Link from 'next/link';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';

const SERVICE_TYPES = ['工程', '人工', '物料', '服務'];
const UNIT_OPTIONS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];

export default function ProjectRateCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [record, setRecord] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    rateCardsApi.get(Number(params.id)).then(res => {
      setRecord(res.data);
      setForm({ ...res.data });
      setLoading(false);
    }).catch(() => router.push('/project-rate-cards'));
  };

  useEffect(() => {
    loadData();
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
    projectsApi.simple().then(res => setProjects(res.data)).catch(() => {});
  }, [params.id]);

  const handleSave = async () => {
    try {
      const { company, client, source_quotation, project, created_at, updated_at, ot_rates, ...updateData } = form;
      updateData.day_rate = Number(updateData.day_rate) || 0;
      updateData.project_id = updateData.project_id || null;
      updateData.effective_date = updateData.effective_date || null;
      updateData.expiry_date = updateData.expiry_date || null;
      const res = await rateCardsApi.update(record.id, updateData);
      setRecord(res.data);
      setForm({ ...res.data });
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/project-rate-cards" className="hover:text-primary-600">工程價目表</Link><span>/</span><span className="text-gray-900">{record?.name || record?.service_type}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{record?.name || record?.service_type}</h1>
          <p className="text-gray-500">
            {record?.client?.name} | {record?.service_type} | <span className={record?.status === 'active' ? 'badge-green' : 'badge-gray'}>{record?.status === 'active' ? '啟用' : '停用'}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => { setForm({ ...record }); setEditing(false); }} className="btn-secondary">取消</button>
              <button onClick={handleSave} className="btn-primary">儲存</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Basic Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">基本資料</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-500 mb-1">開票公司</label>
              <select value={form.company_id} onChange={e => setForm({...form, company_id: Number(e.target.value)})} className="input-field">
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
              <select value={form.client_id} onChange={e => setForm({...form, client_id: Number(e.target.value)})} className="input-field">
                {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">合約編號</label><input value={form.contract_no || ''} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">服務類型</label>
              <select value={form.service_type} onChange={e => setForm({...form, service_type: e.target.value})} className="input-field">
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">項目名稱</label><input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="input-field" /></div>
            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-500 mb-1">項目描述</label><textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} placeholder="來自報價單的項目描述" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">關聯工程項目</label>
              <select value={form.project_id || ''} onChange={e => setForm({...form, project_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                <option value="">無</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><p className="text-sm text-gray-500">開票公司</p><p className="font-medium">{record?.company?.internal_prefix} - {record?.company?.name}</p></div>
            <div><p className="text-sm text-gray-500">客戶</p><p className="font-medium">{record?.client?.name}</p></div>
            <div><p className="text-sm text-gray-500">合約編號</p><p>{record?.contract_no || '-'}</p></div>
            <div><p className="text-sm text-gray-500">服務類型</p><p>{record?.service_type}</p></div>
            <div><p className="text-sm text-gray-500">項目名稱</p><p className="font-medium">{record?.name || '-'}</p></div>
            {record?.description && <div className="md:col-span-2"><p className="text-sm text-gray-500">項目描述</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{record.description}</p></div>}
            <div><p className="text-sm text-gray-500">關聯工程項目</p>
              {record?.project ? (
                <Link href={`/projects/${record.project.id}`} className="text-primary-600 hover:underline font-mono">{record.project.project_no} - {record.project.project_name}</Link>
              ) : <p>-</p>}
            </div>
            <div><p className="text-sm text-gray-500">備註</p><p>{record?.remarks || '-'}</p></div>
          </div>
        )}
      </div>

      {/* Rate and Dates */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">費率及有效期</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div><label className="block text-xs text-gray-500 mb-1">單價</label>
              <div className="flex gap-1">
                <input type="number" value={form.day_rate} onChange={e => setForm({...form, day_rate: e.target.value})} className="input-field flex-1" />
                <select value={form.day_unit || 'JOB'} onChange={e => setForm({...form, day_unit: e.target.value})} className="input-field w-20">{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select>
              </div>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">生效日期</label><input type="date" value={form.effective_date || ''} onChange={e => setForm({...form, effective_date: e.target.value})} className="input-field" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">到期日期</label><input type="date" value={form.expiry_date || ''} onChange={e => setForm({...form, expiry_date: e.target.value})} className="input-field" /></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs text-blue-600 mb-1">單價</p><p className="text-xl font-bold font-mono">${Number(record?.day_rate).toLocaleString()}<span className="text-sm font-normal text-gray-500">/{record?.day_unit || 'JOB'}</span></p></div>
            <div><p className="text-sm text-gray-500">生效日期</p><p>{fmtDate(record?.effective_date)}</p></div>
            <div><p className="text-sm text-gray-500">到期日期</p><p>{fmtDate(record?.expiry_date)}</p></div>
            <div><p className="text-sm text-gray-500">來源報價單</p>
              {record?.source_quotation ? (
                <Link href={`/quotations/${record.source_quotation.id}`} className="text-primary-600 hover:underline font-mono">{record.source_quotation.quotation_no}</Link>
              ) : <p>-</p>}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div className="card">
          <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
          <textarea value={form.remarks || ''} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={3} />
        </div>
      )}

      {/* Audit History */}
      <div className="card">
        <AuditHistory targetTable="rate_cards" targetId={Number(params.id)} />
      </div>
    </div>
  );
}
