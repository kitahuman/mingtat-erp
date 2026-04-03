'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { rateCardsApi, companiesApi, partnersApi } from '@/lib/api';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/components/SearchableSelect';
import Combobox from '@/components/Combobox';
import { useMultiFieldOptions } from '@/hooks/useFieldOptions';

const SERVICE_TYPES = ['運輸', '機械租賃', '人工', '物料', '服務', '租賃/運輸'];
const UNIT_OPTIONS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];
const FIELD_OPTION_CATEGORIES = ['tonnage', 'vehicle_type'];

const STATUS_OPTIONS = [
  { value: 'active', label: '生效中' },
  { value: 'inactive', label: '停用' },
  { value: 'cancelled', label: '取消' },
];

export default function RentalRateCardsPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const { optionsMap } = useMultiFieldOptions(FIELD_OPTION_CATEGORIES);
  const tonnageOptions = optionsMap['tonnage'] || [];
  const vehicleTypeOptions = optionsMap['vehicle_type'] || [];

  const [form, setForm] = useState<any>({
    company_id: '', client_id: '', contract_no: '', service_type: '運輸',
    name: '', description: '', day_night: '', vehicle_tonnage: '', vehicle_type: '',
    origin: '', destination: '',
    rate: 0, unit: '車', mid_shift_rate: 0, ot_rate: 0,
    effective_date: '', expiry_date: '',
    remarks: '', status: 'active',
    ot_rates: [],
  });

  const load = () => {
    setLoading(true);
    rateCardsApi.list({
      page, limit: 20, search,
      rate_card_type: 'rental',
      status: statusFilter || undefined,
      service_type: serviceTypeFilter || undefined,
      sortBy, sortOrder,
    }).then(res => { setData(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, search, statusFilter, serviceTypeFilter, sortBy, sortOrder]);
  useEffect(() => {
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        rate_card_type: 'rental',
        company_id: Number(form.company_id),
        client_id: Number(form.client_id),
        rate: Number(form.rate) || 0,
        day_rate: Number(form.rate) || 0,
        night_rate: 0,
        mid_shift_rate: Number(form.mid_shift_rate) || 0,
        ot_rate: Number(form.ot_rate) || 0,
        effective_date: form.effective_date || null,
        expiry_date: form.expiry_date || null,
      };
      await rateCardsApi.create(payload);
      setShowModal(false);
      load();
    } catch (err: any) { alert(err.response?.data?.message || '新增失敗'); }
  };

  const handleInlineSave = async (id: number, formData: any) => {
    const payload: any = {};
    const textFields = ['service_type', 'name', 'vehicle_tonnage', 'vehicle_type', 'origin', 'destination', 'contract_no', 'remarks', 'status', 'day_night', 'unit'];
    const numFields = ['rate', 'mid_shift_rate', 'ot_rate'];
    const dateFields = ['effective_date', 'expiry_date'];
    textFields.forEach(f => { if (formData[f] !== undefined) payload[f] = formData[f]; });
    numFields.forEach(f => { if (formData[f] !== undefined) payload[f] = Number(formData[f]) || 0; });
    dateFields.forEach(f => { if (formData[f] !== undefined) payload[f] = formData[f] || null; });
    await rateCardsApi.update(id, payload);
    load();
  };

  const serviceTypeOptions = SERVICE_TYPES.map(t => ({ value: t, label: t }));
  const unitOptions = UNIT_OPTIONS.map(u => ({ value: u, label: u }));

  const clientOptions = partners
    .filter((p: any) => p.partner_type === 'client')
    .map((p: any) => ({ value: p.id, label: p.code ? `${p.code} - ${p.name}` : p.name }));

  const columns = [
    { key: 'client', label: '客戶', sortable: true, editable: false, render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'company', label: '公司', sortable: true, editable: false, render: (_: any, row: any) => row.company?.internal_prefix || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || '-' },
    { key: 'service_type', label: '服務類型', sortable: true, editable: true, editType: 'select' as const, editOptions: serviceTypeOptions },
    { key: 'name', label: '名稱', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'vehicle_tonnage', label: '噸數', sortable: true, editable: true, editType: 'select' as const, editOptions: [{ value: '', label: '不適用' }, ...tonnageOptions], render: (v: any) => v || '-' },
    { key: 'vehicle_type', label: '機種', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'origin', label: '起點', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'destination', label: '終點', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'day_night', label: '日/夜', sortable: true, editable: true, editType: 'select' as const, editOptions: [{ value: '', label: '-' }, { value: '日', label: '日' }, { value: '夜', label: '夜' }, { value: '中直', label: '中直' }], render: (v: any) => v || '-' },
    { key: 'rate', label: '費率', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any, row: any) => { const r = Number(v || row.day_rate || 0); return r > 0 ? <span className="font-mono">${r.toLocaleString()}/{row.unit || '車'}</span> : '-'; } },
    { key: 'mid_shift_rate', label: '中直', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any) => Number(v) > 0 ? <span className="font-mono">${Number(v).toLocaleString()}</span> : '-' },
    { key: 'effective_date', label: '生效日期', sortable: true, editable: true, editType: 'date' as const, render: (v: any) => fmtDate(v) },
    { key: 'expiry_date', label: '到期日期', sortable: true, editable: true, editType: 'date' as const, render: (v: any) => fmtDate(v) },
    { key: 'source_quotation', label: '來源報價單', sortable: true, editable: false, render: (_: any, row: any) => row.source_quotation ? (
      <span className="font-mono text-xs text-primary-600">{row.source_quotation.quotation_no}</span>
    ) : '-' },
    { key: 'status', label: '狀態', sortable: true, editable: true, editType: 'select' as const, editOptions: STATUS_OPTIONS, render: (v: any) => {
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

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('rental-rate-cards', columns);


  const handleInlineDelete = async (id: number) => {
    await rateCardsApi.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">客戶價目表</h1>
          <p className="text-gray-500 text-sm mt-1">管理客戶報價（收入端），支援日/夜/中直/OT多維度費率</p>
        </div>
        <div className="flex gap-2">
          <CsvImportModal module="rate-cards" onImportComplete={load} />
          <button onClick={() => setShowModal(true)} className="btn-primary">新增客戶價目</button>
        </div>
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="客戶價目表"
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
          searchPlaceholder="搜尋客戶、名稱、起終點..."
          onRowClick={(row) => router.push(`/rental-rate-cards/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => { setSortBy(f); setSortOrder(o); }}
          onSave={handleInlineSave}
        onDelete={handleInlineDelete}
          filters={
            <div className="flex gap-2">
              <select value={serviceTypeFilter} onChange={e => { setServiceTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部類型</option>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

      {/* Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增客戶價目" size="xl">
        <form onSubmit={handleCreate} className="space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開票公司 *</label>
              <select value={form.company_id} onChange={e => setForm({...form, company_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶 *</label>
              <SearchableSelect
                value={form.client_id}
                onChange={(val) => setForm({...form, client_id: val || ''})}
                options={clientOptions}
                placeholder="搜尋客戶..."
                clearable={true}
              />
              {!form.client_id && <input tabIndex={-1} autoComplete="off" style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }} value={form.client_id} onChange={() => {}} required />}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合約編號</label>
              <input value={form.contract_no} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">服務類型</label>
              <select value={form.service_type} onChange={e => setForm({...form, service_type: e.target.value})} className="input-field">
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名稱</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field" placeholder="例如 20噸泥頭車" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">噸數</label>
              <Combobox
                value={form.vehicle_tonnage}
                onChange={(val) => setForm({...form, vehicle_tonnage: val || ''})}
                options={tonnageOptions}
                placeholder="選擇或輸入噸數"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">機種</label>
              <Combobox
                value={form.vehicle_type}
                onChange={(val) => setForm({...form, vehicle_type: val || ''})}
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

          {/* Dates */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">有效期</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">生效日期</label>
                <input type="date" value={form.effective_date} onChange={e => setForm({...form, effective_date: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">到期日期</label>
                <input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className="input-field" />
              </div>
            </div>
          </div>

          {/* Rates */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">費率設定</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">日/夜</label>
                <select value={form.day_night || ''} onChange={e => setForm({...form, day_night: e.target.value})} className="input-field">
                  <option value="">無</option>
                  <option value="日">日</option>
                  <option value="夜">夜</option>
                  <option value="中直">中直</option>
                </select>
              </div>
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
                <input type="number" value={form.mid_shift_rate} onChange={e => setForm({...form, mid_shift_rate: e.target.value})} className="input-field" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">OT 費率</label>
                <input type="number" value={form.ot_rate} onChange={e => setForm({...form, ot_rate: e.target.value})} className="input-field" placeholder="0" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註（包油/不包油、包司機等）</label>
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
