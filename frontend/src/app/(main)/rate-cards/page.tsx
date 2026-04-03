'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { rateCardsApi, companiesApi, partnersApi, projectsApi, fleetRateCardsApi, vehiclesApi, machineryApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/components/SearchableSelect';
import Combobox from '@/components/Combobox';

const SERVICE_TYPES = ['運輸', '機械租賃', '人工', '物料', '服務', '工程', '租賃/運輸'];
const UNIT_OPTIONS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];
const TONNAGE_OPTIONS = ['13噸', '20噸', '24噸', '30噸', '38噸'];
const VEHICLE_TYPE_OPTIONS = ['泥頭車', '拖頭', '吊臂車', '吊雞車', '平板車', '密斗車', '油壓車', '鈎臂車', '炮車'];
const OT_TIME_SLOTS = ['1800-1900', '1900-2000', '0600-0700', '0700-0800'];

export default function RateCardsPage() {
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
  const [projects, setProjects] = useState<any[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<any[]>([]);

  // Fleet rate card editing popup state
  const [showFleetModal, setShowFleetModal] = useState(false);
  const [fleetCards, setFleetCards] = useState<any[]>([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetSaving, setFleetSaving] = useState(false);
  const [selectedRateCardId, setSelectedRateCardId] = useState<number | null>(null);
  // Expanded fleet card for editing
  const [expandedFleetIdx, setExpandedFleetIdx] = useState<number | null>(null);

  const openFleetModal = async (rateCardId: number) => {
    setSelectedRateCardId(rateCardId);
    setFleetLoading(true);
    setShowFleetModal(true);
    setExpandedFleetIdx(null);
    try {
      const res = await fleetRateCardsApi.linked(rateCardId);
      setFleetCards(res.data.map((c: any) => ({ ...c, ot_rates: c.ot_rates || [] })));
    } catch (err: any) {
      alert(err.response?.data?.message || '載入租賃價目失敗');
    } finally {
      setFleetLoading(false);
    }
  };

  const updateFleetCard = (index: number, field: string, value: any) => {
    setFleetCards(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const updateFleetCardOtRate = (cardIdx: number, otIdx: number, field: string, value: any) => {
    setFleetCards(prev => prev.map((c, i) => {
      if (i !== cardIdx) return c;
      const ot_rates = [...(c.ot_rates || [])];
      ot_rates[otIdx] = { ...ot_rates[otIdx], [field]: value };
      return { ...c, ot_rates };
    }));
  };

  const addFleetCardOtRate = (cardIdx: number) => {
    setFleetCards(prev => prev.map((c, i) => {
      if (i !== cardIdx) return c;
      return { ...c, ot_rates: [...(c.ot_rates || []), { time_slot: '1800-1900', rate: 0, unit: '小時' }] };
    }));
  };

  const removeFleetCardOtRate = (cardIdx: number, otIdx: number) => {
    setFleetCards(prev => prev.map((c, i) => {
      if (i !== cardIdx) return c;
      return { ...c, ot_rates: (c.ot_rates || []).filter((_: any, j: number) => j !== otIdx) };
    }));
  };

  const saveFleetCards = async () => {
    setFleetSaving(true);
    try {
      for (const card of fleetCards) {
        const { client, source_quotation, company, created_at, updated_at, ...updateData } = card;
        updateData.rate = Number(updateData.rate) || 0;
        updateData.ot_rate = Number(updateData.ot_rate) || 0;
        updateData.day_rate = Number(updateData.day_rate) || 0;
        updateData.night_rate = Number(updateData.night_rate) || 0;
        updateData.mid_shift_rate = Number(updateData.mid_shift_rate) || 0;
        if (updateData.ot_rates) {
          updateData.ot_rates = updateData.ot_rates.map((ot: any) => ({
            time_slot: ot.time_slot, rate: Number(ot.rate) || 0, unit: ot.unit || '小時',
          }));
        }
        await fleetRateCardsApi.update(card.id, updateData);
      }
      setShowFleetModal(false);
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存失敗');
    } finally {
      setFleetSaving(false);
    }
  };

  const [form, setForm] = useState<any>({
    company_id: '', client_id: '', contract_no: '', service_type: '運輸',
    name: '', description: '', vehicle_tonnage: '', vehicle_type: '', equipment_number: '',
    origin: '', destination: '',
    day_rate: 0, day_unit: '天', night_rate: 0, night_unit: '晚',
    mid_shift_rate: 0, mid_shift_unit: '天', ot_rate: 0, ot_unit: '小時',
    effective_date: '', expiry_date: '', project_id: '',
    remarks: '', status: 'active',
    ot_rates: [],
  });

  const load = () => {
    setLoading(true);
    rateCardsApi.list({
      page, limit: 20, search,
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
    projectsApi.simple().then(res => setProjects(res.data)).catch(() => {});
    Promise.all([vehiclesApi.simple(), machineryApi.simple()]).then(([vRes, mRes]) => {
      setEquipmentOptions([...vRes.data, ...mRes.data]);
    }).catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        company_id: Number(form.company_id),
        client_id: Number(form.client_id),
        project_id: form.project_id ? Number(form.project_id) : null,
        day_rate: Number(form.day_rate) || 0,
        night_rate: Number(form.night_rate) || 0,
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
    await rateCardsApi.update(id, {
      service_type: formData.service_type,
      name: formData.name,
      vehicle_tonnage: formData.vehicle_tonnage,
      origin: formData.origin,
      destination: formData.destination,
      day_rate: formData.day_rate ? Number(formData.day_rate) : 0,
      night_rate: formData.night_rate ? Number(formData.night_rate) : 0,
      mid_shift_rate: formData.mid_shift_rate ? Number(formData.mid_shift_rate) : 0,
      ot_rate: formData.ot_rate ? Number(formData.ot_rate) : 0,
      effective_date: formData.effective_date || null,
      expiry_date: formData.expiry_date || null,
      status: formData.status,
      remarks: formData.remarks,
    });
    load();
  };

  const statusOptions = [
    { value: 'active', label: '啟用' },
    { value: 'inactive', label: '停用' },
  ];

  const clientOptions = partners
    .filter((p: any) => p.partner_type === 'client')
    .map((p: any) => ({ value: p.id, label: p.code ? `${p.code} - ${p.name}` : p.name }));

  const columns = [
    { key: 'client', label: '客戶', sortable: true, editable: false, render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'company', label: '公司', sortable: true, editable: false, render: (_: any, row: any) => row.company?.internal_prefix || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || '-' },
    { key: 'service_type', label: '服務類型', sortable: true, editable: true, editType: 'select' as const, editOptions: SERVICE_TYPES.map(t => ({ value: t, label: t })) },
    { key: 'name', label: '名稱', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'vehicle_tonnage', label: '噸數', sortable: true, editable: true, editType: 'select' as const, editOptions: [{ value: '', label: '不適用' }, ...TONNAGE_OPTIONS.map(t => ({ value: t, label: t }))], render: (v: any) => v || '-' },
    { key: 'vehicle_type', label: '機種', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'origin', label: '起點', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'destination', label: '終點', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => v || '-' },
    { key: 'day_rate', label: '日間', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any, row: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}/{row.day_unit || '天'}</span> : '-' },
    { key: 'night_rate', label: '夜間', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any, row: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}/{row.night_unit || '晚'}</span> : '-' },
    { key: 'effective_date', label: '生效日期', sortable: true, editable: true, editType: 'date' as const, render: (v: any) => fmtDate(v) },
    { key: 'expiry_date', label: '到期日期', sortable: true, editable: true, editType: 'date' as const, render: (v: any) => fmtDate(v) },
    { key: 'source_quotation', label: '來源報價單', sortable: true, editable: false, render: (_: any, row: any) => row.source_quotation ? (
      <span className="font-mono text-xs text-primary-600">{row.source_quotation.quotation_no}</span>
    ) : '-' },
    { key: 'project', label: '工程項目', sortable: true, editable: false, render: (_: any, row: any) => row.project ? (
      <span className="font-mono text-xs text-primary-600">{row.project.project_no}</span>
    ) : '-' },
    { key: 'status', label: '狀態', sortable: true, editable: true, editType: 'select' as const, editOptions: statusOptions, render: (v: any) => <span className={v === 'active' ? 'badge-green' : 'badge-gray'}>{v === 'active' ? '啟用' : '停用'}</span>, filterRender: (v: any) => v === 'active' ? '啟用' : '停用' },
    { key: '_fleet', label: '租賃價目', sortable: false, editable: false, render: (_: any, row: any) => (
      <button
        onClick={(e) => { e.stopPropagation(); openFleetModal(row.id); }}
        className="text-xs text-primary-600 hover:text-primary-800 hover:underline whitespace-nowrap"
      >詳細編輯</button>
    ) },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('rate-cards', columns);


  const handleInlineDelete = async (id: number) => {
    await rateCardsApi.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">客戶價目表</h1>
          <p className="text-gray-500 text-sm mt-1">管理客戶定價，支援日/夜/中直/OT多維度費率</p>
        </div>
        <div className="flex gap-2">
          <CsvImportModal module="rate-cards" onImportComplete={load} />
          <button onClick={() => setShowModal(true)} className="btn-primary">新增價目</button>
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
          onRowClick={(row) => router.push(`/rate-cards/${row.id}`)}
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
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          }
        />
      </div>

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
                options={TONNAGE_OPTIONS.map(t => ({ value: t, label: t }))}
                placeholder="選擇或輸入噸數"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">機種</label>
              <Combobox
                value={form.vehicle_type}
                onChange={(val) => setForm({...form, vehicle_type: val || ''})}
                options={VEHICLE_TYPE_OPTIONS.map(t => ({ value: t, label: t }))}
                placeholder="選擇或輸入機種"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">機號</label>
              <Combobox
                value={form.equipment_number}
                onChange={(val) => setForm({...form, equipment_number: val || ''})}
                options={equipmentOptions}
                placeholder="選擇或輸入機號"
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

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">有效期及關聯</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">生效日期</label>
                <input type="date" value={form.effective_date} onChange={e => setForm({...form, effective_date: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">到期日期</label>
                <input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">關聯工程項目</label>
                <select value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})} className="input-field">
                  <option value="">無</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">費率設定</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">日間費率</label>
                <div className="flex gap-1">
                  <input type="number" value={form.day_rate} onChange={e => setForm({...form, day_rate: e.target.value})} className="input-field flex-1" placeholder="0" />
                  <select value={form.day_unit} onChange={e => setForm({...form, day_unit: e.target.value})} className="input-field w-20">
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">夜間費率</label>
                <div className="flex gap-1">
                  <input type="number" value={form.night_rate} onChange={e => setForm({...form, night_rate: e.target.value})} className="input-field flex-1" placeholder="0" />
                  <select value={form.night_unit} onChange={e => setForm({...form, night_unit: e.target.value})} className="input-field w-20">
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">中直費率</label>
                <div className="flex gap-1">
                  <input type="number" value={form.mid_shift_rate} onChange={e => setForm({...form, mid_shift_rate: e.target.value})} className="input-field flex-1" placeholder="0" />
                  <select value={form.mid_shift_unit} onChange={e => setForm({...form, mid_shift_unit: e.target.value})} className="input-field w-20">
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">OT 費率</label>
                <div className="flex gap-1">
                  <input type="number" value={form.ot_rate} onChange={e => setForm({...form, ot_rate: e.target.value})} className="input-field flex-1" placeholder="0" />
                  <select value={form.ot_unit} onChange={e => setForm({...form, ot_unit: e.target.value})} className="input-field w-20">
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
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

      {/* Fleet Rate Card Editing Modal - Full fields per card */}
      <Modal isOpen={showFleetModal} onClose={() => setShowFleetModal(false)} title="編輯租賃價目表" size="xl">
        {fleetLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : fleetCards.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">沒有對應的租賃價目表記錄</p>
        ) : (
          <div className="space-y-3 max-h-[75vh] overflow-y-auto">
            <p className="text-xs text-gray-500">以下是與此客戶價目對應的租賃價目表（自家成本價）。點擊展開編輯各條記錄。</p>
            {fleetCards.map((card, idx) => (
              <div key={card.id} className="border rounded-lg overflow-hidden">
                {/* Card header - click to expand */}
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                  onClick={() => setExpandedFleetIdx(expandedFleetIdx === idx ? null : idx)}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-gray-700">#{idx + 1}</span>
                    {card.day_night && <span className="badge-blue">{card.day_night}</span>}
                    {card.vehicle_tonnage && <span className="text-gray-600">{card.vehicle_tonnage}</span>}
                    {card.vehicle_type && <span className="text-gray-600">{card.vehicle_type}</span>}
                    {card.equipment_number && <span className="text-gray-500 font-mono">{card.equipment_number}</span>}
                    {(card.day_rate > 0 || card.night_rate > 0 || card.rate > 0) && (
                      <span className="text-primary-600 font-mono">
                        ${Number(card.day_rate || card.rate || 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 text-xs">{expandedFleetIdx === idx ? '▲ 收起' : '▼ 展開'}</span>
                </button>

                {/* Expanded form */}
                {expandedFleetIdx === idx && (
                  <div className="p-4 space-y-4">
                    {/* Basic info */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">日/夜</label>
                        <select value={card.day_night || ''} onChange={e => updateFleetCard(idx, 'day_night', e.target.value)} className="input-field text-sm">
                          <option value="">無</option>
                          <option value="日">日</option>
                          <option value="夜">夜</option>
                          <option value="中直">中直</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">合約編號</label>
                        <input value={card.contract_no || ''} onChange={e => updateFleetCard(idx, 'contract_no', e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">服務類型</label>
                        <select value={card.service_type || ''} onChange={e => updateFleetCard(idx, 'service_type', e.target.value)} className="input-field text-sm">
                          <option value="">無</option>
                          {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">名稱</label>
                        <input value={card.name || ''} onChange={e => updateFleetCard(idx, 'name', e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">噸數</label>
                        <Combobox
                          value={card.vehicle_tonnage || ''}
                          onChange={(val) => updateFleetCard(idx, 'vehicle_tonnage', val || '')}
                          options={TONNAGE_OPTIONS.map(t => ({ value: t, label: t }))}
                          placeholder="選擇或輸入噸數"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">機種</label>
                        <Combobox
                          value={card.vehicle_type || ''}
                          onChange={(val) => updateFleetCard(idx, 'vehicle_type', val || '')}
                          options={VEHICLE_TYPE_OPTIONS.map(t => ({ value: t, label: t }))}
                          placeholder="選擇或輸入機種"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">機號</label>
                        <Combobox
                          value={card.equipment_number || ''}
                          onChange={(val) => updateFleetCard(idx, 'equipment_number', val || '')}
                          options={equipmentOptions}
                          placeholder="選擇或輸入機號"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">起點</label>
                        <input value={card.origin || ''} onChange={e => updateFleetCard(idx, 'origin', e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">終點</label>
                        <input value={card.destination || ''} onChange={e => updateFleetCard(idx, 'destination', e.target.value)} className="input-field text-sm" />
                      </div>
                    </div>

                    {/* Rates */}
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">費率</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">日間費率</label>
                          <div className="flex gap-1">
                            <input type="number" value={card.day_rate ?? 0} onChange={e => updateFleetCard(idx, 'day_rate', e.target.value)} className="input-field flex-1 text-sm" />
                            <select value={card.day_unit || '天'} onChange={e => updateFleetCard(idx, 'day_unit', e.target.value)} className="input-field w-16 text-sm">
                              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">夜間費率</label>
                          <div className="flex gap-1">
                            <input type="number" value={card.night_rate ?? 0} onChange={e => updateFleetCard(idx, 'night_rate', e.target.value)} className="input-field flex-1 text-sm" />
                            <select value={card.night_unit || '晚'} onChange={e => updateFleetCard(idx, 'night_unit', e.target.value)} className="input-field w-16 text-sm">
                              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">中直費率</label>
                          <div className="flex gap-1">
                            <input type="number" value={card.mid_shift_rate ?? 0} onChange={e => updateFleetCard(idx, 'mid_shift_rate', e.target.value)} className="input-field flex-1 text-sm" />
                            <select value={card.mid_shift_unit || '天'} onChange={e => updateFleetCard(idx, 'mid_shift_unit', e.target.value)} className="input-field w-16 text-sm">
                              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">OT 費率</label>
                          <div className="flex gap-1">
                            <input type="number" value={card.ot_rate ?? 0} onChange={e => updateFleetCard(idx, 'ot_rate', e.target.value)} className="input-field flex-1 text-sm" />
                            <select value={card.ot_unit || '小時'} onChange={e => updateFleetCard(idx, 'ot_unit', e.target.value)} className="input-field w-16 text-sm">
                              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* OT Time Slot Rates */}
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-600">OT 時段費率</p>
                        <button type="button" onClick={() => addFleetCardOtRate(idx)} className="text-xs text-primary-600 hover:underline">+ 新增時段</button>
                      </div>
                      {(card.ot_rates || []).length > 0 ? (
                        <table className="w-full text-xs border">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-2 py-1 text-left">時段</th>
                              <th className="px-2 py-1 text-right">費率</th>
                              <th className="px-2 py-1 text-left">單位</th>
                              <th className="px-2 py-1 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(card.ot_rates || []).map((ot: any, otIdx: number) => (
                              <tr key={otIdx} className="border-t">
                                <td className="px-2 py-1">
                                  <select value={ot.time_slot} onChange={e => updateFleetCardOtRate(idx, otIdx, 'time_slot', e.target.value)} className="input-field text-xs">
                                    {OT_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </td>
                                <td className="px-2 py-1">
                                  <input type="number" value={ot.rate} onChange={e => updateFleetCardOtRate(idx, otIdx, 'rate', e.target.value)} className="input-field text-xs text-right" />
                                </td>
                                <td className="px-2 py-1">
                                  <select value={ot.unit || '小時'} onChange={e => updateFleetCardOtRate(idx, otIdx, 'unit', e.target.value)} className="input-field text-xs">
                                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <button type="button" onClick={() => removeFleetCardOtRate(idx, otIdx)} className="text-red-500 hover:text-red-700">&times;</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-xs text-gray-400">暫無 OT 時段費率</p>
                      )}
                    </div>

                    {/* Dates and Remarks */}
                    <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">生效日期</label>
                        <input type="date" value={card.effective_date ? String(card.effective_date).substring(0, 10) : ''} onChange={e => updateFleetCard(idx, 'effective_date', e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">到期日期</label>
                        <input type="date" value={card.expiry_date ? String(card.expiry_date).substring(0, 10) : ''} onChange={e => updateFleetCard(idx, 'expiry_date', e.target.value)} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">狀態</label>
                        <select value={card.status || 'active'} onChange={e => updateFleetCard(idx, 'status', e.target.value)} className="input-field text-sm">
                          <option value="active">啟用</option>
                          <option value="inactive">停用</option>
                        </select>
                      </div>
                      <div className="col-span-2 md:col-span-3">
                        <label className="block text-xs text-gray-500 mb-1">備註</label>
                        <textarea value={card.remarks || ''} onChange={e => updateFleetCard(idx, 'remarks', e.target.value)} className="input-field text-sm" rows={2} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => setShowFleetModal(false)} className="btn-secondary">取消</button>
              <button type="button" onClick={saveFleetCards} disabled={fleetSaving} className="btn-primary">
                {fleetSaving ? '儲存中...' : '儲存所有'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
