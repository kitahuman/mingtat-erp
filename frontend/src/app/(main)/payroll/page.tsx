'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { payrollApi, companyProfilesApi, employeesApi } from '@/lib/api';
import Modal from '@/components/Modal';

// ─── Step indicator ───────────────────────────────────────────
const STEPS = ['選擇公司', '選擇員工', '選擇日期範圍', '核對工作記錄', '確認生成'];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors
                ${done ? 'bg-green-500 border-green-500 text-white' : active ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-300 text-gray-400'}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-xs mt-1 whitespace-nowrap ${active ? 'text-primary-600 font-medium' : done ? 'text-green-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Grouped Settlement View Component ───────────────────────
function GroupedSettlementView({ groups }: { groups: any[] }) {
  if (!groups || groups.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">沒有歸組結算數據</p>;
  }
  const totalAmount = groups.reduce((sum: number, g: any) => sum + (Number(g.total_amount) || 0), 0);
  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600">客戶</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">合約</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">日/夜</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">路線</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">單價</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">數量</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">小計</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g: any, idx: number) => {
            const route = [g.start_location, g.end_location].filter(Boolean).join(' → ');
            const hasPrice = g.price_match_status === 'matched' && g.matched_rate;
            return (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 font-medium">{g.client_name || '-'}</td>
                <td className="px-3 py-2 text-gray-600">{g.contract_no || '-'}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    g.day_night === '夜' ? 'bg-indigo-100 text-indigo-700' :
                    g.day_night === '中直' ? 'bg-purple-100 text-purple-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{g.day_night || '日'}</span>
                </td>
                <td className="px-3 py-2 text-gray-600 text-xs">{route || '-'}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {hasPrice ? `$${Number(g.matched_rate).toLocaleString()}` : <span className="text-orange-500">未設定</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono">{g.count}車</td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {hasPrice ? `$${Number(g.total_amount).toLocaleString()}` : <span className="text-orange-500">未設定</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-gray-900">
          <tr className="bg-gray-50">
            <td colSpan={6} className="px-3 py-2 font-bold text-right">歸組結算合計</td>
            <td className="px-3 py-2 text-right font-mono font-bold text-primary-600">
              ${totalAmount.toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Daily Calculation View (Preview mode - read only) ───────
function DailyCalculationPreview({ dailyCalc }: { dailyCalc: any[] }) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  if (!dailyCalc || dailyCalc.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">沒有逐日計算數據</p>;
  }

  const grandTotal = dailyCalc.reduce((sum: number, d: any) => sum + (Number(d.day_total) || 0), 0);
  const totalTopUp = dailyCalc.reduce((sum: number, d: any) => sum + (Number(d.top_up_amount) || 0), 0);

  return (
    <div className="space-y-1">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 mb-4 p-3 bg-gray-50 rounded-lg text-sm">
        <div><span className="text-gray-500">工作天數：</span><span className="font-bold">{dailyCalc.length}天</span></div>
        <div><span className="text-gray-500">需補底薪天數：</span><span className="font-bold text-orange-600">{dailyCalc.filter((d: any) => d.needs_top_up).length}天</span></div>
        <div><span className="text-gray-500">補底薪合計：</span><span className="font-bold text-orange-600">${totalTopUp.toLocaleString()}</span></div>
        <div><span className="text-gray-500">逐日合計：</span><span className="font-bold text-primary-600">${grandTotal.toLocaleString()}</span></div>
      </div>

      {/* Daily rows */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-8"></th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">工作收入</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">日薪底薪</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">補底薪</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">當日合計</th>
            </tr>
          </thead>
          <tbody>
            {dailyCalc.map((day: any, idx: number) => {
              const isExpanded = expandedDate === day.date;
              const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(day.date).getDay()];
              return (
                <>
                  <tr key={day.date} className={`border-b ${day.needs_top_up ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setExpandedDate(isExpanded ? null : day.date)} className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {day.date} <span className="text-xs text-gray-400">({weekday})</span>
                      {day.work_logs?.length > 1 && <span className="text-xs text-gray-400 ml-1">({day.work_logs.length}筆)</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ${Number(day.work_income).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-500">
                      ${Number(day.base_salary).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {day.needs_top_up ? (
                        <span className="text-orange-600 font-bold">+${Number(day.top_up_amount).toLocaleString()}</span>
                      ) : (
                        <span className="text-green-600">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      ${Number(day.day_total).toLocaleString()}
                    </td>
                  </tr>
                  {/* Expanded work log details */}
                  {isExpanded && (
                    <tr key={`exp-${day.date}`} className="bg-gray-50 border-b">
                      <td colSpan={6} className="px-6 py-2">
                        <div className="text-xs space-y-1">
                          {(day.work_logs || []).map((wl: any, wIdx: number) => (
                            <div key={wIdx} className="flex items-center gap-3 py-1 border-b border-gray-200 last:border-0">
                              <span className={`px-1 py-0.5 rounded text-xs ${
                                wl.day_night === '夜' ? 'bg-indigo-100 text-indigo-700' : 'bg-yellow-100 text-yellow-700'
                              }`}>{wl.day_night || '日'}</span>
                              <span className="text-gray-600">{wl.client_name || '-'}</span>
                              <span className="text-gray-400">{[wl.start_location, wl.end_location].filter(Boolean).join(' → ') || '-'}</span>
                              <span className="ml-auto font-mono">
                                {wl.matched_rate ? `$${Number(wl.matched_rate).toLocaleString()} x ${wl.quantity || 1}` : '未設定'}
                              </span>
                              <span className="font-mono font-bold w-24 text-right">
                                ${Number(wl.line_amount || 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-900">
            <tr className="bg-gray-50">
              <td colSpan={5} className="px-3 py-2 font-bold text-right">逐日合計</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-primary-600">
                ${grandTotal.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Tab type for wizard step 3 ──────────────────────────────
const WIZARD_TABS = ['detail', 'grouped', 'daily'] as const;
type WizardTab = typeof WIZARD_TABS[number];
const WIZARD_TAB_LABELS: Record<WizardTab, string> = {
  detail: '逐筆明細',
  grouped: '歸組結算',
  daily: '逐日計算',
};

// ─── Main Page ────────────────────────────────────────────────
export default function PayrollPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 0: Company
  const [companyProfiles, setCompanyProfiles] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);

  // Step 1: Employee
  const [employees, setEmployees] = useState<any[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  // Step 2: Date range
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Step 3: Preview
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState('');
  const [wizardTab, setWizardTab] = useState<WizardTab>('daily');

  // Step 4: Generate
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<any>(null);
  const [generateError, setGenerateError] = useState('');

  // Load company profiles
  useEffect(() => {
    companyProfilesApi.simple().then(res => setCompanyProfiles(res.data));
  }, []);

  // Load employees when company changes
  useEffect(() => {
    if (!selectedCompany) { setEmployees([]); return; }
    employeesApi.list({ limit: 500, status: 'active', company_profile_id: selectedCompany.id }).then(res => {
      setEmployees(res.data.data || []);
    }).catch(() => {
      employeesApi.list({ limit: 500, status: 'active' }).then(res => setEmployees(res.data.data || []));
    });
  }, [selectedCompany]);

  // Default date range to current month
  useEffect(() => {
    if (step === 2 && !dateFrom) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      setDateFrom(`${y}-${m}-01`);
      setDateTo(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    }
  }, [step]);

  const handlePreview = async () => {
    setPreviewing(true);
    setPreviewError('');
    setPreview(null);
    try {
      const res = await payrollApi.preview({
        employee_id: selectedEmployee.id,
        date_from: dateFrom,
        date_to: dateTo,
        company_profile_id: selectedCompany?.id,
      });
      setPreview(res.data);
      setStep(3);
    } catch (err: any) {
      setPreviewError(err.response?.data?.message || '預覽失敗，請重試');
    }
    setPreviewing(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await payrollApi.generate({
        employee_id: selectedEmployee.id,
        date_from: dateFrom,
        date_to: dateTo,
        company_profile_id: selectedCompany?.id,
      });
      setGenerated(res.data);
      setStep(4);
    } catch (err: any) {
      setGenerateError(err.response?.data?.message || '生成失敗，請重試');
    }
    setGenerating(false);
  };

  const handleReset = () => {
    setStep(0);
    setSelectedCompany(null);
    setSelectedEmployee(null);
    setDateFrom('');
    setDateTo('');
    setPreview(null);
    setPreviewError('');
    setGenerated(null);
    setGenerateError('');
    setEmpSearch('');
    setWizardTab('daily');
  };

  const filteredEmployees = employees.filter(emp =>
    !empSearch ||
    emp.name_zh?.includes(empSearch) ||
    emp.name_en?.toLowerCase().includes(empSearch.toLowerCase()) ||
    emp.emp_code?.toLowerCase().includes(empSearch.toLowerCase())
  );

  const mpfLabel = (plan: string) => {
    if (plan === 'industry') return '東亞（行業計劃）';
    if (plan === 'manulife') return 'Manulife';
    if (plan === 'aia') return 'AIA';
    return plan || '未設定';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">計糧管理</h1>
          <p className="text-sm text-gray-500">逐個員工核對工作記錄，確認後生成糧單</p>
        </div>
        <button onClick={() => router.push('/payroll-records')} className="btn-secondary">
          查看糧單記錄
        </button>
      </div>

      <div className="card">
        <StepBar current={step} />

        {/* ── Step 0: 選公司 ── */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">選擇公司</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {companyProfiles.map(cp => (
                <button
                  key={cp.id}
                  onClick={() => { setSelectedCompany(cp); setSelectedEmployee(null); setStep(1); }}
                  className="p-4 text-left border-2 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-colors group"
                >
                  <div className="font-bold text-gray-900 group-hover:text-primary-700">{cp.chinese_name}</div>
                  <div className="text-sm text-gray-500">{cp.english_name}</div>
                  <div className="text-xs text-gray-400 mt-1">{cp.code}</div>
                </button>
              ))}
              {companyProfiles.length === 0 && (
                <p className="text-gray-400 text-sm col-span-3">沒有公司資料，請先在「公司資料」中新增。</p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 1: 選員工 ── */}
        {step === 1 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setStep(0)} className="text-sm text-gray-500 hover:text-primary-600">← 返回</button>
              <h2 className="text-lg font-bold text-gray-800">選擇員工</h2>
              <span className="text-sm text-gray-500">— {selectedCompany?.chinese_name}</span>
            </div>
            <input
              type="text"
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
              placeholder="搜尋員工姓名或編號..."
              className="input-field mb-4"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              {filteredEmployees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => { setSelectedEmployee(emp); setStep(2); }}
                  className="p-4 text-left border-2 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-colors group"
                >
                  <div className="font-bold text-gray-900 group-hover:text-primary-700">{emp.name_zh}</div>
                  <div className="text-sm text-gray-500">{emp.name_en}</div>
                  <div className="flex gap-2 mt-1">
                    {emp.emp_code && <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{emp.emp_code}</span>}
                    <span className="text-xs text-gray-400">{emp.mpf_plan ? mpfLabel(emp.mpf_plan) : '強積金未設定'}</span>
                  </div>
                </button>
              ))}
              {filteredEmployees.length === 0 && (
                <p className="text-gray-400 text-sm col-span-3">沒有符合條件的員工。</p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: 選日期範圍 ── */}
        {step === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-primary-600">← 返回</button>
              <h2 className="text-lg font-bold text-gray-800">選擇日期範圍</h2>
            </div>

            <div className="flex gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-xs text-gray-500">公司</p>
                <p className="font-medium">{selectedCompany?.chinese_name}</p>
              </div>
              <div className="border-l pl-3">
                <p className="text-xs text-gray-500">員工</p>
                <p className="font-medium">{selectedEmployee?.name_zh} <span className="text-gray-400 text-sm">{selectedEmployee?.name_en}</span></p>
              </div>
              <div className="border-l pl-3">
                <p className="text-xs text-gray-500">強積金計劃</p>
                <p className="font-medium">{mpfLabel(selectedEmployee?.mpf_plan)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始日期 *</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">結束日期 *</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-3 flex-wrap">
              {[
                { label: '本月', fn: () => {
                  const now = new Date();
                  const y = now.getFullYear(); const m = now.getMonth();
                  const lastDay = new Date(y, m + 1, 0).getDate();
                  setDateFrom(`${y}-${String(m+1).padStart(2,'0')}-01`);
                  setDateTo(`${y}-${String(m+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);
                }},
                { label: '上月', fn: () => {
                  const now = new Date();
                  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                  const y = d.getFullYear(); const m = d.getMonth();
                  const lastDay = new Date(y, m + 1, 0).getDate();
                  setDateFrom(`${y}-${String(m+1).padStart(2,'0')}-01`);
                  setDateTo(`${y}-${String(m+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);
                }},
              ].map(preset => (
                <button key={preset.label} onClick={preset.fn} className="text-xs px-3 py-1 border rounded-full hover:bg-gray-50 text-gray-600">
                  {preset.label}
                </button>
              ))}
            </div>

            {previewError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{previewError}</div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handlePreview}
                disabled={!dateFrom || !dateTo || previewing}
                className="btn-primary"
              >
                {previewing ? '載入中...' : '載入工作記錄 →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: 核對工作記錄 (with Tabs) ── */}
        {step === 3 && preview && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-primary-600">← 返回</button>
              <h2 className="text-lg font-bold text-gray-800">核對工作記錄</h2>
            </div>

            {/* Header info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 p-4 bg-gray-50 rounded-xl text-sm">
              <div>
                <p className="text-xs text-gray-500">員工</p>
                <p className="font-bold">{preview.employee?.name_zh}</p>
                <p className="text-gray-400">{preview.employee?.name_en}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">日期範圍</p>
                <p className="font-bold">{dateFrom}</p>
                <p className="text-gray-400">至 {dateTo}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">工作記錄數</p>
                <p className="font-bold text-lg">{preview.work_logs?.length ?? 0} 筆</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">薪酬配置</p>
                <p className="font-bold">{preview.salary_setting ? (preview.salary_setting.salary_type === 'daily' ? '日薪' : '月薪') : '未配置'}</p>
                {preview.salary_setting && <p className="text-gray-400">${Number(preview.salary_setting.base_salary).toLocaleString()}</p>}
              </div>
            </div>

            {!preview.salary_setting && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                此員工沒有薪酬配置，無法計算薪金。請先在「薪酬配置」中設定。
              </div>
            )}

            {/* Tabs */}
            {preview.work_logs?.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center border-b mb-4">
                  {WIZARD_TABS.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setWizardTab(tab)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        wizardTab === tab
                          ? 'border-primary-600 text-primary-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {WIZARD_TAB_LABELS[tab]}
                      {tab === 'daily' && preview.daily_calculation?.length > 0 && (
                        <span className="ml-1 text-xs bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded-full">{preview.daily_calculation.length}天</span>
                      )}
                      {tab === 'detail' && (
                        <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{preview.work_logs.length}筆</span>
                      )}
                      {tab === 'grouped' && preview.grouped_settlement?.length > 0 && (
                        <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{preview.grouped_settlement.length}組</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Detail view */}
                {wizardTab === 'detail' && (
                  <div>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">日期</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">服務類型</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">日/夜班</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">地點</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">數量</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">OT</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">單價</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">金額</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">備註</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.work_logs.map((wl: any, idx: number) => {
                            const rate = wl._matched_rate ?? wl.matched_rate;
                            const lineAmt = wl._line_amount ?? 0;
                            const status = wl._price_match_status ?? wl.price_match_status;
                            const hasPrice = status === 'matched' && rate;
                            return (
                              <tr key={wl.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-3 py-2 font-mono whitespace-nowrap">{wl.scheduled_date}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{wl.service_type || '-'}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                    wl.day_night === '夜' ? 'bg-indigo-100 text-indigo-700' :
                                    wl.day_night === '中直' ? 'bg-purple-100 text-purple-700' :
                                    'bg-yellow-100 text-yellow-700'
                                  }`}>{wl.day_night || '日'}</span>
                                </td>
                                <td className="px-3 py-2 text-gray-600 text-xs">
                                  {[wl.start_location, wl.end_location].filter(Boolean).join(' → ') || '-'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">{wl.quantity || '-'}</td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {wl.ot_quantity ? <span className="text-orange-600 font-medium">{wl.ot_quantity}h</span> : '-'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {hasPrice ? `$${Number(rate).toLocaleString()}` : <span className="text-orange-500 text-xs">未設定</span>}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-bold">
                                  {hasPrice ? `$${Number(lineAmt).toLocaleString()}` : <span className="text-orange-500 text-xs">未設定</span>}
                                </td>
                                <td className="px-3 py-2 text-gray-500 text-xs max-w-32 truncate">{wl.remarks || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Grouped view */}
                {wizardTab === 'grouped' && (
                  <GroupedSettlementView groups={preview.grouped_settlement} />
                )}

                {/* Daily calculation view */}
                {wizardTab === 'daily' && (
                  <DailyCalculationPreview dailyCalc={preview.daily_calculation} />
                )}
              </div>
            )}

            {preview.work_logs?.length === 0 && (
              <div className="mb-5 p-4 bg-gray-50 rounded-lg text-sm text-gray-500 text-center">
                此日期範圍內沒有工作記錄
              </div>
            )}

            {/* Calculation preview */}
            {preview.calculation && (
              <div className="mb-5">
                <h3 className="text-sm font-bold text-gray-700 mb-2">計算預覽</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">項目</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">單價</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">天數/數量</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.calculation.items.map((item: any, idx: number) => {
                        const isDeduction = Number(item.amount) < 0;
                        return (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-2 font-medium">{item.item_name}</td>
                            <td className="px-4 py-2 text-right font-mono text-gray-600">
                              {item.item_type === 'mpf_deduction' && preview.employee?.mpf_plan !== 'industry'
                                ? `${(Number(item.quantity) * 100).toFixed(0)}%`
                                : `$${Number(item.unit_price).toLocaleString()}`}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-gray-600">
                              {item.item_type === 'mpf_deduction' && preview.employee?.mpf_plan !== 'industry'
                                ? '' : Number(item.quantity)}
                            </td>
                            <td className={`px-4 py-2 text-right font-mono font-bold ${isDeduction ? 'text-red-600' : ''}`}>
                              {isDeduction ? '-' : ''}${Math.abs(Number(item.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-900">
                      <tr className="bg-gray-50">
                        <td colSpan={3} className="px-4 py-3 font-bold text-right text-base">淨額</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-lg text-primary-600">
                          ${Number(preview.calculation.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {generateError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{generateError}</div>
            )}

            <div className="flex gap-3">
              {preview.salary_setting && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="btn-primary"
                >
                  {generating ? '生成中...' : '確認生成糧單 →'}
                </button>
              )}
              <button onClick={() => setStep(2)} className="btn-secondary">修改日期範圍</button>
            </div>
          </div>
        )}

        {/* ── Step 4: 完成 ── */}
        {step === 4 && generated && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">糧單已成功生成！</h2>
            <p className="text-gray-500 mb-1">{generated.employee?.name_zh} — {dateFrom} 至 {dateTo}</p>
            <p className="text-2xl font-bold text-primary-600 mb-6">
              淨額：${Number(generated.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => router.push(`/payroll/${generated.id}`)} className="btn-primary">
                查看糧單詳情
              </button>
              <button onClick={handleReset} className="btn-secondary">
                繼續出下一個員工糧單
              </button>
              <button onClick={() => router.push('/payroll-records')} className="btn-secondary">
                查看所有糧單記錄
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
