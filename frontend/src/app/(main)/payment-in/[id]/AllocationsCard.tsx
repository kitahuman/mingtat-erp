'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  paymentInAllocationApi,
  PaymentInAllocationCandidate,
} from '@/lib/api';

const fmt$ = (v: unknown) =>
  `$${Number(v ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

interface AllocationRow {
  id: number;
  payment_in_allocation_amount: number | string;
  payment_in_allocation_remarks: string | null;
  payment_in_allocation_invoice_id: number | null;
  invoice?: {
    id: number;
    invoice_no: string;
    invoice_title: string | null;
    total_amount: number | string;
    paid_amount: number | string | null;
    outstanding: number | string | null;
    retention_amount: number | string | null;
    status: string;
    date: string | null;
    client?: { id: number; name: string | null } | null;
  } | null;
}

interface Props {
  paymentInId: number;
  paymentInAmount: number;
  /** source_type of the parent PaymentIn — controls allocation mode */
  sourceType?: string;
  /** Allocations included in the parent record (initial render). */
  initialAllocations: AllocationRow[];
  /** Notify parent that something changed so it can reload the record. */
  onChange?: () => void;
  readOnly?: boolean;
}

function describeAllocation(a: AllocationRow, isRetentionRelease: boolean): {
  kindLabel: string;
  docNo: string;
  description: string;
  /** For invoice mode: invoice total. For retention_release: retention_amount. */
  contextAmount: number;
  contextLabel: string;
  href: string;
} {
  if (a.payment_in_allocation_invoice_id && a.invoice) {
    const retentionAmount = Number(a.invoice.retention_amount) || 0;
    return {
      kindLabel: isRetentionRelease ? '扣留金釋放' : '發票',
      docNo: a.invoice.invoice_no,
      description:
        [a.invoice.invoice_title, a.invoice.client?.name]
          .filter(Boolean)
          .join(' / ') || '—',
      contextAmount: isRetentionRelease
        ? retentionAmount
        : Number(a.invoice.total_amount) || 0,
      contextLabel: isRetentionRelease ? '累計 Retention' : '發票金額',
      href: `/invoices/${a.invoice.id}`,
    };
  }
  return {
    kindLabel: '—',
    docNo: '—',
    description: '—',
    contextAmount: 0,
    contextLabel: '—',
    href: '#',
  };
}

export default function AllocationsCard({
  paymentInId,
  paymentInAmount,
  sourceType,
  initialAllocations,
  onChange,
  readOnly,
}: Props) {
  const isRetentionRelease = sourceType === 'retention_release';

  const [allocations, setAllocations] = useState<AllocationRow[]>(
    initialAllocations || [],
  );
  const [loading, setLoading] = useState(false);

  // Inline editing state: map of allocationId -> edited amount string
  const [editingAmounts, setEditingAmounts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Edit modal state (edit both amount and remarks for an allocation)
  const [editModalRow, setEditModalRow] = useState<AllocationRow | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editRemarks, setEditRemarks] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);

  // Picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [candidates, setCandidates] = useState<PaymentInAllocationCandidate[]>([]);
  const [selected, setSelected] = useState<PaymentInAllocationCandidate | null>(null);
  const [allocAmount, setAllocAmount] = useState<string>('');
  const [allocRemarks, setAllocRemarks] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAllocations(initialAllocations || []);
  }, [initialAllocations]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentInAllocationApi.listByPaymentIn(paymentInId);
      setAllocations((res.data as AllocationRow[]) || []);
    } finally {
      setLoading(false);
    }
  }, [paymentInId]);

  const allocatedTotal = useMemo(
    () =>
      allocations.reduce(
        (s, a) => s + Number(a.payment_in_allocation_amount || 0),
        0,
      ),
    [allocations],
  );
  const remaining = paymentInAmount - allocatedTotal;

  // ── Inline amount editing ──────────────────────────────────────

  const handleAmountEdit = (id: number, currentAmount: number | string) => {
    setEditingAmounts((prev) => ({
      ...prev,
      [id]: Number(currentAmount).toFixed(2),
    }));
  };

  const handleAmountChange = (id: number, value: string) => {
    setEditingAmounts((prev) => ({ ...prev, [id]: value }));
  };

  const handleAmountSave = async (id: number) => {
    const raw = editingAmounts[id];
    if (raw === undefined) return;
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount <= 0) {
      alert('請輸入有效的正數金額');
      return;
    }
    setSavingId(id);
    try {
      await paymentInAllocationApi.update(id, {
        payment_in_allocation_amount: amount,
      });
      setEditingAmounts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await reload();
      onChange?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '更新失敗';
      alert(msg);
    } finally {
      setSavingId(null);
    }
  };

  const handleAmountCancel = (id: number) => {
    setEditingAmounts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // ── Picker ─────────────────────────────────────────────────────

  const runSearch = useCallback(async () => {
    setPickerLoading(true);
    try {
      let res;
      if (isRetentionRelease) {
        res = await paymentInAllocationApi.searchRetention({
          q: pickerQuery,
          limit: 30,
        });
      } else {
        res = await paymentInAllocationApi.search({
          kind: 'invoice',
          q: pickerQuery,
          limit: 30,
          unpaid_only: true,
        });
      }
      setCandidates(res.data || []);
    } catch {
      setCandidates([]);
    } finally {
      setPickerLoading(false);
    }
  }, [isRetentionRelease, pickerQuery]);

  useEffect(() => {
    if (pickerOpen) {
      runSearch();
    }
  }, [pickerOpen, runSearch]);

  const openPicker = () => {
    setSelected(null);
    setAllocAmount('');
    setAllocRemarks('');
    setPickerQuery('');
    setPickerOpen(true);
  };

  const handleSelectCandidate = (c: PaymentInAllocationCandidate) => {
    setSelected(c);
    // Default amount:
    // - retention_release: outstanding_amount = outstanding retention for this invoice
    // - invoice: min(remaining, outstanding)
    const suggested = Math.max(
      0,
      Math.min(remaining, Number(c.outstanding_amount) || 0),
    );
    setAllocAmount(suggested > 0 ? suggested.toFixed(2) : '');
  };

  const handleCreate = async () => {
    if (!selected) return;
    const amount = parseFloat(allocAmount);
    if (!amount || amount <= 0) {
      alert('請輸入有效的分配金額');
      return;
    }
    setSubmitting(true);
    try {
      await paymentInAllocationApi.create({
        payment_in_allocation_payment_in_id: paymentInId,
        payment_in_allocation_invoice_id:
          selected.kind === 'invoice' ? selected.id : undefined,
        payment_in_allocation_amount: amount,
        payment_in_allocation_remarks: allocRemarks || undefined,
      });
      setPickerOpen(false);
      await reload();
      onChange?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '新增失敗';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit modal (amount + remarks) ──────────────────────────────

  const openEditModal = (a: AllocationRow) => {
    setEditModalRow(a);
    setEditAmount(Number(a.payment_in_allocation_amount).toFixed(2));
    setEditRemarks(a.payment_in_allocation_remarks || '');
  };

  const handleEditSave = async () => {
    if (!editModalRow) return;
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('請輸入有效的正數金額');
      return;
    }
    setEditSaving(true);
    try {
      await paymentInAllocationApi.update(editModalRow.id, {
        payment_in_allocation_amount: amount,
        payment_in_allocation_remarks: editRemarks.trim() || undefined,
      });
      setEditModalRow(null);
      await reload();
      onChange?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '更新失敗';
      alert(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const confirmMsg = isRetentionRelease
      ? '確定刪除此扣留金釋放關聯？對應的 PaymentInDeduction 記錄也會一併刪除。'
      : '確定刪除此關聯？對應發票的收款狀態將自動重算。';
    if (!confirm(confirmMsg)) return;
    try {
      await paymentInAllocationApi.delete(id);
      await reload();
      onChange?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '刪除失敗';
      alert(msg);
    }
  };

  // Determine column header for the context amount column
  const contextColumnHeader = isRetentionRelease ? '累計 Retention' : '發票金額';
  const pickerTitle = isRetentionRelease ? '新增扣留金釋放關聯' : '新增關聯發票';
  const pickerHint = isRetentionRelease
    ? '只顯示有未釋放扣留金的發票'
    : '只顯示尚未完全收清的發票（未收金額 > 0）';
  const pickerOutstandingLabel = isRetentionRelease ? '未釋放 Retention' : '未收';

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-900">
          {isRetentionRelease ? '關聯發票（扣留金釋放）' : '關聯單據（多對多分配）'}
        </h2>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-gray-600">
            收款總額：
            <span className="font-mono font-semibold text-gray-900">
              {fmt$(paymentInAmount)}
            </span>
          </div>
          <div className="text-gray-600">
            已分配：
            <span className="font-mono font-semibold text-indigo-600">
              {fmt$(allocatedTotal)}
            </span>
          </div>
          <div className="text-gray-600">
            剩餘可分配：
            <span
              className={`font-mono font-semibold ${
                remaining < -0.0001
                  ? 'text-red-600'
                  : remaining > 0.0001
                    ? 'text-green-600'
                    : 'text-gray-900'
              }`}
            >
              {fmt$(remaining)}
            </span>
          </div>
          {!readOnly && (
            <button
              onClick={openPicker}
              className="btn-primary text-sm"
              disabled={remaining <= 0.0001}
              title={
                remaining <= 0.0001
                  ? '此收款已完全分配，無剩餘可分配金額'
                  : pickerTitle
              }
            >
              + 新增關聯
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">載入中…</p>
      ) : allocations.length === 0 ? (
        <p className="text-sm text-gray-400">尚未有任何關聯單據</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  類型
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  發票編號
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  描述
                </th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  {contextColumnHeader}
                </th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  本次分配
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  備註
                </th>
                {!readOnly && (
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => {
                const meta = describeAllocation(a, isRetentionRelease);
                const isEditing = editingAmounts[a.id] !== undefined;
                const isSaving = savingId === a.id;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-2 px-3">{meta.kindLabel}</td>
                    <td className="py-2 px-3">
                      {meta.href !== '#' ? (
                        <Link
                          href={meta.href}
                          className="text-primary-600 hover:underline font-mono text-xs"
                        >
                          {meta.docNo}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs">{meta.docNo}</span>
                      )}
                    </td>
                    <td className="py-2 px-3">{meta.description}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {fmt$(meta.contextAmount)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {!readOnly && isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={editingAmounts[a.id]}
                            onChange={(e) => handleAmountChange(a.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAmountSave(a.id);
                              if (e.key === 'Escape') handleAmountCancel(a.id);
                            }}
                            className="w-28 text-right border border-indigo-300 rounded px-2 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleAmountSave(a.id)}
                            disabled={isSaving}
                            className="text-green-600 hover:text-green-700 text-xs px-1"
                            title="儲存"
                          >
                            {isSaving ? '…' : '✓'}
                          </button>
                          <button
                            onClick={() => handleAmountCancel(a.id)}
                            className="text-gray-400 hover:text-gray-600 text-xs px-1"
                            title="取消"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`font-mono font-semibold text-indigo-700 ${!readOnly ? 'cursor-pointer hover:underline hover:text-indigo-900' : ''}`}
                          onClick={() => !readOnly && handleAmountEdit(a.id, a.payment_in_allocation_amount)}
                          title={!readOnly ? '點擊編輯金額' : undefined}
                        >
                          {fmt$(a.payment_in_allocation_amount)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500">
                      {a.payment_in_allocation_remarks || '—'}
                    </td>
                    {!readOnly && (
                      <td className="py-2 px-3 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(a)}
                          className="text-primary-600 hover:text-primary-700 text-xs"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="text-red-600 hover:text-red-700 text-xs"
                        >
                          刪除
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Picker modal */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{pickerTitle}</h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 border-b border-gray-200">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runSearch();
                  }}
                  className="input-field flex-1 min-w-[200px]"
                  placeholder="輸入關鍵字後按 Enter 搜尋（發票編號、標題、客戶…）"
                />
                <button onClick={runSearch} className="btn-secondary text-sm">
                  搜尋
                </button>
              </div>
              <p className="text-xs text-gray-500">{pickerHint}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {pickerLoading ? (
                <p className="text-sm text-gray-400">搜尋中…</p>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-gray-400">未找到符合的發票</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                        編號
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                        描述
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                        發票金額
                      </th>
                      {isRetentionRelease ? (
                        <>
                          <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                            累計 Retention
                          </th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                            已釋放
                          </th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                            未釋放
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                            已收
                          </th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                            未收
                          </th>
                        </>
                      )}
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase" />
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr
                        key={`${c.kind}-${c.id}`}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${
                          selected &&
                          selected.kind === c.kind &&
                          selected.id === c.id
                            ? 'bg-indigo-50'
                            : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-mono text-xs">
                          {c.doc_no}
                        </td>
                        <td className="py-2 px-3">{c.description || '—'}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          {fmt$(c.total_amount)}
                        </td>
                        {isRetentionRelease ? (
                          <>
                            <td className="py-2 px-3 text-right font-mono text-amber-700">
                              {fmt$(c.retention_amount ?? 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-gray-500">
                              {fmt$(c.allocated_amount)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-green-700">
                              {fmt$(c.outstanding_amount)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 px-3 text-right font-mono text-gray-500">
                              {fmt$(c.allocated_amount)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-green-700">
                              {fmt$(c.outstanding_amount)}
                            </td>
                          </>
                        )}
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleSelectCandidate(c)}
                            className="text-primary-600 hover:underline text-xs"
                          >
                            選取
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {selected && (
              <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">
                <div className="text-sm">
                  已選取：
                  <span className="font-mono">{selected.doc_no}</span>　
                  <span className="text-gray-700">{selected.description}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {isRetentionRelease
                        ? `分配金額 *（剩餘可分配 ${fmt$(remaining)}，未釋放 Retention ${fmt$(selected.outstanding_amount)}）`
                        : `分配金額 *（剩餘可分配 ${fmt$(remaining)}，發票未收 ${fmt$(selected.outstanding_amount)}）`}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={allocAmount}
                      onChange={(e) => setAllocAmount(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      備註
                    </label>
                    <input
                      type="text"
                      value={allocRemarks}
                      onChange={(e) => setAllocRemarks(e.target.value)}
                      className="input-field"
                      placeholder={isRetentionRelease ? '扣留金釋放' : '選填'}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setSelected(null)}
                    className="btn-secondary text-sm"
                  >
                    取消選取
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={submitting}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {submitting ? '建立中…' : '確認新增'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit modal (amount + remarks) */}
      {editModalRow && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">編輯關聯單據</h3>
              <button
                onClick={() => setEditModalRow(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {editModalRow.invoice && (
                <div className="text-sm text-gray-600">
                  關聯發票：
                  <span className="font-mono">
                    {editModalRow.invoice.invoice_no}
                  </span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  本次分配金額 *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="input-field"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  備註
                </label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="input-field"
                  placeholder="選填"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  onClick={() => setEditModalRow(null)}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  className="btn-primary disabled:opacity-50"
                >
                  {editSaving ? '儲存中…' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
