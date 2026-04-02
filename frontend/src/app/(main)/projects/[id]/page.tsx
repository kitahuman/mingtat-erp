'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { projectsApi, companiesApi, partnersApi, quotationsApi, rateCardsApi, contractsApi } from '@/lib/api';
import Link from 'next/link';
import { fmtDate, toInputDate } from '@/lib/dateUtils';

const statusLabels: Record<string, string> = {
  pending: '等待', active: '進行中', completed: '已完成', cancelled: '已取消',
};
const statusColors: Record<string, string> = {
  pending: 'badge-yellow', active: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red',
};
const qStatusLabels: Record<string, string> = { draft: '草稿', sent: '已發送', accepted: '已接受', rejected: '已拒絕' };
const qStatusColors: Record<string, string> = { draft: 'badge-gray', sent: 'badge-blue', accepted: 'badge-green', rejected: 'badge-red' };

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkedQuotations, setLinkedQuotations] = useState<any[]>([]);
  const [linkedRateCards, setLinkedRateCards] = useState<any[]>([]);

  const loadData = () => {
    projectsApi.get(Number(params.id)).then(res => {
      setProject(res.data);
      setForm({ ...res.data });
      setLoading(false);
    }).catch(() => router.push('/projects'));
  };

  const loadLinked = () => {
    quotationsApi.byProject(Number(params.id)).then(res => setLinkedQuotations(res.data || [])).catch(() => {});
    rateCardsApi.list({ project_id: Number(params.id), limit: 100 }).then(res => setLinkedRateCards(res.data?.data || [])).catch(() => {});
  };

  useEffect(() => {
    loadData();
    loadLinked();
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
    contractsApi.simple().then(res => setContracts(res.data)).catch(() => {});
  }, [params.id]);

  // Filter contracts by selected client
  const filteredContracts = form.client_id
    ? contracts.filter((c: any) => c.client_id === Number(form.client_id))
    : contracts;

  const handleSave = async () => {
    try {
      const { company, client, contract, created_at, updated_at, ...updateData } = form;
      if (updateData.contract_id !== undefined) {
        updateData.contract_id = updateData.contract_id ? Number(updateData.contract_id) : null;
      }
      const res = await projectsApi.update(project.id, updateData);
      setProject(res.data);
      setForm({ ...res.data });
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await projectsApi.updateStatus(project.id, newStatus);
      setProject(res.data);
      setForm({ ...res.data });
    } catch (err: any) { alert(err.response?.data?.message || '狀態更新失敗'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/projects" className="hover:text-primary-600">工程項目</Link><span>/</span><span className="text-gray-900">{project?.project_no}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{project?.project_no}</h1>
            <span className={statusColors[project?.status]}>{statusLabels[project?.status]}</span>
          </div>
          <p className="text-gray-500 mt-1">{project?.project_name}</p>
        </div>
        <div className="flex gap-2">
          {project?.status === 'pending' && (
            <button onClick={() => handleStatusChange('active')} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">開始進行</button>
          )}
          {project?.status === 'active' && (
            <>
              <button onClick={() => handleStatusChange('completed')} className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm">標記完成</button>
              <button onClick={() => handleStatusChange('cancelled')} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">取消</button>
            </>
          )}
          {editing ? (
            <>
              <button onClick={() => { setForm({ ...project }); setEditing(false); }} className="btn-secondary">取消</button>
              <button onClick={handleSave} className="btn-primary">儲存</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Project Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">工程資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">開立公司</label>
                <select value={form.company_id} onChange={e => setForm({...form, company_id: Number(e.target.value)})} className="input-field">
                  {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
                <select value={form.client_id || ''} onChange={e => setForm({...form, client_id: e.target.value ? Number(e.target.value) : null, contract_id: ''})} className="input-field">
                  <option value="">無</option>
                  {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">關聯合約</label>
                <select value={form.contract_id || ''} onChange={e => setForm({...form, contract_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                  <option value="">無</option>
                  {filteredContracts.map((c: any) => <option key={c.id} value={c.id}>{c.contract_no} - {c.contract_name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">工程名稱</label><input value={form.project_name || ''} onChange={e => setForm({...form, project_name: e.target.value})} className="input-field" /></div>
              <div className="lg:col-span-2"><label className="block text-sm font-medium text-gray-500 mb-1">工程地址</label><input value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">預計開始日期</label><input type="date" value={toInputDate(form.start_date)} onChange={e => setForm({...form, start_date: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">預計結束日期</label><input type="date" value={toInputDate(form.end_date)} onChange={e => setForm({...form, end_date: e.target.value})} className="input-field" /></div>
              <div className="lg:col-span-3"><label className="block text-sm font-medium text-gray-500 mb-1">說明</label><textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} /></div>
              <div className="lg:col-span-3"><label className="block text-sm font-medium text-gray-500 mb-1">備註</label><textarea value={form.remarks || ''} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={2} /></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">工程編號</p><p className="font-mono font-bold">{project?.project_no}</p></div>
              <div><p className="text-sm text-gray-500">工程名稱</p><p className="font-medium">{project?.project_name}</p></div>
              <div><p className="text-sm text-gray-500">開立公司</p><p>{project?.company?.internal_prefix} - {project?.company?.name}</p></div>
              <div><p className="text-sm text-gray-500">客戶</p><p>{project?.client?.name || '-'}</p></div>
              <div>
                <p className="text-sm text-gray-500">關聯合約</p>
                {project?.contract ? (
                  <Link href={`/contracts/${project.contract.id}`} className="font-mono text-primary-600 hover:underline">
                    {project.contract.contract_no} - {project.contract.contract_name}
                  </Link>
                ) : (
                  <p className="text-gray-400">-</p>
                )}
              </div>
              <div><p className="text-sm text-gray-500">工程地址</p><p>{project?.address || '-'}</p></div>
              <div><p className="text-sm text-gray-500">預計開始日期</p><p>{fmtDate(project?.start_date)}</p></div>
              <div><p className="text-sm text-gray-500">預計結束日期</p><p>{fmtDate(project?.end_date)}</p></div>
              {project?.description && <div className="lg:col-span-3"><p className="text-sm text-gray-500">說明</p><p>{project.description}</p></div>}
              {project?.remarks && <div className="lg:col-span-3"><p className="text-sm text-gray-500">備註</p><p>{project.remarks}</p></div>}
            </>
          )}
        </div>
      </div>

      {/* Linked Quotations */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">關聯報價單</h2>
        {linkedQuotations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left">報價單號</th>
                  <th className="px-3 py-2 text-left">日期</th>
                  <th className="px-3 py-2 text-left">客戶</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2 text-left">狀態</th>
                </tr>
              </thead>
              <tbody>
                {linkedQuotations.map((q: any) => (
                  <tr key={q.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/quotations/${q.id}`)}>
                    <td className="px-3 py-2 font-mono font-bold text-primary-600">{q.quotation_no}</td>
                    <td className="px-3 py-2">{fmtDate(q.quotation_date)}</td>
                    <td className="px-3 py-2">{q.client?.name || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono">${Number(q.total_amount).toLocaleString()}</td>
                    <td className="px-3 py-2"><span className={qStatusColors[q.status]}>{qStatusLabels[q.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">暫無關聯報價單</p>
        )}
      </div>

      {/* Linked Rate Cards */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">工程價目記錄</h2>
        {linkedRateCards.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left">名稱</th>
                  <th className="px-3 py-2 text-left">服務類型</th>
                  <th className="px-3 py-2 text-right">日間費率</th>
                  <th className="px-3 py-2 text-left">單位</th>
                  <th className="px-3 py-2 text-left">生效日期</th>
                  <th className="px-3 py-2 text-left">到期日期</th>
                  <th className="px-3 py-2 text-left">來源報價單</th>
                  <th className="px-3 py-2 text-left">狀態</th>
                </tr>
              </thead>
              <tbody>
                {linkedRateCards.map((rc: any) => (
                  <tr key={rc.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/rate-cards/${rc.id}`)}>
                    <td className="px-3 py-2">{rc.name || '-'}</td>
                    <td className="px-3 py-2">{rc.service_type || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono">${Number(rc.day_rate).toLocaleString()}</td>
                    <td className="px-3 py-2">{rc.day_unit || '-'}</td>
                    <td className="px-3 py-2">{fmtDate(rc.effective_date)}</td>
                    <td className="px-3 py-2">{fmtDate(rc.expiry_date)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{rc.source_quotation?.quotation_no || '-'}</td>
                    <td className="px-3 py-2"><span className={rc.status === 'active' ? 'badge-green' : 'badge-gray'}>{rc.status === 'active' ? '啟用' : '停用'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">暫無價目記錄</p>
        )}
      </div>
    </div>
  );
}
