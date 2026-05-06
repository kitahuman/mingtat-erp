'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { payrollApi, employeesApi, fleetRateCardsApi, partnersApi, companiesApi, vehiclesApi, machineryApi } from '@/lib/api';
import Modal from '@/components/Modal';
import Combobox from '@/components/Combobox';
import SearchableSelect from '@/components/SearchableSelect';
import { useMultiFieldOptions } from '@/hooks/useFieldOptions';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';
import DateInput from '@/components/DateInput';

const UNIT_OPTIONS = ['車','噸','天','晚','小時','次'];
const SERVICE_TYPES = ['運輸', '機械', '勞務', '其他'];
const FIELD_OPTION_CATEGORIES = ['tonnage', 'machine_type'];

type TabType = 'grouped' | 'detail' | 'unmatched' | 'daily' | 'calculation';

// ─── Grouped Settlement View ──────────────────────────────────
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
            <th className="px-3 py-2 text-left font-medium text-gray-600">客戶合約</th>
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
                <td className="px-3 py-2 text-gray-600 text-xs">{g.contract_no || '-'}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    g.day_night === '夜' ? 'bg-indigo-100 text-indigo-700' :
                    g.day_night === '中直' ? 'bg-purple-100 text-purple-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{g.day_night || '日'}</span>
                </td>
                <td className="px-3 py-2 text-gray-600 text-xs">{route || '-'}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {hasPrice ? `$${Number(g.matched_rate).toLocaleString()}` : <span className="text-orange-500 text-xs">未設定</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono">{g.count}車</td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {hasPrice ? `$${Number(g.total_amount).toLocaleString()}` : <span className="text-orange-500">-</span>}
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

// ─── Daily Calculation View ───────────────────────────────────
function DailyCalculationPreview({ dailyCalc, salaryType }: { dailyCalc: any[]; salaryType?: string }) {
  const isDaily = salaryType === 'daily' || !salaryType;
  const { isReadOnly } = useAuth();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  if (!dailyCalc || dailyCalc.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">沒有逐日計算數據</p>;
  }
  const isStatutoryHolidayNoAttendance = (day: any) =>
    (day.work_logs || []).length === 0 &&
    (day.daily_allowances || []).some((a: any) => a.allowance_key === 'statutory_holiday');

  const getTopUpAmount = (day: any) => {
    if (!isDaily || isStatutoryHolidayNoAttendance(day)) return 0;
    const workIncome = Number(day.work_income) || 0;
    const baseSalary = Number(day.base_salary) || 0;
    if (baseSalary <= 0 || workIncome >= baseSalary) return 0;
    return Math.max(0, Number(day.top_up_amount) || (baseSalary - workIncome));
  };

  const workDayCount = dailyCalc.filter((d: any) => (d.work_logs || []).length > 0).length;
  const grandTotal = dailyCalc.reduce((sum: number, d: any) => sum + (Number(d.day_total) || 0), 0);
  const totalTopUp = dailyCalc.reduce((sum: number, d: any) => sum + getTopUpAmount(d), 0);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-4 mb-4 p-3 bg-gray-50 rounded-lg text-sm">
        <div><span className="text-gray-500">工作天數：</span><span className="font-bold">{workDayCount}天</span></div>
        {isDaily && <div><span className="text-gray-500">需補底薪天數：</span><span className="font-bold text-orange-600">{dailyCalc.filter((d: any) => getTopUpAmount(d) > 0).length}天</span></div>}
        {isDaily && <div><span className="text-gray-500">補底薪合計：</span><span className="font-bold text-orange-600">${totalTopUp.toLocaleString()}</span></div>}
        <div><span className="text-gray-500">逐日合計：</span><span className="font-bold text-primary-600">${grandTotal.toLocaleString()}</span></div>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-8"></th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">工作收入</th>
              {isDaily && <th className="px-3 py-2 text-right font-medium text-gray-600">日薪底薪</th>}
              {isDaily && <th className="px-3 py-2 text-right font-medium text-gray-600">補底薪</th>}
              <th className="px-3 py-2 text-right font-medium text-gray-600">當日合計</th>
            </tr>
          </thead>
          <tbody>
            {dailyCalc.map((day: any, idx: number) => {
              const isExpanded = expandedDate === day.date;
              const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(day.date).getDay()];
              const topUpAmount = getTopUpAmount(day);
              return (
                <>
                  <tr key={day.date} className={`border-b ${topUpAmount > 0 ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setExpandedDate(isExpanded ? null : day.date)} className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {day.date} <span className="text-xs text-gray-400">({weekday})</span>
                      {day.work_logs?.length > 1 && <span className="text-xs text-gray-400 ml-1">({day.work_logs.length}筆)</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">${Number(day.work_income).toLocaleString()}</td>
                    {isDaily && <td className="px-3 py-2 text-right font-mono text-gray-500">${Number(day.base_salary).toLocaleString()}</td>}
                    {isDaily && <td className="px-3 py-2 text-right font-mono">
                      {topUpAmount > 0
                        ? <span className="text-orange-600 font-bold">+${topUpAmount.toLocaleString()}</span>
                        : <span className="text-green-600">-</span>}
                    </td>}
                    <td className="px-3 py-2 text-right font-mono font-bold">${Number(day.day_total).toLocaleString()}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`exp-${day.date}`} className="bg-gray-50 border-b">
                      <td colSpan={isDaily ? 6 : 4} className="px-6 py-2">
                        <div className="text-xs space-y-2">
                          {(day.work_logs || []).map((wl: any, wIdx: number) => {
                            const wlRoute = [wl.start_location, wl.end_location].filter(Boolean).join(' → ');
                            const wlEquipment = [wl.tonnage, wl.machine_type, wl.equipment_number].filter(Boolean).join('');
                            const wlShortName = wl.client_short_name || (wl.client_name ? wl.client_name.substring(0, 4) : '');
                            const wlDesc = [wl.service_type, wlShortName, wl.client_contract_no, wlRoute, wlEquipment ? `(${wlEquipment})` : '', wl.day_night || '日', wl.ot_quantity && Number(wl.ot_quantity) > 0 ? 'OT' : '', wl.is_mid_shift ? '中直' : ''].filter(Boolean).join(' ');
                            const wlBaseAmt = wl.base_line_amount ?? (wl.matched_rate ? Number(wl.matched_rate) * Number(wl.quantity || 1) : 0);
                            const wlOtAmt = wl.ot_line_amount ?? 0;
                            const wlMidAmt = wl.mid_shift_line_amount ?? 0;
                            return (
                              <div key={wIdx} className="py-1 border-b border-gray-200 last:border-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-700 font-medium">{wlDesc || '-'}</span>
                                  <span className="font-mono font-bold text-primary-600">${Number(wl.line_amount || 0).toLocaleString()}</span>
                                </div>
                                {wl.matched_rate && (
                                  <div className="flex gap-4 mt-0.5 text-gray-400">
                                    <span>基本: ${Number(wl.matched_rate).toLocaleString()} × {wl.quantity} = ${wlBaseAmt.toLocaleString()}</span>
                                    {wl.ot_quantity > 0 && <span>OT: ${wl.matched_ot_rate ? Number(wl.matched_ot_rate).toLocaleString() : '未設定'} × {wl.ot_quantity} = ${wlOtAmt.toLocaleString()}</span>}
                                    {wl.is_mid_shift && <span>中直: ${wl.matched_mid_shift_rate ? Number(wl.matched_mid_shift_rate).toLocaleString() : '未設定'} = ${wlMidAmt.toLocaleString()}</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
              <td colSpan={isDaily ? 5 : 3} className="px-3 py-2 font-bold text-right">逐日合計</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-primary-600">${grandTotal.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Unmatched group type ─────────────────────────────────────
interface UnmatchedGroup {
  key: string;
  company_id?: number | null;
  client_id?: number | null;
  client_name?: string;
  contract_no?: string;
  service_type?: string;
  day_night?: string;
  tonnage?: string;
  machine_type?: string;
  origin?: string;
  destination?: string;
  count: number;
  sample_note: string;
}

function buildUnmatchedGroups(workLogs: any[]): UnmatchedGroup[] {
  const map = new Map<string, UnmatchedGroup>();
  for (const wl of workLogs) {
    const status = wl._price_match_status ?? wl.price_match_status;
    if (status === 'matched') continue;
    const key = [wl.company_id ?? '', wl.client_id ?? '', wl.contract_no ?? '', wl.service_type ?? '', wl.day_night ?? '', wl.tonnage ?? '', wl.machine_type ?? '', wl.start_location ?? '', wl.end_location ?? ''].join('|');
    if (map.has(key)) {
      map.get(key)!.count++;
    } else {
      map.set(key, {
        key,
        company_id: wl.company_id,
        client_id: wl.client_id,
        client_name: wl.client_name || wl.client?.name || '',
        contract_no: wl.contract_no || '',
        service_type: wl.service_type || '',
        day_night: wl.day_night || '',
        tonnage: wl.tonnage || '',
        machine_type: wl.machine_type || '',
        origin: wl.start_location || '',
        destination: wl.end_location || '',
        count: 1,
        sample_note: wl._price_match_note ?? wl.price_match_note ?? '',
      });
    }
  }
  return Array.from(map.values());
}

// ─── Main Page ────────────────────────────────────────────────
export default function PayrollPage() {
  const router = useRouter();

  // ── Selection state ──
  const { isReadOnly } = useAuth();
  const [companies, setCompanies] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Result state ──
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('grouped');

  // ── Generate state ──
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<any>(null);
  const [generateError, setGenerateError] = useState('');

  // ── Add Rate Modal ──
  const [showAddRateModal, setShowAddRateModal] = useState(false);
  const [addRateForm, setAddRateForm] = useState<any>({
    company_id: '', client_id: '', contract_no: '', service_type: '',
    name: '', day_night: '',
    tonnage: '', machine_type: '', equipment_number: '',
    origin: '', destination: '',
    rate: 0, mid_shift_rate: 0, ot_rate: 0,
    unit: '車', remarks: '', status: 'active',
  });
  const [addRateSubmitting, setAddRateSubmitting] = useState(false);
  const [addRateError, setAddRateError] = useState('');
  const [partners, setPartners] = useState<any[]>([]);
  const [allEquipment, setAllEquipment] = useState<{value: string; label: string}[]>([]);
  const { optionsMap } = useMultiFieldOptions(FIELD_OPTION_CATEGORIES);
  const tonnageOptions = optionsMap['tonnage'] || [];
  const vehicleTypeOptions = optionsMap['machine_type'] || [];

  // ── Load reference data ──
  useEffect(() => {
    companiesApi.simple().then(res => setCompanies(res.data || [])).catch(() => {});
    partnersApi.simple().then(res => setPartners(res.data || [])).catch(() => {});
    Promise.all([
      vehiclesApi.simple().then(res => res.data),
      machineryApi.simple().then(res => res.data),
    ]).then(([vehicles, machinery]) => {
      const vPlates = vehicles.map((v: any) => v.plate_number).filter(Boolean);
      const mCodes = machinery.map((m: any) => m.machine_code).filter(Boolean);
      setAllEquipment([...vPlates, ...mCodes].map(s => ({ value: s, label: s })));
    }).catch(() => {});

    // Default date range to current month
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    setDateFrom(`${y}-${m}-01`);
    setDateTo(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
  }, []);

  // ── Load employees when company changes ──
  useEffect(() => {
    setSelectedEmployeeId(null);
    setEmployees([]);
    if (!selectedCompanyId) {
      employeesApi.list({ limit: 500, status: 'active' }).then(res => setEmployees(res.data.data || [])).catch(() => {});
      return;
    }
    employeesApi.list({ limit: 500, status: 'active', company_id: selectedCompanyId }).then(res => {
      setEmployees(res.data.data || []);
    }).catch(() => {
      employeesApi.list({ limit: 500, status: 'active' }).then(res => setEmployees(res.data.data || []));
    });
  }, [selectedCompanyId]);

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId) || null;
  const selectedCompany = companies.find(c => c.id === selectedCompanyId) || null;

  const employeeOptions = employees.map(e => ({
    value: e.id,
    label: `${e.name_zh || ''}${e.name_en ? ' ' + e.name_en : ''}${e.emp_code ? ' (' + e.emp_code + ')' : ''}`,
  }));
  const companyOptions = companies.map(c => ({ value: c.id, label: c.name || c.chinese_name || '' }));

  const handlePreview = async () => {
    if (!selectedEmployeeId || !dateFrom || !dateTo) {
      setPreviewError('請選擇員工和日期範圍');
      return;
    }
    setLoading(true);
    setPreviewError('');
    setPreview(null);
    setGenerated(null);
    try {
      const res = await payrollApi.preview({
        employee_id: selectedEmployeeId,
        date_from: dateFrom,
        date_to: dateTo,
        company_id: selectedCompanyId || undefined,
      });
      setPreview(res.data);
      setActiveTab('grouped');
    } catch (err: any) {
      setPreviewError(err.response?.data?.message || '預覽失敗，請重試');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedEmployeeId) return;
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await payrollApi.generate({
        employee_id: selectedEmployeeId,
        date_from: dateFrom,
        date_to: dateTo,
        company_id: selectedCompanyId || undefined,
      });
      setGenerated(res.data);
    } catch (err: any) {
      setGenerateError(err.response?.data?.message || '生成失敗，請重試');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrepare = async () => {
    if (!selectedEmployeeId) return;
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await payrollApi.prepare({
        employee_id: selectedEmployeeId,
        date_from: dateFrom,
        date_to: dateTo,
        company_id: selectedCompanyId || undefined,
      });
      // 準備完成後直接跳轉到糧單詳情頁編輯工作記錄
      router.push(`/payroll/${res.data.id}`);
    } catch (err: any) {
      setGenerateError(err.response?.data?.message || '準備失敗，請重試');
    } finally {
      setGenerating(false);
    }
  };

  const openAddRateModal = (group: UnmatchedGroup) => {
    setAddRateForm({
      company_id: group.company_id || '',
      client_id: group.client_id || '',
      contract_no: group.contract_no || '',
      service_type: group.service_type || '',
      name: [group.tonnage, group.machine_type, group.origin && group.destination ? `${group.origin}→${group.destination}` : ''].filter(Boolean).join(' '),
      day_night: group.day_night || '',
      tonnage: group.tonnage || '',
      machine_type: group.machine_type || '',
      equipment_number: '',
      origin: group.origin || '',
      destination: group.destination || '',
      rate: 0, mid_shift_rate: 0, ot_rate: 0,
      unit: '車', remarks: '', status: 'active',
    });
    setAddRateError('');
    setShowAddRateModal(true);
  };

  const handleAddRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddRateSubmitting(true);
    setAddRateError('');
    try {
      await fleetRateCardsApi.create({
        ...addRateForm,
        company_id: addRateForm.company_id ? Number(addRateForm.company_id) : null,
        client_id: addRateForm.client_id ? Number(addRateForm.client_id) : null,
        rate: Number(addRateForm.rate) || 0,
        mid_shift_rate: Number(addRateForm.mid_shift_rate) || 0,
        ot_rate: Number(addRateForm.ot_rate) || 0,
      });
      setShowAddRateModal(false);
      await handlePreview();
    } catch (err: any) {
      setAddRateError(err.response?.data?.message || '新增失敗，請重試');
    }
    setAddRateSubmitting(false);
  };

  const mpfLabel = (plan: string) => {
    if (plan === 'industry') return '東亞（行業計劃）';
    if (plan === 'manulife') return 'Manulife';
    if (plan === 'aia') return 'AIA';
    return plan || '未設定';
  };

  // ── Derived data ──
  const unmatchedGroups = preview ? buildUnmatchedGroups(preview.work_logs || []) : [];
  const matchedCount = preview ? (preview.work_logs || []).filter((wl: any) => (wl._price_match_status ?? wl.price_match_status) === 'matched').length : 0;
  const unmatchedCount = preview ? (preview.work_logs || []).length - matchedCount : 0;
  const totalAmount = preview?.calculation?.net_amount ?? 0;

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">計糧管理</h1>
          <p className="text-sm text-gray-500">選擇員工和日期範圍，核對工作記錄後生成糧單</p>
        </div>
        <button onClick={() => router.push('/payroll-records')} className="btn-secondary">
          查看糧單記錄
        </button>
      </div>

      {/* ── Selection Panel ── */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">公司（可選）</label>
            <SearchableSelect
              options={companyOptions}
              value={selectedCompanyId}
              onChange={(v) => setSelectedCompanyId(v ? Number(v) : null)}
              placeholder="全部公司"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">員工 *</label>
            <SearchableSelect
              options={employeeOptions}
              value={selectedEmployeeId}
              onChange={(v) => setSelectedEmployeeId(v ? Number(v) : null)}
              placeholder="選擇員工..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期 *</label>
 <DateInput value={dateFrom} onChange={val => setDateFrom(val || '')} className="input-field w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期 *</label>
 <DateInput value={dateTo} onChange={val => setDateTo(val || '')} className="input-field w-full" />
          </div>
          <div>
            <button
              onClick={handlePreview}
              disabled={loading || !selectedEmployeeId || !dateFrom || !dateTo}
              className="btn-primary w-full"
            >
              {loading ? '計算中...' : '計算'}
            </button>
          </div>
        </div>
        {/* Quick date presets */}
        <div className="flex gap-2 mt-2">
          {[
            { label: '本月', fn: () => { const now = new Date(); const y = now.getFullYear(); const m = now.getMonth(); const last = new Date(y, m + 1, 0).getDate(); setDateFrom(`${y}-${String(m+1).padStart(2,'0')}-01`); setDateTo(`${y}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`); }},
            { label: '上月', fn: () => { const now = new Date(); const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); const y = d.getFullYear(); const m = d.getMonth(); const last = new Date(y, m + 1, 0).getDate(); setDateFrom(`${y}-${String(m+1).padStart(2,'0')}-01`); setDateTo(`${y}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`); }},
          ].map(p => (
            <button key={p.label} onClick={p.fn} className="text-xs px-3 py-1 border rounded-full hover:bg-gray-50 text-gray-600">{p.label}</button>
          ))}
        </div>
        {previewError && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{previewError}</div>}
      </div>

      {/* ── Action Buttons (top) ── */}
      {preview && !generated && (
        <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-center">
          <button onClick={handlePrepare} disabled={generating} className="btn-primary">
            {generating ? '準備中...' : '準備粮單（編輯工作記錄後再計算）'}
          </button>
          {preview.salary_setting && (
            <button onClick={handleGenerate} disabled={generating} className="btn-secondary">
              {generating ? '生成中...' : '直接生成粮單（跳過編輯）'}
            </button>
          )}
          <button onClick={handlePreview} disabled={loading} className="btn-secondary">
            {loading ? '重新抓取資料中...' : '重新抓取資料'}
          </button>
          {generateError && <span className="text-sm text-red-600">{generateError}</span>}
        </div>
      )}

      {/* ── Summary Cards ── */}
      {preview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500 mb-1">員工</p>
            <p className="font-bold text-gray-900">{preview.employee?.name_zh || '-'}</p>
            <p className="text-xs text-gray-400">{preview.employee?.name_en}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500 mb-1">工作記錄</p>
            <p className="text-2xl font-bold text-gray-900">{(preview.work_logs || []).length}</p>
            <p className="text-xs text-gray-400">筆</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500 mb-1">匹配狀況</p>
            <p className="font-bold">
              <span className="text-green-600">{matchedCount} 匹配</span>
              {unmatchedCount > 0 && <span className="text-orange-500 ml-2">{unmatchedCount} 未匹配</span>}
            </p>
            <p className="text-xs text-gray-400">薪酬：{preview.salary_setting ? (preview.salary_setting.salary_type === 'daily' ? '日薪' : '月薪') : '未配置'}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500 mb-1">淨額</p>
            <p className="text-2xl font-bold text-primary-600">${Number(totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {preview && (
        <div className="bg-white rounded-lg shadow p-4">
          {/* Salary setting warning */}
          {!preview.salary_setting && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              此員工沒有薪酬配置，無法計算薪金。請先在「薪酬配置」中設定。
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center border-b mb-4 overflow-x-auto">
            {([
              { key: 'grouped', label: '歸組結算', count: preview.grouped_settlement?.length },
              { key: 'detail', label: '逐筆明細', count: (preview.work_logs || []).length },
              { key: 'daily', label: '逐日計算', count: preview.daily_calculation?.length },
              { key: 'unmatched', label: '未匹配摘要', count: unmatchedGroups.length },
              { key: 'calculation', label: '計算明細', count: null },
            ] as { key: TabType; label: string; count: number | null }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                    tab.key === 'unmatched' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Grouped tab */}
          {activeTab === 'grouped' && (
            <GroupedSettlementView groups={preview.grouped_settlement} />
          )}

          {/* Detail tab - full row-by-row table */}
          {activeTab === 'detail' && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">日期</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">車牌/機號</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">客戶</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">客戶合約</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">服務</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">路線</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">噸數</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">機種</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">日/夜</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">數量</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">費率</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">基本</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">OT</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">中直</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">合計</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.work_logs || []).map((wl: any, idx: number) => {
                    const rate = wl._matched_rate ?? wl.matched_rate;
                    const status = wl._price_match_status ?? wl.price_match_status;
                    const matched = status === 'matched';
                    const lineAmt = Number(wl._line_amount ?? wl.line_amount ?? 0);
                    const baseAmt = Number(wl.base_line_amount ?? (matched && rate ? Number(rate) * Number(wl.quantity || 1) : 0));
                    const otAmt = Number(wl.ot_line_amount ?? 0);
                    const midAmt = Number(wl.mid_shift_line_amount ?? 0);
                    const clientLabel = wl.client_short_name || wl.client?.code || wl.client?.name || wl.client_name || '-';
                    return (
                      <tr key={wl.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">{fmtDate(wl.scheduled_date)}</td>
                        <td className="px-2 py-1.5 text-xs whitespace-nowrap">{wl.equipment_number || '-'}</td>
                        <td className="px-2 py-1.5 text-xs font-medium whitespace-nowrap">{clientLabel}</td>
                        <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">{wl.client_contract_no || '-'}</td>
                        <td className="px-2 py-1.5 text-xs whitespace-nowrap">{wl.service_type || '-'}</td>
                        <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                          {[wl.start_location, wl.end_location].filter(Boolean).join(' → ') || '-'}
                        </td>
                        <td className="px-2 py-1.5 text-xs whitespace-nowrap">{wl.tonnage || '-'}</td>
                        <td className="px-2 py-1.5 text-xs whitespace-nowrap">{wl.machine_type || '-'}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            wl.day_night === '夜' ? 'bg-indigo-100 text-indigo-700' :
                            wl.day_night === '中直' ? 'bg-purple-100 text-purple-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>{wl.day_night || '日'}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">{wl.quantity || '-'}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">
                          {matched && rate ? `$${Number(rate).toLocaleString()}` : <span className="text-orange-500">-</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">
                          {matched ? `$${baseAmt.toLocaleString()}` : <span className="text-orange-500">-</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">
                          {otAmt > 0 ? `$${otAmt.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">
                          {midAmt > 0 ? `$${midAmt.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-xs">
                          {matched ? `$${lineAmt.toLocaleString()}` : <span className="text-orange-500">-</span>}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {matched
                            ? <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">已匹配</span>
                            : <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">未匹配</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(preview.work_logs || []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">沒有工作記錄</p>
              )}
            </div>
          )}

          {/* Daily tab */}
          {activeTab === 'daily' && (
            <DailyCalculationPreview dailyCalc={preview.daily_calculation} salaryType={preview.salary_setting?.salary_type} />
          )}

          {/* Unmatched tab */}
          {activeTab === 'unmatched' && (
            <div>
              {unmatchedGroups.length === 0 ? (
                <p className="text-sm text-green-600 text-center py-4">所有工作記錄均已匹配價目 ✓</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-orange-600 mb-3">共 {unmatchedGroups.length} 組條件未匹配價目，請新增對應的租賃價目後重新計算。</p>
                  {unmatchedGroups.map((group, idx) => {
                    const parts = [group.client_name, group.contract_no, group.day_night, group.tonnage, group.machine_type, group.origin && group.destination ? `${group.origin}→${group.destination}` : (group.origin || group.destination)].filter(Boolean);
                    return (
                      <div key={idx} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800">{parts.join(' / ') || '未知條件'}</span>
                          <span className="ml-2 text-xs text-orange-500 bg-orange-100 px-1.5 py-0.5 rounded-full">{group.count}筆</span>
                          {group.sample_note && <p className="text-xs text-gray-400 mt-0.5 truncate">{group.sample_note}</p>}
                        </div>
                        <button onClick={() => openAddRateModal(group)} className="ml-3 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 whitespace-nowrap">
                          新增價目
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Calculation detail tab */}
          {activeTab === 'calculation' && preview.calculation && (
            <div>
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
                            {item.item_type === 'mpf_deduction' && preview.employee?.mpf_plan !== 'industry' ? '' : Number(item.quantity)}
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
          {activeTab === 'calculation' && !preview.calculation && (
            <p className="text-sm text-gray-400 text-center py-4">沒有計算數據（可能是薪酬配置未設定）</p>
          )}

          {/* Generate / Prepare buttons */}
          {!generated && (
            <div className="mt-4 flex gap-3">
              <button onClick={handlePrepare} disabled={generating} className="btn-primary">
                {generating ? '準備中...' : '準備糧單（編輯工作記錄後再計算）'}
              </button>
              {preview.salary_setting && (
                <button onClick={handleGenerate} disabled={generating} className="btn-secondary">
                  {generating ? '生成中...' : '直接生成糧單（跳過編輯）'}
                </button>
              )}
              <button onClick={handlePreview} disabled={loading} className="btn-secondary">
                {loading ? '重新抓取資料中...' : '重新抓取資料'}
              </button>
            </div>
          )}
          {generateError && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{generateError}</div>}

          {/* Generated success */}
          {generated && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="font-bold text-green-800 mb-1">✓ 糧單已成功生成！</p>
              <p className="text-sm text-green-700">{generated.employee?.name_zh} — {dateFrom} 至 {dateTo}</p>
              <p className="text-lg font-bold text-primary-600 mt-1">淨額：${Number(generated.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <div className="flex gap-3 mt-3">
                <button onClick={() => router.push(`/payroll/${generated.id}`)} className="btn-primary text-sm">查看糧單詳情</button>
                <button onClick={() => { setPreview(null); setGenerated(null); setSelectedEmployeeId(null); }} className="btn-secondary text-sm">繼續出下一個員工糧單</button>
                <button onClick={() => router.push('/payroll-records')} className="btn-secondary text-sm">查看所有糧單記錄</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Fleet Rate Card Modal */}
      <Modal isOpen={showAddRateModal} onClose={() => setShowAddRateModal(false)} title="新增租賃價目" size="lg">
        <form onSubmit={handleAddRateSubmit} className="space-y-4">
          {addRateError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{addRateError}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">公司</label>
              <select className="input w-full" value={addRateForm.company_id || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, company_id: e.target.value }))}>
                <option value="">不限</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name || c.chinese_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
              <select className="input w-full" value={addRateForm.client_id || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, client_id: e.target.value }))}>
                <option value="">不限</option>
                {partners.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合約編號</label>
              <input type="text" className="input w-full" value={addRateForm.contract_no || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, contract_no: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">服務類型</label>
              <select className="input w-full" value={addRateForm.service_type || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, service_type: e.target.value }))}>
                <option value="">不限</option>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日/夜</label>
              <select className="input w-full" value={addRateForm.day_night || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, day_night: e.target.value }))}>
                <option value="">不限</option>
                <option value="日">日</option>
                <option value="夜">夜</option>
                <option value="中直">中直</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">噸數</label>
              <Combobox value={addRateForm.tonnage || ''} onChange={v => setAddRateForm((f: any) => ({ ...f, tonnage: v }))} options={tonnageOptions} placeholder="噸數" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">機種</label>
              <Combobox value={addRateForm.machine_type || ''} onChange={v => setAddRateForm((f: any) => ({ ...f, machine_type: v }))} options={vehicleTypeOptions} placeholder="機種" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">起點</label>
              <input type="text" className="input w-full" value={addRateForm.origin || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, origin: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">終點</label>
              <input type="text" className="input w-full" value={addRateForm.destination || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, destination: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">費率</label>
              <div className="flex gap-1">
                <input type="number" step="0.01" className="input flex-1" value={addRateForm.rate || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, rate: e.target.value }))} />
                <select className="input w-20" value={addRateForm.unit || '車'} onChange={e => setAddRateForm((f: any) => ({ ...f, unit: e.target.value }))}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">中直費率</label>
              <input type="number" step="0.01" className="input w-full" value={addRateForm.mid_shift_rate || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, mid_shift_rate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">OT 費率</label>
              <input type="number" step="0.01" className="input w-full" value={addRateForm.ot_rate || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, ot_rate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名稱（備註）</label>
            <input type="text" className="input w-full" value={addRateForm.name || ''} onChange={e => setAddRateForm((f: any) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAddRateModal(false)} className="btn-secondary">取消</button>
            <button type="submit" disabled={addRateSubmitting} className="btn-primary">{addRateSubmitting ? '新增中...' : '新增並重新匹配'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
