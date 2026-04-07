'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { vehiclesApi, companiesApi, fieldOptionsApi } from '@/lib/api';
import DocumentUpload from '@/components/DocumentUpload';
import CustomFieldsBlock from '@/components/CustomFieldsBlock';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';

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
  const [vehicle, setVehicle] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>(DEFAULT_VEHICLE_TYPES);
  const [showPlateModal, setShowPlateModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [plateForm, setPlateForm] = useState({ new_plate: '', change_date: '', notes: '' });
  const [transferForm, setTransferForm] = useState({ to_company_id: '', transfer_date: '', notes: '' });

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
      const { owner_company, plate_history, transfers, created_at, updated_at, ...updateData } = form;
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

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclesApi.transfer(vehicle.id, { from_company_id: vehicle.owner_company_id, to_company_id: Number(transferForm.to_company_id), transfer_date: transferForm.transfer_date, notes: transferForm.notes });
      setShowTransferModal(false);
      setTransferForm({ to_company_id: '', transfer_date: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '過戶失敗'); }
  };

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
          <button onClick={() => setShowPlateModal(true)} className="btn-secondary">更換車牌</button>
          <button onClick={() => setShowTransferModal(true)} className="btn-secondary">過戶</button>
          {editing ? (
            <><button onClick={() => { setForm(vehicle); setEditing(false); }} className="btn-secondary">取消</button><button onClick={handleSave} className="btn-primary">儲存</button></>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
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
              <div><label className="block text-sm font-medium text-gray-500 mb-1">首次登記日期</label><input type="date" value={form.vehicle_first_reg_date?.slice(0, 10) || ''} onChange={e => setForm({...form, vehicle_first_reg_date: e.target.value})} className="input-field" /></div>
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
              <div><label className="block text-sm font-medium text-gray-500 mb-1">保險到期日</label><input type="date" value={form.insurance_expiry?.slice(0, 10) || ''} onChange={e => setForm({...form, insurance_expiry: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">牌費到期日</label><input type="date" value={form.permit_fee_expiry?.slice(0, 10) || ''} onChange={e => setForm({...form, permit_fee_expiry: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">驗車到期日</label><input type="date" value={form.inspection_date?.slice(0, 10) || ''} onChange={e => setForm({...form, inspection_date: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">行車證到期日</label><input type="date" value={form.license_expiry?.slice(0, 10) || ''} onChange={e => setForm({...form, license_expiry: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">泥尾到期日</label><input type="date" value={form.vehicle_mud_tail_expiry?.slice(0, 10) || ''} onChange={e => setForm({...form, vehicle_mud_tail_expiry: e.target.value})} className="input-field" /></div>
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
              <div><p className="text-sm text-gray-500">所屬公司</p><p className="font-medium">{vehicle?.owner_company?.internal_prefix} - {vehicle?.owner_company?.name}</p></div>
              <div><p className="text-sm text-gray-500">狀態</p><p><span className={vehicle?.status === 'active' ? 'badge-green' : vehicle?.status === 'maintenance' ? 'badge-yellow' : 'badge-red'}>{vehicle?.status === 'active' ? '使用中' : vehicle?.status === 'maintenance' ? '維修中' : '停用'}</span></p></div>
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
            <div><p className="text-sm text-gray-500">牌費到期日</p><p className="mt-1">{dateStatusBadge(vehicle?.permit_fee_expiry)}</p></div>
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

      {/* Plate History */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">車牌變更紀錄</h2>
          <button onClick={() => setShowPlateModal(true)} className="text-sm text-primary-600 hover:underline">更換車牌</button>
        </div>
        {vehicle?.plate_history?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-left">舊車牌</th><th className="px-3 py-2 text-center">→</th><th className="px-3 py-2 text-left">新車牌</th><th className="px-3 py-2 text-left">備註</th></tr></thead>
              <tbody>
                {vehicle.plate_history.map((h: any) => (
                  <tr key={h.id} className="border-b">
                    <td className="px-3 py-2">{fmtDate(h.change_date)}</td>
                    <td className="px-3 py-2 font-mono">{h.old_plate}</td>
                    <td className="px-3 py-2 text-center text-gray-400">→</td>
                    <td className="px-3 py-2 font-mono font-bold">{h.new_plate}</td>
                    <td className="px-3 py-2 text-gray-500">{h.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-gray-500 text-sm">暫無變更紀錄</p>}
      </div>

      {/* Documents */}
      <div className="card mb-6">
        <CustomFieldsBlock module="vehicle" entityId={vehicle?.id} />
      </div>

      <div className="card">
        <DocumentUpload entityType="vehicle" entityId={vehicle?.id} docTypes={['牌簿', '行車證', '保險單', '貸款文件', '買賣合約', '其他']} />
      </div>

      {/* Transfer History */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">過戶紀錄</h2>
          <button onClick={() => setShowTransferModal(true)} className="text-sm text-primary-600 hover:underline">過戶</button>
        </div>
        {vehicle?.transfers?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-left">原公司</th><th className="px-3 py-2 text-center">→</th><th className="px-3 py-2 text-left">新公司</th><th className="px-3 py-2 text-left">備註</th></tr></thead>
              <tbody>
                {vehicle.transfers.map((t: any) => (
                  <tr key={t.id} className="border-b">
                    <td className="px-3 py-2">{fmtDate(t.transfer_date)}</td>
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

      {/* Change Plate Modal */}
      <Modal isOpen={showPlateModal} onClose={() => setShowPlateModal(false)} title="更換車牌">
        <form onSubmit={handleChangePlate} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">目前車牌</label><input value={vehicle?.plate_number} className="input-field bg-gray-50 font-mono" disabled /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">新車牌 *</label><input value={plateForm.new_plate} onChange={e => setPlateForm({...plateForm, new_plate: e.target.value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">變更日期 *</label><input type="date" value={plateForm.change_date} onChange={e => setPlateForm({...plateForm, change_date: e.target.value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={plateForm.notes} onChange={e => setPlateForm({...plateForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowPlateModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">確認更換</button></div>
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
          <div><label className="block text-sm font-medium text-gray-700 mb-1">過戶日期 *</label><input type="date" value={transferForm.transfer_date} onChange={e => setTransferForm({...transferForm, transfer_date: e.target.value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={transferForm.notes} onChange={e => setTransferForm({...transferForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowTransferModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">確認過戶</button></div>
        </form>
      </Modal>
    </div>
  );
}
