'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { quotationsApi, companiesApi, partnersApi } from '@/lib/api';
import Link from 'next/link';

const statusLabels: Record<string, string> = { draft: '草稿', sent: '已發送', accepted: '已接受', rejected: '已拒絕' };
const statusColors: Record<string, string> = { draft: 'badge-gray', sent: 'badge-blue', accepted: 'badge-green', rejected: 'badge-red' };
const UNIT_OPTIONS = ['JOB','M','M2','M3','車','工','噸','天','晚','次','個','件','小時','月','兩周','公斤'];

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [quotation, setQuotation] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = () => {
    quotationsApi.get(Number(params.id)).then(res => {
      setQuotation(res.data);
      setForm({
        ...res.data,
        items: res.data.items || [],
      });
      setLoading(false);
    }).catch(() => router.push('/quotations'));
  };

  useEffect(() => {
    loadData();
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
  }, [params.id]);

  const handleSave = async () => {
    try {
      const { company, client, created_at, updated_at, ...updateData } = form;
      updateData.items = updateData.items.map((item: any, idx: number) => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        sort_order: idx + 1,
      }));
      const res = await quotationsApi.update(quotation.id, updateData);
      setQuotation(res.data);
      setForm({ ...res.data, items: res.data.items || [] });
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await quotationsApi.updateStatus(quotation.id, newStatus);
      setQuotation(res.data);
      setForm({ ...res.data, items: res.data.items || [] });
    } catch (err: any) { alert(err.response?.data?.message || '狀態更新失敗'); }
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { description: '', quantity: 0, unit: 'JOB', unit_price: 0, remarks: '' }] });
  };
  const removeItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) });
  };
  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };

  const totalAmount = (form.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>報價單 ${quotation.quotation_no}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { font-size: 20px; margin: 0; }
        .header p { font-size: 12px; color: #666; margin: 2px 0; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 13px; }
        .info-grid .label { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .total-row { font-weight: bold; background: #f0f0f0; }
        .remarks { margin-top: 20px; font-size: 12px; }
        .remarks h3 { font-size: 14px; margin-bottom: 5px; }
        .quotation-no { font-size: 14px; font-family: monospace; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <div class="header">
        <h1>${quotation.company?.name || ''}</h1>
        <p>${quotation.company?.address || ''}</p>
        <p>電話: ${quotation.company?.phone || ''}</p>
      </div>
      <h2 style="text-align:center; margin-bottom: 20px;">報 價 單 QUOTATION</h2>
      <div class="info-grid">
        <div><span class="label">報價單號：</span><span class="quotation-no">${quotation.quotation_no}</span></div>
        <div><span class="label">日期：</span>${quotation.quotation_date}</div>
        <div><span class="label">致：</span>${quotation.client?.name || '-'}</div>
        <div><span class="label">工程編號：</span>${quotation.project_no || '-'}</div>
        <div colspan="2"><span class="label">工程名稱：</span>${quotation.project_name || '-'}</div>
      </div>
      <table>
        <thead><tr><th style="width:40px">編號</th><th>項目</th><th style="width:70px" class="text-right">數量</th><th style="width:60px">單位</th><th style="width:90px" class="text-right">單價</th><th style="width:100px" class="text-right">金額</th></tr></thead>
        <tbody>
          ${(quotation.items || []).map((item: any, idx: number) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${item.description || ''}</td>
              <td class="text-right">${Number(item.quantity).toLocaleString()}</td>
              <td>${item.unit || ''}</td>
              <td class="text-right">$${Number(item.unit_price).toLocaleString()}</td>
              <td class="text-right">$${Number(item.amount).toLocaleString()}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="5" class="text-right">總金額：</td>
            <td class="text-right">HKD $${Number(quotation.total_amount).toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
      <div class="remarks">
        <h3>REMARKS 備註：</h3>
        ${quotation.validity_period ? `<p>1. ${quotation.validity_period}</p>` : ''}
        ${quotation.payment_terms ? `<p>2. ${quotation.payment_terms}</p>` : ''}
        ${quotation.exclusions ? `<p>3. ${quotation.exclusions}</p>` : ''}
        ${quotation.remarks ? `<p>4. ${quotation.remarks}</p>` : ''}
      </div>
      <div style="margin-top: 60px; display: flex; justify-content: space-between;">
        <div style="text-align: center; width: 200px;">
          <div style="border-top: 1px solid #333; padding-top: 5px;">公司蓋章</div>
        </div>
        <div style="text-align: center; width: 200px;">
          <div style="border-top: 1px solid #333; padding-top: 5px;">客戶確認</div>
        </div>
      </div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/quotations" className="hover:text-primary-600">工程報價單</Link><span>/</span><span className="text-gray-900">{quotation?.quotation_no}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{quotation?.quotation_no}</h1>
          <p className="text-gray-500">{quotation?.project_name} | <span className={statusColors[quotation?.status]}>{statusLabels[quotation?.status]}</span></p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-secondary">列印 / PDF</button>
          {quotation?.status === 'draft' && (
            <button onClick={() => handleStatusChange('sent')} className="btn-secondary">標記已發送</button>
          )}
          {quotation?.status === 'sent' && (
            <>
              <button onClick={() => handleStatusChange('accepted')} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">已接受</button>
              <button onClick={() => handleStatusChange('rejected')} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">已拒絕</button>
            </>
          )}
          {editing ? (
            <>
              <button onClick={() => { setForm({ ...quotation, items: quotation.items || [] }); setEditing(false); }} className="btn-secondary">取消</button>
              <button onClick={handleSave} className="btn-primary">儲存</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
          )}
        </div>
      </div>

      {/* Header Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">報價單資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">開立公司</label>
                <select value={form.company_id} onChange={e => setForm({...form, company_id: Number(e.target.value)})} className="input-field">
                  {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
                <select value={form.client_id || ''} onChange={e => setForm({...form, client_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                  <option value="">無</option>
                  {partners.filter((p: any) => p.partner_type === 'client').map((p: any) => <option key={p.id} value={p.id}>{p.code ? `${p.code} - ${p.name}` : p.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">日期</label><input type="date" value={form.quotation_date} onChange={e => setForm({...form, quotation_date: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">工程編號</label><input value={form.project_no || ''} onChange={e => setForm({...form, project_no: e.target.value})} className="input-field" /></div>
              <div className="lg:col-span-2"><label className="block text-sm font-medium text-gray-500 mb-1">工程名稱</label><input value={form.project_name || ''} onChange={e => setForm({...form, project_name: e.target.value})} className="input-field" /></div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">報價單號</p><p className="font-mono font-bold">{quotation?.quotation_no}</p></div>
              <div><p className="text-sm text-gray-500">開立公司</p><p className="font-medium">{quotation?.company?.internal_prefix} - {quotation?.company?.name}</p></div>
              <div><p className="text-sm text-gray-500">客戶</p><p className="font-medium">{quotation?.client?.name || '-'}</p></div>
              <div><p className="text-sm text-gray-500">日期</p><p>{quotation?.quotation_date}</p></div>
              <div><p className="text-sm text-gray-500">工程編號</p><p>{quotation?.project_no || '-'}</p></div>
              <div><p className="text-sm text-gray-500">工程名稱</p><p>{quotation?.project_name || '-'}</p></div>
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">報價明細</h2>
          {editing && <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:underline">+ 新增項目</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left w-12">#</th>
                <th className="px-3 py-2 text-left">項目描述</th>
                <th className="px-3 py-2 text-right w-24">數量</th>
                <th className="px-3 py-2 text-left w-20">單位</th>
                <th className="px-3 py-2 text-right w-28">單價</th>
                <th className="px-3 py-2 text-right w-28">金額</th>
                {editing && <th className="px-3 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {(editing ? form.items : quotation?.items || []).map((item: any, idx: number) => (
                <tr key={idx} className="border-b">
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  {editing ? (
                    <>
                      <td className="px-3 py-1"><input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="input-field text-sm" /></td>
                      <td className="px-3 py-1"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="input-field text-sm text-right" /></td>
                      <td className="px-3 py-1"><select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="input-field text-sm">{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                      <td className="px-3 py-1"><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} className="input-field text-sm text-right" /></td>
                      <td className="px-3 py-2 text-right font-mono">${((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)).toLocaleString()}</td>
                      <td className="px-3 py-2">{form.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">×</button>}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(item.quantity).toLocaleString()}</td>
                      <td className="px-3 py-2">{item.unit}</td>
                      <td className="px-3 py-2 text-right font-mono">${Number(item.unit_price).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">${Number(item.amount).toLocaleString()}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td colSpan={editing ? 5 : 5} className="px-3 py-2 text-right">總金額：</td>
                <td className="px-3 py-2 text-right font-mono text-primary-600">
                  HKD ${editing ? totalAmount.toLocaleString() : Number(quotation?.total_amount).toLocaleString()}
                </td>
                {editing && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Remarks */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">備註</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-500 mb-1">有效期</label><input value={form.validity_period || ''} onChange={e => setForm({...form, validity_period: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">付款條件</label><input value={form.payment_terms || ''} onChange={e => setForm({...form, payment_terms: e.target.value})} className="input-field" /></div>
            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-500 mb-1">除外責任</label><textarea value={form.exclusions || ''} onChange={e => setForm({...form, exclusions: e.target.value})} className="input-field" rows={2} /></div>
            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-500 mb-1">其他備註</label><textarea value={form.remarks || ''} onChange={e => setForm({...form, remarks: e.target.value})} className="input-field" rows={2} /></div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {quotation?.validity_period && <p><span className="font-medium text-gray-500">有效期：</span>{quotation.validity_period}</p>}
            {quotation?.payment_terms && <p><span className="font-medium text-gray-500">付款條件：</span>{quotation.payment_terms}</p>}
            {quotation?.exclusions && <p><span className="font-medium text-gray-500">除外責任：</span>{quotation.exclusions}</p>}
            {quotation?.remarks && <p><span className="font-medium text-gray-500">備註：</span>{quotation.remarks}</p>}
            {!quotation?.validity_period && !quotation?.payment_terms && !quotation?.exclusions && !quotation?.remarks && <p className="text-gray-400">暫無備註</p>}
          </div>
        )}
      </div>

      <div ref={printRef} className="hidden"></div>
    </div>
  );
}
