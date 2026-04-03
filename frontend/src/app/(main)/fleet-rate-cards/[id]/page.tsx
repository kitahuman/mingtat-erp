'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fleetRateCardsApi, partnersApi } from '@/lib/api';
import Link from 'next/link';

const UNIT_OPTIONS = ['車','噸','天','晚','小時','次'];
const TONNAGE_OPTIONS = ['13噸', '20噸', '24噸', '30噸', '38噸'];

export default function FleetRateCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [record, setRecord] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
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
    partnersApi.simple().then(res => setPartners(res.data));
  }, [params.id]);

  const handleSave = async () => {
    try {
      const { client, created_at, updated_at, ...updateData } = form;
      updateData.day_rate = Number(updateData.day_rate) || 0;
      updateData.night_rate = Number(updateData.night_rate) || 0;
      updateData.mid_shift_rate = Number(updateData.mid_shift_rate) || 0;
      updateData.ot_rate = Number(updateData.ot_rate) || 0;
      const res = await fleetRateCardsApi.update(record.id, updateData);
      setRecord(res.data);
      setForm(res.data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/fleet-rate-cards" className="hover:text-primary-600">租賃價目表</Link><span>/</span><span className="text-gray-900">{record?.client?.name || '詳情'}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{record?.client?.name || '租賃價目'}</h1>
          <p className="text-gray-500">{record?.vehicle_tonnage} {record?.vehicle_type} | {record?.origin} → {record?.destination}</p>
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

      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">基本資料</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
              <select value={form.client_id || ''} onChange={e => setForm({...form, client_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                <option value="">無</option>
                {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">合約編號</label><input value={form.contract_no || ''} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">車輛噸數</label>
              <select value={form.vehicle_tonnage || ''} onChange={e => setForm({...form, vehicle_tonnage: e.target.value})} className="input-field">
                <option value="">不適用</option>
                {TONNAGE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">車輛類型</label><input value={form.vehicle_type || ''} onChange={e => setForm({...form, vehicle_type: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">起點</label><input value={form.origin || ''} onChange={e => setForm({...form, origin: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">終點</label><input value={form.destination || ''} onChange={e => setForm({...form, destination: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">單位</label>
              <select value={form.unit || '車'} onChange={e => setForm({...form, unit: e.target.value})} className="input-field">
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
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
            <div><p className="text-sm text-gray-500">客戶</p><p className="font-medium">{record?.client?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">合約編號</p><p>{record?.contract_no || '-'}</p></div>
            <div><p className="text-sm text-gray-500">車輛噸數</p><p>{record?.vehicle_tonnage || '-'}</p></div>
            <div><p className="text-sm text-gray-500">車輛類型</p><p>{record?.vehicle_type || '-'}</p></div>
            <div><p className="text-sm text-gray-500">起點</p><p>{record?.origin || '-'}</p></div>
            <div><p className="text-sm text-gray-500">終點</p><p>{record?.destination || '-'}</p></div>
            <div><p className="text-sm text-gray-500">單位</p><p>{record?.unit || '-'}</p></div>
            <div><p className="text-sm text-gray-500">狀態</p><p><span className={record?.status === 'active' ? 'badge-green' : 'badge-gray'}>{record?.status === 'active' ? '啟用' : '停用'}</span></p></div>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">費率</h2>
        {editing ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><label className="block text-xs text-gray-500 mb-1">日間</label><input type="number" value={form.day_rate} onChange={e => setForm({...form, day_rate: e.target.value})} className="input-field" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">夜間</label><input type="number" value={form.night_rate} onChange={e => setForm({...form, night_rate: e.target.value})} className="input-field" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">中直</label><input type="number" value={form.mid_shift_rate} onChange={e => setForm({...form, mid_shift_rate: e.target.value})} className="input-field" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">OT</label><input type="number" value={form.ot_rate} onChange={e => setForm({...form, ot_rate: e.target.value})} className="input-field" /></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs text-blue-600 mb-1">日間</p><p className="text-xl font-bold font-mono">${Number(record?.day_rate).toLocaleString()}</p></div>
            <div className="bg-indigo-50 rounded-lg p-3"><p className="text-xs text-indigo-600 mb-1">夜間</p><p className="text-xl font-bold font-mono">${Number(record?.night_rate).toLocaleString()}</p></div>
            <div className="bg-purple-50 rounded-lg p-3"><p className="text-xs text-purple-600 mb-1">中直</p><p className="text-xl font-bold font-mono">${Number(record?.mid_shift_rate).toLocaleString()}</p></div>
            <div className="bg-orange-50 rounded-lg p-3"><p className="text-xs text-orange-600 mb-1">OT</p><p className="text-xl font-bold font-mono">${Number(record?.ot_rate).toLocaleString()}</p></div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-bold text-gray-900 mb-4">備註</h2>
        {editing ? (
          <textarea value={form.remarks || ''} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={3} />
        ) : (
          <p className="text-sm">{record?.remarks || '暫無備註'}</p>
        )}
      </div>
    </div>
  );
}
