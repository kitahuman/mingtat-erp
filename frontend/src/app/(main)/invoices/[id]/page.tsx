'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { invoicesApi, partnersApi, companiesApi, projectsApi } from '@/lib/api';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import Modal from '@/components/Modal';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  issued: '已開立',
  partially_paid: '部分收款',
  paid: '已收清',
  void: '已作廢',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  issued: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{children || <span className="text-gray-400">—</span>}</dd>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = Number(id);

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  // Reference data
  const [partners, setPartners] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  // Payment modal
  const [showPayment, setShowPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: '', bank_account: '', reference_no: '', remarks: '' });
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Payments list
  const [payments, setPayments] = useState<any[]>([]);

  const loadInvoice = async () => {
    try {
      const res = await invoicesApi.get(invoiceId);
      setInvoice(res.data);
      setForm({
        ...res.data,
        date: toInputDate(res.data.date),
        due_date: toInputDate(res.data.due_date),
        items: res.data.items || [],
      });
    } catch {
      router.push('/invoices');
    } finally {
      setLoading(false);
    }
  };

  const loadPayments = async () => {
    try {
      const res = await invoicesApi.getPayments(invoiceId);
      setPayments(res.data || []);
    } catch { }
  };

  useEffect(() => {
    loadInvoice();
    loadPayments();
    partnersApi.simple().then(res => setPartners(res.data || []));
    companiesApi.simple().then(res => setCompanies(res.data || []));
    projectsApi.list({ limit: 500 }).then(res => setProjects(res.data?.data || res.data || []));
  }, [invoiceId]);

  const clientPartners = partners.filter((p: any) => p.partner_type === 'client');

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        date: form.date,
        due_date: form.due_date || null,
        client_id: form.client_id ? Number(form.client_id) : null,
        project_id: form.project_id ? Number(form.project_id) : null,
        tax_rate: Number(form.tax_rate) || 0,
        payment_terms: form.payment_terms,
        remarks: form.remarks,
        items: form.items.map((item: any, idx: number) => ({
          description: item.description,
          quantity: Number(item.quantity) || 0,
          unit: item.unit,
          unit_price: Number(item.unit_price) || 0,
          sort_order: idx + 1,
        })),
      };
      await invoicesApi.update(invoiceId, payload);
      await loadInvoice();
      setEditing(false);
    } catch (err: any) {
      alert(err.response?.data?.message || '更新失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!confirm(`確定要將狀態更改為「${STATUS_LABELS[status]}」嗎？`)) return;
    try {
      await invoicesApi.updateStatus(invoiceId, status);
      await loadInvoice();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      alert('請輸入有效的收款金額');
      return;
    }
    setRecordingPayment(true);
    try {
      await invoicesApi.recordPayment(invoiceId, {
        date: paymentForm.date,
        amount: Number(paymentForm.amount),
        bank_account: paymentForm.bank_account,
        reference_no: paymentForm.reference_no,
        remarks: paymentForm.remarks,
      });
      setShowPayment(false);
      setPaymentForm({ date: new Date().toISOString().slice(0, 10), amount: '', bank_account: '', reference_no: '', remarks: '' });
      await loadInvoice();
      await loadPayments();
    } catch (err: any) {
      alert(err.response?.data?.message || '收款記錄失敗');
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm('確定要刪除此收款記錄嗎？')) return;
    try {
      await invoicesApi.deletePayment(invoiceId, paymentId);
      await loadInvoice();
      await loadPayments();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此發票嗎？此操作無法復原。')) return;
    try {
      await invoicesApi.delete(invoiceId);
      router.push('/invoices');
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  // Item helpers
  const addItem = () => {
    setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unit: 'JOB', unit_price: 0 }] });
  };
  const removeItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) });
  };
  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };
  const itemAmount = (item: any) => (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  const formSubtotal = (form.items || []).reduce((sum: number, item: any) => sum + itemAmount(item), 0);

  // Print
  const handlePrint = () => {
    if (!invoice) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>發票 ${invoice.invoice_no}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; font-size: 13px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { font-size: 20px; margin: 0; }
        .header p { font-size: 12px; color: #666; margin: 2px 0; }
        .title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px; letter-spacing: 4px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; }
        .info-grid .label { font-weight: bold; }
        .client-box { border: 1px solid #ddd; padding: 12px; margin-bottom: 20px; }
        .client-box h3 { margin: 0 0 8px 0; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .total-section { margin-top: 10px; }
        .total-row { display: flex; justify-content: flex-end; gap: 20px; padding: 4px 0; }
        .total-row.grand { font-size: 16px; font-weight: bold; border-top: 2px solid #333; padding-top: 8px; margin-top: 4px; }
        .payment-info { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; }
        .footer { margin-top: 60px; display: flex; justify-content: space-between; }
        .footer div { text-align: center; width: 200px; }
        .footer .line { border-top: 1px solid #333; padding-top: 5px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <div class="header">
        <h1>${invoice.company?.name || ''}</h1>
        ${invoice.company?.name_en ? `<p>${invoice.company.name_en}</p>` : ''}
        <p>${invoice.company?.address || ''}</p>
        <p>電話: ${invoice.company?.phone || ''}</p>
      </div>
      <div class="title">發 票 INVOICE</div>
      <div class="info-grid">
        <div><span class="label">發票編號：</span><span style="font-family:monospace">${invoice.invoice_no}</span></div>
        <div><span class="label">發票日期：</span>${fmtDate(invoice.date)}</div>
        ${invoice.due_date ? `<div><span class="label">到期日：</span>${fmtDate(invoice.due_date)}</div>` : '<div></div>'}
        ${invoice.quotation ? `<div><span class="label">報價單號：</span><span style="font-family:monospace">${invoice.quotation.quotation_no}</span></div>` : '<div></div>'}
      </div>
      <div class="client-box">
        <h3>致 TO：</h3>
        <div><strong>${invoice.client?.name || '-'}</strong></div>
        ${invoice.client?.address ? `<div>${invoice.client.address}</div>` : ''}
        ${invoice.client?.contact_person ? `<div>聯絡人：${invoice.client.contact_person}</div>` : ''}
        ${invoice.client?.phone ? `<div>電話：${invoice.client.phone}</div>` : ''}
      </div>
      ${invoice.project ? `<div style="margin-bottom: 15px;"><span class="label">工程項目：</span>${invoice.project.project_no} - ${invoice.project.project_name}</div>` : ''}
      <table>
        <thead><tr>
          <th style="width:40px">編號</th>
          <th>描述</th>
          <th style="width:70px" class="text-right">數量</th>
          <th style="width:60px">單位</th>
          <th style="width:100px" class="text-right">單價</th>
          <th style="width:110px" class="text-right">金額</th>
        </tr></thead>
        <tbody>
          ${(invoice.items || []).map((item: any, idx: number) => `<tr>
            <td>${idx + 1}</td>
            <td>${item.description || ''}</td>
            <td class="text-right">${Number(item.quantity).toLocaleString()}</td>
            <td>${item.unit || ''}</td>
            <td class="text-right">${fmt$(item.unit_price)}</td>
            <td class="text-right">${fmt$(item.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="total-section">
        <div class="total-row"><span>小計：</span><span>${fmt$(invoice.subtotal)}</span></div>
        ${Number(invoice.tax_rate) > 0 ? `<div class="total-row"><span>稅額 (${invoice.tax_rate}%)：</span><span>${fmt$(invoice.tax_amount)}</span></div>` : ''}
        <div class="total-row grand"><span>總額 TOTAL：</span><span>HKD ${fmt$(invoice.total_amount)}</span></div>
      </div>
      ${invoice.payment_terms ? `<div class="payment-info"><strong>付款條件：</strong>${invoice.payment_terms}</div>` : ''}
      ${invoice.remarks ? `<div style="margin-top: 10px;"><strong>備註：</strong>${invoice.remarks}</div>` : ''}
      <div class="footer">
        <div><div class="line">公司蓋章</div></div>
        <div><div class="line">客戶確認</div></div>
      </div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (!invoice) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/invoices" className="text-gray-400 hover:text-gray-600 text-sm">← 返回列表</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{invoice.invoice_no}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
              {STATUS_LABELS[invoice.status] || invoice.status}
            </span>
            {invoice.quotation && (
              <span className="text-sm text-gray-500">
                來自報價單：<Link href={`/quotations/${invoice.quotation.id}`} className="text-primary-600 hover:underline font-mono">{invoice.quotation.quotation_no}</Link>
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={handlePrint} className="btn-secondary">列印 / PDF</button>
          {invoice.status === 'draft' && (
            <button onClick={() => handleStatusChange('issued')} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">開立發票</button>
          )}
          {['issued', 'partially_paid'].includes(invoice.status) && (
            <button onClick={() => { setPaymentForm({ date: new Date().toISOString().slice(0, 10), amount: String(Number(invoice.outstanding)), bank_account: '', reference_no: '', remarks: '' }); setShowPayment(true); }} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">記錄收款</button>
          )}
          {invoice.status !== 'void' && invoice.status !== 'paid' && (
            <button onClick={() => handleStatusChange('void')} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">作廢</button>
          )}
          {editing ? (
            <>
              <button onClick={() => { setForm({ ...invoice, date: toInputDate(invoice.date), due_date: toInputDate(invoice.due_date), items: invoice.items || [] }); setEditing(false); }} className="btn-secondary">取消</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? '儲存中...' : '儲存'}</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
          {invoice.status === 'draft' && (
            <button onClick={handleDelete} className="text-red-600 hover:text-red-700 px-3 py-2 text-sm">刪除</button>
          )}
        </div>
      </div>

      {/* Basic Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">發票資料</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">發票日期</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">到期日</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">客戶</label>
              <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value })} className="input-field">
                <option value="">— 無 —</option>
                {clientPartners.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">工程項目</label>
              <select value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value })} className="input-field">
                <option value="">— 無 —</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">稅率 (%)</label>
              <input type="number" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} className="input-field" min="0" step="0.01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">付款條件</label>
              <input type="text" value={form.payment_terms || ''} onChange={e => setForm({ ...form, payment_terms: e.target.value })} className="input-field" />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">備註</label>
              <textarea value={form.remarks || ''} onChange={e => setForm({ ...form, remarks: e.target.value })} className="input-field" rows={2} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="發票編號">{invoice.invoice_no}</Field>
            <Field label="發票日期">{fmtDate(invoice.date)}</Field>
            <Field label="到期日">{fmtDate(invoice.due_date)}</Field>
            <Field label="公司">{invoice.company?.name}</Field>
            <Field label="客戶">{invoice.client?.name || '—'}</Field>
            <Field label="工程項目">
              {invoice.project ? (
                <Link href={`/projects/${invoice.project.id}`} className="text-primary-600 hover:underline">
                  {invoice.project.project_no} - {invoice.project.project_name}
                </Link>
              ) : '—'}
            </Field>
            <Field label="付款條件">{invoice.payment_terms}</Field>
            <Field label="備註">{invoice.remarks}</Field>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">發票項目</h2>
          {editing && (
            <button onClick={addItem} className="text-sm text-primary-600 hover:text-primary-700">+ 新增項目</button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            {form.items.map((item: any, idx: number) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">描述</label>}
                  <input type="text" value={item.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} className="input-field text-sm" />
                </div>
                <div className="col-span-2">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">數量</label>}
                  <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="input-field text-sm text-right" min="0" step="0.01" />
                </div>
                <div className="col-span-1">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">單位</label>}
                  <input type="text" value={item.unit || ''} onChange={e => updateItem(idx, 'unit', e.target.value)} className="input-field text-sm" />
                </div>
                <div className="col-span-2">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">單價</label>}
                  <input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} className="input-field text-sm text-right" min="0" step="0.01" />
                </div>
                <div className="col-span-2">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">金額</label>}
                  <div className="input-field text-sm text-right bg-gray-50">{fmt$(itemAmount(item))}</div>
                </div>
                <div className="col-span-1">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">&nbsp;</label>}
                  <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-sm p-2">✕</button>
                </div>
              </div>
            ))}
            <div className="mt-3 text-right text-sm font-medium text-gray-700">
              小計：{fmt$(formSubtotal)}
              {Number(form.tax_rate) > 0 && <> | 稅額 ({form.tax_rate}%)：{fmt$(formSubtotal * Number(form.tax_rate) / 100)}</>}
              {' '}| 總額：<span className="text-lg font-bold">{fmt$(formSubtotal + formSubtotal * Number(form.tax_rate) / 100)}</span>
            </div>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 50 }}>編號</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">描述</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase" style={{ width: 80 }}>數量</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 60 }}>單位</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase" style={{ width: 110 }}>單價</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase" style={{ width: 120 }}>金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(invoice.items || []).map((item: any, idx: number) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right">{Number(item.quantity).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.unit || ''}</td>
                    <td className="px-4 py-3 text-sm text-right">{fmt$(item.unit_price)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{fmt$(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t pt-4 mt-2 space-y-1 text-right text-sm">
              <div className="text-gray-600">小計：{fmt$(invoice.subtotal)}</div>
              {Number(invoice.tax_rate) > 0 && <div className="text-gray-600">稅額 ({invoice.tax_rate}%)：{fmt$(invoice.tax_amount)}</div>}
              <div className="text-lg font-bold text-gray-900">總額：HKD {fmt$(invoice.total_amount)}</div>
            </div>
          </>
        )}
      </div>

      {/* Payment Summary */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">收款狀況</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-xs text-blue-600 font-medium mb-1">發票總額</div>
            <div className="text-xl font-bold text-blue-900">{fmt$(invoice.total_amount)}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-xs text-green-600 font-medium mb-1">已收金額</div>
            <div className="text-xl font-bold text-green-900">{fmt$(invoice.paid_amount)}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-xs text-red-600 font-medium mb-1">未收金額</div>
            <div className="text-xl font-bold text-red-900">{fmt$(invoice.outstanding)}</div>
          </div>
        </div>

        {/* Payment records */}
        {payments.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">收款記錄</h3>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">金額</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">銀行帳戶</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">參考編號</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">備註</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase" style={{ width: 60 }}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-sm">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2 text-sm text-right font-medium text-green-600">{fmt$(p.amount)}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{p.bank_account || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{p.reference_no || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{p.remarks || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => handleDeletePayment(p.id)} className="text-red-500 hover:text-red-700 text-xs">刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {showPayment && (
        <Modal isOpen={showPayment} title="記錄收款" onClose={() => setShowPayment(false)}>
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              <span className="text-blue-700">未收金額：<strong>{fmt$(invoice.outstanding)}</strong></span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">收款日期 <span className="text-red-500">*</span></label>
              <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">收款金額 <span className="text-red-500">*</span></label>
              <input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="input-field" min="0" step="0.01" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">銀行帳戶</label>
              <input type="text" value={paymentForm.bank_account} onChange={e => setPaymentForm({ ...paymentForm, bank_account: e.target.value })} className="input-field" placeholder="銀行名稱 / 帳戶號碼" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">參考編號</label>
              <input type="text" value={paymentForm.reference_no} onChange={e => setPaymentForm({ ...paymentForm, reference_no: e.target.value })} className="input-field" placeholder="支票號碼 / 交易號碼" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea value={paymentForm.remarks} onChange={e => setPaymentForm({ ...paymentForm, remarks: e.target.value })} className="input-field" rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button onClick={() => setShowPayment(false)} className="btn-secondary">取消</button>
              <button onClick={handleRecordPayment} disabled={recordingPayment} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm disabled:opacity-50">
                {recordingPayment ? '處理中...' : '確認收款'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
