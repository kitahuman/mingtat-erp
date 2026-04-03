'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subconRateCardsApi, partnersApi, companiesApi, vehiclesApi, machineryApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import Combobox from '@/components/Combobox';
import SearchableSelect from '@/components/SearchableSelect';
import { useMultiFieldOptions } from '@/hooks/useFieldOptions';

const UNIT_OPTIONS = ['天','晚','車','噸','小時','次'];
const SERVICE_TYPES = ['運輸', '機械', '勞務', '其他'];
const FIELD_OPTION_CATEGORIES = ['tonnage', 'machine_type'];

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
  const [companies, setCompanies] = useState<any[]>([]);
  const [allEquipment, setAllEquipment] = useState<{value: string; label: string}[]>([]);
  const { optionsMap } = useMultiFieldOptions(FIELD_OPTION_CATEGORIES);
  const tonnageOptions = optionsMap['tonnage'] || [];
  const vehicleTypeOptions = optionsMap['machine_type'] || [];

  const [form, setForm] = useState<any>({
    company_id: '', subcon_id: '', plate_no: '',
    client_id: '', contract_no: '', service_type: '',
    name: '', day_night: '日',
    tonnage: '', machine_type: '',
    origin: '', destination: '',
    rate: 0, mid_shift_rate: 0, ot_rate: 0,
    unit: '天', exclude_fuel: false,
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
  useEffect(() => {
    partnersApi.simple().then(res => setPartners(res.data));
    companiesApi.list().then(res => setCompanies(res.data?.data || res.data || []));
    Promise.all([
      vehiclesApi.simple().then(res => res.data),
      machineryApi.simple().then(res => res.data),
    ]).then(([vehicles, machinery]) => {
      const vPlates = vehicles.map((v: any) => v.plate_number).filter(Boolean);
      const mCodes = machinery.map((m: any) => m.machine_code).filter(Boolean);
      setAllEquipment([...vPlates, ...mCodes].map(s => ({ value: s, label: s })));
    }).catch(() => {});
  }, []);

  const resetForm = () => setForm({
    company_id: '', subcon_id: '', plate_no: '',
    client_id: '', contract_no: '', service_type: '',
    name: '', day_night: '日',
    tonnage: '', machine_type: '',
    origin: '', destination: '',
    rate: 0, mid_shift_rate: 0, ot_rate: 0,
    unit: '天', exclude_fuel: false,
    remarks: '', status: 'active',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await subconRateCardsApi.create({
        ...form,
        company_id: form.company_id ? Number(form.company_id) : null,
        subcon_id: form.subcon_id ? Number(form.subcon_id) : null,
        client_id: form.client_id ? Number(form.client_id) : null,
        rate: Number(form.rate) || 0,
        mid_shift_rate: Number(form.mid_shift_rate) || 0,
        ot_rate: Number(form.ot_rate) || 0,
      });
      setShowModal(false);
      resetForm();
      load();
    } catch (err: any) { alert(err.response?.data?.message || '新增失敗'); }
  };

  const handleInlineSave = async (id: number, formData: any) => {
    await subconRateCardsApi.update(id, {
      plate_no: formData.plate_no,
      tonnage: formData.tonnage,
      machine_type: formData.machine_type,
      contract_no: formData.contract_no,
      day_night: formData.day_night,
      origin: formData.origin,
      destination: formData.destination,
      rate: formData.rate ? Number(formData.rate) : 0,
      mid_shift_rate: formData.mid_shift_rate ? Number(formData.mid_shift_rate) : 0,
      ot_rate: formData.ot_rate ? Number(formData.ot_rate) : 0,
      unit: formData.unit,
      exclude_fuel: formData.exclude_fuel,
      status: formData.status,
      remarks: formData.remarks,
    });
    load();
  };

  const dayNightOptions = [
    { value: '日', label: '日' },
    { value: '夜', label: '夜' },
    { value: '中直', label: '中直' },
  ];

  const statusOptions = [
    { value: 'active', label: '生效中' },
    { value: 'cancelled', label: '取消' },
    { value: 'inactive', label: '停用' },
  ];

  const columns = [
    // 欄位順序：狀態、來源報價單、供應商、車牌、客戶、公司、合約、服務類型、日/夜、名稱、噸數、機種、起點、終點、費率、單位、OT費率、中直費率
    { key: 'status', label: '狀態', sortable: true, editable: true, editType: 'select' as const, editOptions: statusOptions, render: (v: any) => {
      const map: Record<string, { label: string; cls: string }> = {
        active: { label: '生效中', cls: 'badge-green' },
        cancelled: { label: '取消', cls: 'badge-red' },
        deleted: { label: '已刪除', cls: 'badge-gray' },
        inactive: { label: '停用', cls: 'badge-gray' },
      };
      const s = map[v] || { label: v, cls: 'badge-gray' };
      return <span className={s.cls}>{s.label}</span>;
    }, filterRender: (v: any) => ({ active: '生效中', cancelled: '取消', deleted: '已刪除', inactive: '停用' }[v] || v) },
    { key: 'source_quotation', label: '來源報價單', sortable: true, editable: false, render: (_: any, row: any) => row.source_quotation ? (
      <span className="font-mono text-xs text-primary-600">{row.source_quotation.quotation_no}</span>
    ) : '-' },
    { key: 'subcontractor', label: '供應商', sortable: true, editable: false, render: (_: any, row: any) => row.subcontractor?.name || '-', filterRender: (_: any, row: any) => row.subcontractor?.name || '-' },
    { key: 'plate_no', label: '車牌', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'client', label: '客戶', sortable: true, editable: false, render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'company', label: '公司', sortable: false, editable: false, render: (_: any, row: any) => row.company?.name || '-' },
    { key: 'contract_no', label: '合約', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'service_type', label: '服務類型', sortable: true, editable: true, editType: 'select' as const, editOptions: SERVICE_TYPES.map(t => ({ value: t, label: t })), render: (v: any) => v || '-' },
    { key: 'day_night', label: '日/夜', sortable: true, editable: true, editType: 'select' as const, editOptions: dayNightOptions, render: (v: any) => v || '-', filterRender: (v: any) => v || '-' },
    { key: 'name', label: '名稱', sortable: false, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'tonnage', label: '噸數', sortable: true, editable: true, editType: 'select' as const, editOptions: [{ value: '', label: '-' }, ...tonnageOptions], render: (v: any) => v || '-' },
    { key: 'machine_type', label: '機種', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'origin', label: '起點', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'destination', label: '終點', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'rate', label: '費率', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any) => {
      const r = Number(v) || 0;
      return r > 0 ? <span className="font-mono">${r.toLocaleString()}</span> : '-';
    } },
    { key: 'unit', label: '單位', sortable: true, editable: true, editType: 'select' as const, editOptions: UNIT_OPTIONS.map(u => ({ value: u, label: u })) },
    { key: 'ot_rate', label: 'OT費率', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}</span> : '-' },
    { key: 'mid_shift_rate', label: '中直費率', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}</span> : '-' },
    { key: 'exclude_fuel', label: '包油', sortable: true, editable: true, editType: 'select' as const, editOptions: [{ value: false, label: '包油' }, { value: true, label: '不包油' }], render: (v: any) => v ? <span className="badge-red">不包油</span> : <span className="badge-green">包油</span>, filterRender: (v: any) => v ? '不包油' : '包油' },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('subcon-rate-cards', columns);

  const handleInlineDelete = async (id: number) => {
    await subconRateCardsApi.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">供應商價目表</h1>
          <p className="text-gray-500 text-sm mt-1">管理外判成本價（街車、外判服務等）</p>
        </div>
        <div className="flex gap-2">
          <CsvImportModal module="subcon-rate-cards" onImportComplete={load} />
          <button onClick={() => setShowModal(true)} className="btn-primary">新增價目</button>
        </div>
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="供應商價目表"
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
          onSearch={setSearch}
          searchPlaceholder="搜尋供應商、車牌、客戶、起終點..."
          onRowClick={(row) => router.push(`/subcon-rate-cards/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => { setSortBy(f); setSortOrder(o); }}
          onSave={handleInlineSave}
          onDelete={handleInlineDelete}
          filters={
            <div className="flex gap-2">
              <select value={dayNightFilter} onChange={e => { setDayNightFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">日/夜</option>
                <option value="日">日</option>
                <option value="夜">夜</option>
                <option value="中直">中直</option>
              </select>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部狀態</option>
                <option value="active">生效中</option>
                <option value="cancelled">取消</option>
                <option value="deleted">已刪除</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title="新增供應商價目" size="lg">
        <form onSubmit={handleCreate} className="space-y-6">
          {/* 基本資料 */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3">基本資料</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開票公司</label>
                <select value={form.company_id} onChange={e => setForm({...form, company_id: e.target.value})} className="input-field">
                  <option value="">請選擇</option>
                  {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">供應商</label>
                <SearchableSelect
                  value={form.subcon_id}
                  onChange={(v) => setForm({...form, subcon_id: v})}
                  options={partners.filter((p: any) => p.partner_type === 'subcontractor' || p.partner_type === 'supplier').map((p: any) => ({ value: p.id, label: p.name }))}
                  placeholder="選擇供應商"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">車牌</label>
                <Combobox
                  value={form.plate_no}
                  onChange={(v) => setForm({...form, plate_no: v})}
                  options={allEquipment}
                  placeholder="選擇或輸入車牌"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
                <SearchableSelect
                  value={form.client_id}
                  onChange={(v) => setForm({...form, client_id: v})}
                  options={partners.filter((p: any) => p.partner_type === 'client').map((p: any) => ({ value: p.id, label: p.name }))}
                  placeholder="選擇客戶"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">合約編號</label>
                <input value={form.contract_no} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">服務類型</label>
                <select value={form.service_type} onChange={e => setForm({...form, service_type: e.target.value})} className="input-field">
                  <option value="">請選擇</option>
                  {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名稱</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field" placeholder="例如 30噸泥頭車" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日/夜</label>
                <select value={form.day_night} onChange={e => setForm({...form, day_night: e.target.value})} className="input-field">
                  <option value="">無</option>
                  <option value="日">日</option>
                  <option value="夜">夜</option>
                  <option value="中直">中直</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">噸數</label>
                <Combobox
                  value={form.tonnage}
                  onChange={(v) => setForm({...form, tonnage: v})}
                  options={tonnageOptions}
                  placeholder="選擇或輸入噸數"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">機種</label>
                <Combobox
                  value={form.machine_type}
                  onChange={(v) => setForm({...form, machine_type: v})}
                  options={vehicleTypeOptions}
                  placeholder="選擇或輸入機種"
                />
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
          </div>

          {/* 費率 */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">費率</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">費率</label>
                <div className="flex gap-1">
                  <input type="number" value={form.rate} onChange={e => setForm({...form, rate: e.target.value})} className="input-field flex-1" placeholder="0" />
                  <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="input-field w-20">
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">中直費率</label>
                <input type="number" value={form.mid_shift_rate} onChange={e => setForm({...form, mid_shift_rate: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">OT 費率</label>
                <input type="number" value={form.ot_rate} onChange={e => setForm({...form, ot_rate: e.target.value})} className="input-field" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.exclude_fuel} onChange={e => setForm({...form, exclude_fuel: e.target.checked})} className="rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-700">不包油</span>
                </label>
              </div>
            </div>
          </div>

          {/* 備註 */}
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">新增</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
