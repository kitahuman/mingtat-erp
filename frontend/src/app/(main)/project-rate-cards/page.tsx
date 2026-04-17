'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { rateCardsApi, companiesApi, partnersApi, projectsApi } from '@/lib/api';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';

const SERVICE_TYPES = ['工程', '人工', '物料', '服務'];
const UNIT_OPTIONS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];

const STATUS_OPTIONS = [
  { value: 'active', label: '啟用' },
  { value: 'inactive', label: '停用' },
];

export default function ProjectRateCardsPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [form, setForm] = useState<any>({
    company_id: '', client_id: '', contract_no: '', service_type: '工程',
    name: '', description: '',
    day_rate: 0, day_unit: 'JOB',
    effective_date: '', expiry_date: '', project_id: '',
    remarks: '', status: 'active',
  });

  const load = () => {
    setLoading(true);
    rateCardsApi.list({
      page, limit: 20, search,
      rate_card_type: 'project',
      status: statusFilter || undefined,
      sortBy, sortOrder,
    }).then(res => { setData(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, search, statusFilter, sortBy, sortOrder]);
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
        rate_card_type: 'project',
        company_id: Number(form.company_id),
        client_id: Number(form.client_id),
        project_id: form.project_id ? Number(form.project_id) : null,
        day_rate: Number(form.day_rate) || 0,
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
    const textFields = ['service_type', 'name', 'contract_no', 'remarks', 'status', 'day_unit'];
    const numFields = ['day_rate'];
    const dateFields = ['effective_date', 'expiry_date'];
    textFields.forEach(f => { if (formData[f] !== undefined) payload[f] = formData[f]; });
    numFields.forEach(f => { if (formData[f] !== undefined) payload[f] = Number(formData[f]) || 0; });
    dateFields.forEach(f => { if (formData[f] !== undefined) payload[f] = formData[f] || null; });
    await rateCardsApi.update(id, payload);
    load();
  };

  const serviceTypeOptions = SERVICE_TYPES.map(t => ({ value: t, label: t }));

  const columns = [
    { key: 'project', label: '工程項目', sortable: true, editable: false, render: (_: any, row: any) => row.project ? (
      <span className="font-mono text-xs text-primary-600">{row.project.project_no}</span>
    ) : '-', filterRender: (_: any, row: any) => row.project?.project_no || '-' },
    { key: 'client', label: '客戶', sortable: true, editable: false, render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'company', label: '公司', sortable: true, editable: false, render: (_: any, row: any) => row.company?.internal_prefix || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || '-' },
    { key: 'name', label: '項目名稱', sortable: true, editable: true, editType: 'text' as const, render: (v: any) => <span className="max-w-[200px] truncate block">{v || '-'}</span> },
    { key: 'service_type', label: '服務類型', sortable: true, editable: true, editType: 'select' as const, editOptions: serviceTypeOptions },
    { key: 'day_rate', label: '單價', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any, row: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}/{row.day_unit || 'JOB'}</span> : '-' },
    { key: 'effective_date', label: '生效日期', sortable: true, editable: true, editType: 'date' as const, render: (v: any) => fmtDate(v) },
    { key: 'expiry_date', label: '到期日期', sortable: true, editable: true, editType: 'date' as const, render: (v: any) => fmtDate(v) },
    { key: 'source_quotation', label: '來源報價單', sortable: true, editable: false, render: (_: any, row: any) => row.source_quotation ? (
      <span className="font-mono text-xs text-primary-600">{row.source_quotation.quotation_no}</span>
    ) : '-' },
    { key: 'status', label: '狀態', sortable: true, editable: true, editType: 'select' as const, editOptions: STATUS_OPTIONS, render: (v: any) => <span className={v === 'active' ? 'badge-green' : 'badge-gray'}>{v === 'active' ? '啟用' : '停用'}</span>, filterRender: (v: any) => v === 'active' ? '啟用' : '停用' },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('project-rate-cards', columns);


  const handleInlineDelete = async (id: number) => {
    await rateCardsApi.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">工程價目表</h1>
          <p className="text-gray-500 text-sm mt-1">管理工程項目相關的一次性價目記錄</p>
        </div>
        <div className="flex gap-2">
          <CsvImportModal module="rate-cards" onImportComplete={load} />
          <button onClick={() => setShowModal(true)} className="btn-primary">新增工程價目</button>
        </div>
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="工程價目表"
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
          searchPlaceholder="搜尋工程項目、客戶、項目名稱..."
          onRowClick={(row) => router.push(`/project-rate-cards/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => { setSortBy(f); setSortOrder(o); }}
          onSave={handleInlineSave}
        onDelete={handleInlineDelete}
          filters={
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto">
              <option value="">全部狀態</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增工程價目" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">關聯工程項目</label>
              <select value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})} className="input-field">
                <option value="">請選擇</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">服務類型</label>
              <select value={form.service_type} onChange={e => setForm({...form, service_type: e.target.value})} className="input-field">
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">項目名稱</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field" placeholder="例如 鋪人造草皮" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合約編號</label>
              <input value={form.contract_no} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">費率及有效期</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">單價</label>
                <div className="flex gap-1">
                  <input type="number" value={form.day_rate} onChange={e => setForm({...form, day_rate: e.target.value})} className="input-field flex-1" placeholder="0" />
                  <select value={form.day_unit} onChange={e => setForm({...form, day_unit: e.target.value})} className="input-field w-20">
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">生效日期</label>
                <input type="date" value={form.effective_date} onChange={e => setForm({...form, effective_date: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">到期日期</label>
                <input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className="input-field" />
              </div>
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
