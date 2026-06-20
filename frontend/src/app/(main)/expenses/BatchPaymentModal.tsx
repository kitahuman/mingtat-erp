'use client';
import { useState, useMemo, useEffect } from 'react';
import Modal from '@/components/Modal';
import DateInput from '@/components/DateInput';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';
import { paymentOutApi, attachmentsApi } from '@/lib/api';

interface ExpenseRow {
  id: number;
  item?: string | null;
  supplier_name?: string | null;
  company_id?: number | null;
  total_amount: number;
  payment_status?: string;
}

interface Option {
  value: string | number;
  label: string;
}

interface BatchPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: ExpenseRow[];
  bankAccountOptions: Option[];
  companyOptions: Option[];
  paymentMethodOptions: Option[];
  onSuccess: () => void;
}

/**
 * Batch payment modal: lets the user pay multiple expenses at once.
 * Creates ONE PaymentOut (status=paid) with multiple PaymentOutAllocation
 * rows via paymentOutApi.bulkPay, then optionally uploads attachments to the
 * newly created payment_out.
 */
export default function BatchPaymentModal({
  isOpen,
  onClose,
  expenses,
  bankAccountOptions,
  companyOptions,
  paymentMethodOptions,
  onSuccess,
}: BatchPaymentModalProps) {
  const today = new Date().toISOString().slice(0, 10);

  // Per-expense payment amount (keyed by expense id)
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [date, setDate] = useState(today);
  const [bankAccountId, setBankAccountId] = useState<string | number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [companyId, setCompanyId] = useState<string | number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Initialize amounts (default to full outstanding/total amount) when opened
  useEffect(() => {
    if (!isOpen) return;
    const init: Record<number, string> = {};
    for (const e of expenses) {
      init[e.id] = String(Number(e.total_amount) || 0);
    }
    setAmounts(init);
    setDate(today);
    setBankAccountId(null);
    setPaymentMethod('');
    setReferenceNo('');
    setRemarks('');
    setFiles([]);
    // Default company: if all expenses share one company, preselect it
    const companyIds = Array.from(
      new Set(expenses.map((e) => e.company_id).filter((v) => v != null)),
    );
    setCompanyId(companyIds.length === 1 ? (companyIds[0] as number) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Warn (but do not block) if selected expenses span multiple companies
  const multiCompany = useMemo(() => {
    const ids = new Set(
      expenses.map((e) => e.company_id).filter((v) => v != null),
    );
    return ids.size > 1;
  }, [expenses]);

  const totalPayment = useMemo(() => {
    return expenses.reduce(
      (sum, e) => sum + (parseFloat(amounts[e.id] || '0') || 0),
      0,
    );
  }, [expenses, amounts]);

  const handleAmountChange = (id: number, value: string) => {
    setAmounts((prev) => ({ ...prev, [id]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async () => {
    // Build allocations, skipping zero/empty amounts
    const allocations = expenses
      .map((e) => ({
        expense_id: e.id,
        amount: parseFloat(amounts[e.id] || '0') || 0,
      }))
      .filter((a) => a.amount > 0);

    if (allocations.length === 0) {
      alert('請至少為一筆支出輸入付款金額');
      return;
    }

    setSubmitting(true);
    try {
      const res = await paymentOutApi.bulkPay({
        date,
        bank_account_id: bankAccountId ? Number(bankAccountId) : undefined,
        payment_method: paymentMethod || undefined,
        reference_no: referenceNo || undefined,
        remarks: remarks || undefined,
        company_id: companyId ? Number(companyId) : undefined,
        allocations,
      });

      const paymentOutId = res.data?.id;

      // Upload attachments (if any) to the new payment_out
      if (paymentOutId && files.length > 0) {
        for (const file of files) {
          const formData = new FormData();
          formData.append('file', file);
          try {
            await attachmentsApi.upload('payment_out', paymentOutId, formData);
          } catch (err) {
            console.error('附件上傳失敗', err);
          }
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err?.response?.data?.message || '批量付款失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const fmtMoney = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="批量付款" size="xl">
      <div className="space-y-5">
        {multiCompany && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700">
            注意：所選支出屬於不同公司，將以下方所選公司（或第一筆支出的公司）建立付款記錄。
          </div>
        )}

        {/* Selected expenses table */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            已選支出（{expenses.length} 筆）
          </h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">支出項目</th>
                  <th className="px-3 py-2 text-right font-medium">原金額</th>
                  <th className="px-3 py-2 text-right font-medium">本次付款金額</th>
                  <th className="px-3 py-2 text-right font-medium">差額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses.map((e) => {
                  const orig = Number(e.total_amount) || 0;
                  const pay = parseFloat(amounts[e.id] || '0') || 0;
                  const diff = orig - pay;
                  return (
                    <tr key={e.id}>
                      <td className="px-3 py-2">
                        <div className="truncate max-w-[260px]" title={e.item || ''}>
                          {[e.item, e.supplier_name].filter(Boolean).join(' / ') ||
                            `支出 #${e.id}`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {fmtMoney(orig)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={amounts[e.id] ?? ''}
                          onChange={(ev) => handleAmountChange(e.id, ev.target.value)}
                          className="w-28 px-2 py-1 text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right ${
                          Math.abs(diff) < 0.005
                            ? 'text-gray-400'
                            : diff > 0
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {fmtMoney(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment info */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">付款資訊</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                付款日期 *
              </label>
              <DateInput value={date} onChange={setDate} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                公司
              </label>
              <SearchableSelect
                value={companyId}
                onChange={setCompanyId}
                options={companyOptions}
                placeholder="請選擇公司"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                銀行賬戶
              </label>
              <SearchableSelect
                value={bankAccountId}
                onChange={setBankAccountId}
                options={bankAccountOptions}
                placeholder="請選擇銀行賬戶"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                付款方法
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="input-field"
              >
                <option value="">請選擇</option>
                {paymentMethodOptions.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                參考號碼
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="input-field"
                placeholder="例：交易參考號"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                備註
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="input-field"
                placeholder="備註"
              />
            </div>
          </div>
        </div>

        {/* File upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            附件文件（選填）
          </label>
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
          {files.length > 0 && (
            <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
              {files.map((f, idx) => (
                <li key={idx}>{f.name}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer: total + actions */}
        <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
          <div className="text-base">
            <span className="text-gray-600">總付款金額：</span>
            <span className="font-bold text-primary-700 text-lg">
              ${fmtMoney(totalPayment)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="btn-primary"
              disabled={submitting || totalPayment <= 0}
            >
              {submitting ? '處理中...' : '確認付款'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
