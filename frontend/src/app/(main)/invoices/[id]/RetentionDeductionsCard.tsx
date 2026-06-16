'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { paymentInDeductionsApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

const fmt$ = (v: unknown) =>
  `$${Number(v ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

interface RetentionDeductionRow {
  id: number;
  payment_in_deduction_amount: number | string;
  payment_in_deduction_remarks: string;
  payment_in?: {
    id: number;
    date: string;
    reference_no: string | null;
  } | null;
}

interface Props {
  invoiceId: number;
}

export default function RetentionDeductionsCard({ invoiceId }: Props) {
  const [deductions, setDeductions] = useState<RetentionDeductionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentInDeductionsApi.listByInvoice(invoiceId);
      setDeductions((res.data as RetentionDeductionRow[]) || []);
    } catch {
      setDeductions([]);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalRetention = useMemo(
    () =>
      deductions.reduce(
        (s, d) => s + Number(d.payment_in_deduction_amount || 0),
        0,
      ),
    [deductions],
  );

  if (loading || deductions.length === 0) {
    return null;
  }

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Retention 紀錄
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                收款日期
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                收款編號
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                金額
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                備註
              </th>
            </tr>
          </thead>
          <tbody>
            {deductions.map((d) => (
              <tr
                key={d.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-2 px-3 text-sm">
                  {d.payment_in?.date ? fmtDate(d.payment_in.date) : '—'}
                </td>
                <td className="py-2 px-3">
                  {d.payment_in ? (
                    <Link
                      href={`/payment-in/${d.payment_in.id}`}
                      className="text-primary-600 hover:underline text-xs font-mono"
                    >
                      #{d.payment_in.id}
                      {d.payment_in.reference_no
                        ? ` (${d.payment_in.reference_no})`
                        : ''}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-purple-700">
                  {fmt$(d.payment_in_deduction_amount)}
                </td>
                <td className="py-2 px-3 text-xs text-gray-600">
                  {d.payment_in_deduction_remarks}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300">
              <td
                colSpan={2}
                className="py-2 px-3 text-sm font-semibold text-gray-700"
              >
                累計 Retention
              </td>
              <td className="py-2 px-3 text-right font-mono font-bold text-purple-800">
                {fmt$(totalRetention)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
