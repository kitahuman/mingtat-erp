'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { employeesApi, companiesApi, fieldOptionsApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { useAuth } from '@/lib/auth';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import ExpiryBadge from '@/components/ExpiryBadge';
import { fmtDate } from '@/lib/dateUtils';
import api from '@/lib/api';

// Fallback role labels for display (used when API options not loaded yet)
const FALLBACK_ROLE_LABELS: Record<string, string> = {
  '管理': '管理', '司機': '司機', '機手': '機手', '雜工': '雜工',
  '鴻輝代工': '鴻輝代工', '散工機手': '散工機手', '散工司機': '散工司機',
  '管工': '管工', '安全督導員': '安全督導員', '董事': '董事', 'T1': 'T1',
  '文員': '文員', 'QS': 'QS',
};

const roleBadgeClass = (v: string) => {
  switch (v) {
    case '管理': return 'badge-blue';
    case '司機': return 'badge-green';
    case '機手': return 'badge-yellow';
    case '鴻輝代工': return 'bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full text-xs font-medium';
    case '散工機手': case '散工司機': return 'bg-orange-100 text-orange-800 border border-orange-200 px-2 py-0.5 rounded-full text-xs font-medium';
    case '董事': return 'bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-full text-xs font-medium';
    case '文員': case 'QS': return 'bg-cyan-100 text-cyan-800 border border-cyan-200 px-2 py-0.5 rounded-full text-xs font-medium';
    default: return 'badge-gray';
  }
};

type TabType = 'active' | 'inactive' | 'temporary';

const EMPTY_CONVERT_FORM = {
  role: '雜工',
  company_id: '',
  emp_code: '',
  join_date: '',
  phone: '',
  name_en: '',
  base_salary: '',
  salary_type: 'monthly',
};

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
  const [form, setForm] = useState<any>({ name_zh: '', name_en: '', role: '雜工', phone: '', company_id: '', emp_code: '', join_date: '', employee_is_temporary: false });
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);

  const [roleOptions, setRoleOptions] = useState<{value: string; label: string}[]>([]);
  const [roleLabels, setRoleLabels] = useState<Record<string, string>>(FALLBACK_ROLE_LABELS);

  // Server-side column filters state
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});

  // Convert to regular modal state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertTarget, setConvertTarget] = useState<any>(null);
  const [convertForm, setConvertForm] = useState<any>(EMPTY_CONVERT_FORM);
  const [convertLoading, setConvertLoading] = useState(false);

  // Batch delete state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Ref to store roleLabels for use in callbacks without stale closures
  const roleLabelsRef = useRef(roleLabels);
  useEffect(() => { roleLabelsRef.current = roleLabels; }, [roleLabels]);

  useEffect(() => {
    companiesApi.simple().then(res => setCompanies(res.data));
    fieldOptionsApi.getByCategory('employee_role').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active).map((o: any) => ({ value: o.label, label: o.label }));
      if (opts.length > 0) {
        setRoleOptions(opts);
        const labels: Record<string, string> = {};
        opts.forEach((o: any) => { labels[o.value] = o.label; });
        setRoleLabels({ ...FALLBACK_ROLE_LABELS, ...labels });
      } else {
        // Fallback to hardcoded options
        setRoleOptions(Object.entries(FALLBACK_ROLE_LABELS).map(([value, label]) => ({ value, label })));
      }
    }).catch(() => {
      setRoleOptions(Object.entries(FALLBACK_ROLE_LABELS).map(([value, label]) => ({ value, label })));
    });
  }, []);

  /**
   * Build the filter_* query params from columnFilters state.
   * The backend expects: filter_role=value1,value2&filter_status=value1,...
   * For display-label columns (role, status), we need to convert display labels back to raw values.
   */
  const buildColumnFilterParams = useCallback((filters: Record<string, Set<string>>) => {
    const params: Record<string, string> = {};
    for (const [key, values] of Object.entries(filters)) {
      if (values.size === 0) continue;
      let rawValues: string[];

      if (key === 'role') {
        // Role values are now stored as Chinese labels directly
        rawValues = Array.from(values);
      } else if (key === 'status') {
        // Convert display labels back to raw status values
        rawValues = Array.from(values).map(v => {
          if (v === '在職') return 'active';
          if (v === '離職') return 'inactive';
          return v;
        });
      } else {
        rawValues = Array.from(values);
      }

      params[`filter_${key}`] = rawValues.join(',');
    }
    return params;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'temporary') {
        const res = await employeesApi.list({
          page, limit: 50, search,
          is_temporary: 'true',
          sortBy: 'created_at', sortOrder: 'DESC',
        });
        setData(res.data.data);
        setTotal(res.data.total);
      } else {
        const filterParams = buildColumnFilterParams(columnFilters);
        const res = await employeesApi.list({
          page, limit: 20, search,
          role: roleFilter || undefined,
          company_id: companyFilter || undefined,
          status: activeTab,
          is_temporary: 'false',
          sortBy, sortOrder,
          ...filterParams,
        });
        setData(res.data.data);
        setTotal(res.data.total);
      }
    } catch {}
    setLoading(false);
  }, [page, search, roleFilter, companyFilter, sortBy, sortOrder, activeTab, columnFilters, buildColumnFilterParams]);

  useEffect(() => { load(); }, [load]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setSearch('');
    setRoleFilter('');
    setColumnFilters({});
    setSelectedIds([]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        company_id: form.employee_is_temporary ? undefined : (form.company_id ? Number(form.company_id) : undefined),
      };
      await employeesApi.create(payload);
      setShowModal(false);
      setForm({ name_zh: '', name_en: '', role: '雜工', phone: '', company_id: '', emp_code: '', join_date: '', employee_is_temporary: false });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '建立失敗'); }
  };

  const handleSort = (field: string, order: string) => {
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
  };

  const handleColumnFilterChange = useCallback((filters: Record<string, Set<string>>) => {
    setColumnFilters(filters);
    setPage(1);
  }, []);

  /**
   * Fetch filter options from the backend for a given column.
   * Passes current search/role/company/status context so options are contextual.
   * Also converts raw values to display labels for role/status columns.
   */
  const handleFetchFilterOptions = useCallback(async (columnKey: string): Promise<string[]> => {
    try {
      const filterParams = buildColumnFilterParams(columnFilters);
      const res = await employeesApi.filterOptions(columnKey, {
        search: search || undefined,
        role: roleFilter || undefined,
        company_id: companyFilter || undefined,
        status: activeTab,
        ...filterParams,
      });
      let options: string[] = res.data;

      // Convert raw values to display labels for certain columns
      if (columnKey === 'role') {
        const currentLabels = roleLabelsRef.current;
        options = options.map(v => currentLabels[v] || v);
      } else if (columnKey === 'status') {
        options = options.map(v => {
          if (v === 'active') return '在職';
          if (v === 'inactive') return '離職';
          return v;
        });
      }

      return options;
    } catch {
      return [];
    }
  }, [search, roleFilter, companyFilter, activeTab, columnFilters, buildColumnFilterParams]);

  const handleInlineSave = async (id: number, formData: any) => {
    const payload: any = {
      name_zh: formData.name_zh,
      name_en: formData.name_en,
      emp_code: formData.emp_code,
      role: formData.role,
      id_number: formData.id_number || null,
      phone: formData.phone,
      company_id: formData.company_id ? Number(formData.company_id) : undefined,
      join_date: formData.join_date || null,
      green_card_expiry: formData.green_card_expiry || null,
      construction_card_expiry: formData.construction_card_expiry || null,
      driving_license_expiry: formData.driving_license_expiry || null,
      termination_date: formData.termination_date || null,
      termination_reason: formData.termination_reason || null,
    };
    await employeesApi.update(id, payload);
    load();
  };

  const handleOpenConvert = (emp: any) => {
    setConvertTarget(emp);
    setConvertForm({
      ...EMPTY_CONVERT_FORM,
      phone: emp.phone || '',
      name_en: emp.name_en || '',
    });
    setShowConvertModal(true);
  };

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertTarget) return;
    setConvertLoading(true);
    try {
      await employeesApi.convertToRegular(convertTarget.id, {
        role: convertForm.role,
        company_id: Number(convertForm.company_id),
        emp_code: convertForm.emp_code || undefined,
        join_date: convertForm.join_date || undefined,
        phone: convertForm.phone || undefined,
        name_en: convertForm.name_en || undefined,
        base_salary: convertForm.base_salary ? Number(convertForm.base_salary) : undefined,
        salary_type: convertForm.salary_type,
      });
      setShowConvertModal(false);
      setConvertTarget(null);
      setConvertForm(EMPTY_CONVERT_FORM);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || '轉正失敗');
    } finally {
      setConvertLoading(false);
    }
  };

  const renderExpiry = (v: string) => <ExpiryBadge date={v} showLabel={false} />;
  const filterExpiry = (v: string) => {
    if (!v) return '-';
    return fmtDate(v);
  };

  // ── Batch delete helpers ──────────────────────────────────────────────────
  const toggleSelectId = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === data.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.map((e: any) => e.id));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    try {
      const type = activeTab === 'inactive' ? 'inactive' : 'temporary';
      await employeesApi.batchDelete(selectedIds, type);
      setSelectedIds([]);
      setShowBatchDeleteConfirm(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || '批量刪除失敗');
    } finally {
      setBatchDeleting(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const companyOptions = companies.map(c => ({ value: c.id, label: c.internal_prefix || c.name }));

  const activeColumns = [
    { key: 'emp_code', label: '編號', sortable: true, className: 'w-20 font-mono', editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'name_zh', label: '中文姓名', sortable: true, editable: true, editType: 'text' as const, render: (_: any, row: any) => (
      <div><div className="font-medium text-gray-900">{row.name_zh}</div>{row.name_en && <div className="text-xs text-gray-500">{row.name_en}</div>}</div>
    )},
    { key: 'name_en', label: '英文姓名', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'role', label: '職位', sortable: true, editable: true, editType: 'select' as const, editOptions: roleOptions, render: (v: string) => (
      <span className={roleBadgeClass(v)}>{roleLabels[v] || v}</span>
    ), filterRender: (v: string) => roleLabels[v] || v },
    { key: 'id_number', label: '身份證號碼', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'join_date', label: '入職日期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry },
    { key: 'phone', label: '電話', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'company', label: '所屬公司', sortable: true, editable: false, render: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-' },
    { key: 'green_card_expiry', label: '平安卡到期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry },
    { key: 'construction_card_expiry', label: '工人註冊證到期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry },
    { key: 'driving_license_expiry', label: '駕駛執照到期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry },
    { key: 'status', label: '狀態', sortable: true, editable: false, render: (v: string) => (
      <span className={v === 'active' ? 'badge-green' : 'badge-red'}>{v === 'active' ? '在職' : '離職'}</span>
    ), filterRender: (v: string) => v === 'active' ? '在職' : '離職' },
  ];

  const inactiveColumns = [
    { key: '_select', label: '', sortable: false, editable: false, className: 'w-8', render: (_: any, row: any) => (
      <input
        type="checkbox"
        checked={selectedIds.includes(row.id)}
        onChange={() => toggleSelectId(row.id)}
        onClick={e => e.stopPropagation()}
        className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-400 cursor-pointer"
      />
    )},
    { key: 'emp_code', label: '編號', sortable: true, className: 'w-20 font-mono', editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'name_zh', label: '中文姓名', sortable: true, editable: true, editType: 'text' as const, render: (_: any, row: any) => (
      <div><div className="font-medium text-gray-900">{row.name_zh}</div>{row.name_en && <div className="text-xs text-gray-500">{row.name_en}</div>}</div>
    )},
    { key: 'role', label: '職位', sortable: true, editable: true, editType: 'select' as const, editOptions: roleOptions, render: (v: string) => (
      <span className={roleBadgeClass(v)}>{roleLabels[v] || v}</span>
    ), filterRender: (v: string) => roleLabels[v] || v },
    { key: 'company', label: '所屬公司', sortable: true, editable: false, render: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-', filterRender: (_: any, row: any) => row.company?.internal_prefix || row.company?.name || '-' },
    { key: 'termination_date', label: '離職日期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry },
    { key: 'termination_reason', label: '離職原因', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v ? <span className="text-gray-600 text-sm">{v}</span> : '-' },
    { key: 'join_date', label: '入職日期', sortable: true, editable: true, editType: 'date' as const, render: renderExpiry, filterRender: filterExpiry },
  ];

  const defaultColumns = activeTab === 'active' ? activeColumns : (activeTab === 'inactive' ? inactiveColumns : activeColumns);
  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig(`employees-${activeTab}`, defaultColumns);


  const handleInlineDelete = async (id: number) => {
    await employeesApi.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">員工管理</h1>
          <p className="text-gray-500 mt-1">管理所有員工資料、薪資設定及調動紀錄</p>
        </div>
        {hasMinRole('clerk') && (
          <div className="flex gap-2">
            <CsvImportModal module="employees" onImportComplete={load} />
            <button
              onClick={async () => {
                if (!confirm('為所有有電話號碼的員工建立手機登入帳號？預設密碼為 Aa-電話號碼。')) return;
                setBulkCreating(true);
                setBulkResult(null);
                try {
                  const res = await api.post('/employee-portal/bulk-create-accounts', {});
                  setBulkResult(res.data);
                } catch (e: any) {
                  alert('建立帳號失敗：' + (e?.response?.data?.message || e?.message || '未知錯誤'));
                } finally {
                  setBulkCreating(false);
                }
              }}
              disabled={bulkCreating}
              className="btn-secondary text-sm"
              title="為所有有電話號碼的員工建立手機入口帳號"
            >
              {bulkCreating ? '建立中...' : '📱 建立手機帳號'}
            </button>
            <button onClick={() => setShowModal(true)} className="btn-primary">新增員工</button>
          </div>
        )}
      </div>

      {/* Bulk Create Result */}
      {bulkResult && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-green-800 font-medium">
                共 {bulkResult.total_employees} 位員工，
                新建 {bulkResult.created_count} 個帳號，
                跳過 {bulkResult.skipped_count} 個（已存在）
                {bulkResult.error_count > 0 && `，失敗 ${bulkResult.error_count} 個`}
              </p>
              {bulkResult.created?.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-green-600 cursor-pointer">查看新建帳號詳情</summary>
                  <div className="mt-1 max-h-40 overflow-y-auto">
                    {bulkResult.created.map((c: any, i: number) => (
                      <div key={i} className="text-xs text-green-700 py-0.5">
                        {c.name} ({c.phone}) — 帳號: {c.username}，預設密碼: {c.default_password}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {bulkResult.errors?.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-red-600 cursor-pointer">查看失敗詳情</summary>
                  <div className="mt-1">
                    {bulkResult.errors.map((e: any, i: number) => (
                      <div key={i} className="text-xs text-red-600 py-0.5">
                        {e.name} ({e.phone}): {e.error}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <button onClick={() => setBulkResult(null)} className="text-green-500 hover:text-green-700 text-lg">&#x2715;</button>
          </div>
        </div>
      )}

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
        <button
          onClick={() => handleTabChange('temporary')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'temporary' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          臨時員工
        </button>
      </div>

      {/* Temporary Employees Tab */}
      {activeTab === 'temporary' ? (
        <div className="card">
          {/* Temporary tab toolbar: search + select all + batch delete */}
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-500">共 <span className="font-semibold text-gray-800">{total}</span> 名臨時員工</p>
              {data.length > 0 && hasMinRole('clerk') && (
                <>
                  <button
                    onClick={toggleSelectAll}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    {selectedIds.length === data.length && data.length > 0 ? '取消全選' : '全選'}
                  </button>
                  {selectedIds.length > 0 && (
                    <button
                      onClick={() => setShowBatchDeleteConfirm(true)}
                      className="text-sm text-white bg-red-500 hover:bg-red-600 font-medium px-3 py-1 rounded-lg transition-colors"
                    >
                      刪除已選 ({selectedIds.length})
                    </button>
                  )}
                </>
              )}
            </div>
            <input
              type="text"
              placeholder="搜尋姓名..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="input-field w-48"
            />
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">👤</p>
              <p className="font-medium">暫無臨時員工</p>
              <p className="text-sm mt-1">臨時員工由打卡頁面的「新增臨時員工」功能建立</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.map((emp: any) => (
                <div
                  key={emp.id}
                  className={`border-2 rounded-xl p-4 hover:shadow-sm transition-all bg-white relative ${
                    selectedIds.includes(emp.id) ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-orange-300'
                  }`}
                >
                  {/* Checkbox overlay */}
                  {hasMinRole('clerk') && (
                    <div className="absolute top-3 right-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(emp.id)}
                        onChange={() => toggleSelectId(emp.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-400 cursor-pointer"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 border-2 border-orange-200">
                      {emp.employee_photo_base64 ? (
                        <img src={`data:image/jpeg;base64,${emp.employee_photo_base64}`} alt={emp.name_zh} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">👤</div>
                      )}
                    </div>
                    <div className="min-w-0 pr-6">
                      <p className="font-semibold text-gray-900 truncate">{emp.name_zh}</p>
                      {emp.name_en && <p className="text-xs text-gray-500 truncate">{emp.name_en}</p>}
                      <span className="inline-block mt-0.5 bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full">臨時員工</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">建立日期</span>
                      <span className="text-gray-700 font-medium">{fmtDate(emp.created_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">打卡次數</span>
                      <span className={`font-semibold ${(emp.attendance_count ?? 0) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {emp.attendance_count != null ? `${emp.attendance_count} 次` : '-'}
                      </span>
                    </div>
                    {emp.phone && <div className="flex justify-between"><span className="text-gray-500">電話</span><span className="text-gray-700">{emp.phone}</span></div>}
                    {emp.company && <div className="flex justify-between"><span className="text-gray-500">公司</span><span className="text-gray-700">{emp.company.internal_prefix || emp.company.name}</span></div>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => router.push(`/employees/${emp.id}`)} className="flex-1 btn-secondary text-xs py-1.5">查看資料</button>
                    <button onClick={() => handleOpenConvert(emp)} className="flex-1 bg-orange-500 text-white text-xs py-1.5 px-3 rounded-lg font-medium hover:bg-orange-600 transition-colors">轉為正式</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {total > 50 && (
            <div className="flex justify-center mt-4 gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm">上一頁</button>
              <span className="text-sm text-gray-500 self-center">第 {page} 頁</span>
              <button disabled={data.length < 50} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm">下一頁</button>
            </div>
          )}
        </div>
      ) : (
      <div className="card">
        {/* Inactive tab batch delete toolbar */}
        {activeTab === 'inactive' && hasMinRole('clerk') && data.length > 0 && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
            <button
              onClick={toggleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              {selectedIds.length === data.length && data.length > 0 ? '取消全選' : '全選'}
            </button>
            {selectedIds.length > 0 && (
              <button
                onClick={() => setShowBatchDeleteConfirm(true)}
                className="text-sm text-white bg-red-500 hover:bg-red-600 font-medium px-3 py-1 rounded-lg transition-colors"
              >
                刪除已選 ({selectedIds.length})
              </button>
            )}
            {selectedIds.length > 0 && (
              <span className="text-sm text-gray-500">已選 {selectedIds.length} 名員工</span>
            )}
          </div>
        )}
        <InlineEditDataTable
          exportFilename={activeTab === 'active' ? '在職員工列表' : '已離職員工列表'}
          onExportFetchAll={async () => {
            const filterParams = buildColumnFilterParams(columnFilters);
            const res = await employeesApi.list({
              limit: 10000, page: 1, search,
              role: roleFilter || undefined,
              company_id: companyFilter || undefined,
              status: activeTab,
              sortBy, sortOrder,
              ...filterParams,
            });
            return res.data.data;
          }}
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
          searchPlaceholder="搜尋姓名、編號、電話或身份證..."
          onRowClick={(row) => router.push(`/employees/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          onSave={handleInlineSave}
          onDelete={handleInlineDelete}
          serverSideFilter={true}
          columnFilters={columnFilters}
          onColumnFilterChange={handleColumnFilterChange}
          onFetchFilterOptions={handleFetchFilterOptions}
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
      )}

      {/* Batch Delete Confirmation Modal */}
      <Modal
        isOpen={showBatchDeleteConfirm}
        onClose={() => setShowBatchDeleteConfirm(false)}
        title="確認批量刪除"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <span className="text-red-500 text-xl mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-800">此操作不可撤銷</p>
              <p className="text-sm text-red-700 mt-1">
                即將永久刪除 <strong>{selectedIds.length}</strong> 名
                {activeTab === 'inactive' ? '離職員工' : '臨時員工'}的所有資料，包括打卡紀錄等關聯數據。
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600">請確認您要刪除以下員工：</p>
          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {data
              .filter((e: any) => selectedIds.includes(e.id))
              .map((e: any) => (
                <div key={e.id} className="px-3 py-2 text-sm text-gray-700 flex items-center gap-2">
                  <span className="font-medium">{e.name_zh}</span>
                  {e.name_en && <span className="text-gray-400 text-xs">{e.name_en}</span>}
                  {e.emp_code && <span className="text-gray-400 text-xs font-mono">({e.emp_code})</span>}
                </div>
              ))
            }
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button
              type="button"
              onClick={() => setShowBatchDeleteConfirm(false)}
              className="btn-secondary"
              disabled={batchDeleting}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={batchDeleting}
              className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {batchDeleting ? '刪除中...' : `確認刪除 ${selectedIds.length} 名員工`}
            </button>
          </div>
        </div>
      </Modal>

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
            {!form.employee_is_temporary && (
              <div><label className="block text-sm font-medium text-gray-700 mb-1">所屬公司 *</label>
                <select value={form.company_id} onChange={e => setForm({...form, company_id: e.target.value})} className="input-field" required={!form.employee_is_temporary}>
                  <option value="">請選擇</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
                </select>
              </div>
            )}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">電話</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">入職日期</label><input type="date" value={form.join_date} onChange={e => setForm({...form, join_date: e.target.value})} className="input-field" /></div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.employee_is_temporary}
                  onChange={e => setForm({...form, employee_is_temporary: e.target.checked, company_id: ''})}
                  className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm font-medium text-gray-700">臨時員工</span>
                <span className="text-xs text-gray-400">（臨時員工不需填寫公司，轉正式员工時再指定）</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">建立</button>
          </div>
        </form>
      </Modal>

      {/* Convert to Regular Modal */}
      <Modal isOpen={showConvertModal} onClose={() => { setShowConvertModal(false); setConvertTarget(null); }} title="轉為正式員工" size="lg">
        {convertTarget && (
          <form onSubmit={handleConvert} className="space-y-4">
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 border-2 border-orange-300">
                {convertTarget.employee_photo_base64 ? (
                  <img src={`data:image/jpeg;base64,${convertTarget.employee_photo_base64}`} alt={convertTarget.name_zh} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl text-gray-400">👤</div>
                )}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{convertTarget.name_zh}</p>
                <p className="text-xs text-gray-500">
                  建立於 {fmtDate(convertTarget.created_at)}
                  {convertTarget.attendance_count != null && ` · 已打卡 ${convertTarget.attendance_count} 次`}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600">請填寫以下正式員工資料，提交後此員工將從臨時員工移至在職員工列表。</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">職位 *</label>
                <select value={convertForm.role} onChange={e => setConvertForm({...convertForm, role: e.target.value})} className="input-field" required>
                  {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所屬公司 *</label>
                <select value={convertForm.company_id} onChange={e => setConvertForm({...convertForm, company_id: e.target.value})} className="input-field" required>
                  <option value="">請選擇</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">員工編號</label>
                <input value={convertForm.emp_code} onChange={e => setConvertForm({...convertForm, emp_code: e.target.value})} className="input-field" placeholder="如 E001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">入職日期</label>
                <input type="date" value={convertForm.join_date} onChange={e => setConvertForm({...convertForm, join_date: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話</label>
                <input value={convertForm.phone} onChange={e => setConvertForm({...convertForm, phone: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">英文姓名</label>
                <input value={convertForm.name_en} onChange={e => setConvertForm({...convertForm, name_en: e.target.value})} className="input-field" />
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">薪資設定（選填）</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">薪資類型</label>
                  <select value={convertForm.salary_type} onChange={e => setConvertForm({...convertForm, salary_type: e.target.value})} className="input-field">
                    <option value="monthly">月薪</option>
                    <option value="daily">日薪</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">底薪</label>
                  <input type="number" value={convertForm.base_salary} onChange={e => setConvertForm({...convertForm, base_salary: e.target.value})} className="input-field" placeholder="0" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => { setShowConvertModal(false); setConvertTarget(null); }} className="btn-secondary" disabled={convertLoading}>取消</button>
              <button type="submit" disabled={convertLoading} className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50">
                {convertLoading ? '處理中...' : '確認轉為正式員工'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
