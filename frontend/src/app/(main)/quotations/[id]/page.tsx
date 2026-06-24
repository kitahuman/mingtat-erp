'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { quotationsApi, companiesApi, partnersApi, invoicesApi } from '@/lib/api';
import ClientContractCombobox from '@/components/ClientContractCombobox';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';
import DateInput from '@/components/DateInput';
import AttachmentUpload from '@/components/AttachmentUpload';
import SearchableSelect from '@/components/SearchableSelect';
import Combobox from '@/components/Combobox';
import { useMultiFieldOptions } from '@/hooks/useFieldOptions';

const statusLabels: Record<string, string> = { draft: '草稿', sent: '已發送', accepted: '已接受', confirmed: '已確認', rejected: '已拒絕', invoiced: '已轉發票' };
const statusColors: Record<string, string> = { draft: 'badge-gray', sent: 'badge-blue', accepted: 'badge-green', confirmed: 'badge-green', rejected: 'badge-red', invoiced: 'badge-purple' };
const typeLabels: Record<string, string> = { project: '工程報價', rental: '租賃/運輸報價' };

type QuotationRevisionSummary = {
  id: number;
  quotation_no: string;
  quotation_date: string;
  total_amount?: number | string | null;
  is_rate_only_total?: boolean;
  items?: any[];
  quotation_parent_id?: number | null;
  quotation_revision_number: number;
  quotation_is_active: boolean;
  status?: string | null;
  created_at?: string | null;
};

const revisionLabel = (revisionNumber: number) =>
  revisionNumber === 0 ? '原始版' : `R${revisionNumber}`;

// Searchable client dropdown
function ClientSearchSelect({ value, onChange, partners }: { value: any; onChange: (v: any) => void; partners: any[] }) {
  const { isReadOnly } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const clientPartners = partners.filter((p: any) => p.partner_type === 'client');
  const filtered = clientPartners.filter((p: any) =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())
  );
  const selected = clientPartners.find((p: any) => String(p.id) === String(value ?? ''));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`input-field text-left flex items-center justify-between w-full ${open ? 'border-primary-500 ring-1 ring-primary-300' : ''}`}>
        <span className={selected ? '' : 'text-gray-400'}>
          {selected ? (selected.code ? `${selected.code} - ${selected.name}` : selected.name) : '— 無 —'}
        </span>
        <span className="text-gray-400 ml-2">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜尋客戶名稱或代碼..." className="input-field text-sm" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button type="button" className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${!value ? 'bg-primary-50 text-primary-700' : ''}`}
              onMouseDown={() => { onChange(null); setOpen(false); setSearch(''); }}>
              <span className="text-gray-400">— 無 —</span>
            </button>
            {filtered.map((p: any) => (
              <button key={p.id} type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${String(p.id) === String(value ?? '') ? 'bg-primary-50 text-primary-700 font-medium' : ''}`}
                onMouseDown={() => { onChange(p.id); setOpen(false); setSearch(''); }}>
                {p.code ? `${p.code} - ${p.name}` : p.name}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">無結果</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuotationDetailPage() {
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('quotations');
  const params = useParams();
  const router = useRouter();
  const [quotation, setQuotation] = useState<any>(null);
  const quotationId = Number(params.id);
  const currentQuotationId = Number(quotation?.id || quotationId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revisions, setRevisions] = useState<QuotationRevisionSummary[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [creatingRevision, setCreatingRevision] = useState(false);
  const [settingActiveId, setSettingActiveId] = useState<number | null>(null);

  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [acceptForm, setAcceptForm] = useState<any>({
    project_name: '', effective_date: new Date().toISOString().slice(0, 10), expiry_date: '',
  });
  const [syncForm, setSyncForm] = useState<any>({
    effective_date: new Date().toISOString().slice(0, 10), expiry_date: '', overwrite: false,
  });
  const [accepting, setAccepting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<any>({
    date: new Date().toISOString().slice(0, 10), due_date: '', tax_rate: 0, payment_terms: '', remarks: '',
  });
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  
  const [detailModal, setDetailModal] = useState<{ isOpen: boolean; index: number | null }>({
    isOpen: false,
    index: null,
  });
  const FIELD_OPTION_CATEGORIES = ['tonnage', 'machine_type', 'service_type', 'location', 'wage_unit'];
  const { optionsMap } = useMultiFieldOptions(FIELD_OPTION_CATEGORIES);
  const tonnageOptions = optionsMap['tonnage'] || [];
  const vehicleTypeOptions = optionsMap['machine_type'] || [];
  const serviceTypeOptions = optionsMap['service_type'] || [];
  const locationOptions = optionsMap['location'] || [];
  const wageUnitOptions = optionsMap['wage_unit'] || [];

  const loadRevisions = async (targetQuotationId: number = quotationId) => {
    setRevisionsLoading(true);
    try {
      const res = await quotationsApi.getRevisions(targetQuotationId);
      setRevisions(res.data || []);
    } catch {
      setRevisions([]);
    } finally {
      setRevisionsLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const res = await quotationsApi.get(quotationId);
      const data = res.data;
      setQuotation(data);
      setForm({
        ...data,
        quotation_date: toInputDate(data.quotation_date),
        items: data.items || [],
      });
      await loadRevisions(Number(data.id));
      setLoading(false);
    } catch {
      router.push('/quotations');
    }
  };

  useEffect(() => {
    loadData();
    companiesApi.simple().then(res => setCompanies(res.data));
    partnersApi.simple().then(res => setPartners(res.data));
  }, [quotationId]);

  const handleSwitchRevision = (revisionId: number) => {
    if (revisionId === currentQuotationId) return;
    if (editing && !confirm('切換版本會放棄尚未儲存的修改，是否繼續？')) return;
    router.push(`/quotations/${revisionId}`);
  };

  const handleCreateRevision = async () => {
    if (readOnly) return;
    if (!confirm('確定要以目前版本內容建立新的修訂版嗎？')) return;
    setCreatingRevision(true);
    try {
      const res = await quotationsApi.createRevision(currentQuotationId);
      const newRevisionId = Number(res.data?.id);
      await loadRevisions(currentQuotationId);
      if (newRevisionId) {
        router.push(`/quotations/${newRevisionId}`);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '建立修訂版失敗');
    } finally {
      setCreatingRevision(false);
    }
  };

  const handleSetActiveRevision = async (revisionId: number) => {
    if (readOnly) return;
    if (!confirm('確定要將此版本設為正式版嗎？同組其他版本會改為非正式。')) return;
    setSettingActiveId(revisionId);
    try {
      await quotationsApi.setActiveRevision(revisionId);
      await loadRevisions(revisionId);
      if (revisionId === currentQuotationId) {
        await loadData();
      } else {
        router.push(`/quotations/${revisionId}`);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '設為正式版失敗');
    } finally {
      setSettingActiveId(null);
    }
  };

  const handleSave = async () => {
    try {
      const { company, client, project, invoices, quotation_parent_id, quotation_revision_number, quotation_is_active, created_at, updated_at, ...updateData } = form;
      updateData.items = updateData.items.map((item: any, idx: number) => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        sort_order: idx + 1,
      }));
      const res = await quotationsApi.update(currentQuotationId, updateData);
      setQuotation(res.data);
      setForm({ ...res.data, items: res.data.items || [] });
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await quotationsApi.updateStatus(currentQuotationId, newStatus);
      setQuotation(res.data);
      setForm({ ...res.data, items: res.data.items || [] });
    } catch (err: any) { alert(err.response?.data?.message || '狀態更新失敗'); }
  };

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await quotationsApi.accept(currentQuotationId, {
        project_name: acceptForm.project_name || quotation.project_name,
        effective_date: acceptForm.effective_date,
        expiry_date: acceptForm.expiry_date || undefined,
      });
      setQuotation(res.data);
      setForm({ ...res.data, items: res.data.items || [] });
      setShowAcceptModal(false);
      alert('報價單已接受！' + (quotation.quotation_type === 'project' ? ' 工程項目已建立。' : ' 價目記錄已生成。'));
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    } finally { setAccepting(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await quotationsApi.syncToRateCards(currentQuotationId, {
        effective_date: syncForm.effective_date,
        expiry_date: syncForm.expiry_date || undefined,
        overwrite: syncForm.overwrite,
      });
      setSyncResult(res.data);
    } catch (err: any) {
      alert(err.response?.data?.message || '同步失敗');
    } finally { setSyncing(false); }
  };

  const handleRefreshQuotationNo = async () => {
    try {
      const res = await quotationsApi.previewNumber({
        company_id: Number(form.company_id),
        client_id: form.client_id ? Number(form.client_id) : null,
        date: form.quotation_date,
      });
      if (res.data?.quotation_no) {
        setForm({ ...form, quotation_no: res.data.quotation_no });
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '取得預覽号碼失敗');
    }
  };

  const handleCreateInvoice = async () => {
    setCreatingInvoice(true);
    try {
      const res = await invoicesApi.createFromQuotation(currentQuotationId, {
        date: invoiceForm.date,
        due_date: invoiceForm.due_date || undefined,
        tax_rate: Number(invoiceForm.tax_rate) || 0,
        payment_terms: invoiceForm.payment_terms || undefined,
        remarks: invoiceForm.remarks || undefined,
      });
      setShowInvoiceModal(false);
      router.push(`/invoices/${res.data.id}`);
    } catch (err: any) {
      alert(err.response?.data?.message || '轉換失敗');
    } finally { setCreatingInvoice(false); }
  };

  const addItem = () => {
    const defaultUnit = String(wageUnitOptions[0]?.value || (form.quotation_type === 'rental' ? '天' : 'JOB'));
    setForm({ ...form, items: [...form.items, { item_name: '', item_description: '', quantity: 0, unit: defaultUnit, unit_price: 0, remarks: '' }] });
  };
  const removeItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) });
  };
  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };

  // Rate Only: explicit rate_only flag, or current legacy convention where quantity is 0/empty
  const isRateOnly = (item: any) => Boolean(item?.rate_only) || !item?.quantity || Number(item.quantity) === 0;
  const isRateOnlyTotal = (items: any[] = []) => items.length > 0 && items.every(isRateOnly);
  const itemAmount = (item: any) => isRateOnly(item) ? 0 : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  const totalAmount = (form.items || []).reduce((sum: number, item: any) => sum + itemAmount(item), 0);
  const allItemsRateOnly = editing
    ? isRateOnlyTotal(form.items || [])
    : Boolean(quotation?.is_rate_only_total) || isRateOnlyTotal(quotation?.items || []);

  const getUnitOptions = (currentUnit?: string | number | null) => {
    const normalizedCurrentUnit = currentUnit === null || currentUnit === undefined ? '' : String(currentUnit);
    if (!normalizedCurrentUnit || wageUnitOptions.some(option => String(option.value) === normalizedCurrentUnit)) {
      return wageUnitOptions;
    }
    return [...wageUnitOptions, { value: normalizedCurrentUnit, label: normalizedCurrentUnit }];
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/quotations" className="hover:text-primary-600">報價單</Link><span>/</span><span className="text-gray-900">{quotation?.quotation_no}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{quotation?.quotation_no}</h1>
            <span className={quotation?.quotation_type === 'project' ? 'badge-blue' : 'badge-purple'}>
              {typeLabels[quotation?.quotation_type] || quotation?.quotation_type}
            </span>
            <span className={statusColors[quotation?.status] || 'badge-gray'}>{statusLabels[quotation?.status] || quotation?.status}</span>
          </div>
          <p className="text-gray-500 mt-1">
            {quotation?.contract_name && <><span className="font-medium">{quotation.contract_name}</span> | </>}
            {quotation?.project_name || '-'}
            {quotation?.project && (
              <> | 工程項目：<Link href={`/projects/${quotation.project.id}`} className="text-primary-600 hover:underline font-mono">{quotation.project.project_no}</Link></>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Link href={`/quotations/${currentQuotationId}/pdf-preview`} className="btn-secondary">
            <span className="mr-1">📄</span> 匯出 PDF
          </Link>
          <button onClick={() => { setSyncResult(null); setSyncForm({ effective_date: quotation.quotation_date || new Date().toISOString().slice(0, 10), expiry_date: '', overwrite: false }); setShowSyncModal(true); }} className="btn-secondary">同步至價目表</button>
          {quotation?.status === 'draft' && (
            <button onClick={() => handleStatusChange('sent')} className="btn-secondary">標記已發送</button>
          )}
          {quotation?.status === 'sent' && (
            <>
              <button onClick={() => { setAcceptForm({ project_name: quotation.project_name || '', effective_date: quotation.quotation_date || new Date().toISOString().slice(0, 10), expiry_date: '' }); setShowAcceptModal(true); }} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">接受報價</button>
              <button onClick={() => handleStatusChange('rejected')} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">已拒絕</button>
            </>
          )}
          {quotation?.status !== 'draft' && quotation?.status !== 'rejected' && (
            <button onClick={() => { setInvoiceForm({ date: new Date().toISOString().slice(0, 10), due_date: '', tax_rate: 0, payment_terms: quotation.payment_terms || '', remarks: '' }); setShowInvoiceModal(true); }} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm">轉為發票</button>
          )}
          {quotation?.invoices?.length > 0 && (
            <div className="flex items-center gap-1 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg text-sm">
              <span>已開發票:</span>
              {quotation.invoices.map((invoice: any, index: number) => (
                <span key={invoice.id} className="inline-flex items-center">
                  {index > 0 && <span className="mx-1">,</span>}
                  <Link href={`/invoices/${invoice.id}`} className="hover:underline font-mono">
                    {invoice.invoice_no || `INV-${invoice.id}`}
                  </Link>
                </span>
              ))}
            </div>
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

      {/* Revision History */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">版本歷史</h2>
            <p className="text-sm text-gray-500 mt-1">每個修訂版本可獨立編輯、設為正式版與匯出 PDF。</p>
          </div>
          <button
            onClick={handleCreateRevision}
            disabled={readOnly || creatingRevision}
            className="btn-primary disabled:opacity-50"
          >
            {creatingRevision ? '建立中...' : '新增修訂版'}
          </button>
        </div>
        {revisionsLoading ? (
          <p className="text-sm text-gray-500">載入版本歷史中...</p>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-gray-500">暫無版本資料</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left">版本</th>
                  <th className="px-3 py-2 text-left">報價單號</th>
                  <th className="px-3 py-2 text-left">日期</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2 text-left">狀態</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((revision) => {
                  const isCurrent = revision.id === currentQuotationId;
                  return (
                    <tr key={revision.id} className={isCurrent ? 'border-b bg-primary-50' : 'border-b'}>
                      <td className="px-3 py-2">
                        <span className="font-medium">{revisionLabel(revision.quotation_revision_number)}</span>
                        {isCurrent && <span className="ml-2 text-xs text-primary-600">目前查看</span>}
                      </td>
                      <td className="px-3 py-2 font-mono">{revision.quotation_no}</td>
                      <td className="px-3 py-2">{fmtDate(revision.quotation_date)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {revision.is_rate_only_total || isRateOnlyTotal((revision as any).items || [])
                          ? <span className="text-orange-600 text-xs font-semibold">Rate Only</span>
                          : `HKD $${Number(revision.total_amount || 0).toLocaleString()}`}
                      </td>
                      <td className="px-3 py-2">
                        {revision.quotation_is_active ? (
                          <span className="badge-green">正式版</span>
                        ) : (
                          <span className="badge-gray">非正式</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          {!isCurrent && (
                            <button onClick={() => handleSwitchRevision(revision.id)} className="text-primary-600 hover:underline">查看</button>
                          )}
                          <Link href={`/quotations/${revision.id}/pdf-preview`} className="text-gray-600 hover:underline">PDF</Link>
                          {revision.quotation_is_active ? (
                            <span className="text-green-600 font-medium">已正式</span>
                          ) : (
                            <button
                              onClick={() => handleSetActiveRevision(revision.id)}
                              disabled={readOnly || settingActiveId === revision.id}
                              className="text-green-600 hover:underline disabled:opacity-50"
                            >
                              {settingActiveId === revision.id ? '設定中...' : '設為正式版'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Header Info */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">報價單資料</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">報價單號</label>
                <div className="flex gap-2">
                  <input value={form.quotation_no || ''} onChange={e => setForm({...form, quotation_no: e.target.value})} className="input-field font-mono flex-1" />
                  <button
                    type="button"
                    onClick={handleRefreshQuotationNo}
                    className="px-3 py-2 rounded border border-gray-300 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 text-gray-400 transition-colors text-sm"
                    title="刷新号碼"
                  >
                    🔄
                  </button>
                </div>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">報價類型</label>
                <select value={form.quotation_type} onChange={e => setForm({...form, quotation_type: e.target.value})} className="input-field">
                  <option value="project">工程報價</option>
                  <option value="rental">租賃/運輸報價</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">開立公司</label>
                <select value={form.company_id} onChange={e => setForm({...form, company_id: Number(e.target.value)})} className="input-field">
                  {companies.map((c: any) => <option key={c.id} value={c.id}>{c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
                <ClientSearchSelect value={form.client_id} onChange={v => setForm({...form, client_id: v})} partners={partners} />
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">日期</label>
 <DateInput value={form.quotation_date} onChange={val => setForm({ ...form, quotation_date: val || '' })} className="input-field" />
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶合約</label>
                <ClientContractCombobox
                  value={form.contract_name || ''}
                  onChange={(val) => setForm({...form, contract_name: val || ''})}
                />
              </div>
              <div><label className="block text-sm font-medium text-gray-500 mb-1">{form.quotation_type === 'project' ? '工程名稱' : '服務說明'}</label>
                <input value={form.project_name || ''} onChange={e => setForm({...form, project_name: e.target.value})} className="input-field" />
              </div>
            </>
          ) : (
            <>
              <div><p className="text-sm text-gray-500">報價單號</p><p className="font-mono font-bold">{quotation?.quotation_no}</p></div>
              <div><p className="text-sm text-gray-500">報價類型</p><p><span className={quotation?.quotation_type === 'project' ? 'badge-blue' : 'badge-purple'}>{typeLabels[quotation?.quotation_type]}</span></p></div>
              <div><p className="text-sm text-gray-500">開立公司</p><p className="font-medium">{quotation?.company?.internal_prefix} - {quotation?.company?.name}</p></div>
              <div><p className="text-sm text-gray-500">客戶</p><p className="font-medium">{quotation?.client?.name || '-'}</p></div>
              <div><p className="text-sm text-gray-500">日期</p><p>{fmtDate(quotation?.quotation_date)}</p></div>
              {quotation?.contract_name && <div><p className="text-sm text-gray-500">客戶合約</p><p className="font-medium font-mono">{quotation.contract_name}</p></div>}
              <div><p className="text-sm text-gray-500">{quotation?.quotation_type === 'project' ? '工程名稱' : '服務說明'}</p><p>{quotation?.project_name || '-'}</p></div>
              {quotation?.project && (
                <div><p className="text-sm text-gray-500">關聯工程項目</p><p><Link href={`/projects/${quotation.project.id}`} className="text-primary-600 hover:underline font-mono">{quotation.project.project_no} - {quotation.project.project_name}</Link></p></div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{quotation?.quotation_type === 'project' ? '報價明細' : '費率明細'}</h2>
          {editing && <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:underline">+ 新增項目</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left w-12">#</th>
                <th className="px-3 py-2 text-left">項目名稱 / 描述</th>
                <th className="px-3 py-2 text-right w-24">數量</th>
                <th className="px-3 py-2 text-left w-20">單位</th>
                <th className="px-3 py-2 text-right w-28">單價</th>
                <th className="px-3 py-2 text-right w-28">金額</th>
                {editing && <th className="px-3 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {(editing ? form.items : quotation?.items || []).map((item: any, idx: number) => {
                const rateOnly = !item.quantity || Number(item.quantity) === 0;
                const amt = rateOnly ? 0 : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                return (
                  <tr key={idx} className="border-b">
                    <td className="px-3 py-2 text-gray-500 align-top pt-3">{idx + 1}</td>
                    {editing ? (
                      <>
                        <td className="px-3 py-1">
                          <input value={item.item_name || ''} onChange={e => updateItem(idx, 'item_name', e.target.value)} className="input-field text-sm mb-1" placeholder="項目名稱（短）" />
                          <textarea value={item.item_description || ''} onChange={e => updateItem(idx, 'item_description', e.target.value)} className="input-field text-sm text-xs" rows={2} placeholder="項目描述（可多行）" />
                          <div className="flex items-center gap-4 mt-2">
                            <button 
                              type="button" 
                              onClick={() => setDetailModal({ isOpen: true, index: idx })}
                              className={`text-xs px-2 py-1 rounded border ${
                                (item.qi_service_type || item.qi_day_night || item.qi_tonnage || item.qi_machine_type || item.qi_origin || item.qi_destination || item.qi_ot_rate || item.qi_mid_shift_rate)
                                ? 'bg-primary-50 border-primary-200 text-primary-700'
                                : 'bg-gray-50 border-gray-200 text-gray-600'
                              }`}
                            >
                              {(item.qi_service_type || item.qi_day_night || item.qi_tonnage || item.qi_machine_type || item.qi_origin || item.qi_destination || item.qi_ot_rate || item.qi_mid_shift_rate)
                                ? '編輯詳細' : '加入詳細'}
                            </button>
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={!!item.qi_sync_to_rate_card} 
                                onChange={e => updateItem(idx, 'qi_sync_to_rate_card', e.target.checked)}
                                className="w-3.5 h-3.5"
                              />
                              同步到價目表
                            </label>
                          </div>
                        </td>
                        <td className="px-3 py-1 align-top pt-2"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="input-field text-sm text-right" /></td>
                        <td className="px-3 py-1 align-top pt-2">
                          <SearchableSelect
                            value={item.unit || null}
                            onChange={(value) => updateItem(idx, 'unit', value || '')}
                            options={getUnitOptions(item.unit)}
                            placeholder="選擇單位"
                            clearable={false}
                            className="min-w-[90px]"
                          />
                        </td>
                        <td className="px-3 py-1 align-top pt-2"><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} className="input-field text-sm text-right" /></td>
                        <td className="px-3 py-2 text-right font-mono align-top pt-3">
                          {rateOnly ? <span className="text-orange-600 text-xs font-semibold">Rate Only</span> : `$${amt.toLocaleString()}`}
                        </td>
                        <td className="px-3 py-2 align-top pt-3">
                          {form.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-lg">&times;</button>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2">
                          {item.item_name && <p className="font-medium">{item.item_name}</p>}
                          {item.item_description && <p className="text-gray-500 text-xs mt-0.5 whitespace-pre-wrap">{item.item_description}</p>}
                          {!item.item_name && !item.item_description && (item.description || '-')}
                          {(item.qi_service_type || item.qi_day_night || item.qi_tonnage || item.qi_machine_type || item.qi_origin || item.qi_destination) && (
                            <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1.5">
                              {item.qi_service_type && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] border border-gray-200">{item.qi_service_type}</span>}
                              {item.qi_day_night && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] border border-gray-200">{item.qi_day_night}</span>}
                              {item.qi_tonnage && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] border border-gray-200">{item.qi_tonnage}</span>}
                              {item.qi_machine_type && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] border border-gray-200">{item.qi_machine_type}</span>}
                              {(item.qi_origin || item.qi_destination) && (
                                <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] border border-gray-200">
                                  {item.qi_origin || '?'} → {item.qi_destination || '?'}
                                </span>
                              )}
                              {item.qi_ot_rate > 0 && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] border border-blue-100">OT: ${Number(item.qi_ot_rate).toLocaleString()}</span>}
                              {item.qi_mid_shift_rate > 0 && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] border border-blue-100">中直: ${Number(item.qi_mid_shift_rate).toLocaleString()}</span>}
                            </div>
                          )}
                          {item.qi_sync_to_rate_card && (
                            <p className="text-[10px] text-primary-600 font-medium mt-1">✓ 已標記同步到價目表</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {rateOnly ? <span className="text-orange-500 text-xs">—</span> : Number(item.quantity).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{item.unit}</td>
                        <td className="px-3 py-2 text-right font-mono">${Number(item.unit_price).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">
                          {rateOnly ? <span className="text-orange-600 text-xs font-semibold">Rate Only</span> : `$${amt.toLocaleString()}`}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td colSpan={editing ? 5 : 5} className="px-3 py-2 text-right">總金額：</td>
                <td className="px-3 py-2 text-right font-mono text-primary-600">
                  {allItemsRateOnly ? 'Rate Only' : `HKD $${editing ? totalAmount.toLocaleString() : Number(quotation?.total_amount).toLocaleString()}`}
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
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-500 mb-1">報價單備註（對外）</label>
              <textarea value={form.external_remark || ''} onChange={e => setForm({...form, external_remark: e.target.value})} className="input-field" rows={2} placeholder="顯示在報價單 PDF 上，給客戶看" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-500 mb-1">內部備註 <span className="text-xs text-gray-400 font-normal">（不顯示在 PDF）</span></label>
              <textarea value={form.internal_remark || ''} onChange={e => setForm({...form, internal_remark: e.target.value})} className="input-field" rows={2} placeholder="僅系統內部可見" />
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {quotation?.validity_period && <p><span className="font-medium text-gray-500">有效期：</span>{quotation.validity_period}</p>}
            {quotation?.payment_terms && <p><span className="font-medium text-gray-500">付款條件：</span>{quotation.payment_terms}</p>}
            {quotation?.exclusions && <p><span className="font-medium text-gray-500">除外責任：</span>{quotation.exclusions}</p>}
            {quotation?.external_remark && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs text-blue-500 font-medium mb-1">報價單備註（對外）</p>
                <p className="whitespace-pre-wrap">{quotation.external_remark}</p>
              </div>
            )}
            {quotation?.internal_remark && (
              <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                <p className="text-xs text-yellow-600 font-medium mb-1">內部備註（不顯示在 PDF）</p>
                <p className="whitespace-pre-wrap">{quotation.internal_remark}</p>
              </div>
            )}
            {!quotation?.validity_period && !quotation?.payment_terms && !quotation?.exclusions && !quotation?.external_remark && !quotation?.internal_remark && (
              <p className="text-gray-400">暫無備註</p>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <AttachmentUpload entityType="quotation" entityId={currentQuotationId} title="報價單文件" readOnly={readOnly} />
      </div>

      {/* Accept Quotation Modal */}
      <Modal isOpen={showAcceptModal} onClose={() => setShowAcceptModal(false)} title="接受報價單" size="md">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            {quotation?.quotation_type === 'project' ? (
              <p>接受此工程報價單後，系統將自動建立<strong>工程項目</strong>並生成對應的<strong>價目記錄</strong>。</p>
            ) : (
              <p>接受此租賃/運輸報價單後，系統將自動生成對應的<strong>客戶價目記錄</strong>。</p>
            )}
          </div>
          {quotation?.quotation_type === 'project' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">工程名稱</label>
              <input value={acceptForm.project_name} onChange={e => setAcceptForm({...acceptForm, project_name: e.target.value})} className="input-field" placeholder="工程項目名稱" />
              <p className="text-xs text-gray-400 mt-1">工程編號將自動生成</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">生效日期 *</label>
 <DateInput value={acceptForm.effective_date} onChange={val => setAcceptForm({ ...acceptForm, effective_date: val || '' })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">到期日期</label>
 <DateInput value={acceptForm.expiry_date} onChange={val => setAcceptForm({ ...acceptForm, expiry_date: val || '' })} className="input-field" />
              <p className="text-xs text-gray-400 mt-1">可選，如有合約期限</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowAcceptModal(false)} className="btn-secondary">取消</button>
            <button onClick={handleAccept} disabled={accepting} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm disabled:opacity-50">
              {accepting ? '處理中...' : '確認接受'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Sync to Rate Cards Modal */}
      <Modal isOpen={showSyncModal} onClose={() => { setShowSyncModal(false); setSyncResult(null); }} title="同步至價目表" size="md">
        <div className="space-y-4">
          {!syncResult ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                <p>將此報價單的明細項目同步到<strong>客戶價目表</strong>，方便工作記錄直接引用報價。</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">生效日期 *</label>
 <DateInput value={syncForm.effective_date} onChange={val => setSyncForm({ ...syncForm, effective_date: val || '' })} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">到期日期</label>
 <DateInput value={syncForm.expiry_date} onChange={val => setSyncForm({ ...syncForm, expiry_date: val || '' })} className="input-field" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="overwrite" checked={syncForm.overwrite} onChange={e => setSyncForm({...syncForm, overwrite: e.target.checked})} className="w-4 h-4" />
                <label htmlFor="overwrite" className="text-sm text-gray-700">覆蓋已存在的同名價目記錄</label>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={() => setShowSyncModal(false)} className="btn-secondary">取消</button>
                <button onClick={handleSync} disabled={syncing} className="btn-primary disabled:opacity-50">
                  {syncing ? '同步中...' : '確認同步'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-green-600">{syncResult.created}</p>
                    <p className="text-xs text-gray-500 mt-1">新增</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-blue-600">{syncResult.overwritten}</p>
                    <p className="text-xs text-gray-500 mt-1">已覆蓋</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-yellow-600">{syncResult.skipped}</p>
                    <p className="text-xs text-gray-500 mt-1">跳過（衝突）</p>
                  </div>
                </div>
                {syncResult.conflicts && syncResult.conflicts.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-yellow-700 mb-2">以下項目已存在，被跳過：</p>
                    <ul className="text-xs text-yellow-600 space-y-1">
                      {syncResult.conflicts.map((c: any, i: number) => (
                        <li key={i}>• {c.item_name}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-gray-500 mt-2">如需覆蓋，請勾選「覆蓋已存在的同名價目記錄」後重新同步。</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={() => { setShowSyncModal(false); setSyncResult(null); }} className="btn-primary">完成</button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Convert to Invoice Modal */}
      {showInvoiceModal && (
        <Modal isOpen={showInvoiceModal} title="報價單轉發票" onClose={() => setShowInvoiceModal(false)}>
          <div className="space-y-4">
            <div className="bg-purple-50 rounded-lg p-3 text-sm text-purple-700">
              將報價單 <strong>{quotation.quotation_no}</strong> 的所有項目轉為發票
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">發票日期</label>
 <DateInput value={invoiceForm.date} onChange={val => setInvoiceForm({ ...invoiceForm, date: val || '' })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">到期日</label>
 <DateInput value={invoiceForm.due_date} onChange={val => setInvoiceForm({ ...invoiceForm, due_date: val || '' })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">稅率 (%)</label>
                <input type="number" value={invoiceForm.tax_rate} onChange={e => setInvoiceForm({...invoiceForm, tax_rate: e.target.value})} className="input-field" min="0" step="0.01" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">付款條件</label>
                <input type="text" value={invoiceForm.payment_terms} onChange={e => setInvoiceForm({...invoiceForm, payment_terms: e.target.value})} className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea value={invoiceForm.remarks} onChange={e => setInvoiceForm({...invoiceForm, remarks: e.target.value})} className="input-field" rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button onClick={() => setShowInvoiceModal(false)} className="btn-secondary">取消</button>
              <button onClick={handleCreateInvoice} disabled={creatingInvoice} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
                {creatingInvoice ? '處理中...' : '確認轉換'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Item Detail Modal */}
      <Modal 
        isOpen={detailModal.isOpen} 
        onClose={() => setDetailModal({ isOpen: false, index: null })} 
        title="費率明細詳細資料" 
        size="lg"
      >
        {detailModal.index !== null && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">服務類型</label>
                <Combobox
                  value={form.items[detailModal.index]?.qi_service_type || ''}
                  onChange={(v) => updateItem(detailModal.index!, 'qi_service_type', v)}
                  options={serviceTypeOptions}
                  placeholder="選擇或輸入服務類型"
                />
              </div>
              <div>
                <label className="label">日夜</label>
                <select 
                  className="input-field"
                  value={form.items[detailModal.index]?.qi_day_night || ''}
                  onChange={(e) => updateItem(detailModal.index!, 'qi_day_night', e.target.value)}
                >
                  <option value="">-</option>
                  <option value="日">日</option>
                  <option value="夜">夜</option>
                </select>
              </div>
              <div>
                <label className="label">噸數</label>
                <Combobox
                  value={form.items[detailModal.index]?.qi_tonnage || ''}
                  onChange={(v) => updateItem(detailModal.index!, 'qi_tonnage', v)}
                  options={tonnageOptions}
                  placeholder="選擇或輸入噸數"
                />
              </div>
              <div>
                <label className="label">機種</label>
                <Combobox
                  value={form.items[detailModal.index]?.qi_machine_type || ''}
                  onChange={(v) => updateItem(detailModal.index!, 'qi_machine_type', v)}
                  options={vehicleTypeOptions}
                  placeholder="選擇或輸入機種"
                />
              </div>
              <div>
                <label className="label">起點</label>
                <Combobox
                  value={form.items[detailModal.index]?.qi_origin || ''}
                  onChange={(v) => updateItem(detailModal.index!, 'qi_origin', v)}
                  options={locationOptions}
                  placeholder="選擇或輸入起點"
                />
              </div>
              <div>
                <label className="label">終點</label>
                <Combobox
                  value={form.items[detailModal.index]?.qi_destination || ''}
                  onChange={(v) => updateItem(detailModal.index!, 'qi_destination', v)}
                  options={locationOptions}
                  placeholder="選擇或輸入終點"
                />
              </div>
              <div>
                <label className="label">單位</label>
                <SearchableSelect
                  value={form.items[detailModal.index]?.unit || null}
                  onChange={(value) => updateItem(detailModal.index!, 'unit', value || '')}
                  options={getUnitOptions(form.items[detailModal.index]?.unit)}
                  placeholder="選擇單位"
                  clearable={false}
                  className="w-full"
                />
              </div>
              <div>
                <label className="label">OT 費率 (每小時)</label>
                <input 
                  type="number" 
                  className="input-field"
                  value={form.items[detailModal.index]?.qi_ot_rate || ''}
                  onChange={(e) => updateItem(detailModal.index!, 'qi_ot_rate', e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div>
                <label className="label">中直費率 (每小時)</label>
                <input 
                  type="number" 
                  className="input-field"
                  value={form.items[detailModal.index]?.qi_mid_shift_rate || ''}
                  onChange={(e) => updateItem(detailModal.index!, 'qi_mid_shift_rate', e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button 
                type="button" 
                onClick={() => setDetailModal({ isOpen: false, index: null })} 
                className="btn-primary"
              >
                確定
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
