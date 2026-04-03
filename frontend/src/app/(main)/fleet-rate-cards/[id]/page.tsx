'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fleetRateCardsApi, companiesApi, partnersApi } from '@/lib/api';
import Link from 'next/link';
import SearchableSelect from '@/components/SearchableSelect';
import Combobox from '@/components/Combobox';

const SERVICE_TYPES = ['運輸', '機械租賃', '人工', '物料', '服務', '工程', '租賃/運輸'];
const UNIT_OPTIONS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];
const TONNAGE_OPTIONS = ['13噸', '20噸', '24噸', '30噸', '38噸'];
const VEHICLE_TYPE_OPTIONS = ['泥頭車', '拖頭', '吊臂車', '吊雞車', '平板車', '密斗車', '油壓車', '鈎臂車', '炮車'];

export default function FleetRateCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [record, setRecord] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    fleetRateCardsApi.get(Number(params.id)).then(res => {
      setRecord(res.data);
      setForm(res.data);
      setLoading(false);
    }).catch(() => router.push('/fleet-rate-cards'));
  };

  useEffect(() => {
    loadData();
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
  }, [params.id]);

  const handleSave = async () => {
    try {
      const { client, company, source_quotation, created_at, updated_at, ...updateData } = form;
      updateData.rate = Number(updateData.rate) || 0;
      updateData.day_rate = Number(updateData.day_rate) || 0;
      updateData.night_rate = Number(updateData.night_rate) || 0;
      updateData.mid_shift_rate = Number(updateData.mid_shift_rate) || 0;
      updateData.ot_rate = Number(updateData.ot_rate) || 0;
      updateData.effective_date = updateData.effective_date || null;
      updateData.expiry_date = updateData.expiry_date || null;
      const res = await fleetRateCardsApi.update(record.id, updateData);
      setRecord(res.data);
      setForm(res.data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const clientOptions = partners
    .filter((p: any) => p.partner_type === 'client')
    .map((p: any) => ({ value: p.id, label: p.name }));

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/fleet-rate-cards" className="hover:text-primary-600">租賃價目表</Link><span>/</span><span className="text-gray-900">{record?.client?.name} - {record?.name || record?.service_type || '詳情'}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{record?.client?.name || '租賃價目'}</h1>
          <p className="text-gray-500">{record?.service_type} | {record?.name || ''} | <span className={record?.status === 'active' ? 'badge-green' : 'badge-gray'}>{record?.status === 'active' ? '啟用' : '停用'}</span></p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => { setForm(record); setEditing(false); }} className="btn-secondary">取消</button>
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
            <div><label className="block text-sm font-medium text-gray-500 mb-1">開票公司</label>
              <select value={form.company_id || ''} onChange={e => setForm({...form, company_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                <option value="">請選擇</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
              <SearchableSelect
                value={form.client_id}
                onChange={(val) => setForm({...form, client_id: val ? Number(val) : null})}
                options={clientOptions}
                placeholder="搜尋客戶..."
              />
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">合約編號</label><input value={form.contract_no || ''} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">服務類型</label>
              <select value={form.service_type || ''} onChange={e => setForm({...form, service_type: e.target.value})} className="input-field">
                <option value="">請選擇</option>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">名稱</label><input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">噸數</label>
              <Combobox
                value={form.vehicle_tonnage || ''}
                onChange={(val) => setForm({...form, vehicle_tonnage: val || ''})}
                options={TONNAGE_OPTIONS.map(t => ({ value: t, label: t }))}
                placeholder="選擇或輸入噸數"
              />
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">機種</label>
              <Combobox
                value={form.vehicle_type || ''}
                onChange={(val) => setForm({...form, vehicle_type: val || ''})}
                options={VEHICLE_TYPE_OPTIONS.map(t => ({ value: t, label: t }))}
                placeholder="選擇或輸入機種"
              />
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">起點</label><input value={form.origin || ''} onChange={e => setForm({...form, origin: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">終點</label><input value={form.destination || ''} onChange={e => setForm({...form, destination: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><p className="text-sm text-gray-500">開票公司</p><p className="font-medium">{record?.company?.internal_prefix ? `${record.company.internal_prefix} - ${record.company.name}` : record?.company?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">客戶</p><p className="font-medium">{record?.client?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">合約編號</p><p>{record?.contract_no || '-'}</p></div>
            <div><p className="text-sm text-gray-500">服務類型</p><p>{record?.service_type || '-'}</p></div>
            <div><p className="text-sm text-gray-500">名稱</p><p>{record?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">噸數</p><p>{record?.vehicle_tonnage || '-'}</p></div>
            <div><p className="text-sm text-gray-500">機種</p><p>{record?.vehicle_type || '-'}</p></div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-500 mb-1">生效日期</label><input type="date" value={form.effective_date || ''} onChange={e => setForm({...form, effective_date: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">到期日期</label><input type="date" value={form.expiry_date || ''} onChange={e => setForm({...form, expiry_date: e.target.value})} className="input-field" /></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div><p className="text-sm text-gray-500">生效日期</p><p>{record?.effective_date || '-'}</p></div>
            <div><p className="text-sm text-gray-500">到期日期</p><p>{record?.expiry_date || '-'}</p></div>
            <div><p className="text-sm text-gray-500">來源報價單</p>
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
            <div><label className="block text-xs text-gray-500 mb-1">日/夜</label>
              <select value={form.day_night || ''} onChange={e => setForm({...form, day_night: e.target.value})} className="input-field">
                <option value="">無</option>
                <option value="日">日</option>
                <option value="夜">夜</option>
                <option value="中直">中直</option>
              </select>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">費率</label>
              <div className="flex gap-1">
                <input type="number" value={form.rate} onChange={e => setForm({...form, rate: e.target.value})} className="input-field flex-1" />
                <select value={form.unit || '車'} onChange={e => setForm({...form, unit: e.target.value})} className="input-field w-20">
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">OT 費率</label>
              <input type="number" value={form.ot_rate} onChange={e => setForm({...form, ot_rate: e.target.value})} className="input-field" />
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">日間費率（舊）</label>
              <input type="number" value={form.day_rate} onChange={e => setForm({...form, day_rate: e.target.value})} className="input-field" />
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">夜間費率（舊）</label>
              <input type="number" value={form.night_rate} onChange={e => setForm({...form, night_rate: e.target.value})} className="input-field" />
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">中直費率（舊）</label>
              <input type="number" value={form.mid_shift_rate} onChange={e => setForm({...form, mid_shift_rate: e.target.value})} className="input-field" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-green-50 rounded-lg p-3"><p className="text-xs text-green-600 mb-1">費率 ({record?.day_night || '-'})</p><p className="text-xl font-bold font-mono">${Number(record?.rate || 0).toLocaleString()}<span className="text-sm font-normal text-gray-500">/{record?.unit || '車'}</span></p></div>
            <div className="bg-orange-50 rounded-lg p-3"><p className="text-xs text-orange-600 mb-1">OT</p><p className="text-xl font-bold font-mono">${Number(record?.ot_rate || 0).toLocaleString()}<span className="text-sm font-normal text-gray-500">/小時</span></p></div>
            <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs text-blue-600 mb-1">日間（舊）</p><p className="text-xl font-bold font-mono">${Number(record?.day_rate || 0).toLocaleString()}</p></div>
            <div className="bg-indigo-50 rounded-lg p-3"><p className="text-xs text-indigo-600 mb-1">夜間（舊）</p><p className="text-xl font-bold font-mono">${Number(record?.night_rate || 0).toLocaleString()}</p></div>
          </div>
        )}
      </div>

      {/* 備註 */}
      {editing && (
        <div className="card">
          <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
          <textarea value={form.remarks || ''} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={3} />
        </div>
      )}
    </div>
  );
}
