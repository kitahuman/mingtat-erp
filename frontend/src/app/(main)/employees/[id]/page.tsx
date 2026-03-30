'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { employeesApi, companiesApi } from '@/lib/api';
import Link from 'next/link';
import Modal from '@/components/Modal';

const roleLabels: Record<string, string> = { admin: '管理', driver: '司機', operator: '機手', worker: '雜工' };
const roleOptions = [{ value: 'driver', label: '司機' }, { value: 'operator', label: '機手' }, { value: 'worker', label: '雜工' }, { value: 'admin', label: '管理' }];

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
  const [salaryForm, setSalaryForm] = useState<any>({ effective_date: '', base_salary: 0, salary_type: 'monthly', allowance_night: 0, allowance_rent: 0, allowance_3runway: 0, ot_rate_standard: 0, notes: '' });
  const [transferForm, setTransferForm] = useState<any>({ to_company_id: '', transfer_date: '', notes: '' });

  const loadData = () => {
    employeesApi.get(Number(params.id)).then(res => { setEmp(res.data); setForm(res.data); setLoading(false); }).catch(() => router.push('/employees'));
  };

  useEffect(() => { loadData(); companiesApi.simple().then(res => setCompanies(res.data)); }, [params.id]);

  const handleSave = async () => {
    try {
      const { company, salary_settings, transfers, created_at, updated_at, ...updateData } = form;
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

  const dateStatusBadge = (date: string | null) => {
    if (!date) return <span className="text-gray-400">未設定</span>;
    if (isExpired(date)) return <span className="badge-red">{date} (已過期)</span>;
    if (isExpiringSoon(date)) return <span className="badge-yellow">{date} (即將到期)</span>;
    return <span className="badge-green">{date}</span>;
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/employees" className="hover:text-primary-600">員工管理</Link><span>/</span><span className="text-gray-900">{emp?.name_zh}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{emp?.name_zh}</h1>
          <p className="text-gray-500">{emp?.name_en} | {emp?.emp_code} | {emp?.company?.internal_prefix || emp?.company?.name}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTransferModal(true)} className="btn-secondary">調動公司</button>
          <button onClick={() => setShowSalaryModal(true)} className="btn-secondary">新增薪資</button>
          {editing ? (
            <><button onClick={() => { setForm(emp); setEditing(false); }} className="btn-secondary">取消</button><button onClick={handleSave} className="btn-primary">儲存</button></>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Basic Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">基本資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">中文姓名</label><input value={form.name_zh || ''} onChange={e => setForm({...form, name_zh: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">英文姓名</label><input value={form.name_en || ''} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">員工編號</label><input value={form.emp_code || ''} onChange={e => setForm({...form, emp_code: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">職位</label><select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="input-field">{roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">電話</label><input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">緊急聯絡人</label><input value={form.emergency_contact || ''} onChange={e => setForm({...form, emergency_contact: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">入職日期</label><input type="date" value={form.join_date || ''} onChange={e => setForm({...form, join_date: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">銀行帳號</label><input value={form.bank_account || ''} onChange={e => setForm({...form, bank_account: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field"><option value="active">在職</option><option value="inactive">離職</option></select></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">員工編號</p><p className="font-mono font-bold">{emp?.emp_code || '-'}</p></div>
              <div><p className="text-sm text-gray-500">職位</p><p><span className={emp?.role === 'admin' ? 'badge-blue' : emp?.role === 'driver' ? 'badge-green' : emp?.role === 'operator' ? 'badge-yellow' : 'badge-gray'}>{roleLabels[emp?.role] || emp?.role}</span></p></div>
              <div><p className="text-sm text-gray-500">狀態</p><p><span className={emp?.status === 'active' ? 'badge-green' : 'badge-red'}>{emp?.status === 'active' ? '在職' : '離職'}</span></p></div>
              <div><p className="text-sm text-gray-500">所屬公司</p><p className="font-medium">{emp?.company?.internal_prefix} - {emp?.company?.name}</p></div>
              <div><p className="text-sm text-gray-500">電話</p><p>{emp?.phone || '-'}</p></div>
              <div><p className="text-sm text-gray-500">緊急聯絡人</p><p>{emp?.emergency_contact || '-'}</p></div>
              <div><p className="text-sm text-gray-500">入職日期</p><p>{emp?.join_date || '-'}</p></div>
              <div><p className="text-sm text-gray-500">銀行帳號</p><p>{emp?.bank_account || '-'}</p></div>
            </>
          )}
        </div>
      </div>

      {/* Licenses */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">證照資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">平安卡號碼</label><input value={form.green_card_no || ''} onChange={e => setForm({...form, green_card_no: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">平安卡到期日</label><input type="date" value={form.green_card_expiry || ''} onChange={e => setForm({...form, green_card_expiry: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">工卡號碼</label><input value={form.construction_card_no || ''} onChange={e => setForm({...form, construction_card_no: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">工卡到期日</label><input type="date" value={form.construction_card_expiry || ''} onChange={e => setForm({...form, construction_card_expiry: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">駕駛執照號碼</label><input value={form.driving_license_no || ''} onChange={e => setForm({...form, driving_license_no: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">駕駛執照到期日</label><input type="date" value={form.driving_license_expiry || ''} onChange={e => setForm({...form, driving_license_expiry: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">駕駛執照類別</label><input value={form.driving_license_class || ''} onChange={e => setForm({...form, driving_license_class: e.target.value})} className="input-field" /></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">平安卡</p><p>{emp?.green_card_no || '-'}</p><p className="mt-1">{dateStatusBadge(emp?.green_card_expiry)}</p></div>
              <div><p className="text-sm text-gray-500">工卡</p><p>{emp?.construction_card_no || '-'}</p><p className="mt-1">{dateStatusBadge(emp?.construction_card_expiry)}</p></div>
              <div><p className="text-sm text-gray-500">駕駛執照</p><p>{emp?.driving_license_no || '-'} {emp?.driving_license_class ? `(${emp.driving_license_class})` : ''}</p><p className="mt-1">{dateStatusBadge(emp?.driving_license_expiry)}</p></div>
            </>
          )}
        </div>
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
                    <td className="px-3 py-2 font-medium">{s.effective_date}{i === 0 && <span className="ml-2 badge-blue">目前</span>}</td>
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
                    <td className="px-3 py-2 font-medium">{t.transfer_date}</td>
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
    </div>
  );
}
