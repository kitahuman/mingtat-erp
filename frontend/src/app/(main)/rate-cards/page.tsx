'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { rateCardsApi, companiesApi, partnersApi, projectsApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';

const SERVICE_TYPES = ['運輸', '機械租賃', '人工', '物料', '服務', '工程', '租賃/運輸'];
const UNIT_OPTIONS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];
const TONNAGE_OPTIONS = ['13噸', '20噸', '24噸', '30噸', '38噸'];

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
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [form, setForm] = useState<any>({
    company_id: '', client_id: '', contract_no: '', service_type: '運輸',
    name: '', description: '', vehicle_tonnage: '', vehicle_type: '',
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

  const columns = [
    { key: 'client', label: '客戶', render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'company', label: '公司', render: (_: any, row: any) => row.company?.internal_prefix || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || '-' },
    { key: 'service_type', label: '服務類型' },
    { key: 'name', label: '名稱', render: (v: any) => v || '-' },
    { key: 'vehicle_tonnage', label: '噸數', render: (v: any) => v || '-' },
    { key: 'origin', label: '起點', render: (v: any) => v || '-' },
    { key: 'destination', label: '終點', render: (v: any) => v || '-' },
    { key: 'day_rate', label: '日間', sortable: true, className: 'text-right', render: (v: any, row: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}/{row.day_unit || '天'}</span> : '-' },
    { key: 'night_rate', label: '夜間', className: 'text-right', render: (v: any, row: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}/{row.night_unit || '晚'}</span> : '-' },
    { key: 'effective_date', label: '生效日期', sortable: true, render: (v: any) => v || '-' },
    { key: 'expiry_date', label: '到期日期', render: (v: any) => v || '-' },
    { key: 'source_quotation', label: '來源報價單', render: (_: any, row: any) => row.source_quotation ? (
      <span className="font-mono text-xs text-primary-600">{row.source_quotation.quotation_no}</span>
    ) : '-' },
    { key: 'project', label: '工程項目', render: (_: any, row: any) => row.project ? (
      <span className="font-mono text-xs text-primary-600">{row.project.project_no}</span>
    ) : '-' },
    { key: 'status', label: '狀態', render: (v: any) => <span className={v === 'active' ? 'badge-green' : 'badge-gray'}>{v === 'active' ? '啟用' : '停用'}</span>, filterRender: (v: any) => v === 'active' ? '啟用' : '停用' },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('rate-cards', columns);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">客戶價目表</h1>
          <p className="text-gray-500 text-sm mt-1">管理客戶定價，支援日/夜/中直/OT多維度費率</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCsvImport(true)} className="btn-secondary">匯入 CSV</button>
          <button onClick={() => setShowModal(true)} className="btn-primary">新增價目</button>
        </div>
      </div>

      <div className="card">
        <DataTable
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

      {/* Create Modal */}
      <CsvImportModal module="rate-cards" moduleName="租賃價目表" isOpen={showCsvImport} onClose={() => setShowCsvImport(false)} onSuccess={load} />

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
              <select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>)}
              </select>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">車輛噸數</label>
              <select value={form.vehicle_tonnage} onChange={e => setForm({...form, vehicle_tonnage: e.target.value})} className="input-field">
                <option value="">不適用</option>
                {TONNAGE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
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
          </div>

          {/* Dates and Project */}
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
    </div>
  );
}
