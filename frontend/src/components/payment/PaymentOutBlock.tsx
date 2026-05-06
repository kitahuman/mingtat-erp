'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { paymentOutApi, bankAccountsApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';
import DateInput from '@/components/DateInput';

// ── Types ──────────────────────────────────────────────────────────
interface PaymentOutBlockProps {
  /** 'expense' or 'subcon_payroll' */
  sourceType: 'expense' | 'subcon_payroll';
  /** The ID of the linked Expense or SubconPayroll */
  sourceRefId: number;
  /** Total amount of the source record (for calculating paid percentage) */
  totalAmount: number;
  /** Callback when payment status changes (parent can reload) */
  onStatusChange?: () => void;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: '未付款', color: 'bg-yellow-100 text-yellow-700' },
  partially_paid: { label: '部分付款', color: 'bg-blue-100 text-blue-700' },
  paid: { label: '已付款', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '取消', color: 'bg-gray-100 text-gray-500' },
};

const fmt$ = (v: number) =>
  `HK$ ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Component ──────────────────────────────────────────────────────
export default function PaymentOutBlock({
  sourceType,
  sourceRefId,
  totalAmount,
  onStatusChange,
}: PaymentOutBlockProps) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  const defaultForm = {
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    bank_account_id: '',
    reference_no: '',
    payment_out_description: '',
    remarks: '',
  };
  const [form, setForm] = useState(defaultForm);

  const queryParam = sourceType === 'expense' ? 'expense_id' : 'subcon_payroll_id';

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentOutApi.list({ [queryParam]: sourceRefId, limit: 200 });
      setPayments(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load payment records:', err);
    } finally {
      setLoading(false);
    }
  }, [queryParam, sourceRefId]);

  useEffect(() => {
    fetchPayments();
    bankAccountsApi.simple().then(r => setBankAccounts(r.data || [])).catch(() => {});
  }, [fetchPayments]);

  const bankAccountOptions = useMemo(
    () =>
      bankAccounts.map((ba: any) => ({
        value: ba.id,
        label: `${ba.bank_name} - ${ba.account_name} (${ba.account_no})`,
      })),
    [bankAccounts],
  );

  // ── Computed summary ──────────────────────────────────────────────
  const paidTotal = useMemo(
    () =>
      payments
        .filter((p: any) => p.payment_out_status === 'paid')
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0),
    [payments],
  );
  const outstanding = totalAmount - paidTotal;
  const paidPercent = totalAmount > 0 ? Math.min((paidTotal / totalAmount) * 100, 100) : 0;

  // ── Handlers ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.date || !form.amount) return alert('請填寫日期和金額');
    setSaving(true);
    try {
      const payload: any = {
        date: form.date,
        amount: parseFloat(form.amount as string),
        payment_out_status: 'paid',
        payment_out_description: form.payment_out_description || undefined,
        bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : undefined,
        reference_no: form.reference_no || undefined,
        remarks: form.remarks || undefined,
      };
      if (sourceType === 'expense') {
        payload.expense_id = sourceRefId;
      } else {
        payload.subcon_payroll_id = sourceRefId;
      }
      await paymentOutApi.create(payload);
      setForm(defaultForm);
      setShowForm(false);
      await fetchPayments();
      onStatusChange?.();
    } catch (err: any) {
      alert(err.response?.data?.message || '新增付款紀錄失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (paymentId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'cancelled' : 'paid';
    try {
      await paymentOutApi.updateStatus(paymentId, newStatus);
      await fetchPayments();
      onStatusChange?.();
    } catch (err: any) {
      alert(err.response?.data?.message || '更新狀態失敗');
    }
  };

  const handleDelete = async (paymentId: number) => {
    if (!confirm('確定刪除此付款紀錄？')) return;
    try {
      await paymentOutApi.delete(paymentId);
      await fetchPayments();
      onStatusChange?.();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="font-bold text-gray-700">付款紀錄</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm text-white bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 font-medium"
        >
          {showForm ? '取消' : '+ 新增付款'}
        </button>
      </div>

      {/* Summary Bar */}
      <div className="px-4 py-3 bg-gray-50 border-b">
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-gray-500">總金額：</span>
            <span className="font-semibold">{fmt$(totalAmount)}</span>
          </div>
          <div>
            <span className="text-gray-500">已付款：</span>
            <span className="font-semibold text-green-700">{fmt$(paidTotal)}</span>
          </div>
          <div>
            <span className="text-gray-500">未付款：</span>
            <span className={`font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {fmt$(Math.max(outstanding, 0))}
            </span>
          </div>
          <div>
            <span className="text-gray-500">進度：</span>
            <span className="font-semibold">{paidPercent.toFixed(1)}%</span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${paidPercent}%` }}
          />
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="px-4 py-4 border-b bg-blue-50">
          <p className="text-sm font-semibold text-gray-700 mb-3">新增付款紀錄</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">日期 *</label>
              <DateInput value={form.date}
                onChange={val => setForm({ ...form, date: val || '' })}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">金額 *</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="input-field text-sm"
                placeholder={outstanding > 0 ? `剩餘 ${outstanding.toFixed(2)}` : '0.00'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">銀行帳戶</label>
              <SearchableSelect
                value={form.bank_account_id ? Number(form.bank_account_id) : null}
                onChange={(v: any) => setForm({ ...form, bank_account_id: v || '' })}
                options={bankAccountOptions}
                placeholder="選擇銀行帳戶"
                clearable
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">支票/交易號碼</label>
              <input
                type="text"
                value={form.reference_no}
                onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
                className="input-field text-sm"
                placeholder="選填"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">項目描述</label>
              <input
                type="text"
                value={form.payment_out_description}
                onChange={(e) => setForm({ ...form, payment_out_description: e.target.value })}
                className="input-field text-sm"
                placeholder="選填"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">備註</label>
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                className="input-field text-sm"
                placeholder="選填"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => { setShowForm(false); setForm(defaultForm); }}
              className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded px-3 py-1.5"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !form.date || !form.amount}
              className="text-sm text-white bg-green-600 hover:bg-green-700 rounded px-4 py-1.5 font-medium disabled:opacity-50"
            >
              {saving ? '儲存中...' : '確認付款'}
            </button>
          </div>
        </div>
      )}

      {/* Payment Records Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">載入中...</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="text-sm">尚無付款紀錄</p>
            <p className="text-xs text-gray-300 mt-1">點擊「新增付款」按鈕來記錄付款</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">金額</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">銀行帳戶</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">支票/交易號碼</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">備註</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">狀態</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map((p: any) => {
                const s = STATUS_MAP[p.payment_out_status] || STATUS_MAP.unpaid;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.date)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {fmt$(Number(p.amount))}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {p.bank_account
                        ? `${p.bank_account.bank_name} - ${p.bank_account.account_no}`
                        : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-600">
                      {p.reference_no || '-'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-[160px] truncate" title={p.remarks || p.payment_out_description || ''}>
                      {p.remarks || p.payment_out_description || '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleToggleStatus(p.id, p.payment_out_status)}
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            p.payment_out_status === 'paid'
                              ? 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200'
                              : 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-200'
                          }`}
                        >
                          {p.payment_out_status === 'paid' ? '取消付款' : '已付款'}
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
