'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { paymentApplicationsApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtQty = (v: any) => { const n = Number(v); return n % 1 === 0 ? n.toFixed(0) : n.toFixed(4).replace(/0+$/, ''); };

export default function IpaPrintPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = Number(params.id);
  const paId = Number(params.paId);
  const [ipa, setIpa] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchIpa = useCallback(async () => {
    try {
      const res = await paymentApplicationsApi.get(contractId, paId);
      setIpa(res.data?.data);
    } catch {
      router.push(`/contracts/${contractId}`);
    } finally {
      setLoading(false);
    }
  }, [contractId, paId, router]);

  useEffect(() => { fetchIpa(); }, [fetchIpa]);

  if (loading || !ipa) return <div className="py-8 text-center text-gray-500">載入中...</div>;

  const summaryRows = [
    { code: 'A', label: 'BQ 項目完工金額（累計）', value: Number(ipa.bq_work_done) },
    { code: 'B', label: '變更指令完工金額（累計）', value: Number(ipa.vo_work_done) },
    { code: 'C', label: '累計完工總額 (A + B)', value: Number(ipa.cumulative_work_done), bold: true },
    { code: 'D', label: '工地物料', value: Number(ipa.materials_on_site) },
    { code: 'E', label: '累計總額 (C + D)', value: Number(ipa.gross_amount), bold: true },
    { code: 'F', label: '保留金', value: Number(ipa.retention_amount), negative: true },
    { code: 'G', label: '扣除保留金後 (E - F)', value: Number(ipa.after_retention), bold: true },
    { code: 'H', label: '其他扣款', value: Number(ipa.other_deductions), negative: true },
    { code: 'I', label: '認證金額 (G - H)', value: Number(ipa.certified_amount), bold: true, highlight: true },
    { code: 'J', label: '上期認證金額', value: Number(ipa.prev_certified_amount), negative: true },
    { code: 'K', label: '當期應付金額 (I - J)', value: Number(ipa.current_due), bold: true, highlight: true },
  ];

  // Group BQ progress by section
  const bqGrouped: Record<string, { section: any; items: any[] }> = {};
  (ipa.bq_progress || []).forEach((item: any) => {
    const sKey = item.bq_item?.section?.section_code || '_none';
    if (!bqGrouped[sKey]) {
      bqGrouped[sKey] = { section: item.bq_item?.section || { section_code: '', section_name: '未分類' }, items: [] };
    }
    bqGrouped[sKey].items.push(item);
  });

  // Group VO progress by VO
  const voGrouped: Record<string, { vo: any; items: any[] }> = {};
  (ipa.vo_progress || []).forEach((item: any) => {
    const voKey = item.vo_item?.variation_order?.vo_no || '_none';
    if (!voGrouped[voKey]) {
      voGrouped[voKey] = { vo: item.vo_item?.variation_order || { vo_no: '', title: '' }, items: [] };
    }
    voGrouped[voKey].items.push(item);
  });

  return (
    <div className="max-w-[1100px] mx-auto bg-white">
      {/* Print toolbar */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button onClick={() => router.back()} className="btn-secondary text-sm">返回</button>
        <button onClick={() => window.print()} className="btn-primary text-sm">列印</button>
      </div>

      {/* ── Header ── */}
      <div className="text-center mb-6 border-b-2 border-gray-800 pb-4">
        <h1 className="text-xl font-bold">明達建築有限公司</h1>
        <h2 className="text-lg font-bold mt-1">MING TAT CONSTRUCTION LIMITED</h2>
        <h3 className="text-base font-semibold mt-3">期中付款申請 Interim Payment Application</h3>
      </div>

      {/* ── Info Grid ── */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-6">
        <div className="flex"><span className="w-28 font-semibold text-gray-600">IPA 編號：</span><span>{ipa.reference}</span></div>
        <div className="flex"><span className="w-28 font-semibold text-gray-600">合約編號：</span><span>{ipa.contract?.contract_no}</span></div>
        <div className="flex"><span className="w-28 font-semibold text-gray-600">期數：</span><span>第 {ipa.pa_no} 期</span></div>
        <div className="flex"><span className="w-28 font-semibold text-gray-600">合約名稱：</span><span>{ipa.contract?.contract_name}</span></div>
        <div className="flex"><span className="w-28 font-semibold text-gray-600">計糧截止：</span><span>{fmtDate(ipa.period_to)}</span></div>
        <div className="flex"><span className="w-28 font-semibold text-gray-600">客戶：</span><span>{ipa.contract?.client?.name || '-'}</span></div>
      </div>

      {/* ── Summary Table ── */}
      <div className="mb-6">
        <h4 className="text-sm font-bold mb-2 border-b border-gray-300 pb-1">金額匯總</h4>
        <table className="w-full text-sm border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left w-8"></th>
              <th className="border px-2 py-1 text-left">項目</th>
              <th className="border px-2 py-1 text-right w-40">金額 (HKD)</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map(row => (
              <tr key={row.code} className={row.highlight ? 'bg-blue-50' : row.bold ? 'bg-gray-50' : ''}>
                <td className="border px-2 py-1 text-gray-500 font-mono">{row.code}</td>
                <td className={`border px-2 py-1 ${row.bold ? 'font-semibold' : ''}`}>{row.label}</td>
                <td className={`border px-2 py-1 text-right font-mono ${row.bold ? 'font-semibold' : ''} ${row.negative ? 'text-red-600' : ''}`}>
                  {row.negative && row.value > 0 ? '(' : ''}{fmt$(Math.abs(row.value))}{row.negative && row.value > 0 ? ')' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── BQ Progress ── */}
      {Object.keys(bqGrouped).length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-bold mb-2 border-b border-gray-300 pb-1">BQ 項目進度</h4>
          <table className="w-full text-xs border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-1 py-1 text-left">項目</th>
                <th className="border px-1 py-1 text-left">描述</th>
                <th className="border px-1 py-1 text-center">單位</th>
                <th className="border px-1 py-1 text-right">合約數量</th>
                <th className="border px-1 py-1 text-right">單價</th>
                <th className="border px-1 py-1 text-right">上期累計</th>
                <th className="border px-1 py-1 text-right">本期累計</th>
                <th className="border px-1 py-1 text-right">本期數量</th>
                <th className="border px-1 py-1 text-right">累計金額</th>
                <th className="border px-1 py-1 text-right">本期金額</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bqGrouped).map(([sKey, group]) => (
                <>
                  <tr key={`s-${sKey}`} className="bg-blue-50">
                    <td colSpan={10} className="border px-1 py-1 font-semibold">{group.section.section_code} {group.section.section_name}</td>
                  </tr>
                  {group.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="border px-1 py-1">{item.bq_item?.item_no}</td>
                      <td className="border px-1 py-1 max-w-[200px] truncate">{item.bq_item?.description}</td>
                      <td className="border px-1 py-1 text-center">{item.bq_item?.unit}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmtQty(item.bq_item?.quantity)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmt$(item.unit_rate)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmtQty(item.prev_cumulative_qty)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmtQty(item.current_cumulative_qty)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmtQty(item.this_period_qty)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmt$(item.current_amount)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmt$(item.this_period_amount)}</td>
                    </tr>
                  ))}
                </>
              ))}
              <tr className="bg-blue-50 font-bold">
                <td colSpan={8} className="border px-1 py-1 text-right">BQ 合計 (A)</td>
                <td className="border px-1 py-1 text-right font-mono">{fmt$(ipa.bq_work_done)}</td>
                <td className="border px-1 py-1 text-right font-mono">
                  {fmt$((ipa.bq_progress || []).reduce((s: number, i: any) => s + Number(i.this_period_amount), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── VO Progress ── */}
      {Object.keys(voGrouped).length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-bold mb-2 border-b border-gray-300 pb-1">變更指令項目進度</h4>
          <table className="w-full text-xs border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-1 py-1 text-left">VO / 項目</th>
                <th className="border px-1 py-1 text-left">描述</th>
                <th className="border px-1 py-1 text-center">單位</th>
                <th className="border px-1 py-1 text-right">數量</th>
                <th className="border px-1 py-1 text-right">單價</th>
                <th className="border px-1 py-1 text-right">上期累計</th>
                <th className="border px-1 py-1 text-right">本期累計</th>
                <th className="border px-1 py-1 text-right">本期數量</th>
                <th className="border px-1 py-1 text-right">累計金額</th>
                <th className="border px-1 py-1 text-right">本期金額</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(voGrouped).map(([voKey, group]) => (
                <>
                  <tr key={`v-${voKey}`} className="bg-green-50">
                    <td colSpan={10} className="border px-1 py-1 font-semibold">{group.vo.vo_no} - {group.vo.title}</td>
                  </tr>
                  {group.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="border px-1 py-1">{item.vo_item?.item_no}</td>
                      <td className="border px-1 py-1 max-w-[200px] truncate">{item.vo_item?.description}</td>
                      <td className="border px-1 py-1 text-center">{item.vo_item?.unit}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmtQty(item.vo_item?.quantity)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmt$(item.unit_rate)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmtQty(item.prev_cumulative_qty)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmtQty(item.current_cumulative_qty)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmtQty(item.this_period_qty)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmt$(item.current_amount)}</td>
                      <td className="border px-1 py-1 text-right font-mono">{fmt$(item.this_period_amount)}</td>
                    </tr>
                  ))}
                </>
              ))}
              <tr className="bg-green-50 font-bold">
                <td colSpan={8} className="border px-1 py-1 text-right">VO 合計 (B)</td>
                <td className="border px-1 py-1 text-right font-mono">{fmt$(ipa.vo_work_done)}</td>
                <td className="border px-1 py-1 text-right font-mono">
                  {fmt$((ipa.vo_progress || []).reduce((s: number, i: any) => s + Number(i.this_period_amount), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Materials ── */}
      {(ipa.materials || []).length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-bold mb-2 border-b border-gray-300 pb-1">工地物料</h4>
          <table className="w-full text-xs border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-1 py-1 text-left">描述</th>
                <th className="border px-1 py-1 text-right w-32">金額 (HKD)</th>
                <th className="border px-1 py-1 text-left">備註</th>
              </tr>
            </thead>
            <tbody>
              {ipa.materials.map((m: any) => (
                <tr key={m.id}>
                  <td className="border px-1 py-1">{m.description}</td>
                  <td className="border px-1 py-1 text-right font-mono">{fmt$(m.amount)}</td>
                  <td className="border px-1 py-1">{m.remarks || '-'}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="border px-1 py-1 text-right">合計 (D)</td>
                <td className="border px-1 py-1 text-right font-mono">{fmt$(ipa.materials_on_site)}</td>
                <td className="border px-1 py-1"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Deductions ── */}
      {(ipa.deductions || []).length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-bold mb-2 border-b border-gray-300 pb-1">其他扣款</h4>
          <table className="w-full text-xs border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-1 py-1 text-left">類型</th>
                <th className="border px-1 py-1 text-left">描述</th>
                <th className="border px-1 py-1 text-right w-32">金額 (HKD)</th>
                <th className="border px-1 py-1 text-left">備註</th>
              </tr>
            </thead>
            <tbody>
              {ipa.deductions.map((d: any) => (
                <tr key={d.id}>
                  <td className="border px-1 py-1">{d.deduction_type}</td>
                  <td className="border px-1 py-1">{d.description}</td>
                  <td className="border px-1 py-1 text-right font-mono">{fmt$(d.amount)}</td>
                  <td className="border px-1 py-1">{d.remarks || '-'}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td colSpan={2} className="border px-1 py-1 text-right">合計 (H)</td>
                <td className="border px-1 py-1 text-right font-mono">{fmt$(ipa.other_deductions)}</td>
                <td className="border px-1 py-1"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Signature ── */}
      <div className="grid grid-cols-3 gap-8 mt-12 text-sm">
        <div className="text-center">
          <div className="border-b border-gray-400 mb-1 h-12"></div>
          <p className="text-gray-600">編製</p>
          <p className="text-xs text-gray-400">Prepared by</p>
        </div>
        <div className="text-center">
          <div className="border-b border-gray-400 mb-1 h-12"></div>
          <p className="text-gray-600">審核</p>
          <p className="text-xs text-gray-400">Checked by</p>
        </div>
        <div className="text-center">
          <div className="border-b border-gray-400 mb-1 h-12"></div>
          <p className="text-gray-600">批准</p>
          <p className="text-xs text-gray-400">Approved by</p>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          nav, header, aside { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
