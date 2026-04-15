'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { paymentOutApi, projectsApi, expensesApi } from '@/lib/api';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';

const fmt$ = (v: any) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{children || <span className="text-gray-400">—</span>}</dd>
    </div>
  );
}

export default function PaymentOutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const recordId = Number(id);

  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  // Reference data
  const [projects, setProjects] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  const loadRecord = useCallback(() => {
    setLoading(true);
    paymentOutApi
      .get(recordId)
      .then((r) => {
        setRecord(r.data);
        setForm(toForm(r.data));
      })
      .catch(() => setError('無法載入付款記錄'))
      .finally(() => setLoading(false));
  }, [recordId]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  useEffect(() => {
    projectsApi.list({ limit: 500 }).then((r) => setProjects(r.data?.data || [])).catch(() => {});
    expensesApi.list({ limit: 500 }).then((r) => setExpenses(r.data?.data || [])).catch(() => {});
  }, []);

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: `${p.project_no} ${p.project_name}` })),
    [projects],
  );

  const expenseOptions = useMemo(
    () =>
      expenses.map((e) => ({
        value: e.id,
        label: `#${e.id} ${e.item || e.supplier_name || '未命名'} ${fmt$(e.total_amount)}`,
      })),
    [expenses],
  );

  function toForm(r: any) {
    return {
      date: r.date ? r.date.slice(0, 10) : '',
      amount: r.amount != null ? Number(r.amount) : '',
      expense_id: r.expense_id || '',
      project_id: r.project_id || '',
      bank_account: r.bank_account || '',
      reference_no: r.reference_no || '',
      remarks: r.remarks || '',
    };
  }

  const handleSave = async () => {
    if (!form.date || !form.amount) return alert('請填寫日期和金額');
    setSaving(true);
    try {
      const payload: any = {
        date: form.date,
        amount: parseFloat(form.amount),
        expense_id: form.expense_id ? Number(form.expense_id) : null,
        project_id: form.project_id ? Number(form.project_id) : null,
        bank_account: form.bank_account || null,
        reference_no: form.reference_no || null,
        remarks: form.remarks || null,
      };
      await paymentOutApi.update(recordId, payload);
      setEditMode(false);
      loadRecord();
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定刪除此付款記錄？此操作無法復原。')) return;
    try {
      await paymentOutApi.delete(recordId);
      router.push('/payment-out');
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error || '找不到付款記錄'}</p>
        <button onClick={() => router.push('/payment-out')} className="btn-secondary">
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/payment-out')}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">付款記錄 #{record.id}</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              建立於 {fmtDate(record.created_at)} · 更新於 {fmtDate(record.updated_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button
                onClick={() => {
                  setEditMode(false);
                  setForm(toForm(record));
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? '儲存中...' : '儲存'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditMode(true)} className="btn-primary">
                編輯
              </button>
              <button onClick={handleDelete} className="btn-secondary text-red-600 hover:text-red-700">
                刪除
              </button>
            </>
          )}
        </div>
      </div>

      {/* Basic Info Card */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">基本資訊</h2>
        {editMode ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">金額 *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="input-field"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">關聯支出</label>
                <SearchableSelect
                  value={form.expense_id ? Number(form.expense_id) : null}
                  onChange={(v: any) => setForm({ ...form, expense_id: v || '' })}
                  options={expenseOptions}
                  placeholder="選擇支出"
                  clearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">項目</label>
                <SearchableSelect
                  value={form.project_id ? Number(form.project_id) : null}
                  onChange={(v: any) => setForm({ ...form, project_id: v || '' })}
                  options={projectOptions}
                  placeholder="選擇項目"
                  clearable
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Field label="日期">{fmtDate(record.date)}</Field>
            <Field label="金額">
              <span className="text-lg font-semibold text-gray-900 font-mono">{fmt$(record.amount)}</span>
            </Field>
            <Field label="關聯支出">
              {record.expense ? (
                <Link href={`/expenses/${record.expense.id}`} className="text-primary-600 hover:underline">
                  #{record.expense.id} {record.expense.item || record.expense.supplier_name || '未命名'}
                </Link>
              ) : null}
            </Field>
            <Field label="項目">
              {record.project ? (
                <Link href={`/projects/${record.project.id}`} className="text-primary-600 hover:underline">
                  {record.project.project_no} {record.project.project_name}
                </Link>
              ) : null}
            </Field>
            <Field label="支出類別">
              {record.expense?.category?.name || null}
            </Field>
            <Field label="支出金額">
              {record.expense ? fmt$(record.expense.total_amount) : null}
            </Field>
          </div>
        )}
      </div>

      {/* Cheque / Transaction Info Card */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">支票 / 交易紀錄</h2>
        {editMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">銀行帳戶</label>
              <input
                type="text"
                value={form.bank_account}
                onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                className="input-field"
                placeholder="選填"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">支票 / 交易號碼</label>
              <input
                type="text"
                value={form.reference_no}
                onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
                className="input-field"
                placeholder="選填"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="銀行帳戶">{record.bank_account}</Field>
            <Field label="支票 / 交易號碼">
              {record.reference_no ? (
                <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">{record.reference_no}</span>
              ) : null}
            </Field>
          </div>
        )}
      </div>

      {/* Remarks Card */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">備註</h2>
        {editMode ? (
          <textarea
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            className="input-field min-h-[100px]"
            placeholder="輸入備註..."
          />
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {record.remarks || <span className="text-gray-400">無備註</span>}
          </p>
        )}
      </div>

      {/* Linked Bank Transactions (月結單配對) */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">連結月結單</h2>
        {record.matched_bank_transactions && record.matched_bank_transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">日期</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">銀行帳戶</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">描述</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">金額</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">交易號碼</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">狀態</th>
                </tr>
              </thead>
              <tbody>
                {record.matched_bank_transactions.map((tx: any) => (
                  <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3">{fmtDate(tx.date)}</td>
                    <td className="py-2 px-3">
                      {tx.bank_account ? (
                        <span className="text-xs">
                          {tx.bank_account.bank_name} - {tx.bank_account.account_no}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 max-w-xs truncate">{tx.description || '—'}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmt$(Math.abs(Number(tx.amount)))}</td>
                    <td className="py-2 px-3">
                      {tx.reference_no ? (
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                          {tx.reference_no}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        已配對
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">尚無配對的銀行月結單記錄</p>
        )}
      </div>

      {/* Linked Payroll Payments */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">關聯薪資付款</h2>
        {record.payroll_payments && record.payroll_payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">付款日期</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">員工</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">薪資期間</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">金額</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">交易號碼</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">銀行帳戶</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">備註</th>
                </tr>
              </thead>
              <tbody>
                {record.payroll_payments.map((pp: any) => (
                  <tr key={pp.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3">{fmtDate(pp.payroll_payment_date)}</td>
                    <td className="py-2 px-3">
                      {pp.payroll?.employee ? (
                        <Link
                          href={`/payroll/${pp.payroll.id}`}
                          className="text-primary-600 hover:underline"
                        >
                          {pp.payroll.employee.name_zh || pp.payroll.employee.name_en || '—'}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs">
                      {pp.payroll
                        ? pp.payroll.period || '—'
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {fmt$(pp.payroll_payment_amount)}
                    </td>
                    <td className="py-2 px-3">
                      {pp.payroll_payment_reference_no ? (
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                          {pp.payroll_payment_reference_no}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs">{pp.payroll_payment_bank_account || '—'}</td>
                    <td className="py-2 px-3 text-xs text-gray-500">{pp.payroll_payment_remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">尚無關聯的薪資付款記錄</p>
        )}
      </div>
    </div>
  );
}
