'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { paymentApplicationsApi, companyProfilesApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

// ─── Formatting helpers ───
// Accounting style: 1,234,567.89 / (1,234.56) for negative / "-" for zero
const fmtNum = (v: any): string => {
  const n = Number(v || 0);
  if (Math.abs(n) < 0.005) return '-';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
};
const fmtQty = (v: any): string => {
  const n = Number(v || 0);
  if (Math.abs(n) < 0.00005) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
// As at date: DD-MMM-YY (e.g. 30-May-26)
const fmtAsAt = (value: any): string => {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong', day: '2-digit', month: 'short', year: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')}`;
};
const pct = (rate: number): string => {
  const p = rate * 100;
  return p % 1 === 0 ? `${p.toFixed(0)}%` : `${p.toFixed(1)}%`;
};

export default function IpaPrintPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = Number(params.id);
  const paId = Number(params.paId);
  const [ipa, setIpa] = useState<any>(null);
  const [ipaList, setIpaList] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchIpa = useCallback(async () => {
    try {
      const res = await paymentApplicationsApi.get(contractId, paId);
      setIpa(res.data?.data);
      paymentApplicationsApi.list(contractId)
        .then(listRes => setIpaList(listRes.data?.data || []))
        .catch(() => setIpaList([]));
      companyProfilesApi.simple()
        .then(cpRes => {
          const profiles = cpRes.data?.data || cpRes.data || [];
          const first = Array.isArray(profiles) ? profiles[0] : null;
          if (first) setCompanyName(first.english_name || first.chinese_name || '');
        })
        .catch(() => setCompanyName(''));
    } catch {
      router.push(`/contracts/${contractId}`);
    } finally {
      setLoading(false);
    }
  }, [contractId, paId, router]);

  useEffect(() => { fetchIpa(); }, [fetchIpa]);

  if (loading || !ipa) return <div className="py-8 text-center text-gray-500">載入中...</div>;

  // ═══════════════════════════════════════════════════════════
  const advancePaymentAmount = Number(ipa.contract?.advance_payment_amount || 0);
  const advancePaymentRate = Number(ipa.contract?.advance_payment_rate || 0);
  const advanceReleaseRate = Number((ipa.contract?.advance_release_rate ?? ipa.contract?.advance_payment_rate) || 0);

  // Previously certified breakdowns (from the latest prior certified/paid IPA;
  // amounts on IPAs are cumulative, so the last prior IPA carries the totals)
  // ═══════════════════════════════════════════════════════════
  const priorIpas = (ipaList || [])
    .filter((row: any) =>
      row.status !== 'void' &&
      Number(row.pa_no || 0) < Number(ipa.pa_no || 0) &&
      ['certified', 'paid'].includes(row.status))
    .sort((a: any, b: any) => Number(a.pa_no || 0) - Number(b.pa_no || 0));
  const lastPrior = priorIpas.length > 0 ? priorIpas[priorIpas.length - 1] : null;

  const prevBqWorkDone = Number(lastPrior?.bq_work_done || 0);
  const prevVoWorkDone = Number(lastPrior?.vo_work_done || 0);
  const prevTotalWorkDone = prevBqWorkDone + prevVoWorkDone;
  const prevRetention = Number(lastPrior?.retention_amount || 0);
  const prevContraCharges = Number(lastPrior?.other_deductions || 0);
  // Advance payment principal is certified in full once granted (before/at first IPA)
  const prevAdvancePayment = advancePaymentAmount > 0 && lastPrior ? advancePaymentAmount : 0;

  // ═══════════════════════════════════════════════════════════
  // Payment Application (cumulative, current IPA) values
  // ═══════════════════════════════════════════════════════════
  const bqWorkDone = Number(ipa.bq_work_done || 0);
  const voWorkDone = Number(ipa.vo_work_done || 0);
  const totalWorkDone = bqWorkDone + voWorkDone;
  const retention = Number(ipa.retention_amount || 0);
  const contraCharges = Number(ipa.other_deductions || 0);

  const contractSum = Number(ipa.contract?.original_amount || 0);
  const hasAdvance = advancePaymentAmount > 0 && advancePaymentRate > 0;

  // Section 2 values (signed): 2.1 positive principal, 2.2 negative release
  // Release = -bqWorkDone × advance_release_rate（累計），與 Excel 公式一致
  const appAdvance = hasAdvance ? advancePaymentAmount : 0;
  const appRelease = hasAdvance ? -(bqWorkDone * advanceReleaseRate) : 0;
  const prevRelease = hasAdvance ? -(prevBqWorkDone * advanceReleaseRate) : 0;

  // Rows: { no, label, app, prev } — outstanding = app - prev; null = show "-"
  type SummaryRow = {
    no: string; label: string;
    app: number | null; prev: number | null;
    subtotal?: boolean; indentTotal?: boolean;
  };
  const rows: SummaryRow[] = [
    { no: '1.1)', label: 'VALUE OF MEASURED WORKDONE', app: bqWorkDone, prev: prevBqWorkDone },
    { no: '1.2)', label: 'VALUE OF VARIATION', app: voWorkDone, prev: prevVoWorkDone },
    { no: '1.3)', label: 'Daily', app: null, prev: null },
    { no: '', label: 'TOTAL VALUE OF WORKDONE  (1.1 to 1.3):', app: totalWorkDone, prev: prevTotalWorkDone, subtotal: true },
    { no: '2.1)', label: `Advance payment (${pct(advancePaymentRate)} of Contract Sum)`, app: hasAdvance ? appAdvance : null, prev: hasAdvance ? prevAdvancePayment : null },
    { no: '2.2)', label: `Release of Advance payment (${pct(advanceReleaseRate)} of Workdone)`, app: hasAdvance ? appRelease : null, prev: hasAdvance ? prevRelease : null },
    { no: '', label: 'SUBTOTAL  (2.1 to 2.2):', app: hasAdvance ? appAdvance + appRelease : null, prev: hasAdvance ? prevAdvancePayment + prevRelease : null, subtotal: true },
    { no: '3.1)', label: 'Retention', app: retention > 0 ? -retention : null, prev: prevRetention > 0 ? -prevRetention : null },
    { no: '3.2)', label: 'LESS RETENTION', app: null, prev: null },
    { no: '', label: 'SUBTOTAL  (3.1 to 3.2):', app: retention > 0 ? -retention : null, prev: prevRetention > 0 ? -prevRetention : null, subtotal: true },
    { no: '4)', label: 'Less Contra Charges', app: contraCharges > 0 ? -contraCharges : null, prev: prevContraCharges > 0 ? -prevContraCharges : null },
    { no: '', label: 'SUBTOTAL  (4):', app: contraCharges > 0 ? -contraCharges : null, prev: prevContraCharges > 0 ? -prevContraCharges : null, subtotal: true },
  ];

  // AMOUNT DUE = outstanding total: (workdone + advance section - retention - contra) app-minus-prev
  const appGrand = totalWorkDone + (hasAdvance ? appAdvance + appRelease : 0) - retention - contraCharges;
  const prevGrand = prevTotalWorkDone + (hasAdvance ? prevAdvancePayment + prevRelease : 0) - prevRetention - prevContraCharges;
  const amountDue = appGrand - prevGrand;

  const outstanding = (app: number | null, prev: number | null): number | null => {
    if (app === null && prev === null) return null;
    return Number(app || 0) - Number(prev || 0);
  };

  // ═══════════════════════════════════════════════════════════
  // BQ detail grouped by section
  // ═══════════════════════════════════════════════════════════
  const bqGrouped: Record<string, { section: any; items: any[] }> = {};
  (ipa.bq_progress || []).forEach((item: any) => {
    const sKey = item.bq_item?.section?.section_code || '_none';
    if (!bqGrouped[sKey]) {
      bqGrouped[sKey] = { section: item.bq_item?.section || { section_code: '', section_name: '未分類' }, items: [] };
    }
    bqGrouped[sKey].items.push(item);
  });

  const totalContractAmount = (ipa.bq_progress || []).reduce(
    (s: number, i: any) => s + Number(i.bq_item?.quantity || 0) * Number(i.unit_rate || 0), 0);
  const totalAppliedAmount = (ipa.bq_progress || []).reduce(
    (s: number, i: any) => s + Number(i.current_amount || 0), 0);

  // VO progress grouped by VO (kept as supplementary detail)
  const voGrouped: Record<string, { vo: any; items: any[] }> = {};
  (ipa.vo_progress || []).forEach((item: any) => {
    const voKey = item.vo_item?.variation_order?.vo_no || '_none';
    if (!voGrouped[voKey]) {
      voGrouped[voKey] = { vo: item.vo_item?.variation_order || { vo_no: '', title: '' }, items: [] };
    }
    voGrouped[voKey].items.push(item);
  });

  const projectTitle = ipa.contract?.description || ipa.contract?.contract_name || '';
  const subcontractWorks = ipa.contract?.contract_name || '';
  const paLine = `Payment Application No.${ipa.pa_no} (up to ${fmtDate(ipa.period_to)})`;

  const HeaderBlock = () => (
    <div className="mb-4 text-sm">
      <p className="font-bold leading-snug">{projectTitle}</p>
      {subcontractWorks && subcontractWorks !== projectTitle && (
        <p className="font-bold mt-2">{subcontractWorks}</p>
      )}
      <p className="font-bold underline mt-1">{paLine}</p>
    </div>
  );

  return (
    <div className="max-w-[1100px] mx-auto bg-white text-black">
      {/* Print toolbar */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button onClick={() => router.back()} className="btn-secondary text-sm">返回</button>
        <button onClick={() => window.print()} className="btn-primary text-sm">列印</button>
      </div>

      {/* ═══════════ PAGE 1 : PAYMENT SUMMARY ═══════════ */}
      <section className="ipa-page">
        <HeaderBlock />

        {/* Meta info */}
        <div className="flex justify-between text-sm mb-4">
          <table className="border-collapse">
            <tbody>
              <tr>
                <td className="pr-4 py-0.5 align-top whitespace-nowrap">Main-Contractor :</td>
                <td className="py-0.5 text-blue-800 font-medium">{ipa.contract?.client?.name || '-'}</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 align-top whitespace-nowrap">Subcontractor Name :</td>
                <td className="py-0.5 text-blue-800 font-medium">{companyName || '-'}</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 align-top whitespace-nowrap">Subcontract Works :</td>
                <td className="py-0.5 text-blue-800 font-medium max-w-[380px]">{subcontractWorks}</td>
              </tr>
            </tbody>
          </table>
          <table className="border-collapse self-start">
            <tbody>
              <tr>
                <td className="pr-4 py-0.5 whitespace-nowrap">Payment No. :</td>
                <td className="py-0.5 text-blue-800 font-medium text-right">{ipa.pa_no}</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 whitespace-nowrap">Payment Type :</td>
                <td className="py-0.5 text-blue-800 font-medium text-right">Interim</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 whitespace-nowrap">As at Date :</td>
                <td className="py-0.5 text-blue-800 font-medium text-right whitespace-nowrap">{fmtAsAt(ipa.period_to)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex text-sm mb-6">
          <span className="w-44">Subcontract Sum :</span>
          <span className="text-blue-800 font-medium">{fmtNum(contractSum)}</span>
        </div>

        {/* Summary table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="w-10"></th>
              <th></th>
              <th className="w-36 text-center font-bold underline pb-2 align-bottom leading-tight">Payment<br />Application</th>
              <th className="w-36 text-center font-bold underline pb-2 align-bottom leading-tight">Previously<br />Certified</th>
              <th className="w-40 text-center font-bold underline pb-2 align-bottom leading-tight">Outstanding Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const out = outstanding(row.app, row.prev);
              if (row.subtotal) {
                return (
                  <tr key={idx} className="font-bold">
                    <td className="py-1"></td>
                    <td className="py-1 text-right pr-2 bg-gray-200">{row.label}</td>
                    <td className="py-1 text-right px-2 bg-gray-200 font-mono border-t border-b border-gray-500">{row.app === null ? '-' : fmtNum(row.app)}</td>
                    <td className="py-1 text-right px-2 bg-gray-200 font-mono border-t border-b border-gray-500">{row.prev === null ? '-' : fmtNum(row.prev)}</td>
                    <td className="py-1 text-right px-2 bg-gray-200 font-mono border-t border-b border-gray-500">{out === null ? '-' : fmtNum(out)}</td>
                  </tr>
                );
              }
              return (
                <tr key={idx}>
                  <td className="py-1.5 align-top text-gray-800">{row.no}</td>
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right px-2 font-mono">{row.app === null ? '-' : fmtNum(row.app)}</td>
                  <td className="py-1.5 text-right px-2 font-mono">{row.prev === null ? '-' : fmtNum(row.prev)}</td>
                  <td className="py-1.5 text-right px-2 font-mono">{out === null ? '-' : fmtNum(out)}</td>
                </tr>
              );
            })}
            {/* Amount due */}
            <tr className="font-bold">
              <td className="pt-6"></td>
              <td className="pt-6"></td>
              <td className="pt-6"></td>
              <td className="pt-6 text-right pr-2 whitespace-nowrap">AMOUNT DUE :</td>
              <td className="pt-6 text-right px-2 font-mono border-t-2 border-b-4 border-double border-gray-800">{fmtNum(amountDue)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ═══════════ PAGE 2 : BQ DETAIL (Applied Workdone) ═══════════ */}
      {Object.keys(bqGrouped).length > 0 && (
        <section className="ipa-page ipa-page-break ipa-page-landscape">
          <div className="mb-3 text-xs">
            <p className="font-bold underline leading-snug">{projectTitle}</p>
            {subcontractWorks && subcontractWorks !== projectTitle && (
              <p className="font-bold underline">{subcontractWorks}</p>
            )}
            <p className="font-bold underline">{paLine}</p>
          </div>

          <table className="w-full text-xs border-collapse bq-table">
            <thead>
              <tr>
                <th colSpan={6} className="border border-gray-800 px-1 py-0.5"></th>
                <th colSpan={4} className="border border-gray-800 px-1 py-0.5 text-center font-bold">Applied Workdone</th>
              </tr>
              <tr>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'5%'}}>Item</th>
                <th className="border border-gray-800 px-1 py-1 text-center">Description</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Qty</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'4%'}}>Unit</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Rate</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'12%'}}>Amount</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Previous</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Current</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Accumulated</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'12%'}}>Amount (HK$)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bqGrouped).map(([sKey, group]) => (
                <React.Fragment key={`s-${sKey}`}>
                  {/* Section header spanning full width */}
                  <tr>
                    <td className="border-x border-gray-800 px-1 py-1"></td>
                    <td colSpan={9} className="border-x border-gray-800 px-1 py-1 font-bold underline">
                      {[group.section.section_code, group.section.section_name].filter(Boolean).join(' ')}
                    </td>
                  </tr>
                  {group.items.map((item: any) => {
                    const contractQty = Number(item.bq_item?.quantity || 0);
                    const rate = Number(item.unit_rate || 0);
                    const itemAmount = contractQty * rate;
                    return (
                      <tr key={item.id}>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-center align-top">{item.bq_item?.item_no}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 align-top whitespace-pre-wrap">{item.bq_item?.description}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtQty(contractQty)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-center align-top">{item.bq_item?.unit}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtNum(rate)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtNum(itemAmount)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtQty(item.prev_cumulative_qty)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtQty(item.this_period_qty)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtQty(item.current_cumulative_qty)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtNum(item.current_amount)}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
              {/* Filler row to push total to visual bottom feel is skipped for print flow */}
              <tr className="font-bold">
                <td className="border border-gray-800 px-1 py-1.5" colSpan={5}></td>
                <td className="border border-gray-800 px-1 py-1.5 text-right font-mono">{fmtNum(totalContractAmount)}</td>
                <td className="border border-gray-800 px-1 py-1.5" colSpan={3}></td>
                <td className="border border-gray-800 px-1 py-1.5 text-right font-mono">{fmtNum(totalAppliedAmount)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* ═══════════ PAGE 3 : VO DETAIL (if any) ═══════════ */}
      {Object.keys(voGrouped).length > 0 && (
        <section className="ipa-page ipa-page-break ipa-page-landscape">
          <div className="mb-3 text-xs">
            <p className="font-bold underline leading-snug">{projectTitle}</p>
            <p className="font-bold underline">{paLine} — Variation Orders</p>
          </div>

          <table className="w-full text-xs border-collapse bq-table">
            <thead>
              <tr>
                <th colSpan={6} className="border border-gray-800 px-1 py-0.5"></th>
                <th colSpan={4} className="border border-gray-800 px-1 py-0.5 text-center font-bold">Applied Workdone</th>
              </tr>
              <tr>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'5%'}}>Item</th>
                <th className="border border-gray-800 px-1 py-1 text-center">Description</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Qty</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'4%'}}>Unit</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Rate</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'12%'}}>Amount</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Previous</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Current</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'9%'}}>Accumulated</th>
                <th className="border border-gray-800 px-1 py-1 text-center" style={{width:'12%'}}>Amount (HK$)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(voGrouped).map(([voKey, group]) => (
                <React.Fragment key={`v-${voKey}`}>
                  <tr>
                    <td className="border-x border-gray-800 px-1 py-1"></td>
                    <td colSpan={9} className="border-x border-gray-800 px-1 py-1 font-bold underline">
                      {[group.vo.vo_no, group.vo.title].filter(Boolean).join(' - ')}
                    </td>
                  </tr>
                  {group.items.map((item: any) => {
                    const voQty = Number(item.vo_item?.quantity || 0);
                    const rate = Number(item.unit_rate || 0);
                    return (
                      <tr key={item.id}>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-center align-top">{item.vo_item?.item_no}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 align-top whitespace-pre-wrap">{item.vo_item?.description}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtQty(voQty)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-center align-top">{item.vo_item?.unit}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtNum(rate)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtNum(voQty * rate)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtQty(item.prev_cumulative_qty)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtQty(item.this_period_qty)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtQty(item.current_cumulative_qty)}</td>
                        <td className="border-x border-gray-800 px-1 py-1.5 text-right align-top font-mono">{fmtNum(item.current_amount)}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
              <tr className="font-bold">
                <td className="border border-gray-800 px-1 py-1.5" colSpan={5}></td>
                <td className="border border-gray-800 px-1 py-1.5 text-right font-mono">
                  {fmtNum((ipa.vo_progress || []).reduce((s: number, i: any) => s + Number(i.vo_item?.quantity || 0) * Number(i.unit_rate || 0), 0))}
                </td>
                <td className="border border-gray-800 px-1 py-1.5" colSpan={3}></td>
                <td className="border border-gray-800 px-1 py-1.5 text-right font-mono">{fmtNum(ipa.vo_work_done)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          nav, header, aside { display: none !important; }
          @page           { size: A4 portrait;  margin: 12mm; }
          @page landscape { size: A4 landscape; margin: 10mm; }
          .ipa-page-landscape { page: landscape; }
          .ipa-page-break { page-break-before: always; break-before: page; }
          .bq-table { page-break-inside: auto; }
          .bq-table tr { page-break-inside: avoid; }
          .bq-table thead { display: table-header-group; }
        }
      `}</style>
    </div>
  );
}
