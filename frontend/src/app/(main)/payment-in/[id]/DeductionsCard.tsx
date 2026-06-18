'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  paymentInDeductionsApi,
  paymentInAllocationApi,
  PaymentInAllocationCandidate,
} from '@/lib/api';
import SearchableSelect from '@/app/(main)/work-logs/SearchableSelect';

const fmt$ = (v: unknown) =>
  `$${Number(v ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const DEDUCTION_TYPE_LABELS: Record<string, string> = {
  retention: 'Retention',
  contra_charge: 'Contra Charge',
  other: '其他',
};

interface DeductionRow {
  id: number;
  payment_in_deduction_payment_in_id: number;
  payment_in_deduction_invoice_id: number | null;
  payment_in_deduction_type: string;
  payment_in_deduction_amount: number | string;
  payment_in_deduction_remarks: string;
  invoice?: {
    id: number;
    invoice_no: string;
    invoice_title: string | null;
  } | null;
}

interface Props {
  paymentInId: number;
  paymentInAmount: number;
  initialDeductions: DeductionRow[];
  onChange?: () => void;
  readOnly?: boolean;
}

export default function DeductionsCard({
  paymentInId,
  paymentInAmount,
  initialDeductions,
  onChange,
  readOnly,
}: Props) {
  const [deductions, setDeductions] = useState<DeductionRow[]>(
    initialDeductions || [],
  );
  const [loading, setLoading] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formType, setFormType] = useState<string>('retention');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formRemarks, setFormRemarks] = useState<string>('');
  const [formInvoiceId, setFormInvoiceId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Invoice candidates for retention
  const [invoiceCandidates, setInvoiceCandidates] = useState<
    PaymentInAllocationCandidate[]
  >([]);

  useEffect(() => {
    setDeductions(initialDeductions || []);
  }, [initialDeductions]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentInDeductionsApi.listByPaymentIn(paymentInId);
      setDeductions((res.data as DeductionRow[]) || []);
    } finally {
      setLoading(false);
    }
  }, [paymentInId]);

  const deductionTotal = useMemo(
    () =>
      deductions.reduce(
        (s, d) => s + Number(d.payment_in_deduction_amount || 0),
        0,
      ),
    [deductions],
  );

  const bookTotal = paymentInAmount + deductionTotal;

  // Load invoice candidates when modal opens
  const loadInvoiceCandidates = useCallback(async () => {
    try {
      const res = await paymentInAllocationApi.search({
        kind: 'invoice',
        limit: 100,
        unpaid_only: false,
      });
      setInvoiceCandidates(res.data || []);
    } catch {
      setInvoiceCandidates([]);
    }
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setFormType('retention');
    setFormAmount('');
    setFormRemarks('');
    setFormInvoiceId(null);
    setModalOpen(true);
    loadInvoiceCandidates();
  };

  const openEditModal = (d: DeductionRow) => {
    setEditingId(d.id);
    setFormType(d.payment_in_deduction_type);
    setFormAmount(String(Number(d.payment_in_deduction_amount)));
    setFormRemarks(d.payment_in_deduction_remarks);
    setFormInvoiceId(d.payment_in_deduction_invoice_id);
    setModalOpen(true);
    loadInvoiceCandidates();
  };

  const handleSubmit = async () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) {
      alert('請輸入有效的金額');
      return;
    }
    if (!formRemarks.trim()) {
      alert('備註為必填');
      return;
    }
    if (formType === 'retention' && !formInvoiceId) {
      alert('Retention 類型必須選擇關聯發票');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await paymentInDeductionsApi.update(editingId, {
          payment_in_deduction_type: formType,
          payment_in_deduction_amount: amount,
          payment_in_deduction_remarks: formRemarks.trim(),
          payment_in_deduction_invoice_id:
            formType === 'retention' ? formInvoiceId : null,
        });
      } else {
        await paymentInDeductionsApi.create({
          payment_in_deduction_payment_in_id: paymentInId,
          payment_in_deduction_type: formType,
          payment_in_deduction_amount: amount,
          payment_in_deduction_remarks: formRemarks.trim(),
          ...(formType === 'retention' && formInvoiceId
            ? { payment_in_deduction_invoice_id: formInvoiceId }
            : {}),
        });
      }
      setModalOpen(false);
      await reload();
      onChange?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '操作失敗';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定刪除此扣減記錄？')) return;
    try {
      await paymentInDeductionsApi.delete(id);
      await reload();
      onChange?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '刪除失敗';
      alert(msg);
    }
  };

  const invoiceOptions = useMemo(
    () =>
      invoiceCandidates.map((c) => ({
        value: c.id,
        label: `${c.doc_no} - ${c.description} (${fmt$(c.total_amount)})`,
      })),
    [invoiceCandidates],
  );

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-900">扣減明細</h2>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-gray-600">
            實收金額：
            <span className="font-mono font-semibold text-gray-900">
              {fmt$(paymentInAmount)}
            </span>
          </div>
          <div className="text-gray-600">
            扣減總額：
            <span className="font-mono font-semibold text-orange-600">
              {fmt$(deductionTotal)}
            </span>
          </div>
          <div className="text-gray-600">
            帳面總額：
            <span className="font-mono font-semibold text-indigo-600">
              {fmt$(bookTotal)}
            </span>
          </div>
          {!readOnly && (
            <button onClick={openCreateModal} className="btn-primary text-sm">
              + 新增扣減
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">載入中…</p>
      ) : deductions.length === 0 ? (
        <p className="text-sm text-gray-400">尚未有任何扣減記錄</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  類型
                </th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  金額
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  備註
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  關聯發票
                </th>
                {!readOnly && (
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {deductions.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.payment_in_deduction_type === 'retention'
                          ? 'bg-purple-100 text-purple-700'
                          : d.payment_in_deduction_type === 'contra_charge'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {DEDUCTION_TYPE_LABELS[d.payment_in_deduction_type] ||
                        d.payment_in_deduction_type}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-orange-700">
                    {fmt$(d.payment_in_deduction_amount)}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-600 max-w-[300px] truncate">
                    {d.payment_in_deduction_remarks}
                  </td>
                  <td className="py-2 px-3">
                    {d.invoice ? (
                      <Link
                        href={`/invoices/${d.invoice.id}`}
                        className="text-primary-600 hover:underline font-mono text-xs"
                      >
                        {d.invoice.invoice_no}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="py-2 px-3 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(d)}
                        className="text-primary-600 hover:text-primary-700 text-xs"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-red-600 hover:text-red-700 text-xs"
                      >
                        刪除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? '編輯扣減' : '新增扣減'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  類型 *
                </label>
                <select
                  value={formType}
                  onChange={(e) => {
                    setFormType(e.target.value);
                    if (e.target.value !== 'retention') {
                      setFormInvoiceId(null);
                    }
                  }}
                  className="input-field"
                >
                  <option value="retention">Retention</option>
                  <option value="contra_charge">Contra Charge</option>
                  <option value="other">其他</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  金額 *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="input-field"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  備註 *
                </label>
                <textarea
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="input-field min-h-[80px]"
                  placeholder="例：5% on Workdone $760,142.24"
                />
              </div>

              {formType === 'retention' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    關聯發票 *
                  </label>
                  <SearchableSelect
                    value={formInvoiceId}
                    onChange={(v: string | number | null) =>
                      setFormInvoiceId(v == null ? null : Number(v))
                    }
                    options={invoiceOptions}
                    placeholder="搜尋並選擇發票..."
                    clearable
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  onClick={() => setModalOpen(false)}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-primary disabled:opacity-50"
                >
                  {submitting ? '處理中...' : editingId ? '儲存' : '新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
