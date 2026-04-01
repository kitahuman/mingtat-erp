'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { employeesApi, companiesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import ExpiryBadge from '@/components/ExpiryBadge';

const roleLabels: Record<string, string> = {
  admin: '管理', driver: '司機', operator: '機手', worker: '雜工',
  subcontractor: '鴻輝代工', casual_operator: '散工機手',
  foreman: '管工', safety_officer: '安全督導員', director: '董事', t1: 'T1',
};
const roleOptions = [
  { value: 'driver', label: '司機' },
  { value: 'operator', label: '機手' },
  { value: 'worker', label: '雜工' },
  { value: 'admin', label: '管理' },
  { value: 'subcontractor', label: '鴻輝代工' },
  { value: 'casual_operator', label: '散工機手' },
  { value: 'foreman', label: '管工' },
  { value: 'safety_officer', label: '安全督導員' },
  { value: 'director', label: '董事' },
  { value: 't1', label: 'T1' },
];

const roleBadgeClass = (v: string) => {
  switch (v) {
    case 'admin': return 'badge-blue';
    case 'driver': return 'badge-green';
    case 'operator': return 'badge-yellow';
    case 'subcontractor': return 'bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full text-xs font-medium';
    case 'casual_operator': return 'bg-orange-100 text-orange-800 border border-orange-200 px-2 py-0.5 rounded-full text-xs font-medium';
    case 'director': return 'bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-full text-xs font-medium';
    default: return 'badge-gray';
  }
};

type TabType = 'active' | 'inactive';

export default function EmployeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasMinRole } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState(searchParams.get('company_id') || '');
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [form, setForm] = useState<any>({ name_zh: '', name_en: '', role: 'worker', phone: '', company_id: '', emp_code: '', join_date: '' });

  useEffect(() => { companiesApi.simple().then(res => setCompanies(res.data)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await employeesApi.list({
        page, limit: 20, search,
        role: roleFilter || undefined,
        company_id: companyFilter || undefined,
        status: activeTab,
        sortBy, sortOrder
      });
      setData(res.data.data);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  }, [page, search, roleFilter, companyFilter, sortBy, sortOrder, activeTab]);

  useEffect(() => { load(); }, [load]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setSearch('');
    setRoleFilter('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await employeesApi.create({ ...form, company_id: Number(form.company_id) });
      setShowModal(false);
      setForm({ name_zh: '', name_en: '', role: 'worker', phone: '', company_id: '', emp_code: '', join_date: '' });
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

  const activeColumns = [
    { key: 'emp_code', label: '編號', sortable: true, className: 'w-20 font-mono', render: (v: string) => v || '-' },
    { key: 'name_zh', label: '姓名', sortable: true, render: (_: any, row: any) => (
      <div><div className="font-medium text-gray-900">{row.name_zh}</div>{row.name_en && <div className="text-xs text-gray-500">{row.name_en}</div>}</div>
    )},
    { key: 'role', label: '職位', sortable: true, render: (v: string) => (
      <span className={roleBadgeClass(v)}>{roleLabels[v] || v}</span>
    ), filterRender: (v: string) => roleLabels[v] || v },
    { key: 'company', label: '所屬公司', render: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-' },
    { key: 'green_card_expiry', label: '平安卡到期', sortable: true, render: renderExpiry, filterRender: filterExpiry },
    { key: 'construction_card_expiry', label: '工人註冊證到期', sortable: true, render: renderExpiry, filterRender: filterExpiry },
    { key: 'driving_license_expiry', label: '駕駛執照到期', sortable: true, render: renderExpiry, filterRender: filterExpiry },
    { key: 'status', label: '狀態', sortable: true, render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : 'badge-red'}>{v === 'active' ? '在職' : '離職'}</span>
    ), filterRender: (v: string) => v === 'active' ? '在職' : '離職' },
  ];

  const inactiveColumns = [
    { key: 'emp_code', label: '編號', sortable: true, className: 'w-20 font-mono', render: (v: string) => v || '-' },
    { key: 'name_zh', label: '姓名', sortable: true, render: (_: any, row: any) => (
      <div><div className="font-medium text-gray-900">{row.name_zh}</div>{row.name_en && <div className="text-xs text-gray-500">{row.name_en}</div>}</div>
    )},
    { key: 'role', label: '職位', sortable: true, render: (v: string) => (
      <span className={roleBadgeClass(v)}>{roleLabels[v] || v}</span>
    ), filterRender: (v: string) => roleLabels[v] || v },
    { key: 'company', label: '所屬公司', render: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-' },
    { key: 'termination_date', label: '離職日期', sortable: true, render: (v: string) => v || '-' },
    { key: 'termination_reason', label: '離職原因', render: (v: string) => v ? <span className="text-gray-600 text-sm">{v}</span> : '-' },
    { key: 'join_date', label: '入職日期', sortable: true, render: (v: string) => v || '-' },
  ];

  const columns = activeTab === 'active' ? activeColumns : inactiveColumns;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">員工管理</h1>
          <p className="text-gray-500 mt-1">管理所有員工資料、薪資設定及調動紀錄</p>
        </div>
        {hasMinRole('clerk') && (
          <button onClick={() => setShowModal(true)} className="btn-primary">新增員工</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => handleTabChange('active')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'active' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          在職員工
        </button>
        <button
          onClick={() => handleTabChange('inactive')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'inactive' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          已離職
        </button>
      </div>

      <div className="card">
        <DataTable
          exportFilename={activeTab === 'active' ? '在職員工列表' : '已離職員工列表'}
          columns={columns}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={(s) => { setSearch(s); setPage(1); }}
          searchPlaceholder="搜尋姓名、編號、電話或身份證..."
          onRowClick={(row) => router.push(`/employees/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          filters={
            <div className="flex gap-2">
              <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部職位</option>
                {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部公司</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix || c.name}</option>)}
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增員工" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">中文姓名 *</label><input value={form.name_zh} onChange={e => setForm({...form, name_zh: e.target.value})} className="input-field" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">英文姓名</label><input value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">員工編號</label><input value={form.emp_code} onChange={e => setForm({...form, emp_code: e.target.value})} className="input-field" placeholder="如 E001" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">職位 *</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="input-field">
                {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">所屬公司 *</label>
              <select value={form.company_id} onChange={e => setForm({...form, company_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">電話</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">入職日期</label><input type="date" value={form.join_date} onChange={e => setForm({...form, join_date: e.target.value})} className="input-field" /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">建立</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
