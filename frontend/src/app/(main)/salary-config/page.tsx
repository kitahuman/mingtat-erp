'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { salaryConfigApi, employeesApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';

const SALARY_TYPE_LABELS: Record<string, string> = { daily: '日薪制', monthly: '月薪制' };

const ALLOWANCE_FIELDS = [
  { key: 'allowance_night', label: '晚間津貼' },
  { key: 'allowance_3runway', label: '3跑津貼' },
  { key: 'allowance_rent', label: '租車津貼' },
  { key: 'allowance_well', label: '落井津貼' },
  { key: 'allowance_machine', label: '揸機津貼' },
  { key: 'allowance_roller', label: '火轆津貼' },
  { key: 'allowance_crane', label: '吊/挾車津貼' },
  { key: 'allowance_move_machine', label: '搬機津貼' },
  { key: 'allowance_kwh_night', label: '嘉華-夜間津貼' },
  { key: 'allowance_mid_shift', label: '中直津貼' },
];

const OT_FIELDS = [
  { key: 'ot_1800_1900', label: 'OT 1800-1900' },
  { key: 'ot_1900_2000', label: 'OT 1900-2000' },
  { key: 'ot_0600_0700', label: 'OT 0600-0700' },
  { key: 'ot_0700_0800', label: 'OT 0700-0800' },
  { key: 'ot_rate_standard', label: '標準OT時薪' },
  { key: 'ot_mid_shift', label: '中直OT津貼' },
];

type TabType = 'active' | 'inactive';

export default function SalaryConfigPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [salaryTypeFilter, setSalaryTypeFilter] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [sortBy, setSortBy] = useState('emp_code');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [roleOptions, setRoleOptions] = useState<{ value: string; label: string }[]>([]);
  const [roleFilter, setRoleFilter] = useState('');

  const defaultForm = {
    employee_id: '', effective_date: new Date().toISOString().slice(0, 10),
    salary_type: 'daily', base_salary: 0, base_salary_night: 0,
    allowance_night: 0, allowance_3runway: 0, allowance_rent: 0,
    allowance_well: 0, allowance_machine: 0, allowance_roller: 0,
    allowance_crane: 0, allowance_move_machine: 0, allowance_kwh_night: 0,
    allowance_mid_shift: 0,
    ot_rate_standard: 0, ot_1800_1900: 0, ot_1900_2000: 0, ot_0600_0700: 0, ot_0700_0800: 0, ot_mid_shift: 0,
    is_piece_rate: false, fleet_rate_card_id: null,
    custom_allowances: [] as { name: string; amount: number }[],
    change_type: '', change_amount: 0, notes: '',
  };
  const [form, setForm] = useState<any>({ ...defaultForm });

  const load = () => {
    setLoading(true);
    salaryConfigApi.list({
      page, limit: 20, search,
      salary_type: salaryTypeFilter || undefined,
      employee_status: activeTab,
      role: roleFilter || undefined,
      sortBy, sortOrder,
    }).then(res => { setData(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, search, salaryTypeFilter, roleFilter, sortBy, sortOrder, activeTab]);
  useEffect(() => {
    employeesApi.list({ limit: 500 }).then(res => setEmployees(res.data.data || []));
    // Load role options from field-options API
    import('@/lib/api').then(({ fieldOptionsApi }) => {
      fieldOptionsApi.getByCategory('employee_role').then(res => {
        const opts = (res.data || []).map((o: any) => ({ value: o.value, label: o.label }));
        setRoleOptions(opts);
      }).catch(() => {});
    });
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setSearch('');
  };

  const addCustomAllowance = () => {
    setForm({ ...form, custom_allowances: [...(form.custom_allowances || []), { name: '', amount: 0 }] });
  };
  const removeCustomAllowance = (idx: number) => {
    setForm({ ...form, custom_allowances: form.custom_allowances.filter((_: any, i: number) => i !== idx) });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await salaryConfigApi.create({
        ...form,
        employee_id: Number(form.employee_id),
        base_salary: Number(form.base_salary) || 0,
        base_salary_night: Number(form.base_salary_night) || 0,
      });
      setShowModal(false);
      setForm({ ...defaultForm });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '新增失敗'); }
  };

  const handleInlineSave = async (id: number, formData: any) => {
    const payload: any = {};
    const numFields = ['base_salary', 'base_salary_night', 'allowance_night', 'ot_rate_standard', 'ot_mid_shift'];
    const dateFields = ['effective_date'];
    if (formData.salary_type !== undefined) payload.salary_type = formData.salary_type;
    numFields.forEach(f => { if (formData[f] !== undefined) payload[f] = Number(formData[f]) || 0; });
    dateFields.forEach(f => { if (formData[f] !== undefined) payload[f] = toInputDate(formData[f]) || undefined; });
    await salaryConfigApi.update(id, payload);
    load();
  };

  const salaryTypeOptions = [
    { value: 'daily', label: '日薪制' },
    { value: 'monthly', label: '月薪制' },
  ];

  const columns = [
    { key: 'emp_code', label: '編號', sortable: true, editable: false, className: 'w-20 font-mono', render: (_: any, row: any) => row.employee?.employee_is_temporary ? <span className="text-gray-400 text-xs">臨時</span> : (row.employee?.emp_code || '-'), filterRender: (_: any, row: any) => row.employee?.emp_code || '-' },
    { key: 'employee', label: '姓名', sortable: true, editable: false, render: (_: any, row: any) => {
      const emp = row.employee;
      if (!emp) return <span>-</span>;
      return (
        <span className="flex items-center gap-1">
          {emp.name_zh || emp.name_en}
          {emp.employee_is_temporary && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">臨時</span>
          )}
        </span>
      );
    }, filterRender: (_: any, row: any) => row.employee?.name_zh || '-' },
    { key: 'company', label: '公司', sortable: true, editable: false, render: (_: any, row: any) => row.employee?.company?.internal_prefix || '-', filterRender: (_: any, row: any) => row.employee?.company?.internal_prefix || '-' },
    { key: 'role', label: '職位', sortable: true, editable: false, render: (_: any, row: any) => row.employee?.role || '-', filterRender: (_: any, row: any) => row.employee?.role || '-' },
    { key: 'effective_date', label: '生效日期', sortable: true, editable: true, editType: 'date' as const, render: (v: any) => fmtDate(v) },
    { key: 'salary_type', label: '薪酬類型', sortable: true, editable: true, editType: 'select' as const, editOptions: salaryTypeOptions, render: (v: any) => SALARY_TYPE_LABELS[v] || v, filterRender: (v: any) => SALARY_TYPE_LABELS[v] || v },
    { key: 'base_salary', label: '日更底薪', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any) => <span className="font-mono">${Number(v).toLocaleString()}</span> },
    { key: 'base_salary_night', label: '夜更底薪', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any, row: any) => Number(v) > 0 ? <span className="font-mono text-indigo-700">${Number(v).toLocaleString()}</span> : <span className="text-gray-400 text-xs">跟日更</span> },
    { key: 'allowance_night', label: '晚間津貼', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}</span> : '-' },
    { key: 'ot_rate_standard', label: '標準OT', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}</span> : '-' },
    { key: 'ot_mid_shift', label: '中直OT', sortable: true, editable: true, editType: 'number' as const, className: 'text-right', render: (v: any) => v > 0 ? <span className="font-mono">${Number(v).toLocaleString()}</span> : '-' },
    { key: 'is_piece_rate', label: '按件計酬', sortable: true, editable: false, render: (v: any) => v ? <span className="badge-blue">是</span> : '-', filterRender: (v: any) => v ? '是' : '否' },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig(`salary-config-${activeTab}`, columns);



  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">員工薪酬配置</h1>
          <p className="text-gray-500 text-sm mt-1">管理員工薪酬設定、津貼配置及變更歷史</p>
        </div>
        <div className="flex gap-2">
          <CsvImportModal module="salary-config" onImportComplete={load} />
          <button onClick={() => setShowModal(true)} className="btn-primary">新增薪酬設定</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => handleTabChange('active')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'active' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          在職員工薪酬
        </button>
        <button
          onClick={() => handleTabChange('inactive')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'inactive' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          已離職員工薪酬
        </button>
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename={activeTab === 'active' ? '在職員工薪酬' : '已離職員工薪酬'}
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
          searchPlaceholder="搜尋員工姓名、編號..."
          onRowClick={(row) => router.push(`/salary-config/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => { setSortBy(f); setSortOrder(o); }}
          onSave={handleInlineSave}
          filters={
            <div className="flex gap-2">
              <select value={salaryTypeFilter} onChange={e => { setSalaryTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部類型</option>
                <option value="daily">日薪制</option>
                <option value="monthly">月薪制</option>
              </select>
              <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部職位</option>
                {roleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增員工薪酬設定" size="xl">
        <form onSubmit={handleCreate} className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">員工 *</label>
              <select value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {employees.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.emp_code} - {emp.name_zh || emp.name_en}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">生效日期 *</label>
              <input type="date" value={form.effective_date} onChange={e => setForm({...form, effective_date: e.target.value})} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">薪酬類型</label>
              <select value={form.salary_type} onChange={e => setForm({...form, salary_type: e.target.value})} className="input-field">
                <option value="daily">日薪制</option>
                <option value="monthly">月薪制</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">底薪金額（日更）</label>
              <input type="number" value={form.base_salary} onChange={e => setForm({...form, base_salary: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">夜更底薪</label>
              <input type="number" value={form.base_salary_night} onChange={e => setForm({...form, base_salary_night: e.target.value})} className="input-field" placeholder="0 = 跟日更底薪" />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">津貼配置</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {ALLOWANCE_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input type="number" value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})} className="input-field text-sm" placeholder="0" />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">OT 津貼</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {OT_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input type="number" value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})} className="input-field text-sm" placeholder="0" />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700">自定義津貼</h3>
              <button type="button" onClick={addCustomAllowance} className="text-sm text-primary-600 hover:underline">+ 新增</button>
            </div>
            {(form.custom_allowances || []).map((ca: any, idx: number) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input value={ca.name} onChange={e => { const cas = [...form.custom_allowances]; cas[idx] = {...cas[idx], name: e.target.value}; setForm({...form, custom_allowances: cas}); }} className="input-field flex-1 text-sm" placeholder="津貼名稱" />
                <input type="number" value={ca.amount} onChange={e => { const cas = [...form.custom_allowances]; cas[idx] = {...cas[idx], amount: Number(e.target.value)}; setForm({...form, custom_allowances: cas}); }} className="input-field w-32 text-sm" placeholder="金額" />
                <button type="button" onClick={() => removeCustomAllowance(idx)} className="text-red-500 text-sm">刪除</button>
              </div>
            ))}
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">按件計酬</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_piece_rate} onChange={e => setForm({...form, is_piece_rate: e.target.checked})} className="rounded border-gray-300" />
              <span className="text-sm text-gray-700">此員工按車/噸數計佣金</span>
            </label>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">變更記錄</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">變更類型</label>
                <select value={form.change_type} onChange={e => setForm({...form, change_type: e.target.value})} className="input-field text-sm">
                  <option value="">初始設定</option>
                  <option value="加薪">加薪</option>
                  <option value="減薪">減薪</option>
                  <option value="調整">調整</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">變更金額</label>
                <input type="number" value={form.change_amount} onChange={e => setForm({...form, change_amount: e.target.value})} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">備註</label>
                <input value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className="input-field text-sm" />
              </div>
            </div>
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
