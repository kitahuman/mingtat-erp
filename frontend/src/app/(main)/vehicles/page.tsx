'use client';
import { useState, useEffect, useCallback } from 'react';
import DateInput from '@/components/DateInput';
import { useRouter, useSearchParams } from 'next/navigation';
import { vehiclesApi, vehiclePlatesApi, companiesApi, fieldOptionsApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { useAuth } from '@/lib/auth';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import ExpiryBadge from '@/components/ExpiryBadge';
import { fmtDate } from '@/lib/dateUtils';

const DEFAULT_VEHICLE_TYPES = ['泥頭車', '夾車', '勾斗車', '吊車', '拖架', '拖頭', '輕型貨車', '領航車'];

type MainTab = 'active' | 'scrapped' | 'plates';
type PlateTab = 'in_use' | 'idle';

export default function VehiclesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasMinRole } = useAuth();
  const [activeTab, setActiveTab] = useState<MainTab>('active');
  const [plateTab, setPlateTab] = useState<PlateTab>('in_use');
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [scrappedVehicles, setScrappedVehicles] = useState<any[]>([]);
  const [plates, setPlates] = useState<any[]>([]);
  const [idlePlates, setIdlePlates] = useState<any[]>([]);
  const [activeVehicles, setActiveVehicles] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState(searchParams.get('owner_company_id') || '');
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>(DEFAULT_VEHICLE_TYPES);
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showTransferPlateModal, setShowTransferPlateModal] = useState(false);
  const [selectedPlate, setSelectedPlate] = useState<any>(null);
  const [assignForm, setAssignForm] = useState({ vehicle_id: '', assigned_date: '', notes: '' });
  const [plateTransferForm, setPlateTransferForm] = useState({ to_company_id: '', transfer_date: '', notes: '' });
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [form, setForm] = useState<any>({
    plate_mode: 'new', existing_plate_id: '', plate_number: '', machine_type: '', tonnage: '', owner_company_id: '',
    brand: '', model: '', insurance_expiry: '', inspection_date: '', license_expiry: ''
  });

  const loadReferenceData = useCallback(async () => {
    const [companiesRes, idleRes, vehiclesRes] = await Promise.all([
      companiesApi.simple(),
      vehiclePlatesApi.list({ status: 'idle' }),
      vehiclesApi.simple(),
    ]);
    setCompanies(companiesRes.data || []);
    setIdlePlates(idleRes.data || []);
    setActiveVehicles(vehiclesRes.data || []);
  }, []);

  useEffect(() => {
    loadReferenceData().catch(() => {});
    fieldOptionsApi.getByCategory('machine_type').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active).map((o: any) => o.label);
      if (opts.length > 0) {
        setVehicleTypes(opts);
        setForm((prev: any) => ({ ...prev, machine_type: prev.machine_type || opts[0] }));
      }
    }).catch(() => {});
  }, [loadReferenceData]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'plates') {
        const res = await vehiclePlatesApi.list({ status: plateTab, search: search || undefined, owner_company_id: companyFilter || undefined });
        setPlates(res.data || []);
        setTotal((res.data || []).length);
      } else if (activeTab === 'scrapped') {
        const res = await vehiclesApi.list({
          page, limit: 20, search,
          status: 'scrapped',
          owner_company_id: companyFilter || undefined,
          sortBy: sortBy === 'id' ? 'scrapped_at' : sortBy,
          sortOrder: sortBy === 'id' ? 'DESC' : sortOrder,
        });
        setScrappedVehicles(res.data.data || []);
        setTotal(res.data.total || 0);
      } else {
        const res = await vehiclesApi.list({
          page, limit: 20, search,
          status: 'not_scrapped',
          machine_type: typeFilter || undefined,
          owner_company_id: companyFilter || undefined,
          sortBy, sortOrder
        });
        setData(res.data.data || []);
        setTotal(res.data.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [activeTab, plateTab, page, search, typeFilter, companyFilter, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => setForm({ plate_mode: 'new', existing_plate_id: '', plate_number: '', machine_type: vehicleTypes[0] || '', tonnage: '', owner_company_id: '', brand: '', model: '', insurance_expiry: '', inspection_date: '', license_expiry: '' });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { ...form, owner_company_id: Number(form.owner_company_id), tonnage: form.tonnage ? Number(form.tonnage) : null };
      if (payload.plate_mode === 'existing') {
        payload.existing_plate_id = Number(payload.existing_plate_id);
        delete payload.plate_number;
      } else {
        delete payload.existing_plate_id;
      }
      await vehiclesApi.create(payload);
      setShowModal(false);
      resetForm();
      await Promise.all([load(), loadReferenceData()]);
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
      inspection_date: formData.inspection_date || null,
      license_expiry: formData.license_expiry || null,
    });
    load();
  };

  const handleInlineDelete = async (id: number) => { await vehiclesApi.delete(id); load(); };

  const handleRestore = async (vehicle: any) => {
    if (!confirm(`確定要復原車輛 ${vehicle.plate_number || vehicle.vehicle_original_plate || vehicle.id}？`)) return;
    await vehiclesApi.restore(vehicle.id);
    load();
  };

  const exportScrappedCsv = () => {
    const headers = ['品牌', '型號', '底盤號碼', '原車牌', '劏車日期', '原屬公司'];
    const rows = scrappedVehicles.map(v => [
      v.brand || '',
      v.model || '',
      v.vehicle_chassis_no || '',
      v.vehicle_original_plate || v.current_plate?.plate_number || v.plate_number || '',
      fmtDate(v.scrapped_at),
      renderCompany(v.owner_company),
    ]);
    const escape = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `已劏車車輛_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openAssignModal = (plate: any) => {
    setSelectedPlate(plate);
    setAssignForm({ vehicle_id: '', assigned_date: new Date().toISOString().slice(0, 10), notes: '' });
    setShowAssignModal(true);
  };

  const handleAssignPlate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclePlatesApi.assign(selectedPlate.id, { vehicle_id: Number(assignForm.vehicle_id), assigned_date: assignForm.assigned_date, notes: assignForm.notes });
      setShowAssignModal(false);
      await Promise.all([load(), loadReferenceData()]);
    } catch (err: any) { alert(err.response?.data?.message || '套牌失敗'); }
  };

  const openTransferPlateModal = (plate: any) => {
    setSelectedPlate(plate);
    setPlateTransferForm({ to_company_id: '', transfer_date: new Date().toISOString().slice(0, 10), notes: '' });
    setShowTransferPlateModal(true);
  };

  const handleTransferPlate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await vehiclePlatesApi.transfer(selectedPlate.id, { from_company_id: selectedPlate.owner_company_id, to_company_id: Number(plateTransferForm.to_company_id), transfer_date: plateTransferForm.transfer_date, notes: plateTransferForm.notes });
      setShowTransferPlateModal(false);
      await Promise.all([load(), loadReferenceData()]);
    } catch (err: any) { alert(err.response?.data?.message || '過戶失敗'); }
  };

  const renderExpiry = (v: string) => <ExpiryBadge date={v} showLabel={false} />;
  const filterExpiry = (v: string) => fmtDate(v);

  const statusOptions = [
    { value: 'active', label: '使用中' },
    { value: 'maintenance', label: '維修中' },
    { value: 'inactive', label: '停用' },
  ];

  const columns = [
    { key: 'plate_number', label: '車牌', sortable: true, editable: false, render: (v: string, row: any) => <span className="font-mono font-bold">{row.current_plate?.plate_number || v}</span> },
    { key: 'machine_type', label: '車型', sortable: true, editable: true, editType: 'select' as const, editOptions: vehicleTypes.map(t => ({ value: t, label: t })) },
    { key: 'owner_company', label: '車主', sortable: true, editable: false, render: (_: any, row: any) => row.owner_company?.internal_prefix || row.owner_company?.name || '-', filterRender: (_: any, row: any) => row.owner_company?.internal_prefix || row.owner_company?.name || '-', exportRender: (_: any, row: any) => row.owner_company?.internal_prefix || row.owner_company?.name || '' },
    { key: 'tonnage', label: '噸數', sortable: true, editable: true, editType: 'number' as const, render: (v: number) => v ? `${v}T` : '-', filterRender: (v: number) => v ? `${v}T` : '-', exportRender: (v: number) => v ? `${v}` : '' },
    { key: 'brand', label: '品牌', sortable: true, editable: true, editType: 'text' as const },
    { key: 'vehicle_chassis_no', label: '底盤號碼', sortable: false, editable: true, editType: 'text' as const, render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : '-' },
    { key: 'insurance_expiry', label: '保險到期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'inspection_date', label: '驗車到期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'license_expiry', label: '行車證到期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry, exportRender: (v: string) => v || '' },
    { key: 'status', label: '狀態', sortable: true, editable: true, editType: 'select' as const, editOptions: statusOptions, render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : v === 'maintenance' ? 'badge-yellow' : 'badge-red'}>{v === 'active' ? '使用中' : v === 'maintenance' ? '維修中' : '停用'}</span>
    ), filterRender: (v: string) => v === 'active' ? '使用中' : v === 'maintenance' ? '維修中' : '停用' },
  ];

  const { columnConfigs, columnWidths, visibleColumns, handleColumnConfigChange, handleReset, handleColumnResize } = useColumnConfig('vehicles', columns);

  const renderCompany = (company: any) => company?.internal_prefix ? `${company.internal_prefix} - ${company.name}` : company?.name || '-';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">車輛管理</h1>
          <p className="text-gray-500 mt-1">管理使用中車輛、已劏車車輛、車牌套牌與過戶紀錄</p>
        </div>
        {hasMinRole('clerk') && activeTab === 'active' && (
          <div className="flex gap-2">
            <CsvImportModal module="vehicles" onImportComplete={load} />
            <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary">新增車輛</button>
          </div>
        )}
      </div>

      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-6">
          {[
            ['active', '使用中車輛'], ['scrapped', '已劏車'], ['plates', '車牌管理']
          ].map(([key, label]) => (
            <button key={key} onClick={() => { setActiveTab(key as MainTab); setPage(1); setSearch(''); }} className={`py-3 text-sm font-medium border-b-2 ${activeTab === key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{label}</button>
          ))}
        </nav>
      </div>

      {activeTab === 'active' && (
        <div className="card">
          <InlineEditDataTable
            exportFilename="使用中車輛列表"
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
            searchPlaceholder="搜尋車牌、品牌、型號或底盤號碼..."
            onRowClick={(row) => router.push(`/vehicles/${row.id}`)}
            loading={loading}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            onSave={handleInlineSave}
            onDelete={handleInlineDelete}
            filters={<div className="flex gap-2"><select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto"><option value="">全部車型</option>{vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}</select><select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }} className="input-field w-auto"><option value="">全部公司</option>{companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}</select></div>}
          />
        </div>
      )}

      {activeTab === 'scrapped' && (
        <div className="card">
          <div className="flex flex-wrap gap-2 mb-4 justify-between"><div className="flex flex-wrap gap-2"><input className="input-field max-w-sm" placeholder="搜尋品牌、型號、底盤號碼或原車牌..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /><select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="input-field w-auto"><option value="">全部公司</option>{companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}</select></div><button onClick={exportScrappedCsv} className="btn-secondary">匯出 CSV</button></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">品牌</th><th className="px-3 py-2 text-left">型號</th><th className="px-3 py-2 text-left">底盤號碼</th><th className="px-3 py-2 text-left">原車牌</th><th className="px-3 py-2 text-left">劏車日期</th><th className="px-3 py-2 text-left">原屬公司</th><th className="px-3 py-2 text-right">操作</th></tr></thead><tbody>{scrappedVehicles.map(v => <tr key={v.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/vehicles/${v.id}`)}><td className="px-3 py-2">{v.brand || '-'}</td><td className="px-3 py-2">{v.model || '-'}</td><td className="px-3 py-2 font-mono text-xs">{v.vehicle_chassis_no || '-'}</td><td className="px-3 py-2 font-mono font-bold">{v.vehicle_original_plate || v.current_plate?.plate_number || v.plate_number || '-'}</td><td className="px-3 py-2">{fmtDate(v.scrapped_at)}</td><td className="px-3 py-2">{renderCompany(v.owner_company)}</td><td className="px-3 py-2 text-right"><button onClick={(e) => { e.stopPropagation(); handleRestore(v); }} className="text-primary-600 hover:underline">復原</button></td></tr>)}</tbody></table>{!loading && scrappedVehicles.length === 0 && <p className="text-gray-500 text-sm py-6 text-center">暫無已劏車車輛</p>}</div>
        </div>
      )}

      {activeTab === 'plates' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4"><div className="flex gap-2"><button onClick={() => setPlateTab('in_use')} className={`px-4 py-2 rounded ${plateTab === 'in_use' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>使用中</button><button onClick={() => setPlateTab('idle')} className={`px-4 py-2 rounded ${plateTab === 'idle' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>閒置</button></div><div className="flex gap-2"><input className="input-field" placeholder="搜尋車牌..." value={search} onChange={e => setSearch(e.target.value)} /><select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="input-field w-auto"><option value="">全部公司</option>{companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}</select></div></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">車牌號碼</th><th className="px-3 py-2 text-left">持有公司</th><th className="px-3 py-2 text-left">{plateTab === 'in_use' ? '目前車輛' : '上一輛車'}</th><th className="px-3 py-2 text-left">{plateTab === 'in_use' ? '套牌日期' : '閒置日期'}</th><th className="px-3 py-2 text-right">操作</th></tr></thead><tbody>{plates.map(p => <tr key={p.id} className="border-b hover:bg-gray-50"><td className="px-3 py-2 font-mono font-bold cursor-pointer text-primary-600" onClick={() => router.push(`/vehicles/plates/${p.id}`)}>{p.plate_number}</td><td className="px-3 py-2">{renderCompany(p.owner_company)}</td><td className="px-3 py-2">{plateTab === 'in_use' ? (p.current_vehicle ? `${p.current_vehicle.plate_number} ${p.current_vehicle.brand || ''} ${p.current_vehicle.model || ''}` : '-') : (p.latest_assignment?.vehicle ? `${p.latest_assignment.vehicle.plate_number} ${p.latest_assignment.vehicle.brand || ''} ${p.latest_assignment.vehicle.model || ''}` : '-')}</td><td className="px-3 py-2">{plateTab === 'in_use' ? fmtDate(p.latest_assignment?.assigned_date) : fmtDate(p.latest_assignment?.removed_date)}</td><td className="px-3 py-2 text-right space-x-3"><button onClick={() => openAssignModal(p)} className="text-primary-600 hover:underline">套牌</button><button onClick={() => openTransferPlateModal(p)} className="text-primary-600 hover:underline">過戶</button></td></tr>)}</tbody></table>{!loading && plates.length === 0 && <p className="text-gray-500 text-sm py-6 text-center">暫無車牌紀錄</p>}</div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增車輛" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="rounded-lg border p-3 bg-gray-50"><label className="block text-sm font-medium text-gray-700 mb-2">車牌來源 *</label><div className="flex flex-wrap gap-4"><label className="inline-flex items-center gap-2"><input type="radio" checked={form.plate_mode === 'new'} onChange={() => setForm({...form, plate_mode: 'new', existing_plate_id: ''})} />新車牌</label><label className="inline-flex items-center gap-2"><input type="radio" checked={form.plate_mode === 'existing'} onChange={() => setForm({...form, plate_mode: 'existing', plate_number: ''})} />套用現有閒置車牌</label></div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {form.plate_mode === 'new' ? <div><label className="block text-sm font-medium text-gray-700 mb-1">新車牌號碼 *</label><input value={form.plate_number} onChange={e => setForm({...form, plate_number: e.target.value})} className="input-field" required /></div> : <div><label className="block text-sm font-medium text-gray-700 mb-1">閒置車牌 *</label><select value={form.existing_plate_id} onChange={e => setForm({...form, existing_plate_id: e.target.value})} className="input-field" required><option value="">請選擇</option>{idlePlates.map(p => <option key={p.id} value={p.id}>{p.plate_number} — {renderCompany(p.owner_company)}</option>)}</select></div>}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">車型 *</label><select value={form.machine_type} onChange={e => setForm({...form, machine_type: e.target.value})} className="input-field" required>{vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">噸數</label><input type="number" step="0.1" value={form.tonnage} onChange={e => setForm({...form, tonnage: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">車主 *</label><select value={form.owner_company_id} onChange={e => setForm({...form, owner_company_id: e.target.value})} className="input-field" required><option value="">請選擇</option>{companies.map(c => <option key={c.id} value={c.id}>{renderCompany(c)}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">品牌</label><input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">型號</label><input value={form.model} onChange={e => setForm({...form, model: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">保險到期日</label><DateInput value={form.insurance_expiry} onChange={value => setForm({...form, insurance_expiry: value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">驗車到期日</label><DateInput value={form.inspection_date} onChange={value => setForm({...form, inspection_date: value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">行車證到期日</label><DateInput value={form.license_expiry} onChange={value => setForm({...form, license_expiry: value})} className="input-field" /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">建立</button></div>
        </form>
      </Modal>

      <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)} title={`套牌：${selectedPlate?.plate_number || ''}`}>
        <form onSubmit={handleAssignPlate} className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">目標車輛 *</label><select value={assignForm.vehicle_id} onChange={e => setAssignForm({...assignForm, vehicle_id: e.target.value})} className="input-field" required><option value="">請選擇</option>{activeVehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number || v.label} — {v.type || ''}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">套牌日期 *</label><DateInput value={assignForm.assigned_date} onChange={value => setAssignForm({...assignForm, assigned_date: value})} className="input-field" required /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={assignForm.notes} onChange={e => setAssignForm({...assignForm, notes: e.target.value})} className="input-field" rows={2} /></div><div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowAssignModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">確認套牌</button></div></form>
      </Modal>

      <Modal isOpen={showTransferPlateModal} onClose={() => setShowTransferPlateModal(false)} title={`車牌過戶：${selectedPlate?.plate_number || ''}`}>
        <form onSubmit={handleTransferPlate} className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">目前公司</label><input value={renderCompany(selectedPlate?.owner_company)} className="input-field bg-gray-50" disabled /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">過戶至 *</label><select value={plateTransferForm.to_company_id} onChange={e => setPlateTransferForm({...plateTransferForm, to_company_id: e.target.value})} className="input-field" required><option value="">請選擇</option>{companies.filter(c => c.id !== selectedPlate?.owner_company_id).map(c => <option key={c.id} value={c.id}>{renderCompany(c)}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">過戶日期 *</label><DateInput value={plateTransferForm.transfer_date} onChange={value => setPlateTransferForm({...plateTransferForm, transfer_date: value})} className="input-field" required /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={plateTransferForm.notes} onChange={e => setPlateTransferForm({...plateTransferForm, notes: e.target.value})} className="input-field" rows={2} /></div><div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowTransferPlateModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">確認過戶</button></div></form>
      </Modal>
    </div>
  );
}
