'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { machineryApi, companiesApi } from '@/lib/api';
import DocumentUpload from '@/components/DocumentUpload';
import CustomFieldsBlock from '@/components/CustomFieldsBlock';
import Link from 'next/link';
import Modal from '@/components/Modal';

const machineTypes = ['挖掘機', '裝載機', '鉸接式自卸卡車', '履帶式裝載機', '推土機', '壓路機'];

function isExpiringSoon(date: string | null) {
  if (!date) return false;
  const diff = (new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 30 && diff >= 0;
}
function isExpired(date: string | null) {
  if (!date) return false;
  return new Date(date) < new Date();
}

export default function MachineryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [machine, setMachine] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ to_company_id: '', transfer_date: '', notes: '' });

  const loadData = () => {
    machineryApi.get(Number(params.id)).then(res => { setMachine(res.data); setForm(res.data); setLoading(false); }).catch(() => router.push('/machinery'));
  };

  useEffect(() => { loadData(); companiesApi.simple().then(res => setCompanies(res.data)); }, [params.id]);

  const handleSave = async () => {
    try {
      const { owner_company, transfers, created_at, updated_at, ...updateData } = form;
      const res = await machineryApi.update(machine.id, { ...updateData, tonnage: updateData.tonnage ? Number(updateData.tonnage) : null });
      setMachine(res.data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await machineryApi.transfer(machine.id, { from_company_id: machine.owner_company_id, to_company_id: Number(transferForm.to_company_id), transfer_date: transferForm.transfer_date, notes: transferForm.notes });
      setShowTransferModal(false);
      setTransferForm({ to_company_id: '', transfer_date: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '過戶失敗'); }
  };

  const dateStatusBadge = (date: string | null) => {
    if (!date) return <span className="text-gray-400">未設定</span>;
    if (isExpired(date)) return <span className="badge-red">{date} (已過期)</span>;
    if (isExpiringSoon(date)) return <span className="badge-yellow">{date} (即將到期)</span>;
    return <span className="badge-green">{date}</span>;
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/machinery" className="hover:text-primary-600">機械管理</Link><span>/</span><span className="text-gray-900">{machine?.machine_code}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{machine?.machine_code}</h1>
          <p className="text-gray-500">{machine?.brand} {machine?.model} | {machine?.machine_type} | {machine?.owner_company?.internal_prefix || machine?.owner_company?.name}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTransferModal(true)} className="btn-secondary">過戶</button>
          {editing ? (
            <><button onClick={() => { setForm(machine); setEditing(false); }} className="btn-secondary">取消</button><button onClick={handleSave} className="btn-primary">儲存</button></>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Machine Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">機械資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">機械編號</label><input value={form.machine_code || ''} onChange={e => setForm({...form, machine_code: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">類型</label><select value={form.machine_type || ''} onChange={e => setForm({...form, machine_type: e.target.value})} className="input-field">{machineTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">品牌</label><input value={form.brand || ''} onChange={e => setForm({...form, brand: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">型號</label><input value={form.model || ''} onChange={e => setForm({...form, model: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">噸數</label><input type="number" step="0.1" value={form.tonnage || ''} onChange={e => setForm({...form, tonnage: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">序號</label><input value={form.serial_number || ''} onChange={e => setForm({...form, serial_number: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">驗機紙到期日</label><input type="date" value={form.inspection_cert_expiry || ''} onChange={e => setForm({...form, inspection_cert_expiry: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">保險到期日</label><input type="date" value={form.insurance_expiry || ''} onChange={e => setForm({...form, insurance_expiry: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field"><option value="active">使用中</option><option value="maintenance">維修中</option><option value="inactive">停用</option></select></div>
              <div className="md:col-span-3"><label className="block text-sm font-medium text-gray-500 mb-1">備註</label><textarea value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className="input-field" rows={2} /></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">機械編號</p><p className="font-mono font-bold text-lg">{machine?.machine_code}</p></div>
              <div><p className="text-sm text-gray-500">類型</p><p>{machine?.machine_type || '-'}</p></div>
              <div><p className="text-sm text-gray-500">品牌</p><p>{machine?.brand || '-'}</p></div>
              <div><p className="text-sm text-gray-500">型號</p><p>{machine?.model || '-'}</p></div>
              <div><p className="text-sm text-gray-500">噸數</p><p>{machine?.tonnage ? `${machine.tonnage}T` : '-'}</p></div>
              <div><p className="text-sm text-gray-500">序號</p><p>{machine?.serial_number || '-'}</p></div>
              <div><p className="text-sm text-gray-500">所屬公司</p><p className="font-medium">{machine?.owner_company?.internal_prefix} - {machine?.owner_company?.name}</p></div>
              <div><p className="text-sm text-gray-500">驗機紙到期日</p><p className="mt-1">{dateStatusBadge(machine?.inspection_cert_expiry)}</p></div>
              <div><p className="text-sm text-gray-500">保險到期日</p><p className="mt-1">{dateStatusBadge(machine?.insurance_expiry)}</p></div>
              <div><p className="text-sm text-gray-500">狀態</p><p><span className={machine?.status === 'active' ? 'badge-green' : machine?.status === 'maintenance' ? 'badge-yellow' : 'badge-red'}>{machine?.status === 'active' ? '使用中' : machine?.status === 'maintenance' ? '維修中' : '停用'}</span></p></div>
              {machine?.notes && <div className="md:col-span-3"><p className="text-sm text-gray-500">備註</p><p>{machine.notes}</p></div>}
            </>
          )}
        </div>
      </div>

      {/* Custom Fields */}
      <div className="card mb-6">
        <CustomFieldsBlock module="machinery" entityId={machine?.id} />
      </div>

      {/* Documents */}
      <div className="card mb-6">
        <DocumentUpload entityType="machinery" entityId={machine?.id} docTypes={['驗機紙', '保險單', '買賣合約', '其他']} />
      </div>

      {/* Transfer History */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">過戶紀錄</h2>
          <button onClick={() => setShowTransferModal(true)} className="text-sm text-primary-600 hover:underline">過戶</button>
        </div>
        {machine?.transfers?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-left">原公司</th><th className="px-3 py-2 text-center">→</th><th className="px-3 py-2 text-left">新公司</th><th className="px-3 py-2 text-left">備註</th></tr></thead>
              <tbody>
                {machine.transfers.map((t: any) => (
                  <tr key={t.id} className="border-b">
                    <td className="px-3 py-2">{t.transfer_date}</td>
                    <td className="px-3 py-2">{t.from_company?.internal_prefix || t.from_company?.name}</td>
                    <td className="px-3 py-2 text-center text-gray-400">→</td>
                    <td className="px-3 py-2">{t.to_company?.internal_prefix || t.to_company?.name}</td>
                    <td className="px-3 py-2 text-gray-500">{t.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-gray-500 text-sm">暫無過戶紀錄</p>}
      </div>

      {/* Transfer Modal */}
      <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title="機械過戶">
        <form onSubmit={handleTransfer} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">目前公司</label><input value={machine?.owner_company?.internal_prefix ? `${machine.owner_company.internal_prefix} - ${machine.owner_company.name}` : machine?.owner_company?.name} className="input-field bg-gray-50" disabled /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">過戶至 *</label>
            <select value={transferForm.to_company_id} onChange={e => setTransferForm({...transferForm, to_company_id: e.target.value})} className="input-field" required>
              <option value="">請選擇</option>
              {companies.filter(c => c.id !== machine?.owner_company_id).map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">過戶日期 *</label><input type="date" value={transferForm.transfer_date} onChange={e => setTransferForm({...transferForm, transfer_date: e.target.value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={transferForm.notes} onChange={e => setTransferForm({...transferForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowTransferModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">確認過戶</button></div>
        </form>
      </Modal>
    </div>
  );
}
