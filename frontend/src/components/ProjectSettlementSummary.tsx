'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { projectFinanceApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

// Accounting style: 1,234,567.89 / (1,234.56) for negative / "-" for zero
const fmtNum = (v: any): string => {
  const n = Number(v || 0);
  if (Math.abs(n) < 0.005) return '-';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
};
const pct = (rate: number): string => {
  const p = rate * 100;
  return p % 1 === 0 ? `${p.toFixed(0)}%` : `${p.toFixed(1)}%`;
};

type SummaryRow = {
  no: string;
  label: string;
  app: number | null; // Payment Application (latest cumulative)
  prev: number | null; // Previously Certified (cumulative)
  perIpa: (number | null)[]; // per-IPA values (cumulative per period, or per-period diff)
  subtotal?: boolean;
};

export default function ProjectSettlementSummary({ projectId }: { projectId: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contract, setContract] = useState<any>(null);
  const [ipas, setIpas] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    projectFinanceApi
      .settlementSummary(projectId)
      .then((res) => {
        setContract(res.data?.contract || null);
        setIpas(res.data?.ipas || []);
        setError('');
      })
      .catch((err: any) => {
        setError(err?.response?.data?.message || '載入結算匯總失敗');
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const computed = useMemo(() => {
    if (!contract || ipas.length === 0) return null;

    const advancePaymentAmount = Number(contract.advance_payment_amount || 0);
    const advancePaymentRate = Number(contract.advance_payment_rate || 0);
    const advanceReleaseRate = Number(
      (contract.advance_release_rate ?? contract.advance_payment_rate) || 0,
    );
    const retentionRate = Number(contract.retention_rate || 0);
    const hasAdvance = advancePaymentAmount > 0 && advancePaymentRate > 0;
    const contractSum = Number(contract.original_amount || 0);

    // Sort by pa_no asc; latest IPA = Payment Application column
    const sorted = [...ipas].sort((a, b) => Number(a.pa_no || 0) - Number(b.pa_no || 0));
    const latest = sorted[sorted.length - 1];

    // Previously certified = last certified/paid IPA prior to the latest one
    const priorCertified = sorted.filter(
      (row) =>
        Number(row.pa_no || 0) < Number(latest.pa_no || 0) &&
        ['certified', 'partially_paid', 'paid'].includes(row.status),
    );
    const lastPrior = priorCertified.length > 0 ? priorCertified[priorCertified.length - 1] : null;

    // ── Payment Application (latest cumulative) ──
    const bqWorkDone = Number(latest.bq_work_done || 0);
    const voWorkDone = Number(latest.vo_work_done || 0);
    const totalWorkDone = bqWorkDone + voWorkDone;
    const retention = Number(latest.retention_amount || 0);
    const contraCharges = Number(latest.other_deductions || 0);
    const appAdvance = hasAdvance ? advancePaymentAmount : 0;
    const appRelease = hasAdvance ? -(bqWorkDone * advanceReleaseRate) : 0;

    // ── Previously Certified (cumulative from last prior certified IPA) ──
    const prevBqWorkDone = Number(lastPrior?.bq_work_done || 0);
    const prevVoWorkDone = Number(lastPrior?.vo_work_done || 0);
    const prevTotalWorkDone = prevBqWorkDone + prevVoWorkDone;
    const prevRetention = Number(lastPrior?.retention_amount || 0);
    const prevContraCharges = Number(lastPrior?.other_deductions || 0);
    // 2.1 Advance Payment: previously certified always = full advance amount (one-off)
    const prevAdvancePayment = hasAdvance ? advancePaymentAmount : 0;
    const prevRelease = hasAdvance ? -(prevBqWorkDone * advanceReleaseRate) : 0;

    // ── Per-IPA breakdown (each certified prior period, cumulative values) ──
    // Expanded view shows per-IPA columns; per-row value uses each IPA's cumulative amounts
    const perIpaList = priorCertified;
    const perIpaValues = (fn: (ipa: any, idx: number) => number | null): (number | null)[] =>
      perIpaList.map((row, idx) => fn(row, idx));

    // For expanded breakdown, show each period's incremental (current_due-style) contribution
    // per row: this period cumulative − previous period cumulative
    const inc = (get: (ipa: any) => number) =>
      perIpaValues((row, idx) => {
        const cur = get(row);
        const before = idx > 0 ? get(perIpaList[idx - 1]) : 0;
        const diff = cur - before;
        return Math.abs(diff) < 0.005 && Math.abs(cur) < 0.005 ? null : diff;
      });

    const perBq = inc((r) => Number(r.bq_work_done || 0));
    const perVo = inc((r) => Number(r.vo_work_done || 0));
    const perTotal = inc((r) => Number(r.bq_work_done || 0) + Number(r.vo_work_done || 0));
    // 2.1 Advance: full amount certified at first period only
    const perAdvance = perIpaValues((_, idx) =>
      hasAdvance ? (idx === 0 ? advancePaymentAmount : null) : null,
    );
    const perRelease = hasAdvance
      ? inc((r) => -(Number(r.bq_work_done || 0) * advanceReleaseRate))
      : perIpaValues(() => null);
    const perAdvSubtotal = perIpaValues((_, idx) => {
      if (!hasAdvance) return null;
      const a = idx === 0 ? advancePaymentAmount : 0;
      const rel = perRelease[idx] || 0;
      const v = a + rel;
      return Math.abs(v) < 0.005 ? null : v;
    });
    const perRetention = inc((r) => -Number(r.retention_amount || 0));
    const perRetSubtotal = perRetention;
    const perContra = inc((r) => -Number(r.other_deductions || 0));
    const perContraSubtotal = perContra;
    const perNull = perIpaValues(() => null);

    const rows: SummaryRow[] = [
      { no: '1.1)', label: '已完成工程價値 Value of Measured Workdone', app: bqWorkDone, prev: prevBqWorkDone, perIpa: perBq },
      { no: '1.2)', label: '更改工程價値 Value of Variation', app: voWorkDone, prev: prevVoWorkDone, perIpa: perVo },
      { no: '1.3)', label: '日工 Daily', app: null, prev: null, perIpa: perNull },
      { no: '', label: '工程總値 Total Value of Workdone  (1.1 to 1.3):', app: totalWorkDone, prev: prevTotalWorkDone, perIpa: perTotal, subtotal: true },
      { no: '2.1)', label: `預付款（合約金額${pct(advancePaymentRate)}）Advance Payment (${pct(advancePaymentRate)} of Contract Sum)`, app: hasAdvance ? appAdvance : null, prev: hasAdvance ? prevAdvancePayment : null, perIpa: perAdvance },
      { no: '2.2)', label: `扣回預付款（已完工程${pct(advanceReleaseRate)}）Release of Advance Payment (${pct(advanceReleaseRate)} of Workdone)`, app: hasAdvance ? appRelease : null, prev: hasAdvance ? prevRelease : null, perIpa: perRelease },
      { no: '', label: '小計 Subtotal  (2.1 to 2.2):', app: hasAdvance ? appAdvance + appRelease : null, prev: hasAdvance ? prevAdvancePayment + prevRelease : null, perIpa: perAdvSubtotal, subtotal: true },
      { no: '3.1)', label: `保留金${retentionRate ? `（工程總値${pct(retentionRate)}）` : ''} Retention`, app: retention > 0 ? -retention : null, prev: prevRetention > 0 ? -prevRetention : null, perIpa: perRetention },
      { no: '3.2)', label: '扣減保留金 Less Retention', app: null, prev: null, perIpa: perNull },
      { no: '', label: '小計 Subtotal  (3.1 to 3.2):', app: retention > 0 ? -retention : null, prev: prevRetention > 0 ? -prevRetention : null, perIpa: perRetSubtotal, subtotal: true },
      { no: '4)', label: '扣減對沖費用 Less Contra Charges', app: contraCharges > 0 ? -contraCharges : null, prev: prevContraCharges > 0 ? -prevContraCharges : null, perIpa: perContra },
      { no: '', label: '小計 Subtotal  (4):', app: contraCharges > 0 ? -contraCharges : null, prev: prevContraCharges > 0 ? -prevContraCharges : null, perIpa: perContraSubtotal, subtotal: true },
    ];

    const appGrand = totalWorkDone + (hasAdvance ? appAdvance + appRelease : 0) - retention - contraCharges;
    const prevGrand = prevTotalWorkDone + (hasAdvance ? prevAdvancePayment + prevRelease : 0) - prevRetention - prevContraCharges;
    const amountDue = appGrand - prevGrand;

    // Per-IPA amount due (each period's current_due for footer reference)
    const perDue = perIpaValues((row) => {
      const v = Number(row.client_current_due ?? row.current_due ?? 0);
      return Math.abs(v) < 0.005 ? null : v;
    });

    return {
      contractSum,
      latest,
      perIpaList,
      rows,
      amountDue,
      perDue,
    };
  }, [contract, ipas]);

  if (loading) {
    return <div className="py-10 text-center text-gray-500 text-sm">載入中...</div>;
  }
  if (error) {
    return <div className="py-10 text-center text-red-500 text-sm">{error}</div>;
  }
  if (!contract) {
    return <div className="py-10 text-center text-gray-400 text-sm">此工程尚未關聯合約，暫無結算資料。</div>;
  }
  if (!computed) {
    return <div className="py-10 text-center text-gray-400 text-sm">此合約暫無 IPA 記錄。</div>;
  }

  const { contractSum, latest, perIpaList, rows, amountDue, perDue } = computed;
  const outstanding = (app: number | null, prev: number | null): number | null => {
    if (app === null && prev === null) return null;
    return Number(app || 0) - Number(prev || 0);
  };
  const prevColSpan = expanded ? perIpaList.length + 1 : 1;

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <h2 className="text-lg font-bold text-gray-900">結算匯總 Settlement Summary</h2>
        <div className="text-sm text-gray-500 text-right">
          <div>
            最新期數 Payment No. <span className="font-semibold text-gray-900">{latest.pa_no}</span>
            {' ・ '}截至 As at {fmtDate(latest.period_to)}
          </div>
          <div>
            合約金額 Contract Sum{' '}
            <span className="font-semibold text-gray-900 font-mono">{fmtNum(contractSum)}</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600">
              <th className="px-3 py-2 text-left font-medium w-12"></th>
              <th className="px-3 py-2 text-left font-medium"></th>
              <th className="px-3 py-2 text-right font-medium w-40">
                付款申請
                <br />
                <span className="font-normal text-xs">Payment Application</span>
              </th>
              {expanded &&
                perIpaList.map((row: any) => (
                  <th key={row.id} className="px-3 py-2 text-right font-medium w-32 bg-amber-50/70">
                    <Link
                      href={`/contracts/${contract.id}/pa/${row.id}`}
                      className="text-primary-600 hover:underline"
                    >
                      IPA{row.pa_no}
                    </Link>
                    <br />
                    <span className="font-normal text-xs">{fmtDate(row.period_to)}</span>
                  </th>
                ))}
              <th className="px-3 py-2 text-right font-medium w-40 bg-amber-50">
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="inline-flex items-center gap-1 hover:text-primary-600"
                  title={expanded ? '收起各期明細' : '展開各期明細'}
                >
                  已認證
                  <span className="text-xs">{expanded ? '◀' : '▶'}</span>
                </button>
                <br />
                <span className="font-normal text-xs">Previously Certified</span>
              </th>
              <th className="px-3 py-2 text-right font-medium w-44">
                未付金額
                <br />
                <span className="font-normal text-xs">Outstanding Amount</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => {
              const out = outstanding(row.app, row.prev);
              const baseCls = row.subtotal
                ? 'bg-gray-100 font-semibold text-gray-900'
                : '';
              const numCls = row.subtotal
                ? 'px-3 py-2 text-right font-mono border-t border-b border-gray-300'
                : 'px-3 py-2 text-right font-mono text-gray-800';
              return (
                <tr key={idx} className={baseCls}>
                  <td className="px-3 py-2 align-top text-gray-500">{row.no}</td>
                  <td className={row.subtotal ? 'px-3 py-2 text-right pr-4' : 'px-3 py-2 text-gray-700'}>
                    {row.label}
                  </td>
                  <td className={numCls}>{row.app === null ? '-' : fmtNum(row.app)}</td>
                  {expanded &&
                    row.perIpa.map((v, i) => (
                      <td key={i} className={`${numCls} bg-amber-50/40 text-gray-600`}>
                        {v === null ? '-' : fmtNum(v)}
                      </td>
                    ))}
                  <td className={`${numCls} bg-amber-50/60`}>
                    {row.prev === null ? '-' : fmtNum(row.prev)}
                  </td>
                  <td className={numCls}>{out === null ? '-' : fmtNum(out)}</td>
                </tr>
              );
            })}
            {/* Per-IPA current due reference row (only when expanded) */}
            {expanded && (
              <tr className="text-xs text-gray-500">
                <td className="px-3 py-2" colSpan={3}>
                  <span className="italic">各期應付 Current Due（當期實際認證/申請金額）</span>
                </td>
                {perDue.map((v, i) => (
                  <td key={i} className="px-3 py-2 text-right font-mono bg-amber-50/40">
                    {v === null ? '-' : fmtNum(v)}
                  </td>
                ))}
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2"></td>
              </tr>
            )}
            {/* Amount due */}
            <tr className="font-bold text-gray-900">
              <td className="px-3 pt-5 pb-2" colSpan={1 + prevColSpan}></td>
              <td className="px-3 pt-5 pb-2 text-right whitespace-nowrap">應付金額 Amount Due :</td>
              <td className="px-3 pt-5 pb-2 text-right font-mono bg-blue-50 border-t-2 border-b-4 border-double border-blue-300 text-blue-900">
                {fmtNum(amountDue)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* IPA list reference */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">IPA 記錄</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-500">
                <th className="px-3 py-2 text-left">期數</th>
                <th className="px-3 py-2 text-left">編號</th>
                <th className="px-3 py-2 text-left">截止日期</th>
                <th className="px-3 py-2 text-right">累計工程總値</th>
                <th className="px-3 py-2 text-right">累計認證金額</th>
                <th className="px-3 py-2 text-right">當期應付</th>
                <th className="px-3 py-2 text-left">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...ipas]
                .sort((a: any, b: any) => Number(a.pa_no || 0) - Number(b.pa_no || 0))
                .map((row: any) => {
                  const statusLabels: Record<string, string> = {
                    draft: '草稿', submitted: '已提交', certified: '已認證',
                    partially_paid: '部分收款', paid: '已收款', void: '已作廢',
                  };
                  const statusColors: Record<string, string> = {
                    draft: 'bg-gray-100 text-gray-700',
                    submitted: 'bg-blue-100 text-blue-700',
                    certified: 'bg-green-100 text-green-700',
                    partially_paid: 'bg-yellow-100 text-yellow-700',
                    paid: 'bg-purple-100 text-purple-700',
                    void: 'bg-red-100 text-red-700',
                  };
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">IPA{row.pa_no}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/contracts/${contract.id}/pa/${row.id}`}
                          className="font-mono text-primary-600 hover:underline"
                        >
                          {row.reference}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{fmtDate(row.period_to)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmtNum(Number(row.bq_work_done || 0) + Number(row.vo_work_done || 0))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmtNum(row.client_certified_amount ?? row.certified_amount)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmtNum(row.client_current_due ?? row.current_due)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[row.status] || 'bg-gray-100 text-gray-700'}`}>
                          {statusLabels[row.status] || row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
