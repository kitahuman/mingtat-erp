'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  paymentOutAllocationApi,
  PaymentOutAllocationCandidate,
} from '@/lib/api';

const fmt$ = (v: unknown) =>
  `$${Number(v ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type AllocationKind = 'expense' | 'payroll' | 'subcon_payroll';

interface AllocationRow {
  id: number;
  payment_out_allocation_amount: number | string;
  payment_out_allocation_remarks: string | null;
  payment_out_allocation_expense_id: number | null;
  payment_out_allocation_payroll_id: number | null;
  payment_out_allocation_subcon_payroll_id: number | null;
  expense?: {
    id: number;
    item: string | null;
    total_amount: number | string;
    supplier_name: string | null;
  } | null;
  payroll?: {
    id: number;
    period: string;
    net_amount: number | string;
    employee?: { name_zh?: string | null; name_en?: string | null } | null;
  } | null;
  subcon_payroll?: {
    id: number;
    subcon_payroll_total_amount: number | string;
    subcon_payroll_month: string | null;
    subcontractor?: { name?: string | null } | null;
  } | null;
}

interface Props {
  paymentOutId: number;
  paymentOutAmount: number;
  /** Allocations included in the parent record (initial render). */
  initialAllocations: AllocationRow[];
  /** Notify parent that something changed so it can reload the record. */
  onChange?: () => void;
  readOnly?: boolean;
}

function describeAllocation(a: AllocationRow): {
  kindLabel: string;
  docNo: string;
  description: string;
  totalAmount: number;
  href: string;
} {
  if (a.payment_out_allocation_expense_id && a.expense) {
    return {
      kindLabel: '支出',
      docNo: `EXP-${a.expense.id}`,
      description: [a.expense.item, a.expense.supplier_name]
        .filter(Boolean)
        .join(' / ') || '—',
      totalAmount: Number(a.expense.total_amount) || 0,
      href: `/expenses/${a.expense.id}`,
    };
  }
  if (a.payment_out_allocation_payroll_id && a.payroll) {
    const name =
      a.payroll.employee?.name_zh || a.payroll.employee?.name_en || '';
    return {
      kindLabel: '糧單',
      docNo: `PAY-${a.payroll.id}`,
      description: `${a.payroll.period} ${name}`.trim(),
      totalAmount: Number(a.payroll.net_amount) || 0,
      href: `/payroll/${a.payroll.id}`,
    };
  }
  if (a.payment_out_allocation_subcon_payroll_id && a.subcon_payroll) {
    const month = a.subcon_payroll.subcon_payroll_month
      ? new Date(a.subcon_payroll.subcon_payroll_month)
          .toISOString()
          .slice(0, 7)
      : '';
    return {
      kindLabel: '判頭糧單',
      docNo: `SUBPAY-${a.subcon_payroll.id}`,
      description: `${month} ${a.subcon_payroll.subcontractor?.name || ''}`.trim(),
      totalAmount: Number(a.subcon_payroll.subcon_payroll_total_amount) || 0,
      href: `/subcon-payroll/${a.subcon_payroll.id}`,
    };
  }
  return {
    kindLabel: '—',
    docNo: '—',
    description: '—',
    totalAmount: 0,
    href: '#',
  };
}

export default function AllocationsCard({
  paymentOutId,
  paymentOutAmount,
  initialAllocations,
  onChange,
  readOnly,
}: Props) {
  const [allocations, setAllocations] = useState<AllocationRow[]>(
    initialAllocations || [],
  );
  const [loading, setLoading] = useState(false);

  // Picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<AllocationKind>('expense');
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [candidates, setCandidates] = useState<PaymentOutAllocationCandidate[]>(
    [],
  );
  const [selected, setSelected] = useState<PaymentOutAllocationCandidate | null>(
    null,
  );
  const [allocAmount, setAllocAmount] = useState<string>('');
  const [allocRemarks, setAllocRemarks] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAllocations(initialAllocations || []);
  }, [initialAllocations]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentOutAllocationApi.listByPaymentOut(paymentOutId);
      setAllocations((res.data as AllocationRow[]) || []);
    } finally {
      setLoading(false);
    }
  }, [paymentOutId]);

  const allocatedTotal = useMemo(
    () =>
      allocations.reduce(
        (s, a) => s + Number(a.payment_out_allocation_amount || 0),
        0,
      ),
    [allocations],
  );
  const remaining = paymentOutAmount - allocatedTotal;

  const runSearch = useCallback(async () => {
    setPickerLoading(true);
    try {
      const res = await paymentOutAllocationApi.search({
        kind: pickerKind,
        q: pickerQuery,
        limit: 30,
        unpaid_only: true,
      });
      setCandidates(res.data || []);
    } catch {
      setCandidates([]);
    } finally {
      setPickerLoading(false);
    }
  }, [pickerKind, pickerQuery]);

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
    setPickerKind('expense');
    setPickerOpen(true);
  };

  const handleSelectCandidate = (c: PaymentOutAllocationCandidate) => {
    setSelected(c);
    // Default amount = min(remaining, outstanding)
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
      await paymentOutAllocationApi.create({
        payment_out_allocation_payment_out_id: paymentOutId,
        payment_out_allocation_expense_id:
          selected.kind === 'expense' ? selected.id : undefined,
        payment_out_allocation_payroll_id:
          selected.kind === 'payroll' ? selected.id : undefined,
        payment_out_allocation_subcon_payroll_id:
          selected.kind === 'subcon_payroll' ? selected.id : undefined,
        payment_out_allocation_amount: amount,
        payment_out_allocation_remarks: allocRemarks || undefined,
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

  const handleDelete = async (id: number) => {
    if (!confirm('確定刪除此關聯？對應單據的付款狀態將自動重算。')) return;
    try {
      await paymentOutAllocationApi.delete(id);
      await reload();
      onChange?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '刪除失敗';
      alert(msg);
    }
  };

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-900">關聯單據（多對多分配）</h2>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-gray-600">
            付款總額：
            <span className="font-mono font-semibold text-gray-900">
              {fmt$(paymentOutAmount)}
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
                  ? '此付款已完全分配，無剩餘可分配金額'
                  : '新增關聯單據'
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
                  單據編號
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  描述
                </th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                  單據金額
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
                const meta = describeAllocation(a);
                return (
                  <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
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
                      {fmt$(meta.totalAmount)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-indigo-700">
                      {fmt$(a.payment_out_allocation_amount)}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500">
                      {a.payment_out_allocation_remarks || '—'}
                    </td>
                    {!readOnly && (
                      <td className="py-2 px-3 text-right">
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
              <h3 className="text-lg font-semibold text-gray-900">新增關聯單據</h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 border-b border-gray-200">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex bg-gray-100 rounded-md p-1">
                  {(['expense', 'payroll', 'subcon_payroll'] as AllocationKind[]).map(
                    (k) => (
                      <button
                        key={k}
                        onClick={() => {
                          setPickerKind(k);
                          setSelected(null);
                        }}
                        className={`px-3 py-1 text-xs rounded ${
                          pickerKind === k
                            ? 'bg-white shadow text-gray-900 font-semibold'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {k === 'expense'
                          ? '支出'
                          : k === 'payroll'
                            ? '糧單'
                            : '判頭糧單'}
                      </button>
                    ),
                  )}
                </div>
                <input
                  type="text"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runSearch();
                  }}
                  className="input-field flex-1 min-w-[200px]"
                  placeholder="輸入關鍵字後按 Enter 搜尋（項目、供應商、員工、判頭…）"
                />
                <button onClick={runSearch} className="btn-secondary text-sm">
                  搜尋
                </button>
              </div>
              <p className="text-xs text-gray-500">
                只顯示尚未完全付清的單據（未付金額 &gt; 0）
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {pickerLoading ? (
                <p className="text-sm text-gray-400">搜尋中…</p>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-gray-400">未找到符合的單據</p>
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
                        單據金額
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                        已付
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                        未付
                      </th>
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
                        <td className="py-2 px-3 font-mono text-xs">{c.doc_no}</td>
                        <td className="py-2 px-3">{c.description || '—'}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          {fmt$(c.total_amount)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-gray-500">
                          {fmt$(c.allocated_amount)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-green-700">
                          {fmt$(c.outstanding_amount)}
                        </td>
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
                      分配金額 *（剩餘可分配 {fmt$(remaining)}，單據未付 {fmt$(selected.outstanding_amount)}）
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
                      placeholder="選填"
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
    </div>
  );
}
