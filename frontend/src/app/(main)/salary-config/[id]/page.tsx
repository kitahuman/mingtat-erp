'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { salaryConfigApi, employeesApi } from '@/lib/api';
import Link from 'next/link';

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
];

export default function SalaryConfigDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [record, setRecord] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    salaryConfigApi.get(Number(params.id)).then(res => {
      setRecord(res.data);
      setForm(res.data);
      // Load history for same employee
      if (res.data.employee_id) {
        salaryConfigApi.getByEmployee(res.data.employee_id).then(hres => {
          setHistory(hres.data || []);
        });
      }
      setLoading(false);
    }).catch(() => router.push('/salary-config'));
  };

  useEffect(() => { loadData(); }, [params.id]);

  const handleSave = async () => {
    try {
      const { employee, created_at, ...updateData } = form;
      const res = await salaryConfigApi.update(record.id, updateData);
      setRecord(res.data);
      setForm(res.data);
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const addCustomAllowance = () => {
    setForm({ ...form, custom_allowances: [...(form.custom_allowances || []), { name: '', amount: 0 }] });
  };
  const removeCustomAllowance = (idx: number) => {
    setForm({ ...form, custom_allowances: form.custom_allowances.filter((_: any, i: number) => i !== idx) });
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const emp = record?.employee;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/salary-config" className="hover:text-primary-600">員工薪酬</Link><span>/</span>
        <span className="text-gray-900">{emp?.emp_code} - {emp?.name_zh || emp?.name_en}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{emp?.name_zh || emp?.name_en}</h1>
          <p className="text-gray-500">{emp?.emp_code} | {SALARY_TYPE_LABELS[record?.salary_type]} | 生效日期: {record?.effective_date}</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => { setForm(record); setEditing(false); }} className="btn-secondary">取消</button>
              <button onClick={handleSave} className="btn-primary">儲存</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Basic Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">基本薪酬</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div><label className="block text-sm font-medium text-gray-500 mb-1">生效日期</label><input type="date" value={form.effective_date} onChange={e => setForm({...form, effective_date: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">薪酬類型</label>
              <select value={form.salary_type} onChange={e => setForm({...form, salary_type: e.target.value})} className="input-field">
                <option value="daily">日薪制</option><option value="monthly">月薪制</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">底薪金額</label><input type="number" value={form.base_salary} onChange={e => setForm({...form, base_salary: e.target.value})} className="input-field" /></div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_piece_rate} onChange={e => setForm({...form, is_piece_rate: e.target.checked})} className="rounded border-gray-300" />
                <span className="text-sm text-gray-700">按件計酬</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-primary-50 rounded-lg p-4">
              <p className="text-xs text-primary-600 mb-1">底薪</p>
              <p className="text-2xl font-bold font-mono">${Number(record?.base_salary).toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{SALARY_TYPE_LABELS[record?.salary_type]}</p>
            </div>
            <div><p className="text-sm text-gray-500">生效日期</p><p className="font-medium">{record?.effective_date}</p></div>
            <div><p className="text-sm text-gray-500">按件計酬</p><p>{record?.is_piece_rate ? <span className="badge-blue">是</span> : '否'}</p></div>
            {record?.change_type && (
              <div><p className="text-sm text-gray-500">最近變更</p><p>{record.change_type} {record.change_amount > 0 ? `+$${Number(record.change_amount).toLocaleString()}` : ''}</p></div>
            )}
          </div>
        )}
      </div>

      {/* Allowances */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">津貼配置</h2>
        {editing ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {ALLOWANCE_FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                <input type="number" value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})} className="input-field text-sm" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {ALLOWANCE_FIELDS.map(f => (
              <div key={f.key} className={`rounded-lg p-3 ${Number(record?.[f.key]) > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
                <p className="text-xs text-gray-500 mb-1">{f.label}</p>
                <p className={`font-mono font-bold ${Number(record?.[f.key]) > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                  ${Number(record?.[f.key] || 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OT Rates */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">OT 津貼</h2>
        {editing ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {OT_FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                <input type="number" value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})} className="input-field text-sm" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {OT_FIELDS.map(f => (
              <div key={f.key} className={`rounded-lg p-3 ${Number(record?.[f.key]) > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
                <p className="text-xs text-gray-500 mb-1">{f.label}</p>
                <p className={`font-mono font-bold ${Number(record?.[f.key]) > 0 ? 'text-orange-700' : 'text-gray-300'}`}>
                  ${Number(record?.[f.key] || 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Allowances */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">自定義津貼</h2>
          {editing && <button type="button" onClick={addCustomAllowance} className="text-sm text-primary-600 hover:underline">+ 新增</button>}
        </div>
        {editing ? (
          (form.custom_allowances || []).length > 0 ? (
            form.custom_allowances.map((ca: any, idx: number) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input value={ca.name} onChange={e => { const cas = [...form.custom_allowances]; cas[idx] = {...cas[idx], name: e.target.value}; setForm({...form, custom_allowances: cas}); }} className="input-field flex-1 text-sm" placeholder="津貼名稱" />
                <input type="number" value={ca.amount} onChange={e => { const cas = [...form.custom_allowances]; cas[idx] = {...cas[idx], amount: Number(e.target.value)}; setForm({...form, custom_allowances: cas}); }} className="input-field w-32 text-sm" placeholder="金額" />
                <button type="button" onClick={() => removeCustomAllowance(idx)} className="text-red-500 hover:text-red-700">×</button>
              </div>
            ))
          ) : <p className="text-gray-400 text-sm">暫無自定義津貼</p>
        ) : (
          (record?.custom_allowances || []).length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {record.custom_allowances.map((ca: any, idx: number) => (
                <div key={idx} className="bg-purple-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{ca.name}</p>
                  <p className="font-mono font-bold text-purple-700">${Number(ca.amount).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-gray-400 text-sm">暫無自定義津貼</p>
        )}
      </div>

      {/* Salary History */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-900 mb-4">薪酬變更歷史</h2>
        {history.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left">生效日期</th>
                <th className="px-3 py-2 text-left">薪酬類型</th>
                <th className="px-3 py-2 text-right">底薪</th>
                <th className="px-3 py-2 text-left">變更類型</th>
                <th className="px-3 py-2 text-right">變更金額</th>
                <th className="px-3 py-2 text-left">備註</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h: any) => (
                <tr key={h.id} className={`border-b ${h.id === record?.id ? 'bg-primary-50' : ''}`}>
                  <td className="px-3 py-2">{h.effective_date}</td>
                  <td className="px-3 py-2">{SALARY_TYPE_LABELS[h.salary_type] || h.salary_type}</td>
                  <td className="px-3 py-2 text-right font-mono">${Number(h.base_salary).toLocaleString()}</td>
                  <td className="px-3 py-2">{h.change_type || '初始設定'}</td>
                  <td className="px-3 py-2 text-right font-mono">{h.change_amount > 0 ? `+$${Number(h.change_amount).toLocaleString()}` : '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{h.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-sm">暫無歷史記錄</p>
        )}
      </div>

      {editing && (
        <div className="card mt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">變更記錄</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-xs text-gray-500 mb-1">變更類型</label>
              <select value={form.change_type || ''} onChange={e => setForm({...form, change_type: e.target.value})} className="input-field text-sm">
                <option value="">初始設定</option><option value="加薪">加薪</option><option value="減薪">減薪</option><option value="調整">調整</option>
              </select>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">變更金額</label><input type="number" value={form.change_amount || 0} onChange={e => setForm({...form, change_amount: e.target.value})} className="input-field text-sm" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">備註</label><input value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className="input-field text-sm" /></div>
          </div>
        </div>
      )}
    </div>
  );
}
