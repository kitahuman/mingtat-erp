'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { subconRateCardsApi, partnersApi } from '@/lib/api';
import Link from 'next/link';

const UNIT_OPTIONS = ['天','晚','車','噸','小時','次'];
const TONNAGE_OPTIONS = ['13噸', '20噸', '24噸', '30噸', '38噸'];

export default function SubconRateCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [record, setRecord] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    subconRateCardsApi.get(Number(params.id)).then(res => {
      setRecord(res.data);
      setForm(res.data);
      setLoading(false);
    }).catch(() => router.push('/subcon-rate-cards'));
  };

  useEffect(() => {
    loadData();
    partnersApi.simple().then(res => setPartners(res.data));
  }, [params.id]);

  const handleSave = async () => {
    try {
      const { subcontractor, client, created_at, updated_at, ...updateData } = form;
      updateData.unit_price = Number(updateData.unit_price) || 0;
      const res = await subconRateCardsApi.update(record.id, updateData);
      setRecord(res.data);
      setForm(res.data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/subcon-rate-cards" className="hover:text-primary-600">供應商價目表</Link><span>/</span><span className="text-gray-900">{record?.subcontractor?.name || record?.plate_no || '詳情'}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{record?.subcontractor?.name || '供應商價目'}</h1>
          <p className="text-gray-500">{record?.plate_no} | {record?.vehicle_tonnage} | {record?.day_night} | {record?.origin} → {record?.destination}</p>
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
            <div><label className="block text-sm font-medium text-gray-500 mb-1">供應商</label>
              <select value={form.subcon_id || ''} onChange={e => setForm({...form, subcon_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                <option value="">無</option>
                {partners.filter((p: any) => p.partner_type === 'subcontractor' || p.partner_type === 'supplier').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">車牌</label><input value={form.plate_no || ''} onChange={e => setForm({...form, plate_no: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">噸數/類別</label>
              <select value={form.vehicle_tonnage || ''} onChange={e => setForm({...form, vehicle_tonnage: e.target.value})} className="input-field">
                <option value="">不適用</option>
                {TONNAGE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
              <select value={form.client_id || ''} onChange={e => setForm({...form, client_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                <option value="">無</option>
                {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">合約</label><input value={form.contract_no || ''} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">日/夜</label>
              <select value={form.day_night || '日'} onChange={e => setForm({...form, day_night: e.target.value})} className="input-field">
                <option value="日">日</option><option value="夜">夜</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">起點</label><input value={form.origin || ''} onChange={e => setForm({...form, origin: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">終點</label><input value={form.destination || ''} onChange={e => setForm({...form, destination: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">單價</label>
              <div className="flex gap-1">
                <input type="number" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value})} className="input-field flex-1" />
                <select value={form.unit || '天'} onChange={e => setForm({...form, unit: e.target.value})} className="input-field w-20">{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select>
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.exclude_fuel} onChange={e => setForm({...form, exclude_fuel: e.target.checked})} className="rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">不包油</span>
              </label>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                <option value="active">啟用</option><option value="inactive">停用</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><p className="text-sm text-gray-500">供應商</p><p className="font-medium">{record?.subcontractor?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">車牌</p><p>{record?.plate_no || '-'}</p></div>
            <div><p className="text-sm text-gray-500">噸數/類別</p><p>{record?.vehicle_tonnage || '-'}</p></div>
            <div><p className="text-sm text-gray-500">客戶</p><p>{record?.client?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">合約</p><p>{record?.contract_no || '-'}</p></div>
            <div><p className="text-sm text-gray-500">日/夜</p><p>{record?.day_night || '-'}</p></div>
            <div><p className="text-sm text-gray-500">起點</p><p>{record?.origin || '-'}</p></div>
            <div><p className="text-sm text-gray-500">終點</p><p>{record?.destination || '-'}</p></div>
            <div><p className="text-sm text-gray-500">單價</p><p className="text-xl font-bold font-mono">${Number(record?.unit_price).toLocaleString()}<span className="text-sm font-normal text-gray-500">/{record?.unit || '天'}</span></p></div>
            <div><p className="text-sm text-gray-500">包油</p><p>{record?.exclude_fuel ? <span className="badge-red">不包油</span> : <span className="badge-green">包油</span>}</p></div>
            <div><p className="text-sm text-gray-500">狀態</p><p><span className={record?.status === 'active' ? 'badge-green' : 'badge-gray'}>{record?.status === 'active' ? '啟用' : '停用'}</span></p></div>
            <div><p className="text-sm text-gray-500">備註</p><p>{record?.remarks || '-'}</p></div>
          </div>
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
