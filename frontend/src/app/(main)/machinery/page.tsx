'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { machineryApi, companiesApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { useAuth } from '@/lib/auth';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import ExpiryBadge from '@/components/ExpiryBadge';

const machineTypes = ['挖掘機', '裝載機', '鉸接式自卸卡車', '履帶式裝載機', '推土機', '壓路機'];
const statusOptions = [
  { value: 'active', label: '使用中' },
  { value: 'maintenance', label: '維修中' },
  { value: 'inactive', label: '停用' },
];

export default function MachineryPage() {
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
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState('machine_code');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [form, setForm] = useState<any>({
    machine_code: '', machine_type: '挖掘機', brand: '', model: '', tonnage: '',
    serial_number: '', owner_company_id: '', inspection_cert_expiry: '', insurance_expiry: ''
  });

  useEffect(() => { companiesApi.simple().then(res => setCompanies(res.data)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await machineryApi.list({
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
      await machineryApi.create({ ...form, owner_company_id: Number(form.owner_company_id), tonnage: form.tonnage ? Number(form.tonnage) : null });
      setShowModal(false);
      setForm({ machine_code: '', machine_type: '挖掘機', brand: '', model: '', tonnage: '', serial_number: '', owner_company_id: '', inspection_cert_expiry: '', insurance_expiry: '' });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '建立失敗'); }
  };

  const handleSort = (field: string, order: string) => { setSortBy(field); setSortOrder(order); setPage(1); };

  const handleInlineSave = async (id: number, formData: any) => {
    await machineryApi.update(id, {
      machine_code: formData.machine_code,
      machine_type: formData.machine_type,
      brand: formData.brand,
      model: formData.model,
      tonnage: formData.tonnage ? Number(formData.tonnage) : null,
      status: formData.status,
      inspection_cert_expiry: formData.inspection_cert_expiry || null,
      insurance_expiry: formData.insurance_expiry || null,
    });
    load();
  };

  const renderExpiry = (v: string) => <ExpiryBadge date={v} showLabel={false} />;
  const filterExpiry = (v: string) => { if (!v) return '-'; try { return new Date(v).toISOString().substring(0, 10); } catch { return v; } };

  const columns = [
    { key: 'machine_code', label: '編號', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => <span className="font-mono font-bold">{v}</span> },
    { key: 'machine_type', label: '類型', sortable: true, editable: true, editType: 'select' as const, editOptions: machineTypes.map(t => ({ value: t, label: t })) },
    { key: 'brand', label: '品牌', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'model', label: '型號', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'tonnage', label: '噸數', sortable: true, editable: true, editType: 'number' as const, render: (v: number) => v ? `${v}T` : '-', filterRender: (v: number) => v ? `${v}T` : '-' },
    { key: 'owner_company', label: '所屬公司', sortable: true, editable: false, render: (_: any, row: any) => row.owner_company?.internal_prefix || '-', filterRender: (_: any, row: any) => row.owner_company?.internal_prefix || '-' },
    { key: 'inspection_cert_expiry', label: '驗機紙到期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry },
    { key: 'insurance_expiry', label: '保險到期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry },
    { key: 'status', label: '狀態', sortable: true, editable: true, editType: 'select' as const, editOptions: statusOptions, render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : v === 'maintenance' ? 'badge-yellow' : 'badge-red'}>
        {v === 'active' ? '使用中' : v === 'maintenance' ? '維修中' : '停用'}
      </span>
    ), filterRender: (v: string) => v === '使用中' ? '使用中' : v === 'maintenance' ? '維修中' : '停用' },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('machinery', columns);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">機械管理</h1>
          <p className="text-gray-500 mt-1">管理所有機械設備資料及過戶紀錄</p>
        </div>
        {hasMinRole('clerk') && (
          <div className="flex gap-2">
            <CsvImportModal module="machinery" onImportComplete={load} />
            <button onClick={() => setShowModal(true)} className="btn-primary">新增機械</button>
          </div>
        )}
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="機械列表"
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
          searchPlaceholder="搜尋編號、品牌或型號..."
          onRowClick={(row) => router.push(`/machinery/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          onSave={handleInlineSave}
          filters={
            <div className="flex gap-2">
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部類型</option>
                {machineTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部公司</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增機械" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">機械編號 *</label><input value={form.machine_code} onChange={e => setForm({...form, machine_code: e.target.value})} className="input-field" placeholder="如 DC23" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">類型 *</label>
              <select value={form.machine_type} onChange={e => setForm({...form, machine_type: e.target.value})} className="input-field">
                {machineTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">品牌</label><input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">型號</label><input value={form.model} onChange={e => setForm({...form, model: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">噸數</label><input type="number" step="0.1" value={form.tonnage} onChange={e => setForm({...form, tonnage: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">序號</label><input value={form.serial_number} onChange={e => setForm({...form, serial_number: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">所屬公司 *</label>
              <select value={form.owner_company_id} onChange={e => setForm({...form, owner_company_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">驗機紙到期日</label><input type="date" value={form.inspection_cert_expiry} onChange={e => setForm({...form, inspection_cert_expiry: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">保險到期日</label><input type="date" value={form.insurance_expiry} onChange={e => setForm({...form, insurance_expiry: e.target.value})} className="input-field" /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">建立</button></div>
        </form>
      </Modal>
    </div>
  );
}
