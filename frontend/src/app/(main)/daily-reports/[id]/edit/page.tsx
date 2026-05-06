'use client';

import { useState, useEffect, useCallback } from 'react';
import DateInput from '@/components/DateInput';
import { useRouter, useParams } from 'next/navigation';
import { dailyReportsApi, quotationsApi, partnersApi, fieldOptionsApi, projectsApi } from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/lib/auth';

const categoryLabels: Record<string, string> = {
  worker: '工人',
  vehicle: '車輛',
  machinery: '機械',
  tool: '工具',
};

const CATEGORIES = ['worker', 'vehicle', 'machinery', 'tool'];

interface EditItem {
  _key: string;
  category: string;
  worker_type: string;
  content: string;
  quantity: string;
  shift_quantity: string;
  ot_hours: string;
  name_or_plate: string;
  with_operator: boolean;
  machine_type: string;
  tonnage: string;
}

function newItem(category = 'worker'): EditItem {
  return {
    _key: Math.random().toString(36).slice(2),
    category,
    worker_type: '',
    content: '',
    quantity: '',
    shift_quantity: '',
    ot_hours: '',
    name_or_plate: '',
    with_operator: false,
    machine_type: '',
    tonnage: '',
  };
}

export default function EditDailyReportPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = Number(params.id);

  // Form state
  const { isReadOnly } = useAuth();
  const [reportDate, setReportDate] = useState('');
  const [shiftType, setShiftType] = useState('day');
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [quotationId, setQuotationId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientContractNo, setClientContractNo] = useState('');
  const [workSummary, setWorkSummary] = useState('');
  const [completedWork, setCompletedWork] = useState('');
  const [memo, setMemo] = useState('');
  const [status, setStatus] = useState('submitted');
  const [items, setItems] = useState<EditItem[]>([]);
  const [projectLocation, setProjectLocation] = useState('');

  // Reference data as SearchableSelect options
  // projectNameOptions: merged list from projects table + daily_reports history, value = project_name string
  const [projectNameOptions, setProjectNameOptions] = useState<{ value: string; label: string }[]>([]);
  // projectsByName: map from project_name -> project_id (only for projects in the projects table)
  const [projectsByName, setProjectsByName] = useState<Map<string, number>>(new Map());
  const [quotations, setQuotations] = useState<any[]>([]);
  const [filteredQuotations, setFilteredQuotations] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerOptions, setPartnerOptions] = useState<{ value: string; label: string }[]>([]);
  const [workerTypeOptions, setWorkerTypeOptions] = useState<{ value: string; label: string }[]>([]);
  const [machineTypeOptions, setMachineTypeOptions] = useState<{ value: string; label: string }[]>([]);
  const [tonnageOptions, setTonnageOptions] = useState<{ value: string; label: string }[]>([]);
  const [contractOptions, setContractOptions] = useState<{ value: string; label: string }[]>([]);
  const [projectLocationOptions, setProjectLocationOptions] = useState<{ value: string; label: string }[]>([]);

  const shiftOptions = [
    { value: 'day', label: '日更' },
    { value: 'night', label: '夜更' },
  ];
  const statusOptions = [
    { value: 'submitted', label: '已提交' },
    { value: 'draft', label: '草稿' },
  ];
  const categoryOptions = CATEGORIES.map(c => ({ value: c, label: categoryLabels[c] }));

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [originalReport, setOriginalReport] = useState<any>(null);

  // Load reference data
  useEffect(() => {
    // Load both sources for project name dropdown:
    // 1. projects table (with IDs) + 2. daily_reports history (distinct names)
    Promise.all([
      projectsApi.simple().catch(() => ({ data: [] })),
      dailyReportsApi.projectNames().catch(() => ({ data: [] })),
    ]).then(([projRes, namesRes]) => {
      const projects: any[] = projRes.data || [];
      const historyNames: string[] = namesRes.data || [];

      // Build name -> project_id map from projects table
      const nameToId = new Map<string, number>();
      projects.forEach((p: any) => {
        if (p.project_name) nameToId.set(p.project_name, p.id);
      });
      setProjectsByName(nameToId);

      // Merge: start with project names from projects table, then add history names not already present
      const projectNames = projects.map((p: any) => p.project_name).filter(Boolean) as string[];
      const allNames = Array.from(new Set([...projectNames, ...historyNames])).sort((a, b) =>
        a.localeCompare(b, 'zh-HK')
      );
      setProjectNameOptions(allNames.map(n => ({ value: n, label: n })));
    });

    partnersApi.simple().then(res => {
      const list: any[] = res.data || [];
      setPartners(list);
      setPartnerOptions(list.map((p: any) => ({ value: String(p.id), label: p.name })));
    }).catch(() => {});

    quotationsApi.list({ limit: 500, status: 'accepted' }).then(res => {
      const q = res.data?.data || [];
      setQuotations(q);
      setFilteredQuotations(q);
    }).catch(() => {});

    fieldOptionsApi.getByCategory('worker_type').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active !== false);
      setWorkerTypeOptions(opts.map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {});

    fieldOptionsApi.getByCategory('machine_type').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active !== false);
      setMachineTypeOptions(opts.map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {});

    fieldOptionsApi.getByCategory('tonnage').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active !== false);
      setTonnageOptions(opts.map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {});

    fieldOptionsApi.getByCategory('client_contract_no').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active !== false);
      setContractOptions(opts.map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {});

    fieldOptionsApi.getByCategory('location').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active !== false);
      setProjectLocationOptions(opts.map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {});
  }, []);

  // Load report data
  useEffect(() => {
    if (!reportId) return;
    setLoading(true);
    dailyReportsApi.get(reportId).then(res => {
      const r = res.data;
      setOriginalReport(r);
      setReportDate(r.daily_report_date?.split('T')[0] || '');
      setShiftType(r.daily_report_shift_type || 'day');
      setProjectId(r.daily_report_project_id ? String(r.daily_report_project_id) : '');
      setProjectName(r.daily_report_project_name || r.project?.project_name || '');
      setQuotationId(r.daily_report_quotation_id ? String(r.daily_report_quotation_id) : '');
      setClientId(r.daily_report_client_id ? String(r.daily_report_client_id) : '');
      setClientName(r.daily_report_client_name || r.client?.name || '');
      setClientContractNo(r.daily_report_client_contract_no || '');
      setProjectLocation(r.daily_report_project_location || '');
      setWorkSummary(r.daily_report_work_summary || '');
      setCompletedWork(r.daily_report_completed_work || '');
      setMemo(r.daily_report_memo || '');
      setStatus(r.daily_report_status || 'submitted');
      setItems((r.items || []).map((item: any) => ({
        _key: Math.random().toString(36).slice(2),
        category: item.daily_report_item_category || 'worker',
        worker_type: item.daily_report_item_worker_type || '',
        content: item.daily_report_item_content || '',
        quantity: item.daily_report_item_quantity != null ? String(item.daily_report_item_quantity) : '',
        shift_quantity: item.daily_report_item_shift_quantity != null ? String(item.daily_report_item_shift_quantity) : '',
        ot_hours: item.daily_report_item_ot_hours != null ? String(item.daily_report_item_ot_hours) : '',
        name_or_plate: item.daily_report_item_name_or_plate || '',
        with_operator: item.daily_report_item_with_operator || false,
        machine_type: item.daily_report_item_machine_type || '',
        tonnage: item.daily_report_item_tonnage != null ? String(item.daily_report_item_tonnage) : '',
      })));
    }).catch(() => setError('載入日報失敗')).finally(() => setLoading(false));
  }, [reportId]);

  // When project name is selected from dropdown:
  // - if the name matches a project in the projects table, auto-set project_id
  // - if not matched (history-only name or free text), leave project_id as null
  const handleProjectNameChange = useCallback((name: string | null) => {
    const selectedName = name || '';
    setProjectName(selectedName);
    if (selectedName && projectsByName.has(selectedName)) {
      // Matched a project in the projects table — set project_id
      setProjectId(String(projectsByName.get(selectedName)));
    } else {
      // No match — clear project_id (history name or free text)
      setProjectId('');
    }
    setQuotationId('');
    setFilteredQuotations(quotations);
  }, [quotations, projectsByName]);

  // When quotation changes, auto-fill client and contract info
  const handleQuotationChange = useCallback((qid: string | null) => {
    setQuotationId(qid || '');
    if (qid) {
      const q = quotations.find((q: any) => String(q.id) === qid);
      if (q) {
        if (q.client_id) {
          setClientId(String(q.client_id));
          setClientName(q.client?.name || '');
        }
        if (q.contract_name) setClientContractNo(q.contract_name);
        if (q.project_id && !projectId) {
          setProjectId(String(q.project_id));
          const proj = { project_name: q.project_name };
          if (proj) setProjectName(q.project_name || '');
        }
      }
    }
  }, [quotations, projectId]);

  const handleClientChange = (cid: string | null) => {
    setClientId(cid || '');
    if (cid) {
      const partner = partners.find((p: any) => String(p.id) === cid);
      if (partner) setClientName(partner.name);
    } else {
      setClientName('');
    }
  };

  // Items management
  const addItem = (category = 'worker') => {
    setItems(prev => [...prev, newItem(category)]);
  };

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(i => i._key !== key));
  };

  const updateItem = (key: string, field: keyof EditItem, value: any) => {
    setItems(prev => prev.map(i => i._key === key ? { ...i, [field]: value } : i));
  };

  const moveItem = (key: string, dir: -1 | 1) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i._key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!reportDate) { setError('請填寫日期'); return; }
    setError('');
    setSaving(true);
    try {
      const dto = {
        report_date: reportDate,
        shift_type: shiftType,
        project_id: projectId || null,
        project_name: projectName || null,
        project_location: projectLocation || null,
        quotation_id: quotationId || null,
        client_id: clientId || null,
        client_name: clientName || null,
        client_contract_no: clientContractNo || null,
        work_summary: workSummary,
        completed_work: completedWork || null,
        memo: memo || null,
        status,
        items: items.map((item, idx) => ({
          category: item.category,
          worker_type: item.worker_type || null,
          content: item.content,
          quantity: item.quantity ? Number(item.quantity) : null,
          shift_quantity: item.shift_quantity ? Number(item.shift_quantity) : null,
          ot_hours: item.ot_hours ? Number(item.ot_hours) : null,
          name_or_plate: item.name_or_plate || null,
          with_operator: item.with_operator,
          machine_type: item.machine_type || null,
          tonnage: item.tonnage ? Number(item.tonnage) : null,
          sort_order: idx,
        })),
      };
      await dailyReportsApi.adminUpdate(reportId, dto);
      router.push('/daily-reports');
    } catch (e: any) {
      setError(e?.response?.data?.message || '保存失敗，請重試');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500">載入中...</span>
      </div>
    );
  }

  // Build quotation options
  const quotationOptions = filteredQuotations.map((q: any) => ({
    value: String(q.id),
    label: `${q.quotation_no}${q.contract_name ? ` - ${q.contract_name}` : ''}${q.project_name ? ` (${q.project_name})` : ''}`,
  }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">編輯日報表</h1>
          <p className="text-sm text-gray-500 mt-1">
            ID #{reportId} &nbsp;·&nbsp; 建立人: {originalReport?.creator?.displayName || '-'}
            &nbsp;·&nbsp;
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
              status === 'submitted' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {status === 'submitted' ? '已提交' : '草稿'}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/daily-reports')}
            className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Section 1: 基本資訊 */}
      <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
        <h2 className="font-semibold text-gray-700 border-b pb-2">基本資訊</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期 <span className="text-red-500">*</span></label>
            <input
              as={DateInput} type="text"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">更次</label>
            <SearchableSelect
              value={shiftType}
              onChange={val => setShiftType((val as string) || 'day')}
              options={shiftOptions}
              placeholder="選擇更次"
              clearable={false}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
            <SearchableSelect
              value={status}
              onChange={val => setStatus((val as string) || 'submitted')}
              options={statusOptions}
              placeholder="選擇狀態"
              clearable={false}
            />
          </div>
        </div>
      </div>

      {/* Section 2: 工程資訊 */}
      <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
        <h2 className="font-semibold text-gray-700 border-b pb-2">工程資訊</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Project name (merged from projects table + daily_reports history) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">工程</label>
            <SearchableSelect
              value={projectName || null}
              onChange={val => handleProjectNameChange(val as string | null)}
              options={projectNameOptions}
              placeholder="選擇或搜尋工程名稱"
            />
            {/* Allow free-text input if project is not in the list */}
            <input
              type="text"
              value={projectName}
              onChange={e => {
                const name = e.target.value;
                setProjectName(name);
                // Auto-match project_id when typing; clear if no match
                if (name && projectsByName.has(name)) {
                  setProjectId(String(projectsByName.get(name)));
                } else {
                  setProjectId('');
                }
              }}
              placeholder="或直接輸入工程名稱"
              className="mt-2 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {projectId && (
              <p className="text-xs text-green-600 mt-1">✓ 已匹配工程 ID: {projectId}</p>
            )}
          </div>

          {/* Project Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">工程地點</label>
            <SearchableSelect
              value={projectLocation || null}
              onChange={val => setProjectLocation((val as string) || '')}
              options={projectLocationOptions}
              placeholder="選擇或搜尋工程地點"
            />
            <input
              type="text"
              value={projectLocation}
              onChange={e => setProjectLocation(e.target.value)}
              placeholder="或直接輸入工程地點"
              className="mt-2 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Quotation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              報價單 / 合約
            </label>
            <SearchableSelect
              value={quotationId || null}
              onChange={val => handleQuotationChange(val as string | null)}
              options={quotationOptions}
              placeholder="選擇報價單"
            />
          </div>

          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
            <SearchableSelect
              value={clientId || null}
              onChange={val => handleClientChange(val as string | null)}
              options={partnerOptions}
              placeholder="選擇客戶"
            />
            {!clientId && (
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="或直接輸入客戶名稱"
                className="mt-2 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Client Contract No */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">客戶合約</label>
            <SearchableSelect
              value={clientContractNo || null}
              onChange={val => setClientContractNo((val as string) || '')}
              options={contractOptions}
              placeholder="選擇合約"
            />
            <input
              type="text"
              value={clientContractNo}
              onChange={e => setClientContractNo(e.target.value)}
              placeholder="或直接輸入合約編號"
              className="mt-2 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Section 3: 工作內容 */}
      <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
        <h2 className="font-semibold text-gray-700 border-b pb-2">工作內容</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">工作摘要</label>
          <textarea
            value={workSummary}
            onChange={e => setWorkSummary(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="輸入工作摘要..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">完成的工作</label>
          <textarea
            value={completedWork}
            onChange={e => setCompletedWork(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="輸入完成的工作..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">備忘錄</label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="輸入備忘錄..."
          />
        </div>
      </div>

      {/* Section 4: Labour and Plant */}
      <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="font-semibold text-gray-700">Labour and Plant</h2>
          <div className="flex gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => addItem(cat)}
                className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 text-gray-600"
              >
                + {categoryLabels[cat]}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed rounded-lg">
            暫無項目，點擊上方按鈕新增
          </div>
        ) : (
          <div className="space-y-2">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2">
              <div className="col-span-1">類別</div>
              <div className="col-span-2">工種</div>
              <div className="col-span-2">內容</div>
              <div className="col-span-1 text-center">數量</div>
              <div className="col-span-1 text-center">中直</div>
              <div className="col-span-1 text-center">OT</div>
              <div className="col-span-1">員工/車牌</div>
              <div className="col-span-1">機種</div>
              <div className="col-span-1 text-center">噸數</div>
              <div className="col-span-1 text-center">操作</div>
            </div>

            {items.map((item, idx) => (
              <div key={item._key} className="grid grid-cols-12 gap-2 items-start bg-gray-50 rounded-lg px-2 py-2">
                {/* Category */}
                <div className="col-span-1">
                  <SearchableSelect
                    value={item.category}
                    onChange={val => updateItem(item._key, 'category', val || 'worker')}
                    options={categoryOptions}
                    placeholder="類別"
                    clearable={false}
                    className="text-xs"
                  />
                </div>

                {/* Worker type */}
                <div className="col-span-2">
                  {item.category === 'worker' ? (
                    <SearchableSelect
                      value={item.worker_type || null}
                      onChange={val => updateItem(item._key, 'worker_type', val || '')}
                      options={workerTypeOptions}
                      placeholder="工種"
                      className="text-xs"
                    />
                  ) : (item.category === 'vehicle' || item.category === 'machinery') ? (
                    <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.with_operator}
                        onChange={e => updateItem(item._key, 'with_operator', e.target.checked)}
                        className="rounded"
                      />
                      連機手/司機
                    </label>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </div>

                {/* Content */}
                <div className="col-span-2">
                  <input
                    type="text"
                    value={item.content}
                    onChange={e => updateItem(item._key, 'content', e.target.value)}
                    placeholder="內容"
                    className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Quantity */}
                <div className="col-span-1">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={e => updateItem(item._key, 'quantity', e.target.value)}
                    placeholder="0"
                    step="0.5"
                    min="0"
                    className="w-full px-2 py-1 border rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Shift quantity */}
                <div className="col-span-1">
                  <input
                    type="number"
                    value={item.shift_quantity}
                    onChange={e => updateItem(item._key, 'shift_quantity', e.target.value)}
                    placeholder="0"
                    step="0.5"
                    min="0"
                    className="w-full px-2 py-1 border rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* OT hours */}
                <div className="col-span-1">
                  <input
                    type="number"
                    value={item.ot_hours}
                    onChange={e => updateItem(item._key, 'ot_hours', e.target.value)}
                    placeholder="0"
                    step="0.5"
                    min="0"
                    className="w-full px-2 py-1 border rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Name or plate */}
                <div className="col-span-1">
                  <input
                    type="text"
                    value={item.name_or_plate}
                    onChange={e => updateItem(item._key, 'name_or_plate', e.target.value)}
                    placeholder="員工/車牌"
                    className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Machine type */}
                <div className="col-span-1">
                  {(item.category === 'vehicle' || item.category === 'machinery') ? (
                    <SearchableSelect
                      value={item.machine_type || null}
                      onChange={val => updateItem(item._key, 'machine_type', val || '')}
                      options={machineTypeOptions}
                      placeholder="機種"
                      className="text-xs"
                    />
                  ) : (
                    <span className="text-xs text-gray-300">-</span>
                  )}
                </div>

                {/* Tonnage */}
                <div className="col-span-1">
                  {(item.category === 'vehicle' || item.category === 'machinery') ? (
                    <SearchableSelect
                      value={item.tonnage || null}
                      onChange={val => updateItem(item._key, 'tonnage', val || '')}
                      options={tonnageOptions}
                      placeholder="噸數"
                      className="text-xs"
                    />
                  ) : (
                    <span className="text-xs text-gray-300">-</span>
                  )}
                </div>

                {/* Actions */}
                <div className="col-span-1 flex items-center justify-center gap-1">
                  <button
                    onClick={() => moveItem(item._key, -1)}
                    disabled={idx === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title="上移"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveItem(item._key, 1)}
                    disabled={idx === items.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title="下移"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => removeItem(item._key)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="刪除"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Item count summary */}
        {items.length > 0 && (
          <div className="text-xs text-gray-400 text-right">
            共 {items.length} 項 &nbsp;|&nbsp;
            工人 {items.filter(i => i.category === 'worker').length} &nbsp;
            車輛 {items.filter(i => i.category === 'vehicle').length} &nbsp;
            機械 {items.filter(i => i.category === 'machinery').length} &nbsp;
            工具 {items.filter(i => i.category === 'tool').length}
          </div>
        )}
      </div>

      {/* Bottom save bar */}
      <div className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between sticky bottom-4">
        <p className="text-sm text-gray-500">
          {originalReport?.daily_report_status === 'submitted'
            ? '⚠️ 此日報已提交，管理員強制修改模式'
            : '草稿模式'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/daily-reports')}
            className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  );
}
