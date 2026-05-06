'use client';
import { useState, useEffect, useCallback } from 'react';
import DateInput from '@/components/DateInput';
import { useRouter, useSearchParams } from 'next/navigation';
import { vehiclesApi, companiesApi, fieldOptionsApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { useAuth } from '@/lib/auth';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import ExpiryBadge from '@/components/ExpiryBadge';
import { fmtDate } from '@/lib/dateUtils';

const DEFAULT_VEHICLE_TYPES = ['泥頭車', '夾車', '勾斗車', '吊車', '拖架', '拖頭', '輕型貨車', '領航車'];

export default function VehiclesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasMinRole , isReadOnly } = useAuth();
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
    plate_number: '', machine_type: '', tonnage: '', owner_company_id: '',
    brand: '', model: '', insurance_expiry: '', permit_fee_expiry: '', inspection_date: '', license_expiry: ''
  });

  useEffect(() => {
    companiesApi.simple().then(res => setCompanies(res.data));
    fieldOptionsApi.getByCategory('machine_type').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active).map((o: any) => o.label);
      if (opts.length > 0) {
        setVehicleTypes(opts);
        setForm((prev: any) => ({ ...prev, machine_type: prev.machine_type || opts[0] }));
      }
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vehiclesApi.list({
        page, limit: 20, search,
        machine_type: typeFilter || undefined,
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
      setForm({ plate_number: '', machine_type: vehicleTypes[0] || '', tonnage: '', owner_company_id: '', brand: '', model: '', insurance_expiry: '', permit_fee_expiry: '', inspection_date: '', license_expiry: '' });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '建立失敗'); }
  };

  const handleSort = (field: string, order: string) => { setSortBy(field); setSortOrder(order); setPage(1); };

  const handleInlineSave = async (id: number, formData: any) => {
    await vehiclesApi.update(id, {
      plate_number: formData.plate_number,
      machine_type: formData.machine_type,
      tonnage: formData.tonnage ? Number(formData.tonnage) : null,
      brand: formData.brand,
      model: formData.model,
      status: formData.status,
      insurance_expiry: formData.insurance_expiry || null,
      permit_fee_expiry: formData.permit_fee_expiry || null,
      inspection_date: formData.inspection_date || null,
      license_expiry: formData.license_expiry || null,
    });
    load();
  };

  const renderExpiry = (v: string) => <ExpiryBadge date={v} showLabel={false} />;
  const filterExpiry = (v: string) => fmtDate(v);

  const statusOptions = [
    { value: 'active', label: '使用中' },
    { value: 'maintenance', label: '維修中' },
    { value: 'inactive', label: '停用' },
  ];

  const columns = [
    { key: 'plate_number', label: '車牌', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => <span className="font-mono font-bold">{v}</span> },
    { key: 'machine_type', label: '車型', sortable: true, editable: true, editType: 'select' as const, editOptions: vehicleTypes.map(t => ({ value: t, label: t })) },
    { key: 'owner_company', label: '車主', sortable: true, editable: false, render: (_: any, row: any) => row.owner_company?.internal_prefix || row.owner_company?.name || '-', filterRender: (_: any, row: any) => row.owner_company?.internal_prefix || row.owner_company?.name || '-', exportRender: (_: any, row: any) => row.owner_company?.internal_prefix || row.owner_company?.name || '' },
    { key: 'tonnage', label: '噸數', sortable: true, editable: true, editType: 'number' as const, render: (v: number) => v ? `${v}T` : '-', filterRender: (v: number) => v ? `${v}T` : '-', exportRender: (v: number) => v ? `${v}` : '' },
    { key: 'brand', label: '品牌', sortable: true, editable: true, editType: 'text' as const },
    { key: 'vehicle_first_reg_date', label: '首次登記', sortable: true, editable: true, editType: 'date' as const, render: (v: string) => v ? new Date(v).toLocaleDateString('en-GB') : '-', filterRender: (v: string) => fmtDate(v), exportRender: (v: string) => v || '' },
    { key: 'vehicle_chassis_no', label: '底盤號碼', sortable: false, editable: true, editType: 'text' as const, render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : '-' },
    { key: 'insurance_expiry', label: '保險到期', sortable: true, editable: true, editType: 'date' as const, render: (v: string) => v ? new Date(v).toLocaleDateString('en-GB') : '-', filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'permit_fee_expiry', label: '牌費到期', sortable: true, editable: true, editType: 'date' as const, render: (v: string) => v ? new Date(v).toLocaleDateString('en-GB') : '-', filterRender: (v: string) => fmtDate(v), exportRender: (v: string) => v || '' },
    { key: 'inspection_date', label: '驗車到期', sortable: true, editable: true, editType: 'date' as const, render: (v: string) => v ? new Date(v).toLocaleDateString('en-GB') : '-', filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'vehicle_inspection_notes', label: '驗車備註', sortable: false, editable: false, render: (v: string) => v ? <span className="text-sm text-gray-700 whitespace-pre-wrap">{v}</span> : '-', filterRender: (v: string) => v || '-', exportRender: (v: string) => v || '' },
    { key: 'license_expiry', label: '行車證到期', sortable: true, editable: true, editType: 'date' as const, render: (v: string) => v ? new Date(v).toLocaleDateString('en-GB') : '-', filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'vehicle_mud_tail_expiry', label: '泥尾到期', sortable: true, editable: true, editType: 'date' as const, render: (v: string) => v ? new Date(v).toLocaleDateString('en-GB') : '-', filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'vehicle_insurance_agent', label: '保險代理', sortable: false, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'vehicle_insurance_company', label: '保險公司', sortable: false, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'vehicle_has_gps', label: 'GPS', sortable: false, editable: false, render: (v: boolean | null) => v === true ? '有' : v === false ? '無' : '-' },
    { key: 'vehicle_original_plate', label: '原身車牌', sortable: false, editable: true, editType: 'text' as const, render: (v: string) => v ? <span className="font-mono">{v}</span> : '-' },
    { key: 'status', label: '狀態', sortable: true, editable: true, editType: 'select' as const, editOptions: statusOptions, render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : v === 'maintenance' ? 'badge-yellow' : 'badge-red'}>
        {v === 'active' ? '使用中' : v === 'maintenance' ? '維修中' : '停用'}
      </span>
    ), filterRender: (v: string) => v === 'active' ? '使用中' : v === 'maintenance' ? '維修中' : '停用',
        exportRender: (v: string) => v === '使用中' ? '使用中' : v === 'maintenance' ? '維修中' : '停用' },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('vehicles', columns);


  const handleInlineDelete = async (id: number) => {
    await vehiclesApi.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">車輛管理</h1>
          <p className="text-gray-500 mt-1">管理所有車輛資料、車牌變更及過戶紀錄</p>
        </div>
        {hasMinRole('clerk') && (
          <div className="flex gap-2">
            <CsvImportModal module="vehicles" onImportComplete={load} />
            <button onClick={() => { setForm({ ...form, machine_type: vehicleTypes[0] || '' }); setShowModal(true); }} className="btn-primary">新增車輛</button>
          </div>
        )}
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="車輛列表"
          columns={visibleColumns as any}
          columnConfigs={columnConfigs}
          onColumnConfigChange={handleColumnConfigChange}
          onColumnConfigReset={handleReset}
          columnWidths={columnWidths}
          onColumnResize={handleColumnResize}
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
          onSave={handleInlineSave}
        onDelete={handleInlineDelete}
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
              <select value={form.machine_type} onChange={e => setForm({...form, machine_type: e.target.value})} className="input-field">
                {vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">噸數</label><input type="number" step="0.1" value={form.tonnage} onChange={e => setForm({...form, tonnage: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">車主 *</label>
              <select value={form.owner_company_id} onChange={e => setForm({...form, owner_company_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">品牌</label><input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">型號</label><input value={form.model} onChange={e => setForm({...form, model: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">保險到期日</label><DateInput value={form.insurance_expiry} onChange={value => setForm({...form, insurance_expiry: value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">牌費到期日</label><DateInput value={form.permit_fee_expiry} onChange={value => setForm({...form, permit_fee_expiry: value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">驗車到期日</label><DateInput value={form.inspection_date} onChange={value => setForm({...form, inspection_date: value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">行車證到期日</label><DateInput value={form.road_license_expiry} onChange={value => setForm({...form, road_license_expiry: value})} className="input-field" /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">建立</button></div>
        </form>
      </Modal>
    </div>
  );
}
