'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { vehiclesApi, companiesApi, fieldOptionsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import ExpiryBadge from '@/components/ExpiryBadge';

// Fallback vehicle types in case field options haven't loaded yet
const DEFAULT_VEHICLE_TYPES = ['泥頭車', '夾車', '勾斗車', '吊車', '拖架', '拖頭', '輕型貨車', '領航車'];

export default function VehiclesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasMinRole } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState(searchParams.get('owner_company_id') || '');
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>(DEFAULT_VEHICLE_TYPES);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [form, setForm] = useState<any>({
    plate_number: '', vehicle_type: '', tonnage: '', owner_company_id: '',
    brand: '', model: '', insurance_expiry: '', permit_fee_expiry: '', inspection_date: '', license_expiry: ''
  });

  // Load reference data including dynamic vehicle types
  useEffect(() => {
    companiesApi.simple().then(res => setCompanies(res.data));
    fieldOptionsApi.getByCategory('vehicle_type').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active).map((o: any) => o.label);
      if (opts.length > 0) {
        setVehicleTypes(opts);
        setForm((prev: any) => ({ ...prev, vehicle_type: prev.vehicle_type || opts[0] }));
      }
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vehiclesApi.list({
        page, limit: 20, search,
        vehicle_type: typeFilter || undefined,
        owner_company_id: companyFilter || undefined,
        sortBy, sortOrder
      });
      setData(res.data.data);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  }, [page, search, typeFilter, companyFilter, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclesApi.create({ ...form, owner_company_id: Number(form.owner_company_id), tonnage: form.tonnage ? Number(form.tonnage) : null });
      setShowModal(false);
      setForm({ plate_number: '', vehicle_type: vehicleTypes[0] || '', tonnage: '', owner_company_id: '', brand: '', model: '', insurance_expiry: '', permit_fee_expiry: '', inspection_date: '', license_expiry: '' });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '建立失敗'); }
  };

  const handleSort = (field: string, order: string) => {
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
  };

  const renderExpiry = (v: string) => <ExpiryBadge date={v} showLabel={false} />;
  const filterExpiry = (v: string) => {
    if (!v) return '-';
    return new Date(v).toLocaleDateString('zh-HK');
  };

  const columns = [
    { key: 'plate_number', label: '車牌', sortable: true, render: (v: string) => <span className="font-mono font-bold">{v}</span> },
    { key: 'vehicle_type', label: '車型', sortable: true },
    { key: 'owner_company', label: '所屬公司', render: (_: any, row: any) => row.owner_company?.internal_prefix || '-', filterRender: (_: any, row: any) => row.owner_company?.internal_prefix || '-', exportRender: (_: any, row: any) => row.owner_company?.internal_prefix || row.owner_company?.name || '' },
    { key: 'tonnage', label: '噸數', sortable: true, render: (v: number) => v ? `${v}T` : '-', filterRender: (v: number) => v ? `${v}T` : '-', exportRender: (v: number) => v ? `${v}` : '' },
    { key: 'insurance_expiry', label: '保險到期', sortable: true, render: renderExpiry, filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'permit_fee_expiry', label: '牌費到期', sortable: true, render: renderExpiry, filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'inspection_date', label: '驗車到期', sortable: true, render: renderExpiry, filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'license_expiry', label: '行車證到期', sortable: true, render: renderExpiry, filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'status', label: '狀態', sortable: true, render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : v === 'maintenance' ? 'badge-yellow' : 'badge-red'}>
        {v === 'active' ? '使用中' : v === 'maintenance' ? '維修中' : '停用'}
      </span>
    ), filterRender: (v: string) => v === 'active' ? '使用中' : v === 'maintenance' ? '維修中' : '停用',
       exportRender: (v: string) => v === 'active' ? '使用中' : v === 'maintenance' ? '維修中' : '停用' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">車輛管理</h1>
          <p className="text-gray-500 mt-1">管理所有車輛資料、車牌變更及過戶紀錄</p>
        </div>
        {hasMinRole('clerk') && (
          <button onClick={() => { setForm({ ...form, vehicle_type: vehicleTypes[0] || '' }); setShowModal(true); }} className="btn-primary">新增車輛</button>
        )}
      </div>

      <div className="card">
        <DataTable
          exportFilename="車輛列表"
          columns={columns}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={(s) => { setSearch(s); setPage(1); }}
          searchPlaceholder="搜尋車牌、品牌或型號..."
          onRowClick={(row) => router.push(`/vehicles/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          filters={
            <div className="flex gap-2">
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部車型</option>
                {vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部公司</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增車輛" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">車牌 *</label><input value={form.plate_number} onChange={e => setForm({...form, plate_number: e.target.value})} className="input-field" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">車型 *</label>
              <select value={form.vehicle_type} onChange={e => setForm({...form, vehicle_type: e.target.value})} className="input-field">
                {vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">噸數</label><input type="number" step="0.1" value={form.tonnage} onChange={e => setForm({...form, tonnage: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">所屬公司 *</label>
              <select value={form.owner_company_id} onChange={e => setForm({...form, owner_company_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">品牌</label><input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">型號</label><input value={form.model} onChange={e => setForm({...form, model: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">保險到期日</label><input type="date" value={form.insurance_expiry} onChange={e => setForm({...form, insurance_expiry: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">牌費到期日</label><input type="date" value={form.permit_fee_expiry} onChange={e => setForm({...form, permit_fee_expiry: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">驗車到期日</label><input type="date" value={form.inspection_date} onChange={e => setForm({...form, inspection_date: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">行車證到期日</label><input type="date" value={form.license_expiry} onChange={e => setForm({...form, license_expiry: e.target.value})} className="input-field" /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">建立</button></div>
        </form>
      </Modal>
    </div>
  );
}
