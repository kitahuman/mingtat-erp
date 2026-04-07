'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { employeesApi, companiesApi, fieldOptionsApi } from '@/lib/api';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import DocumentUpload from '@/components/DocumentUpload';
import CustomFieldsBlock from '@/components/CustomFieldsBlock';
import EmployeePhotoSection from '@/components/EmployeePhotoSection';
import Link from 'next/link';
import Modal from '@/components/Modal';

const roleLabels: Record<string, string> = {
  admin: '管理', driver: '司機', operator: '機手', worker: '雜工',
  subcontractor: '鴻輝代工', casual_operator: '散工機手',
  foreman: '管工', safety_officer: '安全督導員', director: '董事', t1: 'T1',
};
const roleOptions = [
  { value: 'admin', label: '管理' }, { value: 'driver', label: '司機' },
  { value: 'operator', label: '機手' }, { value: 'worker', label: '雜工' },
  { value: 'subcontractor', label: '鴻輝代工' }, { value: 'casual_operator', label: '散工機手' },
  { value: 'foreman', label: '管工' }, { value: 'safety_officer', label: '安全督導員' },
  { value: 'director', label: '董事' }, { value: 't1', label: 'T1' },
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

const mpfOptions = [
  { value: '', label: '請選擇' },
  { value: 'aia', label: 'AIA' },
  { value: 'manulife', label: '宏利 Manulife' },
  { value: 'bea_mpf', label: '東亞銀行MPF' },
  { value: 'industry', label: '東亞（行業計劃）' },
  { value: 'other', label: '其他' },
];

const genderOptions = [
  { value: '', label: '請選擇' },
  { value: 'M', label: '男' },
  { value: 'F', label: '女' },
];

// Static certificate field definitions (fixed schema columns)
const STATIC_CERT_FIELDS = [
  { label: '駕駛執照', noKey: 'driving_license_no', expiryKey: 'driving_license_expiry', extraKey: 'driving_license_class', extraLabel: '類別' },
  { label: '建造業安全訓練證明書（平安卡）', noKey: 'green_card_no', expiryKey: 'green_card_expiry' },
  { label: '建造業工人註冊證（工卡）', noKey: 'construction_card_no', expiryKey: 'construction_card_expiry' },
  { label: '核准工人證明書', noKey: 'approved_worker_cert_no', expiryKey: 'approved_worker_cert_expiry' },
  { label: '操作搬土機證明書', noKey: 'earth_mover_cert_no', expiryKey: 'earth_mover_cert_expiry' },
  { label: '操作挖掘機證明書', noKey: 'excavator_cert_no', expiryKey: 'excavator_cert_expiry' },
  { label: '起重機操作員證明書', noKey: 'crane_operator_cert_no', expiryKey: 'crane_operator_cert_expiry' },
  { label: '操作貨車吊機證明書', noKey: 'lorry_crane_cert_no', expiryKey: 'lorry_crane_cert_expiry' },
  { label: '操作履帶式固定吊臂起重機證明書', noKey: 'crawler_crane_cert_no', expiryKey: 'crawler_crane_cert_expiry' },
  { label: '操作輪胎式液壓伸縮吊臂起重機證明書', noKey: 'hydraulic_crane_cert_no', expiryKey: 'hydraulic_crane_cert_expiry' },
  { label: '機場禁區通行證', noKey: 'airport_pass_no', expiryKey: 'airport_pass_expiry' },
  { label: '金門證', noKey: 'gammon_pass_no', expiryKey: 'gammon_pass_expiry' },
  { label: '禮頓證', noKey: 'leighton_pass_no', expiryKey: 'leighton_pass_expiry' },
  { label: '密閉空間作業核准工人證明書', noKey: 'confined_space_cert_no', expiryKey: 'confined_space_cert_expiry' },
  { label: '操作壓實機證明書', noKey: 'compactor_cert_no', expiryKey: 'compactor_cert_expiry' },
  { label: '吊索銀咭', noKey: 'slinging_silver_card_no', expiryKey: 'slinging_silver_card_expiry' },
  { label: '工藝測試證明書', noKey: 'craft_test_cert_no', expiryKey: 'craft_test_cert_expiry' },
  { label: '壓實負荷物移動機械操作員機證明書', noKey: 'compaction_load_cert_no', expiryKey: 'compaction_load_cert_expiry' },
  { label: '升降台安全使用訓練證書', noKey: 'aerial_platform_cert_no', expiryKey: 'aerial_platform_cert_expiry' },
];

// Labels already covered by static fields (to avoid duplication in dynamic section)
const STATIC_CERT_LABELS = new Set(STATIC_CERT_FIELDS.map(f => f.label));

function isExpiringSoon(date: string | null) {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 30 && diff >= 0;
}
function isExpired(date: string | null) {
  if (!date) return false;
  return new Date(date) < new Date();
}

function calcAge(dob: string | null): string {
  if (!dob) return '-';
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age.toString();
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [emp, setEmp] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [salaryForm, setSalaryForm] = useState<any>({ effective_date: '', base_salary: 0, salary_type: 'monthly', allowance_night: 0, allowance_rent: 0, allowance_3runway: 0, ot_rate_standard: 0, notes: '' });
  const [transferForm, setTransferForm] = useState<any>({ to_company_id: '', transfer_date: '', notes: '' });
  const [terminateForm, setTerminateForm] = useState<any>({ termination_date: '', termination_reason: '' });
  const [showAllCerts, setShowAllCerts] = useState(false);
  // Dynamic certificate types from field-options
  const [certTypes, setCertTypes] = useState<Array<{ id: number; label: string }>>([]);
  // other_certificates JSON: { [label]: { cert_no: string, expiry_date: string } }
  const [otherCerts, setOtherCerts] = useState<Record<string, { cert_no: string; expiry_date: string }>>({});

  const loadData = () => {
    employeesApi.get(Number(params.id)).then(res => {
      setEmp(res.data);
      setForm(res.data);
      // Parse other_certificates JSON
      try {
        const oc = res.data.other_certificates;
        if (oc && typeof oc === 'object') setOtherCerts(oc);
        else if (typeof oc === 'string') setOtherCerts(JSON.parse(oc));
      } catch { setOtherCerts({}); }
      setLoading(false);
    }).catch(() => router.push('/employees'));
  };

  useEffect(() => {
    loadData();
    companiesApi.simple().then(res => setCompanies(res.data));
    // Load dynamic certificate types
    fieldOptionsApi.getByCategory('certificate_type').then(res => {
      setCertTypes((res.data || []).filter((o: any) => o.is_active));
    }).catch(() => {});
  }, [params.id]);

  const handleSave = async () => {
    try {
      const { company, salary_settings, transfers, created_at, updated_at, ...updateData } = form;
      // Merge otherCerts into other_certificates
      updateData.other_certificates = otherCerts;
      const res = await employeesApi.update(emp.id, updateData);
      setEmp(res.data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const handleAddSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await employeesApi.addSalary(emp.id, { ...salaryForm, base_salary: Number(salaryForm.base_salary), allowance_night: Number(salaryForm.allowance_night), allowance_rent: Number(salaryForm.allowance_rent), allowance_3runway: Number(salaryForm.allowance_3runway), ot_rate_standard: Number(salaryForm.ot_rate_standard) });
      setShowSalaryModal(false);
      setSalaryForm({ effective_date: '', base_salary: 0, salary_type: 'monthly', allowance_night: 0, allowance_rent: 0, allowance_3runway: 0, ot_rate_standard: 0, notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '新增失敗'); }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await employeesApi.transfer(emp.id, { from_company_id: emp.company_id, to_company_id: Number(transferForm.to_company_id), transfer_date: transferForm.transfer_date, notes: transferForm.notes });
      setShowTransferModal(false);
      setTransferForm({ to_company_id: '', transfer_date: '', notes: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '調動失敗'); }
  };

  const handleTerminate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await employeesApi.terminate(emp.id, { termination_date: terminateForm.termination_date, termination_reason: terminateForm.termination_reason || undefined });
      setShowTerminateModal(false);
      setTerminateForm({ termination_date: '', termination_reason: '' });
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '操作失敗'); }
  };

  const handleReinstate = async () => {
    if (!confirm('確定要將此員工復職嗎？')) return;
    try {
      await employeesApi.reinstate(emp.id);
      loadData();
    } catch (err: any) { alert(err.response?.data?.message || '操作失敗'); }
  };

  // Date status badge using DD/MM/YYYY format
  const dateStatusBadge = (date: string | null) => {
    if (!date) return <span className="text-gray-400">未設定</span>;
    const formatted = fmtDate(date);
    if (isExpired(date)) return <span className="badge-red">{formatted} (已過期)</span>;
    if (isExpiringSoon(date)) return <span className="badge-yellow">{formatted} (即將到期)</span>;
    return <span className="badge-green">{formatted}</span>;
  };

  const getMpfLabel = (v: string | null) => {
    const opt = mpfOptions.find(o => o.value === v);
    return opt?.label || v || '未設定';
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const isTerminated = emp?.status === 'inactive';

  // Static certs: in view mode, only show those with data (unless showAllCerts)
  const visibleStaticCerts = showAllCerts
    ? STATIC_CERT_FIELDS
    : STATIC_CERT_FIELDS.filter(c => emp?.[c.noKey] || emp?.[c.expiryKey]);

  // Dynamic certs: types from field-options that are NOT already covered by static fields
  const dynamicCertTypes = certTypes.filter(ct => !STATIC_CERT_LABELS.has(ct.label));
  // In view mode, only show dynamic certs that have data (unless showAllCerts)
  const visibleDynamicCerts = showAllCerts
    ? dynamicCertTypes
    : dynamicCertTypes.filter(ct => otherCerts[ct.label]?.cert_no || otherCerts[ct.label]?.expiry_date);

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/employees" className="hover:text-primary-600">員工管理</Link><span>/</span><span className="text-gray-900">{emp?.name_zh}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{emp?.name_zh}</h1>
            {emp?.nickname && <span className="text-gray-500 text-lg">({emp.nickname})</span>}
            {isTerminated && <span className="badge-red">已離職</span>}
          </div>
          <p className="text-gray-500">{emp?.name_en} | {emp?.emp_code} | {emp?.company?.internal_prefix || emp?.company?.name}</p>
        </div>
        <div className="flex gap-2">
          {isTerminated ? (
            <button onClick={handleReinstate} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">復職</button>
          ) : (
            <button onClick={() => setShowTerminateModal(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">離職</button>
          )}
          <button onClick={() => setShowTransferModal(true)} className="btn-secondary">調動公司</button>
          <button onClick={() => setShowSalaryModal(true)} className="btn-secondary">新增薪資</button>
          {editing ? (
            <><button onClick={() => { setForm(emp); setOtherCerts(emp?.other_certificates || {}); setEditing(false); }} className="btn-secondary">取消</button><button onClick={handleSave} className="btn-primary">儲存</button></>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Termination Info Banner */}
      {isTerminated && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
          <div>
            <p className="font-medium text-red-800">此員工已離職</p>
            <div className="text-sm text-red-700 mt-1">
              <span>離職日期：{fmtDate(emp?.termination_date) || '未記錄'}</span>
              {emp?.termination_reason && <span className="ml-4">原因：{emp.termination_reason}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Basic Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">基本資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">中文姓名</label><input value={form.name_zh || ''} onChange={e => setForm({...form, name_zh: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">英文姓名</label><input value={form.name_en || ''} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">別名</label><input value={form.nickname || ''} onChange={e => setForm({...form, nickname: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">員工編號</label><input value={form.emp_code || ''} onChange={e => setForm({...form, emp_code: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">職位</label><select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="input-field">{roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field"><option value="active">在職</option><option value="inactive">離職</option></select></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">身份證號碼</label><input value={form.id_number || ''} onChange={e => setForm({...form, id_number: e.target.value})} className="input-field" placeholder="例：R838479(6)" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">出生日期</label><input type="date" value={toInputDate(form.date_of_birth)} onChange={e => setForm({...form, date_of_birth: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">性別</label><select value={form.gender || ''} onChange={e => setForm({...form, gender: e.target.value})} className="input-field">{genderOptions.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">電話</label><input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">緊急聯絡人</label><input value={form.emergency_contact || ''} onChange={e => setForm({...form, emergency_contact: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">入職日期</label><input type="date" value={toInputDate(form.join_date)} onChange={e => setForm({...form, join_date: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">離職日期</label><input type="date" value={toInputDate(form.termination_date)} onChange={e => setForm({...form, termination_date: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">離職原因</label><input value={form.termination_reason || ''} onChange={e => setForm({...form, termination_reason: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">常用車牌</label><input value={form.frequent_vehicle || ''} onChange={e => setForm({...form, frequent_vehicle: e.target.value})} className="input-field" /></div>
              <div className="md:col-span-2 lg:col-span-3"><label className="block text-sm font-medium text-gray-500 mb-1">地址</label><input value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} className="input-field" /></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">員工編號</p><p className="font-mono font-bold">{emp?.emp_code || '-'}</p></div>
              <div><p className="text-sm text-gray-500">職位</p><p><span className={roleBadgeClass(emp?.role)}>{roleLabels[emp?.role] || emp?.role}</span></p></div>
              <div><p className="text-sm text-gray-500">狀態</p><p><span className={emp?.status === 'active' ? 'badge-green' : 'badge-red'}>{emp?.status === 'active' ? '在職' : '離職'}</span></p></div>
              <div><p className="text-sm text-gray-500">所屬公司</p><p className="font-medium">{emp?.company?.internal_prefix} - {emp?.company?.name}</p></div>
              {emp?.nickname && <div><p className="text-sm text-gray-500">別名</p><p>{emp.nickname}</p></div>}
              <div><p className="text-sm text-gray-500">身份證號碼</p><p>{emp?.id_number || '-'}</p></div>
              <div><p className="text-sm text-gray-500">出生日期</p><p>{fmtDate(emp?.date_of_birth)}{emp?.date_of_birth && <span className="text-gray-400 ml-2">({calcAge(emp.date_of_birth)} 歲)</span>}</p></div>
              <div><p className="text-sm text-gray-500">性別</p><p>{emp?.gender === 'M' ? '男' : emp?.gender === 'F' ? '女' : '-'}</p></div>
              <div><p className="text-sm text-gray-500">電話</p><p>{emp?.phone || '-'}</p></div>
              <div><p className="text-sm text-gray-500">緊急聯絡人</p><p>{emp?.emergency_contact || '-'}</p></div>
              <div><p className="text-sm text-gray-500">入職日期</p><p>{fmtDate(emp?.join_date)}</p></div>
              {isTerminated && <div><p className="text-sm text-gray-500">離職日期</p><p className="text-red-600">{fmtDate(emp?.termination_date)}</p></div>}
              {isTerminated && emp?.termination_reason && <div><p className="text-sm text-gray-500">離職原因</p><p className="text-red-600">{emp.termination_reason}</p></div>}
              <div><p className="text-sm text-gray-500">常用車牌</p><p>{emp?.frequent_vehicle || '-'}</p></div>
              <div className="md:col-span-2 lg:col-span-3"><p className="text-sm text-gray-500">地址</p><p>{emp?.address || '-'}</p></div>
            </>
          )}
        </div>
      </div>

      {/* Bank & MPF Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">銀行及強積金資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">銀行名稱</label><input value={form.bank_name || ''} onChange={e => setForm({...form, bank_name: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">銀行戶口號碼</label><input value={form.bank_account || ''} onChange={e => setForm({...form, bank_account: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">強積金計劃</label><select value={form.mpf_plan || ''} onChange={e => setForm({...form, mpf_plan: e.target.value})} className="input-field">{mpfOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">強積金戶口號碼</label><input value={form.mpf_account_number || ''} onChange={e => setForm({...form, mpf_account_number: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">受僱日期(MPF)</label><input type="date" value={toInputDate(form.mpf_employment_date)} onChange={e => setForm({...form, mpf_employment_date: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">舊受僱日期</label><input type="date" value={toInputDate(form.mpf_old_employment_date)} onChange={e => setForm({...form, mpf_old_employment_date: e.target.value})} className="input-field" /></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">銀行名稱</p><p>{emp?.bank_name || '-'}</p></div>
              <div><p className="text-sm text-gray-500">銀行戶口號碼</p><p>{emp?.bank_account || '-'}</p></div>
              <div><p className="text-sm text-gray-500">強積金計劃</p><p>{getMpfLabel(emp?.mpf_plan)}</p></div>
              <div><p className="text-sm text-gray-500">強積金戶口號碼</p><p>{emp?.mpf_account_number || '-'}</p></div>
              <div><p className="text-sm text-gray-500">受僱日期(MPF)</p><p>{fmtDate(emp?.mpf_employment_date)}</p></div>
              <div><p className="text-sm text-gray-500">舊受僱日期</p><p>{fmtDate(emp?.mpf_old_employment_date)}</p></div>
            </>
          )}
        </div>
      </div>

      {/* Salary Notes */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">薪資備註</h2>
        {editing ? (
          <div><textarea value={form.salary_notes || ''} onChange={e => setForm({...form, salary_notes: e.target.value})} className="input-field" rows={3} placeholder="例：日薪$800, 津貼$100, 3跑津貼$200" /></div>
        ) : (
          <p className="text-gray-700 whitespace-pre-wrap">{emp?.salary_notes || '未設定'}</p>
        )}
      </div>

      {/* Certificates & Licences */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">證書及牌照</h2>
          {!editing && (
            <button onClick={() => setShowAllCerts(!showAllCerts)} className="text-sm text-primary-600 hover:underline">
              {showAllCerts ? '只顯示已填寫' : '顯示全部欄位'}
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-6">
            {/* Static certificate fields */}
            {STATIC_CERT_FIELDS.map(cert => (
              <div key={cert.noKey} className="border-b border-gray-100 pb-4 last:border-0">
                <p className="text-sm font-medium text-gray-700 mb-2">{cert.label}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label className="block text-xs text-gray-500 mb-1">號碼</label><input value={form[cert.noKey] || ''} onChange={e => setForm({...form, [cert.noKey]: e.target.value})} className="input-field" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">到期日</label><input type="date" value={toInputDate(form[cert.expiryKey])} onChange={e => setForm({...form, [cert.expiryKey]: e.target.value})} className="input-field" /></div>
                  {cert.extraKey && <div><label className="block text-xs text-gray-500 mb-1">{cert.extraLabel}</label><input value={form[cert.extraKey] || ''} onChange={e => setForm({...form, [cert.extraKey]: e.target.value})} className="input-field" /></div>}
                </div>
              </div>
            ))}
            {/* Dynamic certificate fields from field-options */}
            {dynamicCertTypes.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">自定義證書類型</p>
                {dynamicCertTypes.map(ct => (
                  <div key={ct.id} className="border-b border-gray-100 pb-4 mb-4 last:border-0">
                    <p className="text-sm font-medium text-gray-700 mb-2">{ct.label}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">號碼</label>
                        <input
                          value={otherCerts[ct.label]?.cert_no || ''}
                          onChange={e => setOtherCerts(prev => ({ ...prev, [ct.label]: { ...prev[ct.label], cert_no: e.target.value, expiry_date: prev[ct.label]?.expiry_date || '' } }))}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">到期日</label>
                        <input
                          type="date"
                          value={otherCerts[ct.label]?.expiry_date || ''}
                          onChange={e => setOtherCerts(prev => ({ ...prev, [ct.label]: { ...prev[ct.label], expiry_date: e.target.value, cert_no: prev[ct.label]?.cert_no || '' } }))}
                          className="input-field"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {(visibleStaticCerts.length > 0 || visibleDynamicCerts.length > 0) ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">證書/牌照</th><th className="px-3 py-2 text-left">號碼</th><th className="px-3 py-2 text-left">到期日</th></tr></thead>
                  <tbody>
                    {visibleStaticCerts.map(cert => (
                      <tr key={cert.noKey} className="border-b">
                        <td className="px-3 py-2 font-medium text-gray-700">{cert.label}</td>
                        <td className="px-3 py-2">
                          {emp?.[cert.noKey] || '-'}
                          {cert.extraKey && emp?.[cert.extraKey] && <span className="text-gray-400 ml-1">({emp[cert.extraKey]})</span>}
                        </td>
                        <td className="px-3 py-2">{dateStatusBadge(emp?.[cert.expiryKey])}</td>
                      </tr>
                    ))}
                    {visibleDynamicCerts.map(ct => (
                      <tr key={`dyn-${ct.id}`} className="border-b bg-blue-50/30">
                        <td className="px-3 py-2 font-medium text-gray-700">{ct.label}</td>
                        <td className="px-3 py-2">{otherCerts[ct.label]?.cert_no || '-'}</td>
                        <td className="px-3 py-2">{dateStatusBadge(otherCerts[ct.label]?.expiry_date || null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">暫無證書資料</p>
            )}
          </>
        )}
      </div>

      {/* Salary History */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">薪資紀錄</h2>
          <button onClick={() => setShowSalaryModal(true)} className="text-sm text-primary-600 hover:underline">新增薪資設定</button>
        </div>
        {emp?.salary_settings?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">生效日期</th><th className="px-3 py-2 text-left">類型</th><th className="px-3 py-2 text-right">底薪</th><th className="px-3 py-2 text-right">夜班津貼</th><th className="px-3 py-2 text-right">租屋津貼</th><th className="px-3 py-2 text-right">三跑津貼</th><th className="px-3 py-2 text-right">OT時薪</th><th className="px-3 py-2 text-left">備註</th></tr></thead>
              <tbody>
                {emp.salary_settings.map((s: any, i: number) => (
                  <tr key={s.id} className={`border-b ${i === 0 ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2 font-medium">{fmtDate(s.effective_date)}{i === 0 && <span className="ml-2 badge-blue">目前</span>}</td>
                    <td className="px-3 py-2">{s.salary_type === 'monthly' ? '月薪' : '日薪'}</td>
                    <td className="px-3 py-2 text-right font-mono">${Number(s.base_salary).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono">${Number(s.allowance_night).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono">${Number(s.allowance_rent).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono">${Number(s.allowance_3runway).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono">${Number(s.ot_rate_standard).toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-500">{s.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-gray-500 text-sm">暫無薪資紀錄</p>}
      </div>

      {/* Custom Fields */}
      <div className="card mb-6">
        <CustomFieldsBlock module="employee" entityId={emp?.id} />
      </div>

      {/* Standard Photo (標準照) */}
      <EmployeePhotoSection employeeId={emp?.id} />

      {/* Documents */}
      <div className="card mb-6">
        <DocumentUpload entityType="employee" entityId={emp?.id} docTypes={['身份證', '建造業工人註冊證', '平安卡', '駕駛執照', '技術證書', '合約', '其他']} />
      </div>

      {/* Transfer History */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-900 mb-4">調動紀錄</h2>
        {emp?.transfers?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-left">原公司</th><th className="px-3 py-2 text-center">→</th><th className="px-3 py-2 text-left">新公司</th><th className="px-3 py-2 text-left">備註</th></tr></thead>
              <tbody>
                {emp.transfers.map((t: any) => (
                  <tr key={t.id} className="border-b">
                    <td className="px-3 py-2 font-medium">{fmtDate(t.transfer_date)}</td>
                    <td className="px-3 py-2">{t.from_company?.internal_prefix || t.from_company?.name}</td>
                    <td className="px-3 py-2 text-center text-gray-400">→</td>
                    <td className="px-3 py-2">{t.to_company?.internal_prefix || t.to_company?.name}</td>
                    <td className="px-3 py-2 text-gray-500">{t.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-gray-500 text-sm">暫無調動紀錄</p>}
      </div>

      {/* Salary Modal */}
      <Modal isOpen={showSalaryModal} onClose={() => setShowSalaryModal(false)} title="新增薪資設定" size="lg">
        <form onSubmit={handleAddSalary} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">生效日期 *</label><input type="date" value={salaryForm.effective_date} onChange={e => setSalaryForm({...salaryForm, effective_date: e.target.value})} className="input-field" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">薪資類型</label><select value={salaryForm.salary_type} onChange={e => setSalaryForm({...salaryForm, salary_type: e.target.value})} className="input-field"><option value="monthly">月薪</option><option value="daily">日薪</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">底薪</label><input type="number" value={salaryForm.base_salary} onChange={e => setSalaryForm({...salaryForm, base_salary: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">夜班津貼</label><input type="number" value={salaryForm.allowance_night} onChange={e => setSalaryForm({...salaryForm, allowance_night: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">租屋津貼</label><input type="number" value={salaryForm.allowance_rent} onChange={e => setSalaryForm({...salaryForm, allowance_rent: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">三跑津貼</label><input type="number" value={salaryForm.allowance_3runway} onChange={e => setSalaryForm({...salaryForm, allowance_3runway: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">OT時薪</label><input type="number" value={salaryForm.ot_rate_standard} onChange={e => setSalaryForm({...salaryForm, ot_rate_standard: e.target.value})} className="input-field" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={salaryForm.notes} onChange={e => setSalaryForm({...salaryForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowSalaryModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">新增</button></div>
        </form>
      </Modal>

      {/* Transfer Modal */}
      <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title="員工調動">
        <form onSubmit={handleTransfer} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">目前公司</label><input value={emp?.company?.internal_prefix ? `${emp.company.internal_prefix} - ${emp.company.name}` : emp?.company?.name} className="input-field bg-gray-50" disabled /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">調動至 *</label>
            <select value={transferForm.to_company_id} onChange={e => setTransferForm({...transferForm, to_company_id: e.target.value})} className="input-field" required>
              <option value="">請選擇</option>
              {companies.filter(c => c.id !== emp?.company_id).map(c => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">調動日期 *</label><input type="date" value={transferForm.transfer_date} onChange={e => setTransferForm({...transferForm, transfer_date: e.target.value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={transferForm.notes} onChange={e => setTransferForm({...transferForm, notes: e.target.value})} className="input-field" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setShowTransferModal(false)} className="btn-secondary">取消</button><button type="submit" className="btn-primary">確認調動</button></div>
        </form>
      </Modal>

      {/* Terminate Modal */}
      <Modal isOpen={showTerminateModal} onClose={() => setShowTerminateModal(false)} title="員工離職">
        <form onSubmit={handleTerminate} className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            確定要將 <strong>{emp?.name_zh}</strong> 設為離職嗎？離職後員工將移至「已離職」分頁。
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">離職日期 *</label><input type="date" value={terminateForm.termination_date} onChange={e => setTerminateForm({...terminateForm, termination_date: e.target.value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">離職原因</label><textarea value={terminateForm.termination_reason} onChange={e => setTerminateForm({...terminateForm, termination_reason: e.target.value})} className="input-field" rows={3} placeholder="請輸入離職原因（選填）" /></div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowTerminateModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">確認離職</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
