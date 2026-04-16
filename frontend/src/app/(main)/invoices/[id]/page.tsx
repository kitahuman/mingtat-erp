'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { invoicesApi, partnersApi, companiesApi, projectsApi, quotationsApi, paymentInApi, bankAccountsApi } from '@/lib/api';
import ClientContractCombobox from '@/components/ClientContractCombobox';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import Modal from '@/components/Modal';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', issued: '已開立', partially_paid: '部分收款', paid: '已收清', void: '已作廢',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', issued: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', void: 'bg-red-100 text-red-700',
};

function Field({ label, children }: { label: string; children?: React.ReactNode }) {
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
  const [quotations, setQuotations] = useState<any[]>([]);

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  // Payment modal
  const [showPayment, setShowPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: '', bank_account_id: '', reference_no: '', remarks: '' });
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);

  const loadInvoice = async () => {
    try {
      const res = await invoicesApi.get(invoiceId);
      const data = res.data;
      setInvoice(data);
      setForm({
        ...data,
        date: toInputDate(data.date),
        due_date: toInputDate(data.due_date) || '',
        items: (data.items || []).map((item: any) => ({ ...item })),
        other_charges: data.other_charges || [],
        retention_rate: Number(data.retention_rate) || 0,
      });
    } catch {
      router.push('/invoices');
    } finally {
      setLoading(false);
    }
  };

  const loadPayments = async () => {
    try {
      const res = await paymentInApi.list({ source_type: 'INVOICE', source_ref_id: invoiceId, limit: 200 });
      setPayments(res.data?.data || []);
    } catch { }
  };

  useEffect(() => {
    loadInvoice();
    loadPayments();
    partnersApi.simple().then(res => setPartners(res.data || []));
    companiesApi.simple().then(res => setCompanies(res.data || []));
    projectsApi.list({ limit: 500 }).then(res => setProjects(res.data?.data || res.data || []));
    quotationsApi.list({ limit: 500 }).then(res => setQuotations(res.data?.data || res.data || [])).catch(() => {});
    bankAccountsApi.simple().then(res => setBankAccounts(res.data || [])).catch(() => {});
  }, [invoiceId]);

  const clientPartners = partners.filter((p: any) => p.partner_type === 'client');

  // Item helpers
  const addItem = () => setForm({ ...form, items: [...form.items, { item_name: '', description: '', quantity: 1, unit: 'JOB', unit_price: 0 }] });
  const removeItem = (idx: number) => setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) });
  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };
  const itemAmount = (item: any) => (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);

  // Other charges helpers
  const addCharge = () => setForm({ ...form, other_charges: [...(form.other_charges || []), { name: '', amount: 0 }] });
  const removeCharge = (idx: number) => setForm({ ...form, other_charges: (form.other_charges || []).filter((_: any, i: number) => i !== idx) });
  const updateCharge = (idx: number, field: string, value: any) => {
    const charges = [...(form.other_charges || [])];
    charges[idx] = { ...charges[idx], [field]: value };
    setForm({ ...form, other_charges: charges });
  };

  // Totals
  const formSubtotal = (form.items || []).reduce((sum: number, item: any) => sum + itemAmount(item), 0);
  const formRetention = formSubtotal * (Number(form.retention_rate) || 0) / 100;
  const formOtherChargesTotal = (form.other_charges || []).reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
  const formTotal = formSubtotal - formRetention + formOtherChargesTotal;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        date: form.date,
        due_date: form.due_date || null,
        company_id: form.company_id ? Number(form.company_id) : null,
        client_id: form.client_id ? Number(form.client_id) : null,
        project_id: form.project_id ? Number(form.project_id) : null,
        quotation_id: form.quotation_id ? Number(form.quotation_id) : null,
        invoice_title: form.invoice_title || null,
        client_contract_no: form.client_contract_no || null,
        retention_rate: Number(form.retention_rate) || 0,
        other_charges: form.other_charges || [],
        payment_terms: form.payment_terms || null,
        remarks: form.remarks || null,
        items: form.items.map((item: any, idx: number) => ({
          id: item.id,
          item_name: item.item_name || null,
          description: item.description || null,
          quantity: Number(item.quantity) || 0,
          unit: item.unit || null,
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
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) { alert('請輸入有效的收款金額'); return; }
    setRecordingPayment(true);
    try {
      await paymentInApi.create({
        date: paymentForm.date,
        amount: Number(paymentForm.amount),
        source_type: 'INVOICE',
        source_ref_id: invoiceId,
        project_id: invoice.project_id || undefined,
        bank_account_id: paymentForm.bank_account_id ? Number(paymentForm.bank_account_id) : undefined,
        reference_no: paymentForm.reference_no || undefined,
        remarks: paymentForm.remarks || `發票 ${invoice.invoice_no} 收款`,
        payment_in_status: 'paid',
      });
      setShowPayment(false);
      setPaymentForm({ date: new Date().toISOString().slice(0, 10), amount: '', bank_account_id: '', reference_no: '', remarks: '' });
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
      await paymentInApi.delete(paymentId);
      await loadInvoice();
      await loadPayments();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const handleTogglePaymentStatus = async (paymentId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    try {
      await paymentInApi.updateStatus(paymentId, newStatus);
      await loadInvoice();
      await loadPayments();
    } catch (err: any) {
      alert(err.response?.data?.message || '更新狀態失敗');
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

  const handlePrint = () => {
    if (!invoice) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const otherChargesRows = (invoice.other_charges || []).map((c: any) =>
      `<div class="total-row"><span>${c.name}：</span><span>${fmt$(c.amount)}</span></div>`
    ).join('');
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
        .item-title { font-weight: bold; }
        .item-desc { color: #555; font-size: 12px; }
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
      ${invoice.invoice_title ? `<div style="text-align:center;font-size:15px;margin-bottom:15px;font-weight:bold;">${invoice.invoice_title}</div>` : ''}
      <div class="info-grid">
        <div><span class="label">發票編號：</span><span style="font-family:monospace">${invoice.invoice_no}</span></div>
        <div><span class="label">發票日期：</span>${fmtDate(invoice.date)}</div>
        ${invoice.due_date ? `<div><span class="label">到期日：</span>${fmtDate(invoice.due_date)}</div>` : '<div></div>'}
        ${invoice.client_contract_no ? `<div><span class="label">客戶合約：</span>${invoice.client_contract_no}</div>` : '<div></div>'}
        ${invoice.quotation ? `<div><span class="label">報價單號：</span><span style="font-family:monospace">${invoice.quotation.quotation_no}</span></div>` : ''}
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
          <th>項目</th>
          <th style="width:70px" class="text-right">數量</th>
          <th style="width:60px">單位</th>
          <th style="width:100px" class="text-right">單價</th>
          <th style="width:110px" class="text-right">金額</th>
        </tr></thead>
        <tbody>
          ${(invoice.items || []).map((item: any, idx: number) => `<tr>
            <td>${idx + 1}</td>
            <td>${item.item_name ? `<div class="item-title">${item.item_name}</div>` : ''}${item.description ? `<div class="item-desc">${item.description}</div>` : ''}</td>
            <td class="text-right">${Number(item.quantity).toLocaleString()}</td>
            <td>${item.unit || ''}</td>
            <td class="text-right">${fmt$(item.unit_price)}</td>
            <td class="text-right">${fmt$(item.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="total-section">
        <div class="total-row"><span>小計：</span><span>${fmt$(invoice.subtotal)}</span></div>
        ${Number(invoice.retention_rate) > 0 ? `<div class="total-row"><span>保留金 (${invoice.retention_rate}%)：</span><span>-${fmt$(invoice.retention_amount)}</span></div>` : ''}
        ${otherChargesRows}
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
          {invoice.invoice_title && <p className="text-gray-600 mt-0.5">{invoice.invoice_title}</p>}
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
            <button onClick={() => { setPaymentForm({ date: new Date().toISOString().slice(0, 10), amount: String(Number(invoice.outstanding)), bank_account_id: '', reference_no: '', remarks: '' }); setShowPayment(true); }} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">記錄收款</button>
          )}
          {invoice.status !== 'void' && invoice.status !== 'paid' && (
            <button onClick={() => handleStatusChange('void')} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">作廢</button>
          )}
          {editing ? (
            <>
              <button onClick={() => { setForm({ ...invoice, date: toInputDate(invoice.date), due_date: toInputDate(invoice.due_date) || '', items: (invoice.items || []).map((i: any) => ({ ...i })), other_charges: invoice.other_charges || [], retention_rate: Number(invoice.retention_rate) || 0 }); setEditing(false); }} className="btn-secondary">取消</button>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">發票名稱/標題</label>
              <input type="text" value={form.invoice_title || ''} onChange={e => setForm({ ...form, invoice_title: e.target.value })} className="input-field" placeholder="例如：工程費用發票" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">發票日期</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">到期日</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">開立公司</label>
              <select value={form.company_id || ''} onChange={e => setForm({ ...form, company_id: e.target.value })} className="input-field">
                <option value="">— 無 —</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">客戶</label>
              <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value })} className="input-field">
                <option value="">— 無 —</option>
                {clientPartners.map((p: any) => <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">客戶合約</label>
              <ClientContractCombobox
                value={form.client_contract_no || ''}
                onChange={(val) => setForm({ ...form, client_contract_no: val || '' })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">工程項目</label>
              <select value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value })} className="input-field">
                <option value="">— 無 —</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">關聯報價單</label>
              <select value={form.quotation_id || ''} onChange={e => setForm({ ...form, quotation_id: e.target.value })} className="input-field">
                <option value="">— 無 —</option>
                {quotations.map((q: any) => <option key={q.id} value={q.id}>{q.quotation_no}{q.contract_name ? ` - ${q.contract_name}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">保留金 (%)</label>
              <input type="number" value={form.retention_rate} onChange={e => setForm({ ...form, retention_rate: e.target.value })} className="input-field" min="0" max="100" step="0.01" placeholder="0" />
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
            <Field label="發票編號"><span className="font-mono font-bold">{invoice.invoice_no}</span></Field>
            {invoice.invoice_title && <Field label="發票名稱">{invoice.invoice_title}</Field>}
            <Field label="發票日期">{fmtDate(invoice.date)}</Field>
            <Field label="到期日">{fmtDate(invoice.due_date)}</Field>
            <Field label="開立公司">{invoice.company?.internal_prefix ? `${invoice.company.internal_prefix} - ${invoice.company.name}` : invoice.company?.name}</Field>
            <Field label="客戶">{invoice.client ? (invoice.client.code ? `${invoice.client.code} - ${invoice.client.name}` : invoice.client.name) : '—'}</Field>
            <Field label="客戶合約">
              {invoice.client_contract_no ? <span className="font-mono text-indigo-600">{invoice.client_contract_no}</span> : undefined}
            </Field>
            <Field label="工程項目">
              {invoice.project ? (
                <Link href={`/projects/${invoice.project.id}`} className="text-primary-600 hover:underline">
                  {invoice.project.project_no} - {invoice.project.project_name}
                </Link>
              ) : undefined}
            </Field>
            <Field label="關聯報價單">
              {invoice.quotation ? (
                <Link href={`/quotations/${invoice.quotation.id}`} className="text-primary-600 hover:underline font-mono">
                  {invoice.quotation.quotation_no}
                </Link>
              ) : undefined}
            </Field>
            <Field label="付款條件">{invoice.payment_terms}</Field>
            {invoice.remarks && <Field label="備註">{invoice.remarks}</Field>}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">發票項目</h2>
          {editing && <button onClick={addItem} className="text-sm text-primary-600 hover:text-primary-700">+ 新增項目</button>}
        </div>
        {editing ? (
          <div className="space-y-3">
            {form.items.map((item: any, idx: number) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-11 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">標題</label>
                      <input type="text" value={item.item_name || ''} onChange={e => updateItem(idx, 'item_name', e.target.value)} className="input-field text-sm" placeholder="項目標題（選填）" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">描述</label>
                      <input type="text" value={item.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} className="input-field text-sm" placeholder="詳細描述（選填）" />
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end pt-5">
                    <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-sm p-1">✕</button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">數量</label>
                    <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="input-field text-sm text-right" min="0" step="0.01" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">單位</label>
                    <input type="text" value={item.unit || ''} onChange={e => updateItem(idx, 'unit', e.target.value)} className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">單價</label>
                    <input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} className="input-field text-sm text-right" min="0" step="0.01" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">金額</label>
                    <div className="input-field text-sm text-right bg-gray-50">{fmt$(itemAmount(item))}</div>
                  </div>
                </div>
              </div>
            ))}
            {/* Other Charges in edit mode */}
            <div className="border-t pt-3 mt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">其他費用</span>
                <button onClick={addCharge} className="text-xs text-primary-600 hover:text-primary-700">+ 新增</button>
              </div>
              {(form.other_charges || []).map((charge: any, idx: number) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-center">
                  <div className="col-span-7">
                    <input type="text" value={charge.name || ''} onChange={e => updateCharge(idx, 'name', e.target.value)} className="input-field text-sm" placeholder="費用名稱（如：油費、維修費）" />
                  </div>
                  <div className="col-span-4">
                    <input type="number" value={charge.amount} onChange={e => updateCharge(idx, 'amount', e.target.value)} className="input-field text-sm text-right" step="0.01" placeholder="金額（可負數）" />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => removeCharge(idx)} className="text-red-500 hover:text-red-700 text-sm p-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
            {/* Totals summary */}
            <div className="border-t pt-3 mt-2 text-right space-y-1 text-sm">
              <div className="text-gray-600">小計：{fmt$(formSubtotal)}</div>
              {Number(form.retention_rate) > 0 && <div className="text-orange-600">保留金 ({form.retention_rate}%)：-{fmt$(formRetention)}</div>}
              {(form.other_charges || []).filter((c: any) => c.name).map((c: any, i: number) => (
                <div key={i} className="text-gray-600">{c.name}：{Number(c.amount) >= 0 ? '' : '-'}{fmt$(Math.abs(Number(c.amount)))}</div>
              ))}
              <div className="text-lg font-bold text-gray-900">總額：HKD {fmt$(formTotal)}</div>
            </div>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" style={{ width: 50 }}>編號</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">項目</th>
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
                    <td className="px-4 py-3 text-sm">
                      {item.item_name && <div className="font-medium text-gray-900">{item.item_name}</div>}
                      {item.description && <div className="text-gray-500 text-xs mt-0.5">{item.description}</div>}
                      {!item.item_name && !item.description && <span className="text-gray-400">—</span>}
                    </td>
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
              {Number(invoice.retention_rate) > 0 && (
                <div className="text-orange-600">保留金 ({Number(invoice.retention_rate)}%)：-{fmt$(invoice.retention_amount)}</div>
              )}
              {(invoice.other_charges || []).map((c: any, i: number) => (
                <div key={i} className="text-gray-600">{c.name}：{fmt$(c.amount)}</div>
              ))}
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
        {payments.length > 0 ? (
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
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">狀態</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase" style={{ width: 120 }}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.map((p: any) => (
                  <tr key={p.id} className={p.payment_in_status === 'unpaid' ? 'bg-gray-50 opacity-70' : ''}>
                    <td className="px-4 py-2 text-sm">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2 text-sm text-right font-medium text-green-600 font-mono">{fmt$(p.amount)}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{p.bank_account?.account_name ? `${p.bank_account.bank_name} - ${p.bank_account.account_no}` : '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{p.reference_no || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{p.remarks || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${p.payment_in_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {p.payment_in_status === 'paid' ? '已收款' : '未收款'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center space-x-1">
                      <button
                        onClick={() => handleTogglePaymentStatus(p.id, p.payment_in_status)}
                        className={`text-xs px-2 py-1 rounded ${p.payment_in_status === 'paid' ? 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100' : 'text-green-700 bg-green-50 hover:bg-green-100'}`}
                      >
                        {p.payment_in_status === 'paid' ? '取消收款' : '已收款'}
                      </button>
                      <button onClick={() => handleDeletePayment(p.id)} className="text-red-500 hover:text-red-700 text-xs px-2 py-1">刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">尚無收款記錄</p>
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
              <select value={paymentForm.bank_account_id} onChange={e => setPaymentForm({ ...paymentForm, bank_account_id: e.target.value })} className="input-field">
                <option value="">請選擇銀行帳戶</option>
                {bankAccounts.map((ba: any) => (
                  <option key={ba.id} value={ba.id}>{ba.bank_name} - {ba.account_name} ({ba.account_no})</option>
                ))}
              </select>
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
