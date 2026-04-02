'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { contractsApi, partnersApi, projectsApi } from '@/lib/api';
import Link from 'next/link';
import { fmtDate, toInputDate } from '@/lib/dateUtils';

const statusLabels: Record<string, string> = {
  active: '進行中', completed: '已完成', cancelled: '已取消',
};
const statusColors: Record<string, string> = {
  active: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red',
};
const pStatusLabels: Record<string, string> = {
  pending: '等待', active: '進行中', completed: '已完成', cancelled: '已取消',
};
const pStatusColors: Record<string, string> = {
  pending: 'badge-yellow', active: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red',
};

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [contract, setContract] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkedProjects, setLinkedProjects] = useState<any[]>([]);

  const loadData = () => {
    contractsApi.get(Number(params.id)).then(res => {
      setContract(res.data);
      setForm({ ...res.data });
      setLoading(false);
    }).catch(() => router.push('/contracts'));
  };

  const loadLinkedProjects = () => {
    projectsApi.list({ contract_id: Number(params.id), limit: 100 })
      .then(res => setLinkedProjects(res.data?.data || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
    loadLinkedProjects();
    partnersApi.simple().then(res => {
      setClients((res.data || []).filter((p: any) => p.partner_type === 'client'));
    });
  }, [params.id]);

  const handleSave = async () => {
    try {
      const { client, _count, created_at, updated_at, ...updateData } = form;
      if (updateData.original_amount !== undefined) {
        updateData.original_amount = Number(updateData.original_amount) || 0;
      }
      if (updateData.client_id) updateData.client_id = Number(updateData.client_id);
      const res = await contractsApi.update(contract.id, updateData);
      setContract(res.data);
      setForm({ ...res.data });
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此合約嗎？')) return;
    try {
      await contractsApi.delete(contract.id);
      router.push('/contracts');
    } catch (err: any) { alert(err.response?.data?.message || '刪除失敗'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/contracts" className="hover:text-primary-600">合約管理</Link><span>/</span><span className="text-gray-900">{contract?.contract_no}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{contract?.contract_no}</h1>
            <span className={statusColors[contract?.status]}>{statusLabels[contract?.status]}</span>
          </div>
          <p className="text-gray-500 mt-1">{contract?.contract_name}</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => { setForm({ ...contract }); setEditing(false); }} className="btn-secondary">取消</button>
              <button onClick={handleSave} className="btn-primary">儲存</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
              {(contract?._count?.projects || 0) === 0 && (
                <button onClick={handleDelete} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">刪除</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Contract Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">合約資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">合約編號</label>
                <input value={form.contract_no || ''} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" />
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
                <select value={form.client_id || ''} onChange={e => setForm({...form, client_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                  <option value="">請選擇</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ${c.name}` : c.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">合約名稱</label>
                <input value={form.contract_name || ''} onChange={e => setForm({...form, contract_name: e.target.value})} className="input-field" />
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">合約金額</label>
                <input type="number" step="0.01" value={form.original_amount || ''} onChange={e => setForm({...form, original_amount: e.target.value})} className="input-field" />
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
                <select value={form.status || 'active'} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                  <option value="active">進行中</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">簽約日期</label>
                <input type="date" value={toInputDate(form.sign_date)} onChange={e => setForm({...form, sign_date: e.target.value})} className="input-field" />
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">開始日期</label>
                <input type="date" value={toInputDate(form.start_date)} onChange={e => setForm({...form, start_date: e.target.value})} className="input-field" />
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">結束日期</label>
                <input type="date" value={toInputDate(form.end_date)} onChange={e => setForm({...form, end_date: e.target.value})} className="input-field" />
              </div>
              <div className="lg:col-span-3"><label className="block text-sm font-medium text-gray-500 mb-1">說明</label>
                <textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={3} />
              </div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">合約編號</p><p className="font-mono font-bold">{contract?.contract_no}</p></div>
              <div><p className="text-sm text-gray-500">合約名稱</p><p className="font-medium">{contract?.contract_name}</p></div>
              <div><p className="text-sm text-gray-500">客戶</p><p>{contract?.client?.name || '-'}</p></div>
              <div><p className="text-sm text-gray-500">合約金額</p><p className="font-mono">${Number(contract?.original_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
              <div><p className="text-sm text-gray-500">狀態</p><p><span className={statusColors[contract?.status]}>{statusLabels[contract?.status]}</span></p></div>
              <div><p className="text-sm text-gray-500">簽約日期</p><p>{fmtDate(contract?.sign_date)}</p></div>
              <div><p className="text-sm text-gray-500">開始日期</p><p>{fmtDate(contract?.start_date)}</p></div>
              <div><p className="text-sm text-gray-500">結束日期</p><p>{fmtDate(contract?.end_date)}</p></div>
              {contract?.description && <div className="lg:col-span-3"><p className="text-sm text-gray-500">說明</p><p>{contract.description}</p></div>}
            </>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-sm text-gray-500">關聯項目</p>
          <p className="text-2xl font-bold text-primary-600">{contract?._count?.projects || 0}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">關聯支出</p>
          <p className="text-2xl font-bold text-orange-600">{contract?._count?.expenses || 0}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">合約金額</p>
          <p className="text-2xl font-bold text-green-600">${Number(contract?.original_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Linked Projects */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">關聯工程項目</h2>
        {linkedProjects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left">工程編號</th>
                  <th className="px-3 py-2 text-left">工程名稱</th>
                  <th className="px-3 py-2 text-left">公司</th>
                  <th className="px-3 py-2 text-left">開始日期</th>
                  <th className="px-3 py-2 text-left">結束日期</th>
                  <th className="px-3 py-2 text-left">狀態</th>
                </tr>
              </thead>
              <tbody>
                {linkedProjects.map((p: any) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                    <td className="px-3 py-2 font-mono font-bold text-primary-600">{p.project_no}</td>
                    <td className="px-3 py-2">{p.project_name || '-'}</td>
                    <td className="px-3 py-2">{p.company?.internal_prefix || p.company?.name || '-'}</td>
                    <td className="px-3 py-2">{fmtDate(p.start_date)}</td>
                    <td className="px-3 py-2">{fmtDate(p.end_date)}</td>
                    <td className="px-3 py-2"><span className={pStatusColors[p.status] || 'badge-gray'}>{pStatusLabels[p.status] || p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">暫無關聯工程項目</p>
        )}
      </div>
    </div>
  );
}
