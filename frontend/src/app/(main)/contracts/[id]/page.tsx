'use client';
import { useState, useEffect, useCallback } from 'react';
import DateInput from '@/components/DateInput';
import { useParams, useRouter } from 'next/navigation';
import { contractsApi, partnersApi, projectsApi, bqSectionsApi, bqItemsApi, variationOrdersApi, contractSummaryApi, quotationsApi, paymentApplicationsApi } from '@/lib/api';
import Link from 'next/link';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import Modal from '@/components/Modal';
import IpaTabContent from '@/components/payment/IpaTabContent';
import RetentionTabContent from '@/components/retention/RetentionTabContent';
import { useAuth } from '@/lib/auth';

// ── Status labels ──
const statusLabels: Record<string, string> = { active: '進行中', completed: '已完成', cancelled: '已取消' };
const statusColors: Record<string, string> = { active: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red' };
const pStatusLabels: Record<string, string> = { pending: '等待', active: '進行中', completed: '已完成', cancelled: '已取消' };
const pStatusColors: Record<string, string> = { pending: 'badge-yellow', active: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red' };
const voStatusLabels: Record<string, string> = { draft: '草稿', submitted: '已提交', approved: '已批准', rejected: '已拒絕' };
const voStatusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
};

const UNIT_OPTIONS = ['m³', 'm²', 'm', 'no.', 'item', 'kg', 'ton', 'set', 'lot', 'day', 'hr', 'trip', 'L.S.'];

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = Number(params.id);
  const { isReadOnly } = useAuth();
  const [contract, setContract] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  // ── Tab: 基本資料 ──
  const [linkedProjects, setLinkedProjects] = useState<any[]>([]);

  // ── Tab: BQ ──
  const [sections, setSections] = useState<any[]>([]);
  const [bqItems, setBqItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number | null>>(new Set());
  const [sectionModal, setSectionModal] = useState<{ open: boolean; data?: any }>({ open: false });
  const [bqItemModal, setBqItemModal] = useState<{ open: boolean; data?: any }>({ open: false });
  const [editingBqItem, setEditingBqItem] = useState<number | null>(null);
  const [editBqForm, setEditBqForm] = useState<any>({});

  // ── Tab: VO ──
  const [voList, setVoList] = useState<any[]>([]);
  const [voModal, setVoModal] = useState<{ open: boolean; data?: any }>({ open: false });
  const [voDetail, setVoDetail] = useState<any>(null);
  const [voEditing, setVoEditing] = useState(false);
  const [voForm, setVoForm] = useState<any>({});
  const [voItems, setVoItems] = useState<any[]>([]);

  // ── Import from Quotation ──
  const [importModal, setImportModal] = useState(false);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [selectedQuotation, setSelectedQuotation] = useState<any>(null);
  const [quotationItems, setQuotationItems] = useState<any[]>([]);
  const [selectedImportItems, setSelectedImportItems] = useState<Set<number>>(new Set());
  const [importLoading, setImportLoading] = useState(false);

  // ── Load data ──
  const loadContract = useCallback(() => {
    contractsApi.get(contractId).then(res => {
      setContract(res.data);
      setForm({ ...res.data });
      setLoading(false);
    }).catch(() => router.push('/contracts'));
  }, [contractId, router]);

  const loadLinkedProjects = useCallback(() => {
    projectsApi.list({ contract_id: contractId, limit: 100 })
      .then(res => setLinkedProjects(res.data?.data || []))
      .catch(() => {});
  }, [contractId]);

  const loadBqData = useCallback(() => {
    bqSectionsApi.list(contractId).then(res => setSections(res.data || [])).catch(() => {});
    bqItemsApi.list(contractId).then(res => setBqItems(res.data || [])).catch(() => {});
    contractSummaryApi.get(contractId).then(res => setSummary(res.data?.data || null)).catch(() => {});
  }, [contractId]);

  const loadVoList = useCallback(() => {
    variationOrdersApi.list(contractId).then(res => setVoList(res.data || [])).catch(() => {});
  }, [contractId]);

  useEffect(() => {
    loadContract();
    loadLinkedProjects();
    partnersApi.simple().then(res => {
      setClients((res.data || []).filter((p: any) => p.partner_type === 'client'));
    });
  }, [contractId]);

  useEffect(() => {
    if (activeTab === 'bq') loadBqData();
    if (activeTab === 'vo') loadVoList();
  }, [activeTab, contractId]);

  // ── Contract CRUD ──
  const handleSave = async () => {
    try {
      const { client, _count, created_at, updated_at, bq_sections, bq_items, variation_orders, ...updateData } = form;
      if (updateData.original_amount !== undefined) updateData.original_amount = Number(updateData.original_amount) || 0;
      if (updateData.client_id) updateData.client_id = Number(updateData.client_id);
      const res = await contractsApi.update(contract.id, updateData);
      setContract(res.data);
      setForm({ ...res.data });
      setEditing(false);
    } catch (err: any) { alert(err.response?.data?.message || '更新失敗'); }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此合約嗎？')) return;
    try {
      await contractsApi.delete(contract.id);
      router.push('/contracts');
    } catch (err: any) { alert(err.response?.data?.message || '刪除失敗'); }
  };

  // ── BQ Section CRUD ──
  const handleSaveSection = async () => {
    try {
      const d = sectionModal.data;
      if (d.id) {
        await bqSectionsApi.update(contractId, d.id, { section_code: d.section_code, section_name: d.section_name, sort_order: d.sort_order });
      } else {
        await bqSectionsApi.create(contractId, { section_code: d.section_code, section_name: d.section_name });
      }
      setSectionModal({ open: false });
      loadBqData();
    } catch (err: any) { alert(err.response?.data?.message || '儲存失敗'); }
  };

  const handleDeleteSection = async (id: number) => {
    if (!confirm('確定要刪除此分部嗎？')) return;
    try {
      await bqSectionsApi.delete(contractId, id);
      loadBqData();
    } catch (err: any) { alert(err.response?.data?.message || '刪除失敗'); }
  };

  // ── BQ Item CRUD ──
  const handleSaveBqItem = async () => {
    try {
      const d = bqItemModal.data;
      if (d.id) {
        await bqItemsApi.update(contractId, d.id, d);
      } else {
        await bqItemsApi.create(contractId, d);
      }
      setBqItemModal({ open: false });
      loadBqData();
      loadContract();
    } catch (err: any) { alert(err.response?.data?.message || '儲存失敗'); }
  };

  const handleInlineSaveBq = async (id: number) => {
    try {
      await bqItemsApi.update(contractId, id, editBqForm);
      setEditingBqItem(null);
      loadBqData();
      loadContract();
    } catch (err: any) { alert(err.response?.data?.message || '儲存失敗'); }
  };

  const handleDeleteBqItem = async (id: number) => {
    if (!confirm('確定要刪除此 BQ 項目嗎？')) return;
    try {
      await bqItemsApi.delete(contractId, id);
      loadBqData();
      loadContract();
    } catch (err: any) { alert(err.response?.data?.message || '刪除失敗'); }
  };

  // ── VO CRUD ──
  const handleSaveVo = async () => {
    try {
      const d = { ...voForm, items: voItems.map((item: any, i: number) => ({ ...item, sort_order: i + 1 })) };
      if (voDetail?.id) {
        await variationOrdersApi.update(contractId, voDetail.id, d);
      } else {
        await variationOrdersApi.create(contractId, d);
      }
      setVoModal({ open: false });
      setVoDetail(null);
      loadVoList();
      loadBqData();
    } catch (err: any) { alert(err.response?.data?.message || '儲存失敗'); }
  };

  const handleVoStatusChange = async (voId: number, newStatus: string) => {
    const confirmMsg: Record<string, string> = {
      submitted: '確定要提交此變更指令嗎？', approved: '確定要批准此變更指令嗎？', rejected: '確定要拒絕此變更指令嗎？',
    };
    if (!confirm(confirmMsg[newStatus] || '確定？')) return;
    try {
      await variationOrdersApi.update(contractId, voId, { status: newStatus });
      loadVoList();
      loadBqData();
    } catch (err: any) { alert(err.response?.data?.message || '操作失敗'); }
  };

  const handleDeleteVo = async (id: number) => {
    if (!confirm('確定要刪除此變更指令嗎？')) return;
    try {
      await variationOrdersApi.delete(contractId, id);
      loadVoList();
    } catch (err: any) { alert(err.response?.data?.message || '刪除失敗'); }
  };

  const openVoDetail = async (vo: any) => {
    try {
      const res = await variationOrdersApi.get(contractId, vo.id);
      const data = res.data;
      setVoDetail(data);
      setVoForm({ vo_no: data.vo_no, title: data.title, description: data.description, submitted_date: data.submitted_date, approved_date: data.approved_date, status: data.status, remarks: data.remarks, approved_amount: data.approved_amount });
      setVoItems(data.items || []);
      setVoEditing(false);
      setVoModal({ open: true, data });
    } catch (err: any) { alert('載入失敗'); }
  };

  const openNewVo = () => {
    setVoDetail(null);
    setVoForm({ vo_no: '', title: '', description: '', status: 'draft', remarks: '' });
    setVoItems([{ item_no: '', description: '', quantity: 0, unit: '', unit_rate: 0, amount: 0 }]);
    setVoEditing(true);
    setVoModal({ open: true });
  };

  // ── Import from Quotation ──
  const openImportModal = async () => {
    setImportModal(true);
    setSelectedQuotation(null);
    setQuotationItems([]);
    setSelectedImportItems(new Set());
    try {
      const res = await quotationsApi.list({ clientId: contract?.client_id, limit: 100 });
      setQuotations(res.data?.data || []);
    } catch { setQuotations([]); }
  };

  const loadQuotationItems = async (qId: number) => {
    try {
      const res = await quotationsApi.get(qId);
      const items = res.data?.items || [];
      setQuotationItems(items);
      setSelectedImportItems(new Set(items.map((i: any) => i.id)));
    } catch { setQuotationItems([]); }
  };

  const handleImport = async () => {
    if (selectedImportItems.size === 0) return;
    setImportLoading(true);
    try {
      const items = quotationItems
        .filter((i: any) => selectedImportItems.has(i.id))
        .map((i: any, idx: number) => ({
          item_no: i.item_name || `Q${idx + 1}`,
          description: i.item_description || i.item_name || '',
          quantity: Number(i.quantity) || 0,
          unit: i.unit || '',
          unit_rate: Number(i.unit_price) || 0,
          remarks: i.remarks || '',
        }));
      await bqItemsApi.batchCreate(contractId, items);
      setImportModal(false);
      loadBqData();
      loadContract();
    } catch (err: any) { alert(err.response?.data?.message || '匯入失敗'); }
    setImportLoading(false);
  };

  // ── Helpers ──
  const toggleSection = (sectionId: number | null) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId);
      return next;
    });
  };

  const getItemsBySection = (sectionId: number | null) => {
    return bqItems.filter(i => (sectionId === null ? !i.section_id : i.section_id === sectionId));
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const tabs = [
    { key: 'info', label: '基本資料' },
    { key: 'bq', label: '工程量清單 (BQ)' },
    { key: 'vo', label: '變更指令 (VO)' },
    { key: 'projects', label: '項目列表' },
    { key: 'ipa', label: '計糧 (IPA)' },
    { key: 'retention', label: '扣留金' },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/contracts" className="hover:text-primary-600">合約管理</Link><span>/</span><span className="text-gray-900">{contract?.contract_no}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{contract?.contract_no}</h1>
            <span className={statusColors[contract?.status]}>{statusLabels[contract?.status]}</span>
          </div>
          <p className="text-gray-500 mt-1">{contract?.contract_name}</p>
        </div>
        {activeTab === 'info' && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={() => { setForm({ ...contract }); setEditing(false); }} className="btn-secondary">取消</button>
                <button onClick={handleSave} className="btn-primary">儲存</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
                {(contract?._count?.projects || 0) === 0 && (
                  <button onClick={handleDelete} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">刪除</button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card text-center">
            <p className="text-xs text-gray-500">原始合約金額</p>
            <p className="text-lg font-bold text-gray-900 font-mono">{fmt$(summary.original_amount)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">已批准 VO</p>
            <p className="text-lg font-bold text-green-600 font-mono">{fmt$(summary.approved_vo_amount)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">待批 VO</p>
            <p className="text-lg font-bold text-blue-600 font-mono">{fmt$(summary.pending_vo_amount)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">修訂合約總額</p>
            <p className="text-lg font-bold text-primary-600 font-mono">{fmt$(summary.revised_amount)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ═══════════ Tab: 基本資料 ═══════════ */}
      {activeTab === 'info' && (
        <>
          <div className="card mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">合約資料</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {editing ? (
                <>
                  <div><label className="block text-sm font-medium text-gray-500 mb-1">合約編號</label>
                    <input value={form.contract_no || ''} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" /></div>
                  <div><label className="block text-sm font-medium text-gray-500 mb-1">客戶</label>
                    <select value={form.client_id || ''} onChange={e => setForm({...form, client_id: e.target.value ? Number(e.target.value) : null})} className="input-field">
                      <option value="">請選擇</option>
                      {clients.map((c: any) => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ${c.name}` : c.name}</option>)}
                    </select></div>
                  <div><label className="block text-sm font-medium text-gray-500 mb-1">合約名稱</label>
                    <input value={form.contract_name || ''} onChange={e => setForm({...form, contract_name: e.target.value})} className="input-field" /></div>
                  <div><label className="block text-sm font-medium text-gray-500 mb-1">合約金額</label>
                    <input type="number" step="0.01" value={form.original_amount || ''} onChange={e => setForm({...form, original_amount: e.target.value})} className="input-field" /></div>
                  <div><label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
                    <select value={form.status || 'active'} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                      <option value="active">進行中</option><option value="completed">已完成</option><option value="cancelled">已取消</option>
                    </select></div>
                  <div><label className="block text-sm font-medium text-gray-500 mb-1">簽約日期</label>
                    <DateInput value={toInputDate(form.sign_date)} onChange={v => setForm({...form, sign_date: v})} className="input-field" /></div>
                  <div><label className="block text-sm font-medium text-gray-500 mb-1">開始日期</label>
                    <DateInput value={toInputDate(form.start_date)} onChange={v => setForm({...form, start_date: v})} className="input-field" /></div>
                  <div><label className="block text-sm font-medium text-gray-500 mb-1">結束日期</label>
                    <DateInput value={toInputDate(form.end_date)} onChange={v => setForm({...form, end_date: v})} className="input-field" /></div>
                  <div className="lg:col-span-3"><label className="block text-sm font-medium text-gray-500 mb-1">說明</label>
                    <textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={3} /></div>
                </>
              ) : (
                <>
                  <div><p className="text-sm text-gray-500">合約編號</p><p className="font-mono font-bold">{contract?.contract_no}</p></div>
                  <div><p className="text-sm text-gray-500">合約名稱</p><p className="font-medium">{contract?.contract_name}</p></div>
                  <div><p className="text-sm text-gray-500">客戶</p><p>{contract?.client?.name || '-'}</p></div>
                  <div><p className="text-sm text-gray-500">合約金額</p><p className="font-mono">{fmt$(contract?.original_amount)}</p></div>
                  <div><p className="text-sm text-gray-500">狀態</p><p><span className={statusColors[contract?.status]}>{statusLabels[contract?.status]}</span></p></div>
                  <div><p className="text-sm text-gray-500">簽約日期</p><p>{fmtDate(contract?.sign_date)}</p></div>
                  <div><p className="text-sm text-gray-500">開始日期</p><p>{fmtDate(contract?.start_date)}</p></div>
                  <div><p className="text-sm text-gray-500">結束日期</p><p>{fmtDate(contract?.end_date)}</p></div>
                  {contract?.description && <div className="lg:col-span-3"><p className="text-sm text-gray-500">說明</p><p>{contract.description}</p></div>}
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="card text-center"><p className="text-sm text-gray-500">關聯項目</p><p className="text-2xl font-bold text-primary-600">{contract?._count?.projects || 0}</p></div>
            <div className="card text-center"><p className="text-sm text-gray-500">關聯支出</p><p className="text-2xl font-bold text-orange-600">{contract?._count?.expenses || 0}</p></div>
            <div className="card text-center"><p className="text-sm text-gray-500">合約金額</p><p className="text-2xl font-bold text-green-600">{fmt$(contract?.original_amount)}</p></div>
          </div>
        </>
      )}

      {/* ═══════════ Tab: BQ ═══════════ */}
      {activeTab === 'bq' && (
        <>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setSectionModal({ open: true, data: { section_code: '', section_name: '' } })} className="btn-secondary text-sm">新增分部</button>
            <button onClick={() => setBqItemModal({ open: true, data: { item_no: '', description: '', quantity: 0, unit: '', unit_rate: 0, section_id: '' } })} className="btn-primary text-sm">新增項目</button>
            <button onClick={openImportModal} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm">從報價單匯入</button>
          </div>

          {/* Sections with items */}
          {sections.map((sec: any) => {
            const sItems = getItemsBySection(sec.id);
            const sectionTotal = sItems.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
            return (
              <div key={sec.id} className="card mb-4">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection(sec.id)}>
                  <div className="flex items-center gap-3">
                    <svg className={`w-4 h-4 transition-transform ${expandedSections.has(sec.id) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    <span className="font-bold text-gray-900">{sec.section_code} - {sec.section_name}</span>
                    <span className="text-xs text-gray-400">({sItems.length} 項)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold">{fmt$(sectionTotal)}</span>
                    <button onClick={(e) => { e.stopPropagation(); setSectionModal({ open: true, data: { ...sec } }); }} className="text-xs text-blue-600 hover:underline">編輯</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSection(sec.id); }} className="text-xs text-red-600 hover:underline">刪除</button>
                  </div>
                </div>
                {expandedSections.has(sec.id) && (
                  <div className="mt-3">
                    {renderBqItemsTable(sItems)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Uncategorized items */}
          {(() => {
            const uncategorized = getItemsBySection(null);
            if (uncategorized.length === 0 && sections.length > 0) return null;
            return (
              <div className="card mb-4">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection(null)}>
                  <div className="flex items-center gap-3">
                    <svg className={`w-4 h-4 transition-transform ${expandedSections.has(null) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    <span className="font-bold text-gray-900">未分類</span>
                    <span className="text-xs text-gray-400">({uncategorized.length} 項)</span>
                  </div>
                  <span className="font-mono text-sm font-bold">{fmt$(uncategorized.reduce((s: number, i: any) => s + Number(i.amount || 0), 0))}</span>
                </div>
                {expandedSections.has(null) && (
                  <div className="mt-3">
                    {renderBqItemsTable(uncategorized)}
                  </div>
                )}
              </div>
            );
          })()}

          {bqItems.length === 0 && sections.length === 0 && (
            <div className="card text-center py-12 text-gray-400">
              <p className="text-lg mb-2">尚未建立工程量清單</p>
              <p className="text-sm">點擊「新增項目」或「從報價單匯入」開始建立 BQ</p>
            </div>
          )}
        </>
      )}

      {/* ═══════════ Tab: VO ═══════════ */}
      {activeTab === 'vo' && (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">變更指令列表</h2>
            <button onClick={openNewVo} className="btn-primary text-sm">新增 VO</button>
          </div>

          {voList.length > 0 ? (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left">VO 編號</th>
                    <th className="px-3 py-2 text-left">標題</th>
                    <th className="px-3 py-2 text-left">提交日期</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-right">批准金額</th>
                    <th className="px-3 py-2 text-center">狀態</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {voList.map((vo: any) => (
                    <tr key={vo.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono font-bold text-primary-600 cursor-pointer" onClick={() => openVoDetail(vo)}>{vo.vo_no}</td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => openVoDetail(vo)}>{vo.title}</td>
                      <td className="px-3 py-2">{fmtDate(vo.submitted_date)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt$(vo.total_amount)}</td>
                      <td className="px-3 py-2 text-right font-mono">{vo.status === 'approved' ? fmt$(vo.approved_amount) : '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voStatusColors[vo.status]}`}>{voStatusLabels[vo.status]}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex gap-1 justify-center">
                          {vo.status === 'draft' && (
                            <>
                              <button onClick={() => handleVoStatusChange(vo.id, 'submitted')} className="text-xs text-blue-600 hover:underline">提交</button>
                              <button onClick={() => handleDeleteVo(vo.id)} className="text-xs text-red-600 hover:underline">刪除</button>
                            </>
                          )}
                          {vo.status === 'submitted' && (
                            <>
                              <button onClick={() => handleVoStatusChange(vo.id, 'approved')} className="text-xs text-green-600 hover:underline">批准</button>
                              <button onClick={() => handleVoStatusChange(vo.id, 'rejected')} className="text-xs text-red-600 hover:underline">拒絕</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card text-center py-12 text-gray-400">
              <p className="text-lg mb-2">尚無變更指令</p>
              <p className="text-sm">點擊「新增 VO」開始建立變更指令</p>
            </div>
          )}
        </>
      )}

      {/* ═══════════ Tab: 項目列表 ═══════════ */}
      {activeTab === 'projects' && (
        <div className="card mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">關聯工程項目</h2>
          {linkedProjects.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left">工程編號</th>
                    <th className="px-3 py-2 text-left">工程名稱</th>
                    <th className="px-3 py-2 text-left">公司</th>
                    <th className="px-3 py-2 text-left">開始日期</th>
                    <th className="px-3 py-2 text-left">結束日期</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedProjects.map((p: any) => (
                    <tr key={p.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                      <td className="px-3 py-2 font-mono font-bold text-primary-600">{p.project_no}</td>
                      <td className="px-3 py-2">{p.project_name || '-'}</td>
                      <td className="px-3 py-2">{p.company?.internal_prefix || p.company?.name || '-'}</td>
                      <td className="px-3 py-2">{fmtDate(p.start_date)}</td>
                      <td className="px-3 py-2">{fmtDate(p.end_date)}</td>
                      <td className="px-3 py-2"><span className={pStatusColors[p.status] || 'badge-gray'}>{pStatusLabels[p.status] || p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">暫無關聯工程項目</p>
          )}
        </div>
      )}

      {/* ═══════════ Tab: 計糧 (IPA) ═══════════ */}
      {activeTab === 'ipa' && (
        <IpaTabContent contractId={contractId} />
      )}

      {/* ═══════════ Tab: 扣留金 ═══════════ */}
      {activeTab === 'retention' && (
        <RetentionTabContent contractId={contractId} />
      )}

      {/* ═══════════ Modals ═══════════ */}

      {/* Section Modal */}
      <Modal isOpen={sectionModal.open} onClose={() => setSectionModal({ open: false })} title={sectionModal.data?.id ? '編輯分部' : '新增分部'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">分部代碼 <span className="text-red-500">*</span></label>
            <input value={sectionModal.data?.section_code || ''} onChange={e => setSectionModal({ ...sectionModal, data: { ...sectionModal.data, section_code: e.target.value } })} className="input-field" placeholder="例如：A, B, C" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">分部名稱 <span className="text-red-500">*</span></label>
            <input value={sectionModal.data?.section_name || ''} onChange={e => setSectionModal({ ...sectionModal, data: { ...sectionModal.data, section_name: e.target.value } })} className="input-field" placeholder="例如：土方工程" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setSectionModal({ open: false })} className="btn-secondary">取消</button>
            <button onClick={handleSaveSection} className="btn-primary">儲存</button>
          </div>
        </div>
      </Modal>

      {/* BQ Item Modal */}
      <Modal isOpen={bqItemModal.open} onClose={() => setBqItemModal({ open: false })} title={bqItemModal.data?.id ? '編輯 BQ 項目' : '新增 BQ 項目'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">所屬分部</label>
              <select value={bqItemModal.data?.section_id || ''} onChange={e => setBqItemModal({ ...bqItemModal, data: { ...bqItemModal.data, section_id: e.target.value ? Number(e.target.value) : null } })} className="input-field">
                <option value="">未分類</option>
                {sections.map((s: any) => <option key={s.id} value={s.id}>{s.section_code} - {s.section_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">項目編號 <span className="text-red-500">*</span></label>
              <input value={bqItemModal.data?.item_no || ''} onChange={e => setBqItemModal({ ...bqItemModal, data: { ...bqItemModal.data, item_no: e.target.value } })} className="input-field" placeholder="例如：A1" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述 <span className="text-red-500">*</span></label>
            <textarea value={bqItemModal.data?.description || ''} onChange={e => setBqItemModal({ ...bqItemModal, data: { ...bqItemModal.data, description: e.target.value } })} className="input-field" rows={2} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">數量</label>
              <input type="number" step="0.0001" value={bqItemModal.data?.quantity ?? ''} onChange={e => setBqItemModal({ ...bqItemModal, data: { ...bqItemModal.data, quantity: e.target.value } })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">單位</label>
              <select value={bqItemModal.data?.unit || ''} onChange={e => setBqItemModal({ ...bqItemModal, data: { ...bqItemModal.data, unit: e.target.value } })} className="input-field">
                <option value="">-</option>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">單價</label>
              <input type="number" step="0.01" value={bqItemModal.data?.unit_rate ?? ''} onChange={e => setBqItemModal({ ...bqItemModal, data: { ...bqItemModal.data, unit_rate: e.target.value } })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">金額</label>
              <p className="input-field bg-gray-50 font-mono">{fmt$(((Number(bqItemModal.data?.quantity) || 0) * (Number(bqItemModal.data?.unit_rate) || 0)))}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input value={bqItemModal.data?.remarks || ''} onChange={e => setBqItemModal({ ...bqItemModal, data: { ...bqItemModal.data, remarks: e.target.value } })} className="input-field" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setBqItemModal({ open: false })} className="btn-secondary">取消</button>
            <button onClick={handleSaveBqItem} className="btn-primary">儲存</button>
          </div>
        </div>
      </Modal>

      {/* VO Detail/Edit Modal */}
      <Modal isOpen={voModal.open} onClose={() => { setVoModal({ open: false }); setVoDetail(null); }} title={voDetail ? `VO: ${voDetail.vo_no}` : '新增變更指令'} size="xl">
        <div className="space-y-4">
          {/* VO basic info */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">VO 編號 <span className="text-red-500">*</span></label>
              <input value={voForm.vo_no || ''} onChange={e => setVoForm({ ...voForm, vo_no: e.target.value })} className="input-field" disabled={!!voDetail && !voEditing} placeholder="例如：VO-001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">標題 <span className="text-red-500">*</span></label>
              <input value={voForm.title || ''} onChange={e => setVoForm({ ...voForm, title: e.target.value })} className="input-field" disabled={!!voDetail && !voEditing} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voStatusColors[voForm.status || 'draft']}`}>{voStatusLabels[voForm.status || 'draft']}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea value={voForm.description || ''} onChange={e => setVoForm({ ...voForm, description: e.target.value })} className="input-field" rows={2} disabled={!!voDetail && !voEditing} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">提交日期</label>
              <DateInput value={toInputDate(voForm.submitted_date)} onChange={v => setVoForm({...voForm, submitted_date: v})} className="input-field" disabled={!!voDetail && !voEditing} />
            </div>
            {voForm.status === 'approved' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">批准金額</label>
                <input type="number" step="0.01" value={voForm.approved_amount ?? ''} onChange={v => setVoForm({...voForm, submitted_date: v})} className="input-field" disabled={!voEditing} />
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input value={voForm.remarks || ''} onChange={e => setVoForm({...voForm, remarks: e.target.value})} className="input-field" disabled={!!voDetail && !voEditing} />
          </div>

          {/* VO Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900">項目明細</h3>
              {(!voDetail || voEditing) && (
                <button onClick={() => setVoItems([...voItems, { item_no: '', description: '', quantity: 0, unit: '', unit_rate: 0, amount: 0 }])} className="text-xs text-primary-600 hover:underline">+ 新增行</button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-2 py-1.5 text-left w-20">編號</th>
                    <th className="px-2 py-1.5 text-left">描述</th>
                    <th className="px-2 py-1.5 text-right w-24">數量</th>
                    <th className="px-2 py-1.5 text-center w-16">單位</th>
                    <th className="px-2 py-1.5 text-right w-24">單價</th>
                    <th className="px-2 py-1.5 text-right w-28">金額</th>
                    {(!voDetail || voEditing) && <th className="px-2 py-1.5 w-12"></th>}
                  </tr>
                </thead>
                <tbody>
                  {voItems.map((item: any, idx: number) => {
                    const amt = (Number(item.quantity) || 0) * (Number(item.unit_rate) || 0);
                    return (
                      <tr key={idx} className="border-b">
                        <td className="px-2 py-1">
                          {(!voDetail || voEditing) ? (
                            <input value={item.item_no} onChange={e => { const arr = [...voItems]; arr[idx] = { ...arr[idx], item_no: e.target.value }; setVoItems(arr); }} className="w-full px-1 py-0.5 text-sm border rounded" />
                          ) : <span className="font-mono">{item.item_no}</span>}
                        </td>
                        <td className="px-2 py-1">
                          {(!voDetail || voEditing) ? (
                            <input value={item.description} onChange={e => { const arr = [...voItems]; arr[idx] = { ...arr[idx], description: e.target.value }; setVoItems(arr); }} className="w-full px-1 py-0.5 text-sm border rounded" />
                          ) : item.description}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {(!voDetail || voEditing) ? (
                            <input type="number" step="0.0001" value={item.quantity} onChange={e => { const arr = [...voItems]; arr[idx] = { ...arr[idx], quantity: e.target.value }; setVoItems(arr); }} className="w-full px-1 py-0.5 text-sm border rounded text-right" />
                          ) : <span className="font-mono">{Number(item.quantity).toLocaleString()}</span>}
                        </td>
                        <td className="px-2 py-1 text-center">
                          {(!voDetail || voEditing) ? (
                            <select value={item.unit || ''} onChange={e => { const arr = [...voItems]; arr[idx] = { ...arr[idx], unit: e.target.value }; setVoItems(arr); }} className="w-full px-1 py-0.5 text-sm border rounded">
                              <option value="">-</option>
                              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          ) : (item.unit || '-')}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {(!voDetail || voEditing) ? (
                            <input type="number" step="0.01" value={item.unit_rate} onChange={e => { const arr = [...voItems]; arr[idx] = { ...arr[idx], unit_rate: e.target.value }; setVoItems(arr); }} className="w-full px-1 py-0.5 text-sm border rounded text-right" />
                          ) : <span className="font-mono">{fmt$(item.unit_rate)}</span>}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{fmt$(amt)}</td>
                        {(!voDetail || voEditing) && (
                          <td className="px-2 py-1 text-center">
                            <button onClick={() => setVoItems(voItems.filter((_: any, i: number) => i !== idx))} className="text-red-500 hover:text-red-700 text-xs">✕</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={5} className="px-2 py-2 text-right">合計：</td>
                    <td className="px-2 py-2 text-right font-mono">{fmt$(voItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 0) * (Number(i.unit_rate) || 0), 0))}</td>
                    {(!voDetail || voEditing) && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-2">
            <div>
              {voDetail && voDetail.status === 'draft' && !voEditing && (
                <button onClick={() => setVoEditing(true)} className="text-sm text-blue-600 hover:underline">編輯</button>
              )}
              {voDetail && voDetail.status === 'submitted' && !voEditing && (
                <button onClick={() => setVoEditing(true)} className="text-sm text-blue-600 hover:underline">編輯</button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setVoModal({ open: false }); setVoDetail(null); }} className="btn-secondary">
                {voDetail && !voEditing ? '關閉' : '取消'}
              </button>
              {(!voDetail || voEditing) && (
                <button onClick={handleSaveVo} className="btn-primary">儲存</button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Import from Quotation Modal */}
      <Modal isOpen={importModal} onClose={() => setImportModal(false)} title="從報價單匯入 BQ" size="xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">選擇報價單</label>
            <select
              value={selectedQuotation?.id || ''}
              onChange={e => {
                const qId = Number(e.target.value);
                const q = quotations.find((q: any) => q.id === qId);
                setSelectedQuotation(q || null);
                if (qId) loadQuotationItems(qId);
                else { setQuotationItems([]); setSelectedImportItems(new Set()); }
              }}
              className="input-field"
            >
              <option value="">請選擇報價單</option>
              {quotations.map((q: any) => (
                <option key={q.id} value={q.id}>{q.quotation_no} - {q.project_name || q.description || '未命名'}</option>
              ))}
            </select>
          </div>

          {quotationItems.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">共 {quotationItems.length} 項，已選 {selectedImportItems.size} 項</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedImportItems(new Set(quotationItems.map((i: any) => i.id)))} className="text-xs text-blue-600 hover:underline">全選</button>
                  <button onClick={() => setSelectedImportItems(new Set())} className="text-xs text-gray-600 hover:underline">取消全選</button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm border">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b">
                      <th className="px-2 py-1.5 w-8"><input type="checkbox" checked={selectedImportItems.size === quotationItems.length} onChange={e => setSelectedImportItems(e.target.checked ? new Set(quotationItems.map((i: any) => i.id)) : new Set())} /></th>
                      <th className="px-2 py-1.5 text-left">項目名稱</th>
                      <th className="px-2 py-1.5 text-left">描述</th>
                      <th className="px-2 py-1.5 text-right">數量</th>
                      <th className="px-2 py-1.5 text-center">單位</th>
                      <th className="px-2 py-1.5 text-right">單價</th>
                      <th className="px-2 py-1.5 text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotationItems.map((item: any) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        <td className="px-2 py-1"><input type="checkbox" checked={selectedImportItems.has(item.id)} onChange={e => {
                          const next = new Set(selectedImportItems);
                          if (e.target.checked) next.add(item.id); else next.delete(item.id);
                          setSelectedImportItems(next);
                        }} /></td>
                        <td className="px-2 py-1">{item.item_name || '-'}</td>
                        <td className="px-2 py-1 text-gray-500 text-xs">{item.item_description || '-'}</td>
                        <td className="px-2 py-1 text-right font-mono">{Number(item.quantity).toLocaleString()}</td>
                        <td className="px-2 py-1 text-center">{item.unit || '-'}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt$(item.unit_price)}</td>
                        <td className="px-2 py-1 text-right font-mono">{fmt$(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setImportModal(false)} className="btn-secondary">取消</button>
            <button onClick={handleImport} disabled={selectedImportItems.size === 0 || importLoading} className="btn-primary disabled:opacity-50">
              {importLoading ? '匯入中...' : `匯入 ${selectedImportItems.size} 項`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );

  // ── BQ Items Table (reusable) ──
  function renderBqItemsTable(items: any[]) {
    if (items.length === 0) return <p className="text-gray-400 text-sm py-2">暫無項目</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-2 py-1.5 text-left w-24">項目編號</th>
              <th className="px-2 py-1.5 text-left">描述</th>
              <th className="px-2 py-1.5 text-right w-24">數量</th>
              <th className="px-2 py-1.5 text-center w-16">單位</th>
              <th className="px-2 py-1.5 text-right w-28">單價</th>
              <th className="px-2 py-1.5 text-right w-28">金額</th>
              <th className="px-2 py-1.5 text-center w-28">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => {
              const isEditing = editingBqItem === item.id;
              return (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="px-2 py-1">
                    {isEditing ? <input value={editBqForm.item_no || ''} onChange={e => setEditBqForm({ ...editBqForm, item_no: e.target.value })} className="w-full px-1 py-0.5 text-sm border rounded" /> : <span className="font-mono font-bold">{item.item_no}</span>}
                  </td>
                  <td className="px-2 py-1">
                    {isEditing ? <input value={editBqForm.description || ''} onChange={e => setEditBqForm({ ...editBqForm, description: e.target.value })} className="w-full px-1 py-0.5 text-sm border rounded" /> : item.description}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {isEditing ? <input type="number" step="0.0001" value={editBqForm.quantity ?? ''} onChange={e => setEditBqForm({ ...editBqForm, quantity: e.target.value })} className="w-full px-1 py-0.5 text-sm border rounded text-right" /> : <span className="font-mono">{Number(item.quantity).toLocaleString()}</span>}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {isEditing ? (
                      <select value={editBqForm.unit || ''} onChange={e => setEditBqForm({ ...editBqForm, unit: e.target.value })} className="w-full px-1 py-0.5 text-sm border rounded">
                        <option value="">-</option>
                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (item.unit || '-')}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {isEditing ? <input type="number" step="0.01" value={editBqForm.unit_rate ?? ''} onChange={e => setEditBqForm({ ...editBqForm, unit_rate: e.target.value })} className="w-full px-1 py-0.5 text-sm border rounded text-right" /> : <span className="font-mono">{fmt$(item.unit_rate)}</span>}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    {isEditing ? fmt$((Number(editBqForm.quantity) || 0) * (Number(editBqForm.unit_rate) || 0)) : fmt$(item.amount)}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {isEditing ? (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => handleInlineSaveBq(item.id)} className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">儲存</button>
                        <button onClick={() => setEditingBqItem(null)} className="px-2 py-0.5 text-xs bg-gray-400 text-white rounded hover:bg-gray-500">取消</button>
                      </div>
                    ) : (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => { setEditingBqItem(item.id); setEditBqForm({ ...item }); }} className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">編輯</button>
                        <button onClick={() => handleDeleteBqItem(item.id)} className="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600">刪除</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold">
              <td colSpan={5} className="px-2 py-2 text-right">小計：</td>
              <td className="px-2 py-2 text-right font-mono">{fmt$(items.reduce((s: number, i: any) => s + Number(i.amount || 0), 0))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }
}
