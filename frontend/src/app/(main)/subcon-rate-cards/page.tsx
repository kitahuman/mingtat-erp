'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subconRateCardsApi, partnersApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';

const UNIT_OPTIONS = ['天','晚','車','噸','小時','次'];
const TONNAGE_OPTIONS = ['13噸', '20噸', '24噸', '30噸', '38噸'];

export default function SubconRateCardsPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dayNightFilter, setDayNightFilter] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);

  const [form, setForm] = useState<any>({
    subcon_id: '', plate_no: '', vehicle_tonnage: '',
    client_id: '', contract_no: '', day_night: '日',
    origin: '', destination: '',
    unit_price: 0, unit: '天', exclude_fuel: false,
    remarks: '', status: 'active',
  });

  const load = () => {
    setLoading(true);
    subconRateCardsApi.list({
      page, limit: 20, search,
      status: statusFilter || undefined,
      day_night: dayNightFilter || undefined,
      sortBy, sortOrder,
    }).then(res => { setData(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, search, statusFilter, dayNightFilter, sortBy, sortOrder]);
  useEffect(() => { partnersApi.simple().then(res => setPartners(res.data)); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await subconRateCardsApi.create({
        ...form,
        subcon_id: form.subcon_id ? Number(form.subcon_id) : null,
        client_id: form.client_id ? Number(form.client_id) : null,
        unit_price: Number(form.unit_price) || 0,
      });
      setShowModal(false);
      load();
    } catch (err: any) { alert(err.response?.data?.message || '新增失敗'); }
  };

  const columns = [
    { key: 'subcontractor', label: '街車公司/司機', render: (_: any, row: any) => row.subcontractor?.name || '-', filterRender: (_: any, row: any) => row.subcontractor?.name || '-' },
    { key: 'plate_no', label: '車牌', render: (v: any) => v || '-' },
    { key: 'vehicle_tonnage', label: '噸數/類別', render: (v: any) => v || '-' },
    { key: 'client', label: '客戶', render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'day_night', label: '日/夜', render: (v: any) => v || '-' },
    { key: 'origin', label: '起點', render: (v: any) => v || '-' },
    { key: 'destination', label: '終點', render: (v: any) => v || '-' },
    { key: 'unit_price', label: '單價', sortable: true, className: 'text-right', render: (v: any, row: any) => <span className="font-mono">${Number(v).toLocaleString()}/{row.unit || '天'}</span> },
    { key: 'exclude_fuel', label: '包油', render: (v: any) => v ? <span className="badge-red">不包油</span> : <span className="badge-green">包油</span>, filterRender: (v: any) => v ? '不包油' : '包油' },
    { key: 'status', label: '狀態', render: (v: any) => <span className={v === 'active' ? 'badge-green' : 'badge-gray'}>{v === 'active' ? '啟用' : '停用'}</span>, filterRender: (v: any) => v === 'active' ? '啟用' : '停用' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">街車價目表</h1>
          <p className="text-gray-500 text-sm mt-1">管理外判車輛（街車）費用</p>
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
          searchPlaceholder="搜尋街車公司、車牌、客戶、起終點..."
          onRowClick={(row) => router.push(`/subcon-rate-cards/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => { setSortBy(f); setSortOrder(o); }}
          filters={
            <div className="flex gap-2">
              <select value={dayNightFilter} onChange={e => { setDayNightFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">日/夜</option>
                <option value="日">日</option>
                <option value="夜">夜</option>
              </select>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部狀態</option>
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增街車價目" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">街車公司/司機</label>
              <select value={form.subcon_id} onChange={e => setForm({...form, subcon_id: e.target.value})} className="input-field">
                <option value="">請選擇</option>
                {partners.filter((p: any) => p.partner_type === 'subcontractor' || p.partner_type === 'supplier').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">車牌</label>
              <input value={form.plate_no} onChange={e => setForm({...form, plate_no: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">噸數/類別</label>
              <select value={form.vehicle_tonnage} onChange={e => setForm({...form, vehicle_tonnage: e.target.value})} className="input-field">
                <option value="">請選擇</option>
                {TONNAGE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
              <select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} className="input-field">
                <option value="">請選擇</option>
                {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合約</label>
              <input value={form.contract_no} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日/夜</label>
              <select value={form.day_night} onChange={e => setForm({...form, day_night: e.target.value})} className="input-field">
                <option value="日">日</option>
                <option value="夜">夜</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">起點</label>
              <input value={form.origin} onChange={e => setForm({...form, origin: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">終點</label>
              <input value={form.destination} onChange={e => setForm({...form, destination: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">單價</label>
              <div className="flex gap-1">
                <input type="number" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value})} className="input-field flex-1" />
                <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="input-field w-20">
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.exclude_fuel} onChange={e => setForm({...form, exclude_fuel: e.target.checked})} className="rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">不包油</span>
              </label>
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
