'use client';
import { useState, useEffect } from 'react';
import DateInput from '@/components/DateInput';
import { useParams, useRouter } from 'next/navigation';
import { vehiclesApi, companiesApi, fieldOptionsApi } from '@/lib/api';
import DocumentUpload from '@/components/DocumentUpload';
import CustomFieldsBlock from '@/components/CustomFieldsBlock';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';

// Fallback vehicle types
const DEFAULT_VEHICLE_TYPES = ['泥頭車', '夾車', '勾斗車', '吊車', '拖架', '拖頭', '輕型貨車', '領航車'];

function isExpiringSoon(date: string | null) {
  if (!date) return false;
  const diff = (new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 30 && diff >= 0;
}
function isExpired(date: string | null) {
  if (!date) return false;
  return new Date(date) < new Date();
}

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [vehicle, setVehicle] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>(DEFAULT_VEHICLE_TYPES);
  const [showPlateModal, setShowPlateModal] = useState(false);
  const [showRemovePlateModal, setShowRemovePlateModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showManualTransferModal, setShowManualTransferModal] = useState(false);
  const [showHistoryEventModal, setShowHistoryEventModal] = useState(false);
  const [plateForm, setPlateForm] = useState({ new_plate: '', change_date: '', notes: '' });
  const [removePlateForm, setRemovePlateForm] = useState({ remove_date: '', notes: '' });
  const [transferForm, setTransferForm] = useState({ to_company_id: '', transfer_date: '', notes: '' });
  const [manualTransferForm, setManualTransferForm] = useState({ from_company_id: '', to_company_id: '', transfer_date: '', notes: '' });
  const [historyEventForm, setHistoryEventForm] = useState({ event_date: '', event_type: '', description: '' });

  const loadData = () => {
    vehiclesApi.get(Number(params.id)).then(res => { setVehicle(res.data); setForm(res.data); setLoading(false); }).catch(() => router.push('/vehicles'));
  };

  useEffect(() => {
    loadData();
    companiesApi.simple().then(res => setCompanies(res.data));
    fieldOptionsApi.getByCategory('machine_type').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active).map((o: any) => o.label);
      if (opts.length > 0) setVehicleTypes(opts);
    }).catch(() => {});
  }, [params.id]);

  const handleSave = async () => {
    try {
      const { owner_company, plate_history, plate_assignments, transfers, history_events, current_plate, created_at, updated_at, ...updateData } = form;
      const res = await vehiclesApi.update(vehicle.id, { ...updateData, tonnage: updateData.tonnage ? Number(updateData.tonnage) : null });
      setVehicle(res.data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const handleChangePlate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclesApi.changePlate(vehicle.id, plateForm);
      setShowPlateModal(false);
      setPlateForm({ new_plate: '', change_date: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '更換失敗'); }
  };

  const handleRemovePlate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclesApi.removePlate(vehicle.id, removePlateForm);
      setShowRemovePlateModal(false);
      setRemovePlateForm({ remove_date: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '移除車牌失敗'); }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclesApi.transfer(vehicle.id, { from_company_id: vehicle.owner_company_id, to_company_id: Number(transferForm.to_company_id), transfer_date: transferForm.transfer_date, notes: transferForm.notes });
      setShowTransferModal(false);
      setTransferForm({ to_company_id: '', transfer_date: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '過戶失敗'); }
  };

  const handleAddTransferHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclesApi.addTransferHistory(vehicle.id, { from_company_id: Number(manualTransferForm.from_company_id), to_company_id: Number(manualTransferForm.to_company_id), transfer_date: manualTransferForm.transfer_date, notes: manualTransferForm.notes });
      setShowManualTransferModal(false);
      setManualTransferForm({ from_company_id: '', to_company_id: '', transfer_date: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '新增歷史紀錄失敗'); }
  };

  const handleAddHistoryEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclesApi.addHistoryEvent(vehicle.id, historyEventForm);
      setShowHistoryEventModal(false);
      setHistoryEventForm({ event_date: '', event_type: '', description: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '新增自定義歷史失敗'); }
  };

  const handleScrap = async () => {
    const plate = vehicle?.current_plate?.plate_number || vehicle?.plate_number;
    if (!confirm(`確定要將此車輛標記為已劏車？車牌 ${plate || '-'} 將變為閒置狀態。`)) return;
    try { await vehiclesApi.scrap(vehicle.id); loadData(); } catch (err: any) { alert(err.response?.data?.message || '劏車失敗'); }
  };

  const handleRestore = async () => {
    if (!confirm('確定要復原此已劏車車輛？')) return;
    try { await vehiclesApi.restore(vehicle.id); loadData(); } catch (err: any) { alert(err.response?.data?.message || '復原失敗'); }
  };

  const timelineEvents = [
    ...(vehicle?.plate_assignments || []).flatMap((a: any) => {
      const plate = a.plate?.plate_number || vehicle?.plate_number || '-';
      const events: any[] = [{ key: `plate-assigned-${a.id}`, date: a.assigned_date, type: '車牌套牌', description: `套用車牌 ${plate}`, notes: a.notes }];
      if (a.removed_date) events.push({ key: `plate-removed-${a.id}`, date: a.removed_date, type: '車牌拆牌', description: `拆除車牌 ${plate}`, notes: a.notes });
      return events;
    }),
    ...(vehicle?.transfers || []).map((t: any) => ({
      key: `transfer-${t.id}`,
      date: t.transfer_date,
      type: '車輛過戶',
      description: `${t.from_company?.internal_prefix || t.from_company?.name || '-'} → ${t.to_company?.internal_prefix || t.to_company?.name || '-'}`,
      notes: t.notes,
    })),
    ...(vehicle?.history_events || []).map((e: any) => ({ key: `custom-${e.id}`, date: e.event_date, type: e.event_type, description: e.description, notes: '' })),
  ].filter((e: any) => e.date).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const dateStatusBadge = (date: string | null) => {
    if (!date) return <span className="text-gray-400">未設定</span>;
    if (isExpired(date)) return <span className="badge-red">{fmtDate(date)} (已過期)</span>;
    if (isExpiringSoon(date)) return <span className="badge-yellow">{fmtDate(date)} (即將到期)</span>;
    return <span className="badge-green">{fmtDate(date)}</span>;
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/vehicles" className="hover:text-primary-600">車輛管理</Link><span>/</span><span className="text-gray-900">{vehicle?.plate_number}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{vehicle?.plate_number}</h1>
          <p className="text-gray-500">{vehicle?.machine_type} | {vehicle?.owner_company?.internal_prefix || vehicle?.owner_company?.name}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {vehicle?.status === 'scrapped' ? (
            <button onClick={handleRestore} className="btn-primary">復原</button>
          ) : (
            <>
              <button onClick={() => setShowPlateModal(true)} className="btn-secondary">更換車牌</button>
              {(vehicle?.current_plate_id || vehicle?.current_plate || vehicle?.plate_number) && <button onClick={() => setShowRemovePlateModal(true)} className="btn-secondary">移除車牌</button>}
              <button onClick={() => setShowTransferModal(true)} className="btn-secondary">過戶</button>
              <button onClick={handleScrap} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">劏車</button>
              {editing ? (
                <><button onClick={() => { setForm(vehicle); setEditing(false); }} className="btn-secondary">取消</button><button onClick={handleSave} className="btn-primary">儲存</button></>
              ) : (
                <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Vehicle Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">車輛資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">車牌</label><input value={form.plate_number || ''} className="input-field bg-gray-50" disabled /><p className="text-xs text-gray-400 mt-1">請使用「更換車牌」功能</p></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">車型</label><select value={form.machine_type || ''} onChange={e => setForm({...form, machine_type: e.target.value})} className="input-field">{vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">噸數</label><input type="number" step="0.1" value={form.tonnage || ''} onChange={e => setForm({...form, tonnage: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">品牌</label><input value={form.brand || ''} onChange={e => setForm({...form, brand: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">型號</label><input value={form.model || ''} onChange={e => setForm({...form, model: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field"><option value="active">使用中</option><option value="maintenance">維修中</option><option value="inactive">停用</option></select></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">首次登記日期</label><DateInput value={form.vehicle_first_reg_date?.slice(0, 10) || ''} onChange={value => setForm({...form, vehicle_first_reg_date: value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">底盤號碼</label><input value={form.vehicle_chassis_no || ''} onChange={e => setForm({...form, vehicle_chassis_no: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">原身車牌</label><input value={form.vehicle_original_plate || ''} onChange={e => setForm({...form, vehicle_original_plate: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">車主名稱</label><input value={form.vehicle_owner_name || ''} onChange={e => setForm({...form, vehicle_owner_name: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">GPS</label>
                <select value={form.vehicle_has_gps === true ? 'true' : form.vehicle_has_gps === false ? 'false' : ''} onChange={e => setForm({...form, vehicle_has_gps: e.target.value === 'true' ? true : e.target.value === 'false' ? false : null})} className="input-field">
                  <option value="">未設定</option>
                  <option value="true">有</option>
                  <option value="false">無</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">保險到期日</label><DateInput value={form.insurance_expiry?.slice(0, 10) || ''} onChange={value => setForm({...form, insurance_expiry: value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">驗車到期日</label><DateInput value={form.inspection_date?.slice(0, 10) || ''} onChange={value => setForm({...form, inspection_date: value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">行車證到期日</label><DateInput value={form.license_expiry?.slice(0, 10) || ''} onChange={value => setForm({...form, license_expiry: value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">泥尾到期日</label><DateInput value={form.vehicle_mud_tail_expiry?.slice(0, 10) || ''} onChange={value => setForm({...form, vehicle_mud_tail_expiry: value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">電子通訊</label><input value={form.vehicle_electronic_comm || ''} onChange={e => setForm({...form, vehicle_electronic_comm: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">易通行</label><input value={form.vehicle_autotoll || ''} onChange={e => setForm({...form, vehicle_autotoll: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">易通行已取</label><input value={form.vehicle_autotoll_collected || ''} onChange={e => setForm({...form, vehicle_autotoll_collected: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">保險代理公司</label><input value={form.vehicle_insurance_agent || ''} onChange={e => setForm({...form, vehicle_insurance_agent: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">保險公司</label><input value={form.vehicle_insurance_company || ''} onChange={e => setForm({...form, vehicle_insurance_company: e.target.value})} className="input-field" /></div>
              <div className="md:col-span-3"><label className="block text-sm font-medium text-gray-500 mb-1">驗車備註</label><textarea value={form.vehicle_inspection_notes || ''} onChange={e => setForm({...form, vehicle_inspection_notes: e.target.value})} className="input-field" rows={2} /></div>
              <div className="md:col-span-3"><label className="block text-sm font-medium text-gray-500 mb-1">備註</label><textarea value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className="input-field" rows={2} /></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">車牌</p><p className="font-mono font-bold text-lg">{vehicle?.plate_number}</p></div>
              <div><p className="text-sm text-gray-500">車型</p><p>{vehicle?.machine_type || '-'}</p></div>
              <div><p className="text-sm text-gray-500">噸數</p><p>{vehicle?.tonnage ? `${vehicle.tonnage}T` : '-'}</p></div>
              <div><p className="text-sm text-gray-500">品牌</p><p>{vehicle?.brand || '-'}</p></div>
              <div><p className="text-sm text-gray-500">型號</p><p>{vehicle?.model || '-'}</p></div>
              <div><p className="text-sm text-gray-500">車主</p><p className="font-medium">{vehicle?.owner_company?.internal_prefix ? `${vehicle.owner_company.internal_prefix} - ${vehicle.owner_company.name}` : vehicle?.owner_company?.name || '-'}</p></div>
              <div><p className="text-sm text-gray-500">狀態</p><p><span className={vehicle?.status === 'active' ? 'badge-green' : vehicle?.status === 'maintenance' ? 'badge-yellow' : 'badge-red'}>{vehicle?.status === 'active' ? '使用中' : vehicle?.status === 'maintenance' ? '維修中' : vehicle?.status === 'scrapped' ? '已劏車' : '停用'}</span></p></div>
              <div><p className="text-sm text-gray-500">首次登記日期</p><p>{fmtDate(vehicle?.vehicle_first_reg_date) || '-'}</p></div>
              <div><p className="text-sm text-gray-500">底盤號碼</p><p className="font-mono text-sm">{vehicle?.vehicle_chassis_no || '-'}</p></div>
              <div><p className="text-sm text-gray-500">原身車牌</p><p className="font-mono">{vehicle?.vehicle_original_plate || '-'}</p></div>
              {vehicle?.vehicle_owner_name && (
                <div><p className="text-sm text-gray-500">車主名稱</p><p>{vehicle.vehicle_owner_name}</p></div>
              )}
              <div><p className="text-sm text-gray-500">GPS</p><p>{vehicle?.vehicle_has_gps === true ? '有' : vehicle?.vehicle_has_gps === false ? '無' : '-'}</p></div>
            </>
          )}
        </div>
      </div>

      {/* Date Tracking */}
      {!editing && (
        <div className="card mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">日期追蹤</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><p className="text-sm text-gray-500">保險到期日</p><p className="mt-1">{dateStatusBadge(vehicle?.insurance_expiry)}</p></div>
            <div><p className="text-sm text-gray-500">驗車到期日</p><p className="mt-1">{dateStatusBadge(vehicle?.inspection_date)}</p></div>
            <div><p className="text-sm text-gray-500">行車證到期日</p><p className="mt-1">{dateStatusBadge(vehicle?.license_expiry)}</p></div>
            <div><p className="text-sm text-gray-500">泥尾到期日</p><p className="mt-1">{dateStatusBadge(vehicle?.vehicle_mud_tail_expiry)}</p></div>
          </div>
        </div>
      )}

      {/* Insurance & Autotoll Info */}
      {!editing && (
        <div className="card mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">保險及易通行</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><p className="text-sm text-gray-500">保險代理公司</p><p>{vehicle?.vehicle_insurance_agent || '-'}</p></div>
            <div><p className="text-sm text-gray-500">保險公司</p><p>{vehicle?.vehicle_insurance_company || '-'}</p></div>
            <div><p className="text-sm text-gray-500">電子通訊</p><p>{vehicle?.vehicle_electronic_comm || '-'}</p></div>
            <div><p className="text-sm text-gray-500">易通行</p><p className="font-mono text-sm">{vehicle?.vehicle_autotoll || '-'}</p></div>
            <div><p className="text-sm text-gray-500">易通行已取</p><p>{vehicle?.vehicle_autotoll_collected || '-'}</p></div>
          </div>
          {vehicle?.vehicle_inspection_notes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500 mb-1">驗車備註</p>
              <p className="text-sm whitespace-pre-wrap">{vehicle.vehicle_inspection_notes}</p>
            </div>
          )}
          {vehicle?.notes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500 mb-1">備註</p>
              <p className="text-sm whitespace-pre-wrap">{vehicle.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Vehicle Timeline */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">車輛歷史時間線</h2>
          <div className="flex gap-3 text-sm flex-wrap justify-end">
            {vehicle?.status !== 'scrapped' && <button onClick={() => setShowPlateModal(true)} className="text-primary-600 hover:underline">更換車牌</button>}
            {vehicle?.status !== 'scrapped' && (vehicle?.current_plate_id || vehicle?.current_plate || vehicle?.plate_number) && <button onClick={() => setShowRemovePlateModal(true)} className="text-primary-600 hover:underline">移除車牌</button>}
            {vehicle?.status !== 'scrapped' && <button onClick={() => setShowTransferModal(true)} className="text-primary-600 hover:underline">過戶</button>}
            <button onClick={() => setShowManualTransferModal(true)} className="text-primary-600 hover:underline">新增過戶歷史</button>
            <button onClick={() => setShowHistoryEventModal(true)} className="text-primary-600 hover:underline">新增自定義歷史</button>
          </div>
        </div>
        {timelineEvents.length > 0 ? (
          <div className="space-y-3">
            {timelineEvents.map((event: any) => (
              <div key={event.key} className="flex gap-4 border-l-2 border-primary-200 pl-4 py-2">
                <div className="w-28 flex-shrink-0 text-sm font-mono text-gray-600">{fmtDate(event.date)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs font-medium">{event.type}</span>
                    <span className="font-medium text-gray-900">{event.description}</span>
                  </div>
                  {event.notes && <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{event.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-gray-500 text-sm">暫無歷史紀錄</p>}
      </div>

      {/* Documents */}
      <div className="card mb-6">
        <CustomFieldsBlock module="vehicle" entityId={vehicle?.id} />
      </div>

      <div className="card mb-6">
        <DocumentUpload entityType="vehicle" entityId={vehicle?.id} docTypes={['牌簿', '行車證', '保險單', '貸款文件', '買賣合約', '其他']} />
      </div>

      {/* Change Plate Modal */}
      <Modal isOpen={showPlateModal} onClose={() => setShowPlateModal(false)} title="更換車牌">
        <form onSubmit={handleChangePlate} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">目前車牌</label><input value={vehicle?.plate_number} className="input-field bg-gray-50 font-mono" disabled /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">新車牌 *</label><input value={plateForm.new_plate} onChange={e => setPlateForm({...plateForm, new_plate: e.target.value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">變更日期 *</label><DateInput value={plateForm.change_date} onChange={value => setPlateForm({...plateForm, change_date: value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={plateForm.notes} onChange={e => setPlateForm({...plateForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowPlateModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">確認更換</button></div>
        </form>
      </Modal>

      {/* Remove Plate Modal */}
      <Modal isOpen={showRemovePlateModal} onClose={() => setShowRemovePlateModal(false)} title="移除車牌">
        <form onSubmit={handleRemovePlate} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">目前車牌</label><input value={vehicle?.current_plate?.plate_number || vehicle?.plate_number || ''} className="input-field bg-gray-50 font-mono" disabled /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">移除日期 *</label><DateInput value={removePlateForm.remove_date} onChange={value => setRemovePlateForm({...removePlateForm, remove_date: value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={removePlateForm.notes} onChange={e => setRemovePlateForm({...removePlateForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowRemovePlateModal(false)} className="btn-secondary">取消</button><button type="submit" className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">確認移除</button></div>
        </form>
      </Modal>

      {/* Manual Transfer History Modal */}
      <Modal isOpen={showManualTransferModal} onClose={() => setShowManualTransferModal(false)} title="新增車輛過戶歷史紀錄">
        <form onSubmit={handleAddTransferHistory} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">原公司 *</label>
            <select value={manualTransferForm.from_company_id} onChange={e => setManualTransferForm({...manualTransferForm, from_company_id: e.target.value})} className="input-field" required>
              <option value="">請選擇</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">新公司 *</label>
            <select value={manualTransferForm.to_company_id} onChange={e => setManualTransferForm({...manualTransferForm, to_company_id: e.target.value})} className="input-field" required>
              <option value="">請選擇</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">過戶日期 *</label><DateInput value={manualTransferForm.transfer_date} onChange={value => setManualTransferForm({...manualTransferForm, transfer_date: value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={manualTransferForm.notes} onChange={e => setManualTransferForm({...manualTransferForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowManualTransferModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">新增歷史紀錄</button></div>
        </form>
      </Modal>

      {/* Custom History Event Modal */}
      <Modal isOpen={showHistoryEventModal} onClose={() => setShowHistoryEventModal(false)} title="新增自定義車輛歷史">
        <form onSubmit={handleAddHistoryEvent} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label><DateInput value={historyEventForm.event_date} onChange={value => setHistoryEventForm({...historyEventForm, event_date: value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">類型 *</label><input value={historyEventForm.event_type} onChange={e => setHistoryEventForm({...historyEventForm, event_type: e.target.value})} className="input-field" placeholder="例如：大修、意外、驗車、備註" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">描述 *</label><textarea value={historyEventForm.description} onChange={e => setHistoryEventForm({...historyEventForm, description: e.target.value})} className="input-field" rows={3} required /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowHistoryEventModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">新增歷史</button></div>
        </form>
      </Modal>

      {/* Transfer Modal */}
      <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title="車輛過戶">
        <form onSubmit={handleTransfer} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">目前公司</label><input value={vehicle?.owner_company?.internal_prefix ? `${vehicle.owner_company.internal_prefix} - ${vehicle.owner_company.name}` : vehicle?.owner_company?.name} className="input-field bg-gray-50" disabled /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">過戶至 *</label>
            <select value={transferForm.to_company_id} onChange={e => setTransferForm({...transferForm, to_company_id: e.target.value})} className="input-field" required>
              <option value="">請選擇</option>
              {companies.filter(c => c.id !== vehicle?.owner_company_id).map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">過戶日期 *</label><DateInput value={transferForm.transfer_date} onChange={value => setTransferForm({...transferForm, transfer_date: value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={transferForm.notes} onChange={e => setTransferForm({...transferForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowTransferModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">確認過戶</button></div>
        </form>
      </Modal>
    </div>
  );
}
