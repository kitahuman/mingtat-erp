'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { projectsApi, companiesApi, partnersApi, contractsApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import CsvImportModal from '@/components/CsvImportModal';
import { fmtDate } from '@/lib/dateUtils';

const statusLabels: Record<string, string> = {
  pending: '等待', active: '進行中', completed: '已完成', cancelled: '已取消',
};
const statusColors: Record<string, string> = {
  pending: 'badge-yellow', active: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red',
};

export default function ProjectsPage() {
  const router = useRouter();
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
  const [contracts, setContracts] = useState<any[]>([]);

  const [form, setForm] = useState<any>({
    company_id: '', client_id: '', contract_id: '', client_contract_no: '', project_name: '', description: '',
    address: '', start_date: '', end_date: '', status: 'pending', remarks: ''
  });

  const load = () => {
    setLoading(true);
    projectsApi.list({ page, limit: 20, search, status: statusFilter || undefined, sortBy, sortOrder })
      .then(res => { setData(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, search, statusFilter, sortBy, sortOrder]);
  useEffect(() => {
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
    contractsApi.simple().then(res => setContracts(res.data)).catch(() => {});
  }, []);

  // Derive whether a contract is selected and the resolved client name
  const selectedContract = useMemo(() => {
    if (!form.contract_id) return null;
    return contracts.find((c: any) => c.id === Number(form.contract_id)) || null;
  }, [form.contract_id, contracts]);

  const hasContract = !!selectedContract;

  // When contract is selected, client is auto-resolved from contract
  const resolvedClientName = useMemo(() => {
    if (!selectedContract) return '';
    return selectedContract.client?.name || '';
  }, [selectedContract]);

  const handleContractChange = (contractIdStr: string) => {
    if (contractIdStr) {
      const contract = contracts.find((c: any) => c.id === Number(contractIdStr));
      setForm({
        ...form,
        contract_id: contractIdStr,
        client_id: contract ? String(contract.client_id) : '',
      });
    } else {
      // Clear contract → restore client to editable, keep current client_id
      setForm({ ...form, contract_id: '', client_id: '' });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    // Frontend validation: client must be set
    if (!hasContract && !form.client_id) {
      alert('請選擇客戶');
      return;
    }
    try {
      await projectsApi.create({
        ...form,
        company_id: Number(form.company_id),
        client_id: form.client_id ? Number(form.client_id) : null,
        contract_id: form.contract_id ? Number(form.contract_id) : null,
      });
      setShowModal(false);
      setForm({ company_id: '', client_id: '', contract_id: '', client_contract_no: '', project_name: '', description: '', address: '', start_date: '', end_date: '', status: 'pending', remarks: '' });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '新增失敗'); }
  };

  const columns = [
    { key: 'project_no', label: '工程編號', sortable: true, render: (v: any) => <span className="font-mono font-bold text-primary-600">{v}</span> },
    { key: 'project_name', label: '工程名稱', sortable: true, render: (v: any) => <span className="max-w-[250px] truncate block">{v || '-'}</span> },
    { key: 'company', label: '公司', sortable: true, render: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || '-' },
    { key: 'client', label: '客戶', sortable: true, render: (_: any, row: any) => row.client?.name || '-', filterRender: (_: any, row: any) => row.client?.name || '-' },
    { key: 'contract', label: '合約編號', sortable: false, render: (_: any, row: any) => row.contract?.contract_no ? <span className="font-mono text-xs text-blue-600">{row.contract.contract_no}</span> : <span className="text-gray-400">&mdash;</span>, filterRender: (_: any, row: any) => row.contract?.contract_no || '' },
    { key: 'client_contract_no', label: '客戶合約', sortable: true, render: (v: any) => v ? <span className="font-mono text-xs text-indigo-600">{v}</span> : <span className="text-gray-400">&mdash;</span> },
    { key: 'start_date', label: '開始日期', sortable: true, render: (v: any) => fmtDate(v) },
    { key: 'end_date', label: '結束日期', sortable: true, render: (v: any) => fmtDate(v) },
    { key: 'status', label: '狀態', sortable: true, render: (v: any) => <span className={statusColors[v] || 'badge-gray'}>{statusLabels[v] || v}</span>, filterRender: (v: any) => statusLabels[v] || v },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">工程項目</h1>
          <p className="text-gray-500 text-sm mt-1">管理工程項目，追蹤工程進度</p>
        </div>
        <div className="flex items-center gap-2">
          <CsvImportModal module="projects" onImportComplete={load} />
          <button onClick={() => setShowModal(true)} className="btn-primary">新增工程項目</button>
        </div>
      </div>

      <div className="card">
        <DataTable
          exportFilename="工程項目列表"
          columns={columns}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={setSearch}
          searchPlaceholder="搜尋工程編號、工程名稱、客戶..."
          onRowClick={(row) => router.push(`/projects/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => { setSortBy(f); setSortOrder(o); }}
          filters={
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto">
              <option value="">全部狀態</option>
              <option value="pending">等待</option>
              <option value="active">進行中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增工程項目" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            工程編號將自動生成（格式：公司代碼-年份-P序號）
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開立公司 *</label>
              <select value={form.company_id} onChange={e => setForm({...form, company_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">關聯合約</label>
              <select
                value={form.contract_id}
                onChange={e => handleContractChange(e.target.value)}
                className="input-field"
              >
                <option value="">無合約（選填）</option>
                {contracts.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.contract_no} - {c.contract_name}{c.client?.name ? ` - ${c.client.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶 *</label>
              {hasContract ? (
                <input
                  value={resolvedClientName}
                  className="input-field bg-gray-100 cursor-not-allowed"
                  readOnly
                  tabIndex={-1}
                />
              ) : (
                <select
                  value={form.client_id}
                  onChange={e => setForm({...form, client_id: e.target.value})}
                  className="input-field"
                  required
                >
                  <option value="">請選擇客戶</option>
                  {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => (
                    <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶合約</label>
              <input value={form.client_contract_no} onChange={e => setForm({...form, client_contract_no: e.target.value})} className="input-field" placeholder="例如 ABC-2024-001" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">工程名稱 *</label>
              <input value={form.project_name} onChange={e => setForm({...form, project_name: e.target.value})} className="input-field" required placeholder="例如 機場東面機場路Site6鋪人造草皮工程" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">工程地址</label>
              <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input-field" placeholder="工程地點" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">預計開始日期</label>
              <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">預計結束日期</label>
              <input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                <option value="pending">等待</option>
                <option value="active">進行中</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">新增工程項目</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
