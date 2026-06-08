'use client';

import { useEffect, useState } from 'react';
import DateInput from '@/components/DateInput';
import { invoiceStatementsApi } from '@/lib/api';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

const fmt$ = (v: any) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  issued: '已發出',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  issued: '已開立',
  partially_paid: '部分收款',
  paid: '已收清',
  void: '已作廢',
};

function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children || <span className="text-gray-400">—</span>}</dd>
    </div>
  );
}

export default function InvoiceStatementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const statementId = Number(id);
  const { isReadOnly } = useAuth();
  const [statement, setStatement] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const parseOtherCharges = (value: any) => {
    if (Array.isArray(value)) return value;
    return [];
  };

  const loadStatement = async () => {
    setLoading(true);
    try {
      const res = await invoiceStatementsApi.get(statementId);
      const data = res.data;
      const otherCharges = parseOtherCharges(data.statement_other_charges);
      setStatement(data);
      setForm({
        statement_title: data.statement_title || '',
        statement_status: data.statement_status || 'draft',
        period_start: toInputDate(data.statement_period_start),
        period_end: toInputDate(data.statement_period_end),
        remarks: data.statement_remarks || '',
        other_charges: otherCharges.length ? otherCharges.map((c: any) => ({ name: c.name || '', amount: String(c.amount || '') })) : [],
      });
    } catch {
      router.push('/invoice-statements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatement();
  }, [statementId]);

  const save = async () => {
    setSaving(true);
    try {
      await invoiceStatementsApi.update(statementId, {
        statement_title: form.statement_title || undefined,
        statement_status: form.statement_status,
        period_start: form.period_start,
        period_end: form.period_end,
        remarks: form.remarks || undefined,
        other_charges: (form.other_charges || [])
          .map((charge: any) => ({ name: String(charge.name || '').trim(), amount: Number(charge.amount || 0) }))
          .filter((charge: any) => charge.name || charge.amount !== 0),
      });
      setEditing(false);
      await loadStatement();
    } catch (error: any) {
      alert(error.response?.data?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await invoiceStatementsApi.exportPdf(statementId);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${statement?.statement_no || 'invoice-statement'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(error.response?.data?.message || '下載 PDF 失敗');
    } finally {
      setPdfLoading(false);
    }
  };

  const remove = async () => {
    if (!confirm('確定要刪除此發票清單？')) return;
    try {
      await invoiceStatementsApi.delete(statementId);
      router.push('/invoice-statements');
    } catch (error: any) {
      alert(error.response?.data?.message || '刪除失敗');
    }
  };

  const updateCharge = (index: number, patch: Record<string, any>) => {
    setForm((prev: any) => {
      const next = [...(prev.other_charges || [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, other_charges: next };
    });
  };

  const addCharge = () => setForm((prev: any) => ({ ...prev, other_charges: [...(prev.other_charges || []), { name: '', amount: '' }] }));
  const removeCharge = (index: number) => setForm((prev: any) => ({ ...prev, other_charges: (prev.other_charges || []).filter((_: any, i: number) => i !== index) }));

  if (loading) {
    return <div className="p-6 text-gray-500">載入中...</div>;
  }

  if (!statement) return null;

  const items = statement.items || [];
  const otherCharges = parseOtherCharges(statement.statement_other_charges);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/invoice-statements" className="mb-2 inline-block text-sm text-primary-600 hover:text-primary-700">← 返回客戶發票清單</Link>
          <h1 className="text-2xl font-bold text-gray-900">{statement.statement_no}</h1>
          <p className="mt-1 text-sm text-gray-500">{statement.statement_title || '未命名發票清單'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/invoice-statements/${statementId}/pdf-preview`} target="_blank" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">PDF 預覽</Link>
          <button onClick={downloadPdf} disabled={pdfLoading} className="rounded-lg border border-primary-600 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50">{pdfLoading ? '下載中...' : '下載 PDF'}</button>
          {!isReadOnly && !editing && <button onClick={() => setEditing(true)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">編輯</button>}
          {!isReadOnly && <button onClick={remove} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">刪除</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">清單資料</h2>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{STATUS_LABELS[statement.statement_status] || statement.statement_status}</span>
            </div>

            {!editing ? (
              <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="標題">{statement.statement_title}</Field>
                <Field label="狀態">{STATUS_LABELS[statement.statement_status] || statement.statement_status}</Field>
                <Field label="公司">{statement.company?.name}</Field>
                <Field label="客戶">{statement.client?.code ? `${statement.client.code} - ${statement.client.name}` : statement.client?.name}</Field>
                <Field label="期間開始">{fmtDate(statement.statement_period_start)}</Field>
                <Field label="期間結束">{fmtDate(statement.statement_period_end)}</Field>
                <Field label="發票數量">{statement.statement_invoice_count}</Field>
                <Field label="備註">{statement.statement_remarks}</Field>
              </dl>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">標題</label>
                    <input value={form.statement_title} onChange={(e) => setForm((prev: any) => ({ ...prev, statement_title: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">狀態</label>
                    <select value={form.statement_status} onChange={(e) => setForm((prev: any) => ({ ...prev, statement_status: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="draft">草稿</option>
                      <option value="issued">已發出</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">期間開始</label>
                    <DateInput value={form.period_start} onChange={(value) => setForm((prev: any) => ({ ...prev, period_start: value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">期間結束</label>
                    <DateInput value={form.period_end} onChange={(value) => setForm((prev: any) => ({ ...prev, period_end: value }))} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">備註</label>
                  <textarea value={form.remarks} onChange={(e) => setForm((prev: any) => ({ ...prev, remarks: e.target.value }))} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">包含發票</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">發票編號</th>
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-left">標題</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                    <th className="px-3 py-2 text-right">金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2"><Link href={`/invoices/${item.invoice?.id}`} className="font-mono text-primary-600 hover:text-primary-700">{item.invoice?.invoice_no}</Link></td>
                      <td className="px-3 py-2">{fmtDate(item.invoice?.date)}</td>
                      <td className="px-3 py-2">{item.invoice?.invoice_title || '-'}</td>
                      <td className="px-3 py-2">{INVOICE_STATUS_LABELS[item.invoice?.status] || item.invoice?.status || '-'}</td>
                      <td className="px-3 py-2 text-right">{fmt$(item.invoice?.total_amount)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">沒有發票</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">金額摘要</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">發票小計</span><span className="font-medium">{fmt$(statement.statement_subtotal)}</span></div>
              {otherCharges.map((charge: any, index: number) => (
                <div key={index} className="flex justify-between"><span className="text-gray-500">{charge.name || '其他費用'}</span><span className="font-medium">{fmt$(charge.amount)}</span></div>
              ))}
              <div className="border-t border-gray-200 pt-3 flex justify-between text-base font-bold"><span>總金額</span><span>{fmt$(statement.statement_total_amount)}</span></div>
            </div>
          </div>

          {editing && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">其他收費</h2>
                <button onClick={addCharge} className="text-sm font-medium text-primary-600 hover:text-primary-700">新增</button>
              </div>
              <div className="space-y-3">
                {(form.other_charges || []).map((charge: any, index: number) => (
                  <div key={index} className="grid grid-cols-[1fr_120px_auto] gap-2">
                    <input value={charge.name} onChange={(e) => updateCharge(index, { name: e.target.value })} placeholder="項目" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    <input type="number" value={charge.amount} onChange={(e) => updateCharge(index, { amount: e.target.value })} placeholder="金額" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-right" />
                    <button onClick={() => removeCharge(index)} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">刪除</button>
                  </div>
                ))}
                {(form.other_charges || []).length === 0 && <p className="text-sm text-gray-500">沒有其他收費</p>}
              </div>
            </div>
          )}

          {editing && (
            <div className="flex gap-3">
              <button onClick={() => { setEditing(false); loadStatement(); }} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button>
              <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">{saving ? '儲存中...' : '儲存'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
