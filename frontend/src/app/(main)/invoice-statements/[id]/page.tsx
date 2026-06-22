'use client';

import { useEffect, useRef, useState } from 'react';
import DateInput from '@/components/DateInput';
import { invoiceStatementsApi, invoicesApi } from '@/lib/api';
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

// 單格 inline-edit 元件
function InlineCell({
  value,
  type = 'text',
  align = 'left',
  disabled,
  onCommit,
}: {
  value: any;
  type?: 'text' | 'number' | 'date';
  align?: 'left' | 'right' | 'center';
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    if (disabled) return;
    if (type === 'date') {
      setDraft(toInputDate(value) || '');
    } else {
      setDraft(value === null || value === undefined ? '' : String(value));
    }
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      // 避免 Portal/focus 觸發捲動跳動
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 10);
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    onCommit(draft);
  };

  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (editing) {
    return (
      <td className={`px-3 py-1.5 ${alignClass}`}>
        <input
          ref={inputRef}
          type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className={`w-full rounded border border-primary-400 px-2 py-1 text-sm ${alignClass}`}
        />
      </td>
    );
  }

  let display: React.ReactNode;
  if (type === 'date') display = value ? fmtDate(value) : <span className="text-gray-400">—</span>;
  else if (type === 'number') display = fmt$(value);
  else display = value || <span className="text-gray-400">—</span>;

  return (
    <td
      className={`px-3 py-2 ${alignClass} ${disabled ? '' : 'cursor-pointer hover:bg-primary-50'}`}
      onClick={startEdit}
      title={disabled ? '' : '點擊編輯'}
    >
      {display}
    </td>
  );
}

export default function InvoiceStatementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const statementId = Number(id);
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly();

  const [statement, setStatement] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // 拖拉狀態
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 新增發票彈窗
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const parseOtherCharges = (value: any) => (Array.isArray(value) ? value : []);

  const applyStatement = (data: any) => {
    setStatement(data);
    setItems((data.items || []).slice().sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)));
    const otherCharges = parseOtherCharges(data.statement_other_charges);
    setForm({
      statement_title: data.statement_title || '',
      statement_status: data.statement_status || 'draft',
      period_start: toInputDate(data.statement_period_start),
      period_end: toInputDate(data.statement_period_end),
      statement_date: toInputDate(data.statement_date),
      remarks: data.statement_remarks || '',
      statement_show_paid_columns: !!data.statement_show_paid_columns,
      statement_show_bank_info: !!data.statement_show_bank_info,
      statement_show_signature: !!data.statement_show_signature,
      other_charges: otherCharges.length
        ? otherCharges.map((c: any) => ({ name: c.name || '', amount: String(c.amount || '') }))
        : [],
    });
  };

  const loadStatement = async () => {
    setLoading(true);
    try {
      const res = await invoiceStatementsApi.get(statementId);
      applyStatement(res.data);
    } catch {
      router.push('/invoice-statements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await invoiceStatementsApi.update(statementId, {
        statement_title: form.statement_title || undefined,
        statement_status: form.statement_status,
        period_start: form.period_start,
        period_end: form.period_end,
        statement_date: form.statement_date || undefined,
        remarks: form.remarks || undefined,
        statement_show_paid_columns: !!form.statement_show_paid_columns,
        statement_show_bank_info: !!form.statement_show_bank_info,
        statement_show_signature: !!form.statement_show_signature,
        other_charges: (form.other_charges || [])
          .map((charge: any) => ({ name: String(charge.name || '').trim(), amount: Number(charge.amount || 0) }))
          .filter((charge: any) => charge.name || charge.amount !== 0),
      });
      applyStatement(res.data);
      setEditing(false);
    } catch (error: any) {
      alert(error.response?.data?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  // 即時切換 checkbox（非編輯模式也可即時儲存）
  const toggleFlag = async (field: string, value: boolean) => {
    setForm((prev: any) => ({ ...prev, [field]: value }));
    try {
      const res = await invoiceStatementsApi.update(statementId, { [field]: value });
      applyStatement(res.data);
    } catch (error: any) {
      alert(error.response?.data?.message || '更新失敗');
      loadStatement();
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

  // ── 其他收費 ──
  const updateCharge = (index: number, patch: Record<string, any>) => {
    setForm((prev: any) => {
      const next = [...(prev.other_charges || [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, other_charges: next };
    });
  };
  const addCharge = () => setForm((prev: any) => ({ ...prev, other_charges: [...(prev.other_charges || []), { name: '', amount: '' }] }));
  const removeCharge = (index: number) =>
    setForm((prev: any) => ({ ...prev, other_charges: (prev.other_charges || []).filter((_: any, i: number) => i !== index) }));

  // ── 項目 inline edit ──
  const commitItem = async (item: any, field: string, rawValue: string) => {
    const numericFields = ['item_amount', 'item_paid_amount', 'item_outstanding'];
    let payloadValue: any = rawValue;
    if (numericFields.includes(field)) payloadValue = rawValue === '' ? 0 : Number(rawValue);

    // 樂觀更新
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, [field]: payloadValue } : it)));
    try {
      const res = await invoiceStatementsApi.updateItem(statementId, item.id, { [field]: payloadValue });
      applyStatement(res.data);
    } catch (error: any) {
      alert(error.response?.data?.message || '更新項目失敗');
      loadStatement();
    }
  };

  const deleteItem = async (item: any) => {
    if (!confirm('確定要移除此項目？')) return;
    try {
      const res = await invoiceStatementsApi.deleteItem(statementId, item.id);
      applyStatement(res.data);
    } catch (error: any) {
      alert(error.response?.data?.message || '刪除項目失敗');
    }
  };

  const addCustomItem = async () => {
    try {
      const res = await invoiceStatementsApi.addItem(statementId, {
        item_type: 'custom',
        item_title: '',
        item_amount: 0,
      });
      applyStatement(res.data);
    } catch (error: any) {
      alert(error.response?.data?.message || '新增項目失敗');
    }
  };

  // ── 拖拉排序 ──
  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (dragIndex === null || dragIndex === dropIndex) return;

    const reordered = items.slice();
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    const withOrder = reordered.map((it, idx) => ({ ...it, sort_order: idx + 1 }));
    setItems(withOrder); // 樂觀更新

    try {
      const res = await invoiceStatementsApi.reorderItems(
        statementId,
        withOrder.map((it) => ({ id: it.id, sort_order: it.sort_order })),
      );
      applyStatement(res.data);
    } catch (error: any) {
      alert(error.response?.data?.message || '排序更新失敗');
      loadStatement();
    }
  };

  // ── 新增發票搜尋 ──
  const searchInvoices = async () => {
    if (!statement) return;
    setSearching(true);
    try {
      const res = await invoicesApi.list({
        page: 1,
        limit: 50,
        company_id: statement.company_id,
        client_id: statement.client_id,
        search: invoiceSearch || undefined,
      });
      const existingIds = new Set(items.map((it) => it.invoice_id).filter(Boolean));
      const list = (res.data?.data || res.data || []).filter((inv: any) => !existingIds.has(inv.id));
      setSearchResults(list);
    } catch (error: any) {
      alert(error.response?.data?.message || '搜尋發票失敗');
    } finally {
      setSearching(false);
    }
  };

  const addInvoiceItem = async (invoice: any) => {
    try {
      const res = await invoiceStatementsApi.addItem(statementId, {
        invoice_id: invoice.id,
        item_type: 'invoice',
      });
      applyStatement(res.data);
      setSearchResults((prev) => prev.filter((inv) => inv.id !== invoice.id));
    } catch (error: any) {
      alert(error.response?.data?.message || '加入發票失敗');
    }
  };

  if (loading) return <div className="p-6 text-gray-500">載入中...</div>;
  if (!statement) return null;

  const otherCharges = parseOtherCharges(statement.statement_other_charges);
  const showPaid = !!statement.statement_show_paid_columns;
  // 表格欄位數量（含拖拉把手、編號、操作）
  const baseCols = 6; // 把手 # 發票編號 日期 標題 狀態 金額 = 7 actually; compute below
  void baseCols;

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
          {!readOnly && !editing && <button onClick={() => setEditing(true)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">編輯</button>}
          {!readOnly && <button onClick={remove} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">刪除</button>}
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
                <Field label="清單日期">{fmtDate(statement.statement_date)}</Field>
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
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">清單日期</label>
                    <DateInput value={form.statement_date} onChange={(value) => setForm((prev: any) => ({ ...prev, statement_date: value }))} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">備註</label>
                  <textarea value={form.remarks} onChange={(e) => setForm((prev: any) => ({ ...prev, remarks: e.target.value }))} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            {/* PDF 顯示選項 checkbox */}
            <div className="mt-6 border-t border-gray-100 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">PDF 輸出選項</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={!!form.statement_show_paid_columns}
                    onChange={(e) => toggleFlag('statement_show_paid_columns', e.target.checked)}
                  />
                  顯示已收/未收
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={!!form.statement_show_bank_info}
                    onChange={(e) => toggleFlag('statement_show_bank_info', e.target.checked)}
                  />
                  顯示公司銀行資料
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={!!form.statement_show_signature}
                    onChange={(e) => toggleFlag('statement_show_signature', e.target.checked)}
                  />
                  顯示簽名欄
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">包含發票</h2>
              {!readOnly && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowAddInvoice(true); setSearchResults([]); setInvoiceSearch(''); }}
                    className="rounded-lg border border-primary-600 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50"
                  >
                    新增發票
                  </button>
                  <button
                    onClick={addCustomItem}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    新增其他項目
                  </button>
                </div>
              )}
            </div>
            <p className="mb-2 text-xs text-gray-400">提示：拖曳左側把手可調整順序；點擊欄位可直接編輯。狀態欄不會輸出至 PDF。</p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {!readOnly && <th className="w-8 px-2 py-2" />}
                    <th className="w-10 px-2 py-2 text-center">#</th>
                    <th className="px-3 py-2 text-left">發票編號</th>
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-left">標題</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-right">已收</th>
                    <th className="px-3 py-2 text-right">未收</th>
                    {!readOnly && <th className="w-12 px-2 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {items.map((item: any, index: number) => {
                    const isCustom = item.item_type === 'custom';
                    const statusVal = item.item_status || '';
                    return (
                      <tr
                        key={item.id}
                        draggable={!readOnly}
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null); }}
                        className={dragOverIndex === index ? 'bg-primary-50' : ''}
                      >
                        {!readOnly && (
                          <td className="cursor-move px-2 py-2 text-center text-gray-400" title="拖曳排序">⋮⋮</td>
                        )}
                        <td className="px-2 py-2 text-center text-gray-500">{index + 1}</td>
                        {/* 發票編號 */}
                        {readOnly ? (
                          <td className="px-3 py-2">
                            {item.invoice_id ? (
                              <Link href={`/invoices/${item.invoice_id}`} className="font-mono text-primary-600 hover:text-primary-700">{item.item_invoice_no}</Link>
                            ) : (item.item_invoice_no || '-')}
                          </td>
                        ) : (
                          <InlineCell value={item.item_invoice_no} onCommit={(v) => commitItem(item, 'item_invoice_no', v)} />
                        )}
                        {/* 日期 */}
                        <InlineCell value={item.item_date} type="date" disabled={readOnly} onCommit={(v) => commitItem(item, 'item_date', v)} />
                        {/* 標題 */}
                        <InlineCell value={item.item_title} disabled={readOnly} onCommit={(v) => commitItem(item, 'item_title', v)} />
                        {/* 狀態 */}
                        <InlineCell
                          value={INVOICE_STATUS_LABELS[statusVal] || statusVal}
                          disabled={readOnly}
                          onCommit={(v) => commitItem(item, 'item_status', v)}
                        />
                        {/* 金額 */}
                        <InlineCell value={item.item_amount} type="number" align="right" disabled={readOnly} onCommit={(v) => commitItem(item, 'item_amount', v)} />
                        {/* 已收 */}
                        <InlineCell value={item.item_paid_amount} type="number" align="right" disabled={readOnly} onCommit={(v) => commitItem(item, 'item_paid_amount', v)} />
                        {/* 未收 */}
                        <InlineCell value={item.item_outstanding} type="number" align="right" disabled={readOnly} onCommit={(v) => commitItem(item, 'item_outstanding', v)} />
                        {!readOnly && (
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => deleteItem(item)} className="text-red-600 hover:text-red-800" title="移除">✕</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan={readOnly ? 9 : 11} className="px-3 py-8 text-center text-gray-500">沒有項目</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {!showPaid && (
              <p className="mt-2 text-xs text-gray-400">「已收/未收」目前不會輸出至 PDF（可於上方 PDF 輸出選項開啟）。</p>
            )}
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

      {/* 新增發票彈窗 */}
      {showAddInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddInvoice(false)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">新增發票</h3>
              <button onClick={() => setShowAddInvoice(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4 p-6">
              <div className="flex gap-2">
                <input
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') searchInvoices(); }}
                  placeholder="搜尋發票編號、標題..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <button onClick={searchInvoices} disabled={searching} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">{searching ? '搜尋中...' : '搜尋'}</button>
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">發票編號</th>
                      <th className="px-3 py-2 text-left">日期</th>
                      <th className="px-3 py-2 text-left">標題</th>
                      <th className="px-3 py-2 text-right">金額</th>
                      <th className="w-16 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {searchResults.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="px-3 py-2 font-mono text-primary-600">{invoice.invoice_no}</td>
                        <td className="px-3 py-2">{fmtDate(invoice.date)}</td>
                        <td className="px-3 py-2">{invoice.invoice_title || '-'}</td>
                        <td className="px-3 py-2 text-right">{fmt$(invoice.total_amount)}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => addInvoiceItem(invoice)} className="rounded border border-primary-600 px-2 py-1 text-xs text-primary-700 hover:bg-primary-50">加入</button>
                        </td>
                      </tr>
                    ))}
                    {!searching && searchResults.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">沒有可加入的發票</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
