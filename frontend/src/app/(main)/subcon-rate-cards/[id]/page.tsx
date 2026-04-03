'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { subconRateCardsApi, companiesApi, partnersApi, vehiclesApi, machineryApi } from '@/lib/api';
import Link from 'next/link';
import SearchableSelect from '@/components/SearchableSelect';
import Combobox from '@/components/Combobox';
import { useMultiFieldOptions } from '@/hooks/useFieldOptions';

const SERVICE_TYPES = ['運輸', '機械租賃', '人工', '物料', '服務', '工程', '租賃/運輸'];
const UNIT_OPTIONS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];
const OT_TIME_SLOTS = ['1800-1900', '1900-2000', '0600-0700', '0700-0800'];
const FIELD_OPTION_CATEGORIES = ['tonnage', 'vehicle_type'];

export default function SubconRateCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [record, setRecord] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { optionsMap } = useMultiFieldOptions(FIELD_OPTION_CATEGORIES);
  const tonnageOptions = optionsMap['tonnage'] || [];
  const vehicleTypeOptions = optionsMap['vehicle_type'] || [];

  const loadData = () => {
    subconRateCardsApi.get(Number(params.id)).then(res => {
      setRecord(res.data);
      setForm({ ...res.data, ot_rates: res.data.ot_rates || [] });
      setLoading(false);
    }).catch(() => router.push('/subcon-rate-cards'));
  };

  useEffect(() => {
    loadData();
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
    Promise.all([vehiclesApi.simple(), machineryApi.simple()]).then(([vRes, mRes]) => {
      setEquipmentOptions([...vRes.data, ...mRes.data]);
    }).catch(() => {});
  }, [params.id]);

  const handleSave = async () => {
    try {
      const { subcontractor, client, company, source_quotation, created_at, updated_at, ...updateData } = form;
      updateData.rate = Number(updateData.rate) || 0;
      updateData.day_rate = Number(updateData.rate) || 0;
      updateData.night_rate = 0;
      updateData.mid_shift_rate = Number(updateData.mid_shift_rate) || 0;
      updateData.ot_rate = Number(updateData.ot_rate) || 0;
      updateData.effective_date = updateData.effective_date || null;
      updateData.expiry_date = updateData.expiry_date || null;
      if (updateData.ot_rates) {
        updateData.ot_rates = updateData.ot_rates.map((ot: any) => ({
          time_slot: ot.time_slot, rate: Number(ot.rate) || 0, unit: ot.unit || '小時',
        }));
      }
      const res = await subconRateCardsApi.update(record.id, updateData);
      setRecord(res.data);
      setForm({ ...res.data, ot_rates: res.data.ot_rates || [] });
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const addOtRate = () => {
    setForm({ ...form, ot_rates: [...(form.ot_rates || []), { time_slot: '1800-1900', rate: 0, unit: '小時' }] });
  };
  const removeOtRate = (idx: number) => {
    setForm({ ...form, ot_rates: form.ot_rates.filter((_: any, i: number) => i !== idx) });
  };

  const clientOptions = partners
    .filter((p: any) => p.partner_type === 'client')
    .map((p: any) => ({ value: p.id, label: p.name }));
  const subconOptions = partners
    .filter((p: any) => p.partner_type === 'subcontractor' || p.partner_type === 'supplier')
    .map((p: any) => ({ value: p.id, label: p.name }));

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/subcon-rate-cards" className="hover:text-primary-600">供應商價目表</Link>
        <span>/</span>
        <span className="text-gray-900">{record?.subcontractor?.name || '-'} - {record?.name || record?.service_type || '詳情'}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{record?.subcontractor?.name || '供應商價目'}</h1>
          <p className="text-gray-500">
            {record?.service_type && <span>{record.service_type} | </span>}
            {record?.name && <span>{record.name} | </span>}
            <span className={record?.status === 'active' ? 'badge-green' : 'badge-gray'}>{record?.status === 'active' ? '啟用' : '停用'}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => { setForm({ ...record, ot_rates: record.ot_rates || [] }); setEditing(false); }} className="btn-secondary">取消</button>
              <button onClick={handleSave} className="btn-primary">儲存</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* 基本資料 */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">基本資料</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">開票公司</label>
              <select value={form.company_id || ''} onChange={e => setForm({...form, company_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                <option value="">請選擇</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">供應商</label>
              <SearchableSelect
                value={form.subcon_id}
                onChange={(val) => setForm({...form, subcon_id: val ? Number(val) : null})}
                options={subconOptions}
                placeholder="搜尋供應商..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">車牌（選填）</label>
              <Combobox
                value={form.plate_no || ''}
                onChange={(val) => setForm({...form, plate_no: val || ''})}
                options={equipmentOptions}
                placeholder="選擇或輸入車牌"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
              <SearchableSelect
                value={form.client_id}
                onChange={(val) => setForm({...form, client_id: val ? Number(val) : null})}
                options={clientOptions}
                placeholder="搜尋客戶..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">合約編號</label>
              <input value={form.contract_no || ''} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">服務類型</label>
              <select value={form.service_type || ''} onChange={e => setForm({...form, service_type: e.target.value})} className="input-field">
                <option value="">請選擇</option>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">名稱</label>
              <input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">日/夜</label>
              <select value={form.day_night || ''} onChange={e => setForm({...form, day_night: e.target.value})} className="input-field">
                <option value="">無</option>
                <option value="日">日</option>
                <option value="夜">夜</option>
                <option value="中直">中直</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">噸數</label>
              <Combobox
                value={form.vehicle_tonnage || ''}
                onChange={(val) => setForm({...form, vehicle_tonnage: val || ''})}
                options={tonnageOptions}
                placeholder="選擇或輸入噸數"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">機種</label>
              <Combobox
                value={form.vehicle_type || ''}
                onChange={(val) => setForm({...form, vehicle_type: val || ''})}
                options={vehicleTypeOptions}
                placeholder="選擇或輸入機種"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">機號</label>
              <Combobox
                value={form.equipment_number || ''}
                onChange={(val) => setForm({...form, equipment_number: val || ''})}
                options={equipmentOptions}
                placeholder="選擇或輸入機號"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">起點</label>
              <input value={form.origin || ''} onChange={e => setForm({...form, origin: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">終點</label>
              <input value={form.destination || ''} onChange={e => setForm({...form, destination: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
              <select value={form.status || 'active'} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><p className="text-sm text-gray-500">開票公司</p><p className="font-medium">{record?.company?.internal_prefix ? `${record.company.internal_prefix} - ${record.company.name}` : record?.company?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">供應商</p><p className="font-medium">{record?.subcontractor?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">車牌</p><p>{record?.plate_no || '-'}</p></div>
            <div><p className="text-sm text-gray-500">客戶</p><p className="font-medium">{record?.client?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">合約編號</p><p>{record?.contract_no || '-'}</p></div>
            <div><p className="text-sm text-gray-500">服務類型</p><p>{record?.service_type || '-'}</p></div>
            <div><p className="text-sm text-gray-500">名稱</p><p>{record?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">日/夜</p><p>{record?.day_night || '-'}</p></div>
            <div><p className="text-sm text-gray-500">噸數</p><p>{record?.vehicle_tonnage || '-'}</p></div>
            <div><p className="text-sm text-gray-500">機種</p><p>{record?.vehicle_type || '-'}</p></div>
            <div><p className="text-sm text-gray-500">機號</p><p>{record?.equipment_number || '-'}</p></div>
            <div><p className="text-sm text-gray-500">起點</p><p>{record?.origin || '-'}</p></div>
            <div><p className="text-sm text-gray-500">終點</p><p>{record?.destination || '-'}</p></div>
            <div><p className="text-sm text-gray-500">備註</p><p>{record?.remarks || '-'}</p></div>
          </div>
        )}
      </div>

      {/* 有效期及來源 */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">有效期及來源</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">生效日期</label>
              <input type="date" value={form.effective_date ? String(form.effective_date).substring(0, 10) : ''} onChange={e => setForm({...form, effective_date: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">到期日期</label>
              <input type="date" value={form.expiry_date ? String(form.expiry_date).substring(0, 10) : ''} onChange={e => setForm({...form, expiry_date: e.target.value})} className="input-field" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><p className="text-sm text-gray-500">生效日期</p><p>{record?.effective_date ? String(record.effective_date).substring(0, 10) : '-'}</p></div>
            <div><p className="text-sm text-gray-500">到期日期</p><p>{record?.expiry_date ? String(record.expiry_date).substring(0, 10) : '-'}</p></div>
            <div>
              <p className="text-sm text-gray-500">來源報價單</p>
              {record?.source_quotation ? (
                <Link href={`/quotations/${record.source_quotation.id}`} className="text-primary-600 hover:underline font-mono">{record.source_quotation.quotation_no}</Link>
              ) : <p>-</p>}
            </div>
          </div>
        )}
      </div>

      {/* 費率 */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">費率</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">費率</label>
              <div className="flex gap-1">
                <input type="number" value={form.rate ?? form.day_rate ?? 0} onChange={e => setForm({...form, rate: e.target.value})} className="input-field flex-1" />
                <select value={form.unit || '天'} onChange={e => setForm({...form, unit: e.target.value})} className="input-field w-20">{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">中直費率</label>
              <input type="number" value={form.mid_shift_rate ?? 0} onChange={e => setForm({...form, mid_shift_rate: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">OT 費率</label>
              <div className="flex gap-1">
                <input type="number" value={form.ot_rate ?? 0} onChange={e => setForm({...form, ot_rate: e.target.value})} className="input-field flex-1" />
                <select value={form.ot_unit || '小時'} onChange={e => setForm({...form, ot_unit: e.target.value})} className="input-field w-20">{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select>
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.exclude_fuel || false} onChange={e => setForm({...form, exclude_fuel: e.target.checked})} className="rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">不包油</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs text-blue-600 mb-1">費率</p><p className="text-xl font-bold font-mono">${Number(record?.rate || record?.day_rate || 0).toLocaleString()}<span className="text-sm font-normal text-gray-500">/{record?.unit || '天'}</span></p></div>
            <div className="bg-purple-50 rounded-lg p-3"><p className="text-xs text-purple-600 mb-1">中直</p><p className="text-xl font-bold font-mono">${Number(record?.mid_shift_rate || 0).toLocaleString()}</p></div>
            <div className="bg-orange-50 rounded-lg p-3"><p className="text-xs text-orange-600 mb-1">OT</p><p className="text-xl font-bold font-mono">${Number(record?.ot_rate || 0).toLocaleString()}<span className="text-sm font-normal text-gray-500">/{record?.ot_unit || '小時'}</span></p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-600 mb-1">包油</p><p className="text-xl font-bold">{record?.exclude_fuel ? <span className="text-red-600">不包油</span> : <span className="text-green-600">包油</span>}</p></div>
          </div>
        )}
      </div>

      {/* OT 時段費率 */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">OT 時段費率</h2>
          {editing && <button type="button" onClick={addOtRate} className="text-sm text-primary-600 hover:underline">+ 新增時段</button>}
        </div>
        {(editing ? form.ot_rates : record?.ot_rates || []).length > 0 ? (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">時段</th><th className="px-3 py-2 text-right">費率</th><th className="px-3 py-2 text-left">單位</th>{editing && <th className="px-3 py-2 w-10"></th>}</tr></thead>
            <tbody>
              {(editing ? form.ot_rates : record?.ot_rates || []).map((ot: any, idx: number) => (
                <tr key={idx} className="border-b">
                  {editing ? (
                    <>
                      <td className="px-3 py-1"><select value={ot.time_slot} onChange={e => { const ots = [...form.ot_rates]; ots[idx] = {...ots[idx], time_slot: e.target.value}; setForm({...form, ot_rates: ots}); }} className="input-field text-sm">
                        {OT_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select></td>
                      <td className="px-3 py-1"><input type="number" value={ot.rate} onChange={e => { const ots = [...form.ot_rates]; ots[idx] = {...ots[idx], rate: e.target.value}; setForm({...form, ot_rates: ots}); }} className="input-field text-sm text-right" /></td>
                      <td className="px-3 py-1"><select value={ot.unit || '小時'} onChange={e => { const ots = [...form.ot_rates]; ots[idx] = {...ots[idx], unit: e.target.value}; setForm({...form, ot_rates: ots}); }} className="input-field text-sm">{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                      <td className="px-3 py-1"><button type="button" onClick={() => removeOtRate(idx)} className="text-red-500">&times;</button></td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono">{ot.time_slot}</td>
                      <td className="px-3 py-2 text-right font-mono">${Number(ot.rate).toLocaleString()}</td>
                      <td className="px-3 py-2">{ot.unit || '小時'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-sm">暫無 OT 時段費率</p>
        )}
      </div>

      {editing && (
        <div className="card">
          <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
          <textarea value={form.remarks || ''} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={3} />
        </div>
      )}
    </div>
  );
}
