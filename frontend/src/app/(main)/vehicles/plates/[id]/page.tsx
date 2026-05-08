'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Modal from '@/components/Modal';
import DateInput from '@/components/DateInput';
import { companiesApi, vehiclePlatesApi, vehiclesApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

export default function VehiclePlateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [plate, setPlate] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignHistoryModal, setShowAssignHistoryModal] = useState(false);
  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({ vehicle_id: '', assigned_date: '', removed_date: '', notes: '' });
  const [transferForm, setTransferForm] = useState({ from_company_id: '', to_company_id: '', transfer_date: '', notes: '' });

  const loadData = async () => {
    try {
      const [plateRes, companyRes, vehicleRes] = await Promise.all([
        vehiclePlatesApi.get(Number(params.id)),
        companiesApi.simple(),
        vehiclesApi.list({ status: 'not_scrapped', limit: 1000, sortBy: 'plate_number', sortOrder: 'ASC' }),
      ]);
      setPlate(plateRes.data);
      setCompanies(companyRes.data || []);
      setVehicles(vehicleRes.data?.data || []);
      setLoading(false);
    } catch {
      router.push('/vehicles');
    }
  };

  useEffect(() => { loadData(); }, [params.id]);

  const renderCompany = (company: any) => company?.internal_prefix ? `${company.internal_prefix} - ${company.name}` : company?.name || '-';

  const historyItems = useMemo(() => {
    const assignments = (plate?.assignments || []).map((a: any) => ({
      id: `assignment-${a.id}`,
      type: '套牌/拆牌',
      date: a.assigned_date,
      sortDate: a.assigned_date,
      title: `${plate?.plate_number} 套用至 ${a.vehicle?.plate_number || '車輛'}`,
      detail: `套牌日期：${fmtDate(a.assigned_date)}${a.removed_date ? `；拆牌日期：${fmtDate(a.removed_date)}` : '；目前使用中'}`,
      notes: a.notes,
    }));
    const transfers = (plate?.transfers || []).map((t: any) => ({
      id: `transfer-${t.id}`,
      type: '過戶',
      date: t.transfer_date,
      sortDate: t.transfer_date,
      title: `${renderCompany(t.from_company)} → ${renderCompany(t.to_company)}`,
      detail: `過戶日期：${fmtDate(t.transfer_date)}`,
      notes: t.notes,
    }));
    return [...assignments, ...transfers].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  }, [plate]);

  const handleAddAssignmentHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclePlatesApi.addAssignmentHistory(plate.id, { vehicle_id: Number(assignmentForm.vehicle_id), assigned_date: assignmentForm.assigned_date, removed_date: assignmentForm.removed_date || null, notes: assignmentForm.notes });
      setShowAssignHistoryModal(false);
      setAssignmentForm({ vehicle_id: '', assigned_date: '', removed_date: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '新增套牌歷史失敗'); }
  };

  const handleAddTransferHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclePlatesApi.addTransferHistory(plate.id, { from_company_id: Number(transferForm.from_company_id), to_company_id: Number(transferForm.to_company_id), transfer_date: transferForm.transfer_date, notes: transferForm.notes });
      setShowTransferHistoryModal(false);
      setTransferForm({ from_company_id: '', to_company_id: '', transfer_date: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '新增過戶歷史失敗'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/vehicles" className="hover:text-primary-600">車輛管理</Link><span>/</span><span className="text-gray-900 font-mono">{plate?.plate_number}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{plate?.plate_number}</h1>
          <p className="text-gray-500">{renderCompany(plate?.owner_company)} · {plate?.status === 'in_use' ? '使用中' : '閒置'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowAssignHistoryModal(true)} className="btn-secondary">新增套牌/拆牌歷史</button>
          <button onClick={() => setShowTransferHistoryModal(true)} className="btn-secondary">新增過戶歷史</button>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">車牌資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><p className="text-sm text-gray-500">車牌號碼</p><p className="font-mono font-bold text-lg">{plate?.plate_number}</p></div>
          <div><p className="text-sm text-gray-500">持有公司</p><p>{renderCompany(plate?.owner_company)}</p></div>
          <div><p className="text-sm text-gray-500">狀態</p><p><span className={plate?.status === 'in_use' ? 'badge-green' : 'badge-yellow'}>{plate?.status === 'in_use' ? '使用中' : '閒置'}</span></p></div>
          <div><p className="text-sm text-gray-500">目前車輛</p><p>{plate?.current_vehicle ? <Link className="text-primary-600 hover:underline" href={`/vehicles/${plate.current_vehicle.id}`}>{plate.current_vehicle.plate_number} {plate.current_vehicle.brand || ''} {plate.current_vehicle.model || ''}</Link> : '-'}</p></div>
          <div><p className="text-sm text-gray-500">建立時間</p><p>{fmtDate(plate?.created_at)}</p></div>
          <div><p className="text-sm text-gray-500">更新時間</p><p>{fmtDate(plate?.updated_at)}</p></div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">車牌歷史紀錄</h2>
          <div className="flex gap-3 text-sm"><button onClick={() => setShowAssignHistoryModal(true)} className="text-primary-600 hover:underline">新增套牌/拆牌紀錄</button><button onClick={() => setShowTransferHistoryModal(true)} className="text-primary-600 hover:underline">新增過戶紀錄</button></div>
        </div>
        {historyItems.length > 0 ? (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-left">類型</th><th className="px-3 py-2 text-left">內容</th><th className="px-3 py-2 text-left">詳細</th><th className="px-3 py-2 text-left">備註</th></tr></thead><tbody>{historyItems.map((h: any) => <tr key={h.id} className="border-b"><td className="px-3 py-2">{fmtDate(h.date)}</td><td className="px-3 py-2"><span className={h.type === '過戶' ? 'badge-yellow' : 'badge-green'}>{h.type}</span></td><td className="px-3 py-2">{h.title}</td><td className="px-3 py-2 text-gray-600">{h.detail}</td><td className="px-3 py-2 text-gray-500">{h.notes || '-'}</td></tr>)}</tbody></table></div>
        ) : <p className="text-gray-500 text-sm">暫無歷史紀錄</p>}
      </div>

      <Modal isOpen={showAssignHistoryModal} onClose={() => setShowAssignHistoryModal(false)} title="新增套牌/拆牌歷史紀錄">
        <form onSubmit={handleAddAssignmentHistory} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">車輛 *</label><select value={assignmentForm.vehicle_id} onChange={e => setAssignmentForm({...assignmentForm, vehicle_id: e.target.value})} className="input-field" required><option value="">請選擇</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number} — {v.brand || ''} {v.model || ''}</option>)}</select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">套牌日期 *</label><DateInput value={assignmentForm.assigned_date} onChange={value => setAssignmentForm({...assignmentForm, assigned_date: value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">拆牌日期</label><DateInput value={assignmentForm.removed_date} onChange={value => setAssignmentForm({...assignmentForm, removed_date: value})} className="input-field" /><p className="text-xs text-gray-500 mt-1">如為目前使用中可留空；手動補錄不會改變目前套牌狀態。</p></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={assignmentForm.notes} onChange={e => setAssignmentForm({...assignmentForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowAssignHistoryModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">新增歷史紀錄</button></div>
        </form>
      </Modal>

      <Modal isOpen={showTransferHistoryModal} onClose={() => setShowTransferHistoryModal(false)} title="新增車牌過戶歷史紀錄">
        <form onSubmit={handleAddTransferHistory} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">原公司 *</label><select value={transferForm.from_company_id} onChange={e => setTransferForm({...transferForm, from_company_id: e.target.value})} className="input-field" required><option value="">請選擇</option>{companies.map(c => <option key={c.id} value={c.id}>{renderCompany(c)}</option>)}</select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">新公司 *</label><select value={transferForm.to_company_id} onChange={e => setTransferForm({...transferForm, to_company_id: e.target.value})} className="input-field" required><option value="">請選擇</option>{companies.map(c => <option key={c.id} value={c.id}>{renderCompany(c)}</option>)}</select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">過戶日期 *</label><DateInput value={transferForm.transfer_date} onChange={value => setTransferForm({...transferForm, transfer_date: value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={transferForm.notes} onChange={e => setTransferForm({...transferForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowTransferHistoryModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">新增歷史紀錄</button></div>
        </form>
      </Modal>
    </div>
  );
}
