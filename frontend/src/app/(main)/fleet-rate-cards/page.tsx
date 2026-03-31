'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fleetRateCardsApi, partnersApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';

const UNIT_OPTIONS = ['車','噸','天','晚','小時','次'];
const TONNAGE_OPTIONS = ['13噸', '20噸', '24噸', '30噸', '38噸'];

export default function FleetRateCardsPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);

  const [form, setForm] = useState<any>({
    client_id: '', contract_no: '', vehicle_tonnage: '', vehicle_type: '',
    origin: '', destination: '',
    day_rate: 0, night_rate: 0, mid_shift_rate: 0, ot_rate: 0,
    unit: '車', remarks: '', status: 'active',
  });

  const load = () => {
    setLoading(true);
    fleetRateCardsApi.list({ page, limit: 20, search, status: statusFilter || undefined, sortBy, sortOrder })
      .then(res => { setData(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, search, statusFilter, sortBy, sortOrder]);
  useEffect(() => { partnersApi.simple().then(res => setPartners(res.data)); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fleetRateCardsApi.create({
        ...form,
        client_id: form.client_id ? Number(form.client_id) : null,
        day_rate: Number(form.day_rate) || 0,
        night_rate: Number(form.night_rate) || 0,
        mid_shift_rate: Number(form.mid_shift_rate) || 0,
        ot_rate: Number(form.ot_rate) || 0,
      });
      setShowModal(false);
      load();
    } catch (err: any) { alert(err.response?.data?.message || '新增失敗'); }
  };

  const columns = [
    { key: 'client', label: '客戶', render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'contract_no', label: '合約', render: (v: any) => v || '-' },
    { key: 'vehicle_tonnage', label: '噸數', render: (v: any) => v || '-' },
    { key: 'vehicle_type', label: '車型', render: (v: any) => v || '-' },
    { key: 'origin', label: '起點', render: (v: any) => v || '-' },
    { key: 'destination', label: '終點', render: (v: any) => v || '-' },
    { key: 'day_rate', label: '日間分傭', sortable: true, className: 'text-right', render: (v: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}</span> : '-' },
    { key: 'night_rate', label: '夜間分傭', className: 'text-right', render: (v: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}</span> : '-' },
    { key: 'unit', label: '單位' },
    { key: 'source_quotation', label: '來源報價單', render: (_: any, row: any) => row.source_quotation ? (
      <span className="font-mono text-xs text-primary-600">{row.source_quotation.quotation_no}</span>
    ) : '-' },
    { key: 'status', label: '狀態', render: (v: any) => {
      const map: Record<string, { label: string; cls: string }> = {
        active: { label: '生效中', cls: 'badge-green' },
        cancelled: { label: '取消', cls: 'badge-red' },
        deleted: { label: '已刪除', cls: 'badge-gray' },
        inactive: { label: '停用', cls: 'badge-gray' },
      };
      const s = map[v] || { label: v, cls: 'badge-gray' };
      return <span className={s.cls}>{s.label}</span>;
    }, filterRender: (v: any) => ({ active: '生效中', cancelled: '取消', deleted: '已刪除', inactive: '停用' }[v] || v) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">車隊價目表</h1>
          <p className="text-gray-500 text-sm mt-1">管理明達車隊司機分傭費率</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">新增價目</button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={setSearch}
          searchPlaceholder="搜尋客戶、合約、起終點..."
          onRowClick={(row) => router.push(`/fleet-rate-cards/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => { setSortBy(f); setSortOrder(o); }}
          filters={
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto">
              <option value="">全部狀態</option>
              <option value="active">生效中</option>
              <option value="cancelled">取消</option>
              <option value="deleted">已刪除</option>
              <option value="inactive">停用</option>
            </select>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增車隊價目" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
              <select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} className="input-field">
                <option value="">請選擇</option>
                {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合約編號</label>
              <input value={form.contract_no} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">車輛噸數</label>
              <select value={form.vehicle_tonnage} onChange={e => setForm({...form, vehicle_tonnage: e.target.value})} className="input-field">
                <option value="">請選擇</option>
                {TONNAGE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">車輛類型</label>
              <input value={form.vehicle_type} onChange={e => setForm({...form, vehicle_type: e.target.value})} className="input-field" placeholder="例如 平斗、夾斗" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">起點</label>
              <input value={form.origin} onChange={e => setForm({...form, origin: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">終點</label>
              <input value={form.destination} onChange={e => setForm({...form, destination: e.target.value})} className="input-field" />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">分傭費率</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">日間</label><input type="number" value={form.day_rate} onChange={e => setForm({...form, day_rate: e.target.value})} className="input-field" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">夜間</label><input type="number" value={form.night_rate} onChange={e => setForm({...form, night_rate: e.target.value})} className="input-field" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">中直</label><input type="number" value={form.mid_shift_rate} onChange={e => setForm({...form, mid_shift_rate: e.target.value})} className="input-field" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">OT</label><input type="number" value={form.ot_rate} onChange={e => setForm({...form, ot_rate: e.target.value})} className="input-field" /></div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">單位</label>
              <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="input-field w-32">
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">新增</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
