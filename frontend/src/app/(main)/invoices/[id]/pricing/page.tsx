'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fieldOptionsApi, invoicesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const fmtMoney = (value: unknown) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BLANK = '(空白)';

type PivotDimension =
  | 'none'
  | 'company'
  | 'client'
  | 'contract'
  | 'quotation'
  | 'service_type'
  | 'day_night'
  | 'tonnage'
  | 'machine_type'
  | 'origin'
  | 'destination'
  | 'work_date';

interface Option { value: string; label: string; }

interface PricingGroup {
  key: string;
  company_id: number | null;
  client_id: number | null;
  client_contract_no: string | null;
  service_type: string | null;
  quotation_id: number | null;
  day_night: string | null;
  tonnage: string | null;
  machine_type: string | null;
  origin: string | null;
  destination: string | null;
  work_date: string | null;
  count: number;
}

interface InvoiceItemDraft {
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount?: number;
  sort_order?: number;
  matched?: boolean;
  rate_card_id?: number | null;
}

const DIMENSION_OPTIONS: Array<{ value: PivotDimension; label: string }> = [
  { value: 'none', label: '（無）— 空置' },
  { value: 'company', label: '公司' },
  { value: 'client', label: '客戶' },
  { value: 'contract', label: '合約' },
  { value: 'quotation', label: '報價單' },
  { value: 'service_type', label: '服務類型' },
  { value: 'day_night', label: '日夜班' },
  { value: 'tonnage', label: '噸數' },
  { value: 'machine_type', label: '機種' },
  { value: 'origin', label: '起點' },
  { value: 'destination', label: '終點' },
  { value: 'work_date', label: '工作日期' },
];

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function dateText(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  return text.slice(0, 10);
}

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function recordKey(values: unknown[]): string {
  return values.map((value) => normalizeText(value) || '').join('\u001f');
}

function axisKey(values: string[]): string {
  return values.join('\u001e') || '全部';
}

function rowAmount(item: InvoiceItemDraft): number {
  return Math.round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100) / 100;
}

function workLogMatchFields(workLog: any): Omit<PricingGroup, 'key' | 'count'> {
  return {
    company_id: numberOrNull(workLog.company_id),
    client_id: numberOrNull(workLog.client_id),
    client_contract_no: normalizeText(workLog.client_contract_no),
    service_type: normalizeText(workLog.service_type),
    quotation_id: numberOrNull(workLog.quotation_id),
    day_night: normalizeText(workLog.day_night),
    tonnage: normalizeText(workLog.tonnage),
    machine_type: normalizeText(workLog.machine_type),
    origin: normalizeText(workLog.start_location),
    destination: normalizeText(workLog.end_location),
    work_date: dateText(workLog.scheduled_date),
  };
}

function groupDescription(group: PricingGroup): string {
  const parts = [
    group.client_contract_no && `合約：${group.client_contract_no}`,
    group.service_type && `服務：${group.service_type}`,
    group.day_night && `班別：${group.day_night}`,
    group.tonnage && `噸數：${group.tonnage}`,
    group.machine_type && `機種：${group.machine_type}`,
    (group.origin || group.destination) && `路線：${group.origin || '—'} → ${group.destination || '—'}`,
    `筆數：${group.count}`,
  ].filter(Boolean);
  return parts.join('；');
}

function buildPricingGroups(workLogs: any[]): PricingGroup[] {
  const map = new Map<string, PricingGroup>();
  workLogs.forEach((workLog) => {
    const fields = workLogMatchFields(workLog);
    const key = recordKey([
      fields.company_id,
      fields.client_id,
      fields.client_contract_no,
      fields.service_type,
      fields.quotation_id,
      fields.day_night,
      fields.tonnage,
      fields.machine_type,
      fields.origin,
      fields.destination,
    ]);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.work_date && fields.work_date) existing.work_date = fields.work_date;
    } else {
      map.set(key, { key, ...fields, count: 1 });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key, 'zh-Hant'));
}

function dimensionValue(workLog: any, dimension: PivotDimension): string {
  switch (dimension) {
    case 'company':
      return normalizeText(workLog.company?.short_name) || normalizeText(workLog.company?.name) || (workLog.company_id ? `公司 #${workLog.company_id}` : BLANK);
    case 'client':
      return normalizeText(workLog.client?.short_name) || normalizeText(workLog.client?.name) || (workLog.client_id ? `客戶 #${workLog.client_id}` : BLANK);
    case 'contract':
      return normalizeText(workLog.client_contract_no) || BLANK;
    case 'quotation':
      return normalizeText(workLog.quotation?.quotation_no) || (workLog.quotation_id ? `報價單 #${workLog.quotation_id}` : BLANK);
    case 'service_type':
      return normalizeText(workLog.service_type) || BLANK;
    case 'day_night':
      return normalizeText(workLog.day_night) || BLANK;
    case 'tonnage':
      return normalizeText(workLog.tonnage) || BLANK;
    case 'machine_type':
      return normalizeText(workLog.machine_type) || BLANK;
    case 'origin':
      return normalizeText(workLog.start_location) || BLANK;
    case 'destination':
      return normalizeText(workLog.end_location) || BLANK;
    case 'work_date':
      return dateText(workLog.scheduled_date) || BLANK;
    default:
      return '全部';
  }
}

function AxisSelector({ title, fields, onChange }: { title: string; fields: PivotDimension[]; onChange: (fields: PivotDimension[]) => void }) {
  const normalized = fields.length > 0 ? fields : ['none' as PivotDimension];
  const updateAt = (index: number, value: PivotDimension) => {
    if (value === 'none') {
      onChange([]);
      return;
    }
    const next = normalized.filter((field) => field !== 'none');
    next[index] = value;
    onChange(next.filter((field, idx) => next.indexOf(field) === idx));
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 text-sm font-semibold text-gray-800">{title}</div>
      <div className="space-y-2">
        {normalized.map((field, index) => (
          <div key={`${title}-${index}`} className="flex gap-2">
            <select
              value={field}
              onChange={(event) => updateAt(index, event.target.value as PivotDimension)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {DIMENSION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {normalized.length > 1 && field !== 'none' && (
              <button type="button" onClick={() => onChange(normalized.filter((_, idx) => idx !== index && normalized[idx] !== 'none'))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
                移除
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...fields, DIMENSION_OPTIONS.find((option) => !fields.includes(option.value) && option.value !== 'none')?.value || 'company'])}
        className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        + 加入分組
      </button>
    </div>
  );
}

export default function InvoicePricingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = Number(params.id);
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('invoices');

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<any>(null);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [items, setItems] = useState<InvoiceItemDraft[]>([]);
  const [unitOptions, setUnitOptions] = useState<Option[]>([]);
  const [rowFields, setRowFields] = useState<PivotDimension[]>(['tonnage', 'machine_type', 'origin']);
  const [colFields, setColFields] = useState<PivotDimension[]>(['day_night']);
  const [matching, setMatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pricingRes, unitsRes] = await Promise.all([
        invoicesApi.getPricingData(invoiceId),
        fieldOptionsApi.getByCategory('wage_unit').catch(() => ({ data: [] })),
      ]);
      setInvoice(pricingRes.data.invoice);
      setWorkLogs(pricingRes.data.work_logs || []);
      setItems((pricingRes.data.items || []).map((item: any, idx: number) => ({
        item_name: item.item_name || '',
        description: item.description || '',
        quantity: Number(item.quantity) || 0,
        unit: item.unit || '',
        unit_price: Number(item.unit_price) || 0,
        amount: Number(item.amount) || 0,
        sort_order: item.sort_order || idx + 1,
      })));
      setUnitOptions((unitsRes.data || []).map((option: any) => ({ value: option.label || option.value || '', label: option.label || option.value || '' })).filter((option: Option) => option.value));
    } catch (err: any) {
      alert(err.response?.data?.message || '讀取計價資料失敗');
      router.push(`/invoices/${invoiceId}/prepare`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (invoiceId) loadData();
  }, [invoiceId]);

  const pricingGroups = useMemo(() => buildPricingGroups(workLogs), [workLogs]);

  const pivot = useMemo(() => {
    const rowMap = new Map<string, { key: string; labels: string[]; count: number }>();
    const colMap = new Map<string, { key: string; labels: string[]; count: number }>();
    const data = new Map<string, number>();

    workLogs.forEach((workLog) => {
      const rowLabels = rowFields.length ? rowFields.map((field) => dimensionValue(workLog, field)) : ['全部'];
      const colLabels = colFields.length ? colFields.map((field) => dimensionValue(workLog, field)) : ['全部'];
      const rKey = axisKey(rowLabels);
      const cKey = axisKey(colLabels);
      rowMap.set(rKey, { key: rKey, labels: rowLabels, count: (rowMap.get(rKey)?.count || 0) + 1 });
      colMap.set(cKey, { key: cKey, labels: colLabels, count: (colMap.get(cKey)?.count || 0) + 1 });
      data.set(`${rKey}|${cKey}`, (data.get(`${rKey}|${cKey}`) || 0) + 1);
    });

    const rows = Array.from(rowMap.values()).sort((a, b) => a.labels.join(' / ').localeCompare(b.labels.join(' / '), 'zh-Hant'));
    const cols = Array.from(colMap.values()).sort((a, b) => a.labels.join(' / ').localeCompare(b.labels.join(' / '), 'zh-Hant'));
    return { rows, cols, data };
  }, [workLogs, rowFields, colFields]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + rowAmount(item), 0);
    return { subtotal, count: items.length };
  }, [items]);

  const updateItem = (index: number, field: keyof InvoiceItemDraft, value: string | number) => {
    setItems((current) => current.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
  };

  const addItem = () => {
    setItems((current) => [...current, { item_name: '', description: '', quantity: 1, unit: 'JOB', unit_price: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, idx) => idx !== index));
  };

  const handleMatchRates = async () => {
    if (pricingGroups.length === 0) {
      alert('沒有可配對的工作紀錄分組');
      return;
    }
    setMatching(true);
    try {
      const res = await invoicesApi.matchRates(invoiceId, { groups: pricingGroups });
      const results = res.data.results || [];
      setMatchResults(results);
      setItems(results.map((result: any, idx: number) => ({
        item_name: result.item_name || '發票項目',
        description: result.matched ? groupDescription(result) : `未配對價目表；${groupDescription(result)}`,
        quantity: Number(result.quantity ?? result.count) || 0,
        unit: result.unit || 'JOB',
        unit_price: Number(result.unit_price) || 0,
        sort_order: idx + 1,
        matched: Boolean(result.matched),
        rate_card_id: result.rate_card_id || null,
      })));
    } catch (err: any) {
      alert(err.response?.data?.message || '配對價目表失敗');
    } finally {
      setMatching(false);
    }
  };

  const handleSaveItems = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await invoicesApi.updateItems(invoiceId, {
        items: items.map((item, idx) => ({
          item_name: item.item_name || null,
          description: item.description || null,
          quantity: Number(item.quantity) || 0,
          unit: item.unit || null,
          unit_price: Number(item.unit_price) || 0,
          amount: rowAmount(item),
          sort_order: idx + 1,
        })),
      });
      alert('Invoice Items 已更新');
      router.push(`/invoices/${invoiceId}`);
    } catch (err: any) {
      alert(err.response?.data?.message || '確認生成失敗');
    } finally {
      setSaving(false);
    }
  };

  const unmatchedCount = matchResults.filter((result) => !result.matched).length;

  if (loading) {
    return <div className="p-6 text-gray-500">載入計價資料中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 text-sm text-gray-500">
            <Link href={`/invoices/${invoiceId}/prepare`} className="text-blue-600 hover:underline">Step A 整理資料</Link>
            <span className="mx-2">/</span>
            <span>Step B 配對價目與生成項目</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">發票計價：{invoice?.invoice_no || `#${invoiceId}`}</h1>
          <p className="mt-1 text-sm text-gray-600">左側以工作紀錄筆數進行樞紐分析；右側將 10 欄位組合配對 RateCard 並產生 Invoice Items。</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/invoices/${invoiceId}`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">返回發票</Link>
          <button onClick={loadData} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">重新整理</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(460px,0.85fr)]">
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Pivot Table</h2>
                <p className="text-sm text-gray-500">值固定為工作紀錄筆數，共 {workLogs.length} 筆。</p>
              </div>
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">10 欄位組合：{pricingGroups.length} 組</div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <AxisSelector title="列軸" fields={rowFields} onChange={setRowFields} />
              <AxisSelector title="欄軸" fields={colFields} onChange={setColFields} />
            </div>
          </div>

          <div className="overflow-auto p-4">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700">{rowFields.length ? rowFields.map((field) => DIMENSION_OPTIONS.find((option) => option.value === field)?.label).join(' / ') : '全部'}</th>
                  {pivot.cols.map((col) => <th key={col.key} className="whitespace-nowrap border border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700">{col.labels.join(' / ')}</th>)}
                  <th className="whitespace-nowrap border border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700">總計</th>
                </tr>
              </thead>
              <tbody>
                {pivot.rows.length === 0 && (
                  <tr><td className="border border-gray-200 px-3 py-8 text-center text-gray-500" colSpan={Math.max(2, pivot.cols.length + 2)}>尚未連結工作紀錄</td></tr>
                )}
                {pivot.rows.map((row) => (
                  <tr key={row.key} className="hover:bg-blue-50/40">
                    <th className="sticky left-0 z-10 max-w-xs border border-gray-200 bg-white px-3 py-2 text-left font-medium text-gray-800">{row.labels.join(' / ')}</th>
                    {pivot.cols.map((col) => {
                      const count = pivot.data.get(`${row.key}|${col.key}`) || 0;
                      return <td key={`${row.key}-${col.key}`} className="border border-gray-200 px-3 py-2 text-center tabular-nums text-gray-800">{count || '—'}</td>;
                    })}
                    <td className="border border-gray-200 bg-gray-50 px-3 py-2 text-center font-semibold tabular-nums text-gray-900">{row.count}</td>
                  </tr>
                ))}
              </tbody>
              {pivot.rows.length > 0 && (
                <tfoot>
                  <tr>
                    <th className="sticky left-0 z-10 border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-800">總計</th>
                    {pivot.cols.map((col) => <td key={`total-${col.key}`} className="border border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold tabular-nums text-gray-900">{col.count}</td>)}
                    <td className="border border-gray-200 bg-gray-100 px-3 py-2 text-center font-bold tabular-nums text-gray-900">{workLogs.length}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Invoice Items 編輯器</h2>
                <p className="text-sm text-gray-500">配對只會更新右側草稿；按「確認生成」才會寫入 InvoiceItems。</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleMatchRates} disabled={matching || workLogs.length === 0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                  {matching ? '配對中...' : '配對價目表'}
                </button>
                <button onClick={handleSaveItems} disabled={saving || readOnly} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                  {saving ? '寫入中...' : '確認生成'}
                </button>
              </div>
            </div>
            {matchResults.length > 0 && (
              <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${unmatchedCount > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-700'}`}>
                已完成配對：成功 {matchResults.length - unmatchedCount} 組，未配對 {unmatchedCount} 組。未配對項目會以 $0 單價保留，請人工修正後再確認生成。
              </div>
            )}
          </div>

          <div className="overflow-auto p-4">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">項目</th>
                  <th className="px-2 py-2">描述</th>
                  <th className="w-24 px-2 py-2 text-right">數量</th>
                  <th className="w-28 px-2 py-2">單位</th>
                  <th className="w-28 px-2 py-2 text-right">單價</th>
                  <th className="w-28 px-2 py-2 text-right">金額</th>
                  <th className="w-16 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">尚未有項目。可先按「配對價目表」自動產生，或手動新增。</td></tr>}
                {items.map((item, index) => (
                  <tr key={index} className={item.matched === false ? 'bg-yellow-50/60' : ''}>
                    <td className="min-w-[150px] px-2 py-2 align-top">
                      <input value={item.item_name} onChange={(event) => updateItem(index, 'item_name', event.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                    </td>
                    <td className="min-w-[220px] px-2 py-2 align-top">
                      <textarea value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input type="number" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', Number(event.target.value))} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm" />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input list="pricing-unit-options" value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input type="number" value={item.unit_price} onChange={(event) => updateItem(index, 'unit_price', Number(event.target.value))} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm" />
                    </td>
                    <td className="px-2 py-2 text-right align-top font-semibold tabular-nums text-gray-900">{fmtMoney(rowAmount(item))}</td>
                    <td className="px-2 py-2 align-top">
                      <button onClick={() => removeItem(index)} disabled={readOnly} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-400">刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-2 py-3 text-right font-semibold text-gray-700">小計（{totals.count} 項）</td>
                  <td className="px-2 py-3 text-right font-bold tabular-nums text-gray-900">{fmtMoney(totals.subtotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <datalist id="pricing-unit-options">
              {unitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </datalist>
            <button onClick={addItem} disabled={readOnly} className="mt-4 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400">
              + 手動新增項目
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
