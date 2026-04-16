'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { paymentApplicationsApi, paymentInApi, bankAccountsApi } from '@/lib/api';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import Modal from '@/components/Modal';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtQty = (v: any) => { const n = Number(v); return n % 1 === 0 ? n.toFixed(0) : n.toFixed(4).replace(/0+$/, ''); };

const IPA_STATUS_LABELS: Record<string, string> = {
  draft: '草稿', submitted: '已提交', certified: '已認證', partially_paid: '部分收款', paid: '已收款', void: '已作廢',
};
const IPA_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  certified: 'bg-green-100 text-green-700',
  partially_paid: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-purple-100 text-purple-700',
  void: 'bg-red-100 text-red-700',
};

export default function IpaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = Number(params.id);
  const paId = Number(params.paId);

  const [ipa, setIpa] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('bq');

  // Local edit state for BQ/VO progress
  const [localBqProgress, setLocalBqProgress] = useState<any[]>([]);
  const [localVoProgress, setLocalVoProgress] = useState<any[]>([]);
  const [dirty, setDirty] = useState(false);

  // Modals
  const [showCertifyModal, setShowCertifyModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showDeductionModal, setShowDeductionModal] = useState(false);

  // Certify modal state
  const [useClientAmount, setUseClientAmount] = useState(false);
  const [clientAmount, setClientAmount] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Payment records
  const [payments, setPayments] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  // Payment modal state
  const [paidAmount, setPaidAmount] = useState('');
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentBankAccountId, setPaymentBankAccountId] = useState('');
  const [paymentReferenceNo, setPaymentReferenceNo] = useState('');
  const [paymentRemarks, setPaymentRemarks] = useState('');

  // Material/Deduction form
  const [materialForm, setMaterialForm] = useState({ description: '', amount: '', remarks: '' });
  const [deductionForm, setDeductionForm] = useState({ deduction_type: 'other', description: '', amount: '', remarks: '' });

  const fetchIpa = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentApplicationsApi.get(contractId, paId);
      const data = res.data?.data;
      setIpa(data);
      setLocalBqProgress(data?.bq_progress || []);
      setLocalVoProgress(data?.vo_progress || []);
      setDirty(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [contractId, paId]);

  const loadPayments = useCallback(async () => {
    try {
      const res = await paymentInApi.list({ source_type: 'IPA', source_ref_id: paId, limit: 200 });
      setPayments(res.data?.data || []);
    } catch { }
  }, [paId]);

  useEffect(() => {
    fetchIpa();
    loadPayments();
    bankAccountsApi.simple().then(res => setBankAccounts(res.data || [])).catch(() => {});
  }, [fetchIpa, loadPayments]);

  const editable = ipa?.status === 'draft';

  // ── BQ progress local update ──
  const handleBqChange = (bqItemId: number, currentQty: number) => {
    setLocalBqProgress(prev => prev.map(item => {
      if (item.bq_item?.id !== bqItemId) return item;
      const prevQty = Number(item.prev_cumulative_qty);
      const unitRate = Number(item.unit_rate);
      const thisPeriodQty = currentQty - prevQty;
      return {
        ...item,
        current_cumulative_qty: currentQty,
        this_period_qty: thisPeriodQty,
        current_amount: currentQty * unitRate,
        this_period_amount: thisPeriodQty * unitRate,
      };
    }));
    setDirty(true);
  };

  // ── VO progress local update ──
  const handleVoChange = (voItemId: number, currentQty: number) => {
    setLocalVoProgress(prev => prev.map(item => {
      if (item.vo_item?.id !== voItemId) return item;
      const prevQty = Number(item.prev_cumulative_qty);
      const unitRate = Number(item.unit_rate);
      const thisPeriodQty = currentQty - prevQty;
      return {
        ...item,
        current_cumulative_qty: currentQty,
        this_period_qty: thisPeriodQty,
        current_amount: currentQty * unitRate,
        this_period_amount: thisPeriodQty * unitRate,
      };
    }));
    setDirty(true);
  };

  // ── Save progress ──
  const handleSave = async () => {
    setSaving(true);
    try {
      await paymentApplicationsApi.updateBqProgress(contractId, paId,
        localBqProgress.map(p => ({ bq_item_id: p.bq_item?.id, current_cumulative_qty: Number(p.current_cumulative_qty) }))
      );
      if (localVoProgress.length > 0) {
        await paymentApplicationsApi.updateVoProgress(contractId, paId,
          localVoProgress.map(p => ({ vo_item_id: p.vo_item?.id, current_cumulative_qty: Number(p.current_cumulative_qty) }))
        );
      }
      await fetchIpa();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  // ── Status actions ──
  const handleSubmit = async () => {
    if (dirty) await handleSave();
    try {
      await paymentApplicationsApi.submit(contractId, paId);
      fetchIpa();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '提交失敗');
    }
  };

  const handleCertify = async () => {
    try {
      await paymentApplicationsApi.certify(contractId, paId, {
        client_certified_amount: useClientAmount ? parseFloat(clientAmount) : null,
        payment_due_date: dueDate || null,
      });
      setShowCertifyModal(false);
      fetchIpa();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '認證失敗');
    }
  };

  const handleRecordPayment = async () => {
    const amount = parseFloat(paidAmount);
    if (!amount || amount <= 0) { window.alert('請輸入有效的收款金額'); return; }
    try {
      await paymentInApi.create({
        date: paidDate,
        amount,
        source_type: 'IPA',
        source_ref_id: paId,
        contract_id: contractId,
        project_id: ipa?.project_id || undefined,
        bank_account_id: paymentBankAccountId ? Number(paymentBankAccountId) : undefined,
        reference_no: paymentReferenceNo || undefined,
        remarks: paymentRemarks || `IPA #${ipa?.pa_no} 收款`,
        payment_in_status: 'paid',
      });
      setShowPaymentModal(false);
      setPaidAmount('');
      setPaidDate(new Date().toISOString().split('T')[0]);
      setPaymentBankAccountId('');
      setPaymentReferenceNo('');
      setPaymentRemarks('');
      await fetchIpa();
      await loadPayments();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '收款記錄失敗');
    }
  };

  const handleTogglePaymentStatus = async (paymentId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    try {
      await paymentInApi.updateStatus(paymentId, newStatus);
      await fetchIpa();
      await loadPayments();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '更新狀態失敗');
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm('確定要刪除此收款記錄嗎？')) return;
    try {
      await paymentInApi.delete(paymentId);
      await fetchIpa();
      await loadPayments();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const handleRevert = async () => {
    if (!confirm('確認退回此 IPA 至草稿狀態？')) return;
    try {
      await paymentApplicationsApi.revert(contractId, paId);
      fetchIpa();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '退回失敗');
    }
  };

  const handleVoid = async () => {
    if (!confirm('確認作廢此 IPA？')) return;
    try {
      await paymentApplicationsApi.void(contractId, paId);
      fetchIpa();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '作廢失敗');
    }
  };

  const handleDelete = async () => {
    if (!confirm('確認刪除此 IPA？此操作不可復原。')) return;
    try {
      await paymentApplicationsApi.delete(contractId, paId);
      router.push(`/contracts/${contractId}`);
    } catch (err: any) {
      window.alert(err.response?.data?.message || '刪除失敗');
    }
  };

  // ── Material CRUD ──
  const handleAddMaterial = async () => {
    try {
      await paymentApplicationsApi.addMaterial(contractId, paId, materialForm);
      setShowMaterialModal(false);
      setMaterialForm({ description: '', amount: '', remarks: '' });
      fetchIpa();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '新增失敗');
    }
  };

  const handleDeleteMaterial = async (materialId: number) => {
    if (!confirm('確認刪除此物料？')) return;
    try {
      await paymentApplicationsApi.removeMaterial(contractId, paId, materialId);
      fetchIpa();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '刪除失敗');
    }
  };

  // ── Deduction CRUD ──
  const handleAddDeduction = async () => {
    try {
      await paymentApplicationsApi.addDeduction(contractId, paId, deductionForm);
      setShowDeductionModal(false);
      setDeductionForm({ deduction_type: 'other', description: '', amount: '', remarks: '' });
      fetchIpa();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '新增失敗');
    }
  };

  const handleDeleteDeduction = async (deductionId: number) => {
    if (!confirm('確認刪除此扣款？')) return;
    try {
      await paymentApplicationsApi.removeDeduction(contractId, paId, deductionId);
      fetchIpa();
    } catch (err: any) {
      window.alert(err.response?.data?.message || '刪除失敗');
    }
  };

  if (loading || !ipa) {
    return <div className="py-8 text-center text-gray-500">載入中...</div>;
  }

  const tabs = [
    { key: 'bq', label: 'BQ 項目進度' },
    { key: 'vo', label: 'VO 項目進度' },
    { key: 'materials', label: '工地物料' },
    { key: 'deductions', label: '扣款' },
    { key: 'summary', label: '金額匯總' },
  ];

  // ── Summary rows (A~K) ──
  const summaryRows = [
    { code: 'A', label: 'BQ 項目完工金額（累計）', value: Number(ipa.bq_work_done), bold: false, negative: false },
    { code: 'B', label: '變更指令完工金額（累計）', value: Number(ipa.vo_work_done), bold: false, negative: false },
    { code: 'C', label: '累計完工總額 (A + B)', value: Number(ipa.cumulative_work_done), bold: true, negative: false },
    { code: 'D', label: '工地物料', value: Number(ipa.materials_on_site), bold: false, negative: false },
    { code: 'E', label: '累計總額 (C + D)', value: Number(ipa.gross_amount), bold: true, negative: false },
    { code: 'F', label: '保留金', value: Number(ipa.retention_amount), bold: false, negative: true },
    { code: 'G', label: '扣除保留金後 (E - F)', value: Number(ipa.after_retention), bold: true, negative: false },
    { code: 'H', label: '其他扣款', value: Number(ipa.other_deductions), bold: false, negative: true },
    { code: 'I', label: '認證金額 (G - H)', value: Number(ipa.certified_amount), bold: true, negative: false, highlight: true },
    { code: 'J', label: '上期認證金額', value: Number(ipa.prev_certified_amount), bold: false, negative: true },
    { code: 'K', label: '當期應付金額 (I - J)', value: Number(ipa.current_due), bold: true, negative: false, highlight: true },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/contracts" className="hover:text-primary-600">合約管理</Link>
        <span>/</span>
        <Link href={`/contracts/${contractId}`} className="hover:text-primary-600">{ipa.contract?.contract_no}</Link>
        <span>/</span>
        <span className="text-gray-900">{ipa.reference}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{ipa.reference}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${IPA_STATUS_COLORS[ipa.status]}`}>
              {IPA_STATUS_LABELS[ipa.status]}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            第 {ipa.pa_no} 期 ・ 截至 {fmtDate(ipa.period_to)}
            {ipa.contract?.client?.name && ` ・ ${ipa.contract.client.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status action buttons */}
          {ipa.status === 'draft' && (
            <>
              {dirty && (
                <button onClick={handleSave} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                  {saving ? '儲存中...' : '儲存進度'}
                </button>
              )}
              <button onClick={handleSubmit} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                提交
              </button>
              <button onClick={handleDelete} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">
                刪除
              </button>
            </>
          )}
          {ipa.status === 'submitted' && (
            <>
              <button onClick={() => { setClientAmount(String(Number(ipa.certified_amount))); setShowCertifyModal(true); }} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
                認證
              </button>
              <button onClick={handleRevert} className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 text-sm">
                退回修改
              </button>
            </>
          )}
          {['certified', 'partially_paid'].includes(ipa.status) && (
            <button onClick={() => {
              const totalDue = Number(ipa.client_current_due ?? ipa.current_due);
              const alreadyPaid = Number(ipa.paid_amount || 0);
              setPaidAmount(String(Math.max(0, totalDue - alreadyPaid)));
              setShowPaymentModal(true);
            }} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm">
              記錄收款
            </button>
          )}
          {ipa.status !== 'void' && ipa.status !== 'paid' && (
            <button onClick={handleVoid} className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 text-sm">
              作廢
            </button>
          )}
          <Link href={`/contracts/${contractId}/pa/${paId}/print`} className="btn-secondary text-sm">
            列印預覽
          </Link>
        </div>
      </div>

      {/* Inner Tabs */}
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

      {/* ═══════════ Tab: BQ Progress ═══════════ */}
      {activeTab === 'bq' && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">BQ 項目進度</h2>
          {localBqProgress.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">暫無 BQ 項目</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">項目</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">描述</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">單位</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">合約數量</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">單價</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">上期累計</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">{editable ? '本期累計 ✏️' : '本期累計'}</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">本期數量</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">累計金額</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">本期金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(() => {
                    // Group by section
                    const grouped: Record<string, { section: any; items: any[] }> = {};
                    localBqProgress.forEach((item: any) => {
                      const sKey = item.bq_item?.section?.section_code || '_none';
                      if (!grouped[sKey]) {
                        grouped[sKey] = {
                          section: item.bq_item?.section || { section_code: '', section_name: '未分類' },
                          items: [],
                        };
                      }
                      grouped[sKey].items.push(item);
                    });

                    return Object.entries(grouped).map(([sKey, group]) => (
                      <SectionGroup key={sKey} sKey={sKey} group={group} editable={editable} onBqChange={handleBqChange} />
                    ));
                  })()}
                  {/* BQ Total */}
                  <tr className="bg-blue-50 font-bold">
                    <td colSpan={8} className="px-3 py-2 text-right text-blue-900">BQ 項目合計 (A)</td>
                    <td className="px-3 py-2 text-right text-blue-900 font-mono">
                      {fmt$(localBqProgress.reduce((s: number, i: any) => s + Number(i.current_amount), 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-900 font-mono">
                      {fmt$(localBqProgress.reduce((s: number, i: any) => s + Number(i.this_period_amount), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ Tab: VO Progress ═══════════ */}
      {activeTab === 'vo' && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">變更指令項目進度</h2>
          {localVoProgress.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">暫無已批變更指令項目</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">VO / 項目</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">描述</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">單位</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">數量</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">單價</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">上期累計</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">{editable ? '本期累計 ✏️' : '本期累計'}</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">本期數量</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">累計金額</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">本期金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(() => {
                    const grouped: Record<string, { vo: any; items: any[] }> = {};
                    localVoProgress.forEach((item: any) => {
                      const voKey = item.vo_item?.variation_order?.vo_no || '_none';
                      if (!grouped[voKey]) {
                        grouped[voKey] = {
                          vo: item.vo_item?.variation_order || { vo_no: '', title: '' },
                          items: [],
                        };
                      }
                      grouped[voKey].items.push(item);
                    });

                    return Object.entries(grouped).map(([voKey, group]) => (
                      <VoGroup key={voKey} voKey={voKey} group={group} editable={editable} onVoChange={handleVoChange} />
                    ));
                  })()}
                  {/* VO Total */}
                  <tr className="bg-green-50 font-bold">
                    <td colSpan={8} className="px-3 py-2 text-right text-green-900">VO 項目合計 (B)</td>
                    <td className="px-3 py-2 text-right text-green-900 font-mono">
                      {fmt$(localVoProgress.reduce((s: number, i: any) => s + Number(i.current_amount), 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-green-900 font-mono">
                      {fmt$(localVoProgress.reduce((s: number, i: any) => s + Number(i.this_period_amount), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ Tab: Materials ═══════════ */}
      {activeTab === 'materials' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">工地物料 (Materials on Site)</h2>
            {editable && (
              <button onClick={() => setShowMaterialModal(true)} className="btn-primary text-sm">新增物料</button>
            )}
          </div>
          {(ipa.materials || []).length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">暫無工地物料</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">描述</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">金額 (HKD)</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">備註</th>
                    {editable && <th className="px-3 py-2 text-center font-medium text-gray-500">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ipa.materials.map((m: any) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 text-gray-700">{m.description}</td>
                      <td className="px-3 py-2 text-right text-gray-900 font-mono">{fmt$(m.amount)}</td>
                      <td className="px-3 py-2 text-gray-500">{m.remarks || '-'}</td>
                      {editable && (
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => handleDeleteMaterial(m.id)} className="text-red-600 hover:text-red-800 text-xs">刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-3 py-2 text-right">物料合計 (D)</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt$(ipa.materials_on_site)}</td>
                    <td colSpan={editable ? 2 : 1}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ Tab: Deductions ═══════════ */}
      {activeTab === 'deductions' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">其他扣款 (Deductions)</h2>
            {editable && (
              <button onClick={() => setShowDeductionModal(true)} className="btn-primary text-sm">新增扣款</button>
            )}
          </div>
          {(ipa.deductions || []).length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">暫無扣款項目</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">類型</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">描述</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">金額 (HKD)</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">備註</th>
                    {editable && <th className="px-3 py-2 text-center font-medium text-gray-500">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ipa.deductions.map((d: any) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 text-gray-700">{d.deduction_type}</td>
                      <td className="px-3 py-2 text-gray-700">{d.description}</td>
                      <td className="px-3 py-2 text-right text-gray-900 font-mono">{fmt$(d.amount)}</td>
                      <td className="px-3 py-2 text-gray-500">{d.remarks || '-'}</td>
                      {editable && (
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => handleDeleteDeduction(d.id)} className="text-red-600 hover:text-red-800 text-xs">刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={2} className="px-3 py-2 text-right">扣款合計 (H)</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt$(ipa.other_deductions)}</td>
                    <td colSpan={editable ? 2 : 1}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ Tab: Summary ═══════════ */}
      {activeTab === 'summary' && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">金額匯總</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 w-8"></th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">項目</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">申請金額 (HKD)</th>
                  {ipa.client_certified_amount != null && (
                    <th className="px-4 py-2 text-right font-medium text-gray-600">認證金額 (HKD)</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row: any) => (
                  <tr
                    key={row.code}
                    className={
                      row.highlight
                        ? 'bg-blue-50 border-t-2 border-blue-200'
                        : row.bold
                        ? 'bg-gray-50'
                        : ''
                    }
                  >
                    <td className="px-4 py-2 text-gray-400 font-mono">{row.code}</td>
                    <td className={`px-4 py-2 ${row.bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                      {row.label}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${row.bold ? 'font-semibold text-gray-900' : 'text-gray-700'} ${row.negative ? 'text-red-600' : ''}`}>
                      {row.negative && row.value > 0 ? '(' : ''}
                      {fmt$(Math.abs(row.value))}
                      {row.negative && row.value > 0 ? ')' : ''}
                    </td>
                    {ipa.client_certified_amount != null && (
                      <td className="px-4 py-2 text-right text-gray-500 font-mono">
                        {row.code === 'I' ? fmt$(ipa.client_certified_amount) : row.code === 'K' ? fmt$(ipa.client_current_due) : '-'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Payment Summary & Records */}
          <div className="mt-6 border-t pt-4">
            <h3 className="text-md font-bold text-gray-900 mb-3">收款狀況</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-xs text-blue-600 font-medium mb-1">當期應付金額</div>
                <div className="text-xl font-bold text-blue-900">{fmt$(ipa.client_current_due ?? ipa.current_due)}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-xs text-green-600 font-medium mb-1">已收金額</div>
                <div className="text-xl font-bold text-green-900">{fmt$(ipa.paid_amount || 0)}</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-xs text-red-600 font-medium mb-1">未收金額</div>
                <div className="text-xl font-bold text-red-900">{fmt$(Math.max(0, Number(ipa.client_current_due ?? ipa.current_due) - Number(ipa.paid_amount || 0)))}</div>
              </div>
            </div>
            {payments.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">收款記錄</h4>
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
        </div>
      )}

      {/* ═══════════ Modals ═══════════ */}

      {/* Certify Modal */}
      <Modal isOpen={showCertifyModal} onClose={() => setShowCertifyModal(false)} title="認證 IPA" size="sm">
        <div className="space-y-4">
          <div className="rounded bg-blue-50 p-3 text-sm">
            <span className="text-gray-600">申請認證金額：</span>
            <span className="font-semibold text-blue-800">HKD {fmt$(ipa.certified_amount)}</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useClientAmount} onChange={e => setUseClientAmount(e.target.checked)} className="rounded" />
            客戶認證金額不同
          </label>
          {useClientAmount && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶認證金額</label>
              <input type="number" step="0.01" value={clientAmount} onChange={e => setClientAmount(e.target.value)} className="input-field" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">付款到期日</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input-field" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCertifyModal(false)} className="btn-secondary">取消</button>
            <button onClick={handleCertify} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">確認認證</button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="記錄收款" size="sm">
        <div className="space-y-4">
          <div className="rounded bg-green-50 p-3 text-sm">
            <span className="text-gray-600">當期應付：</span>
            <span className="font-semibold text-green-800">HKD {fmt$(ipa.client_current_due ?? ipa.current_due)}</span>
            {Number(ipa.paid_amount || 0) > 0 && (
              <span className="ml-2 text-gray-500">已收：{fmt$(ipa.paid_amount)}</span>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">收款日期 <span className="text-red-500">*</span></label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">收款金額 <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" min="0" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} className="input-field" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">銀行帳戶</label>
            <select value={paymentBankAccountId} onChange={e => setPaymentBankAccountId(e.target.value)} className="input-field">
              <option value="">請選擇銀行帳戶</option>
              {bankAccounts.map((ba: any) => (
                <option key={ba.id} value={ba.id}>{ba.bank_name} - {ba.account_name} ({ba.account_no})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">參考編號</label>
            <input type="text" value={paymentReferenceNo} onChange={e => setPaymentReferenceNo(e.target.value)} className="input-field" placeholder="支票號碼 / 交易號碼" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea value={paymentRemarks} onChange={e => setPaymentRemarks(e.target.value)} className="input-field" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={() => setShowPaymentModal(false)} className="btn-secondary">取消</button>
            <button onClick={handleRecordPayment} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm">確認收款</button>
          </div>
        </div>
      </Modal>

      {/* Material Modal */}
      <Modal isOpen={showMaterialModal} onClose={() => setShowMaterialModal(false)} title="新增工地物料" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述 <span className="text-red-500">*</span></label>
            <input value={materialForm.description} onChange={e => setMaterialForm({ ...materialForm, description: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金額 (HKD) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" value={materialForm.amount} onChange={e => setMaterialForm({ ...materialForm, amount: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input value={materialForm.remarks} onChange={e => setMaterialForm({ ...materialForm, remarks: e.target.value })} className="input-field" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowMaterialModal(false)} className="btn-secondary">取消</button>
            <button onClick={handleAddMaterial} disabled={!materialForm.description || !materialForm.amount} className="btn-primary disabled:opacity-50">新增</button>
          </div>
        </div>
      </Modal>

      {/* Deduction Modal */}
      <Modal isOpen={showDeductionModal} onClose={() => setShowDeductionModal(false)} title="新增扣款" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">扣款類型</label>
            <select value={deductionForm.deduction_type} onChange={e => setDeductionForm({ ...deductionForm, deduction_type: e.target.value })} className="input-field">
              <option value="other">其他</option>
              <option value="advance">預支扣回</option>
              <option value="penalty">罰款</option>
              <option value="contra_charge">對沖費用</option>
              <option value="insurance">保險</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述 <span className="text-red-500">*</span></label>
            <input value={deductionForm.description} onChange={e => setDeductionForm({ ...deductionForm, description: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金額 (HKD) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" value={deductionForm.amount} onChange={e => setDeductionForm({ ...deductionForm, amount: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input value={deductionForm.remarks} onChange={e => setDeductionForm({ ...deductionForm, remarks: e.target.value })} className="input-field" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowDeductionModal(false)} className="btn-secondary">取消</button>
            <button onClick={handleAddDeduction} disabled={!deductionForm.description || !deductionForm.amount} className="btn-primary disabled:opacity-50">新增</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Sub-components for BQ section grouping ──

function SectionGroup({ sKey, group, editable, onBqChange }: { sKey: string; group: any; editable: boolean; onBqChange: (bqItemId: number, qty: number) => void }) {
  return (
    <>
      <tr className="bg-blue-50">
        <td colSpan={10} className="px-3 py-2 font-semibold text-blue-800">
          {group.section.section_code} {group.section.section_name}
        </td>
      </tr>
      {group.items.map((item: any) => {
        const bq = item.bq_item;
        const pct = Number(bq?.quantity) > 0 ? (Number(item.current_cumulative_qty) / Number(bq.quantity)) * 100 : 0;
        const isOver = pct > 120;
        return (
          <tr key={item.id} className={isOver ? 'bg-yellow-50' : ''}>
            <td className="px-3 py-2 text-gray-700">{bq?.item_no}</td>
            <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{bq?.description}</td>
            <td className="px-3 py-2 text-center text-gray-600">{bq?.unit}</td>
            <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmtQty(bq?.quantity)}</td>
            <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt$(item.unit_rate)}</td>
            <td className="px-3 py-2 text-right text-gray-500 font-mono">{fmtQty(item.prev_cumulative_qty)}</td>
            <td className="px-3 py-2 text-right">
              {editable ? (
                <input
                  type="number"
                  step="any"
                  value={Number(item.current_cumulative_qty)}
                  onChange={e => onBqChange(bq.id, parseFloat(e.target.value) || 0)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none font-mono"
                />
              ) : (
                <span className="font-mono">{fmtQty(item.current_cumulative_qty)}</span>
              )}
            </td>
            <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmtQty(item.this_period_qty)}</td>
            <td className="px-3 py-2 text-right text-gray-900 font-mono">{fmt$(item.current_amount)}</td>
            <td className="px-3 py-2 text-right font-medium text-gray-900 font-mono">{fmt$(item.this_period_amount)}</td>
          </tr>
        );
      })}
      {/* Section subtotal */}
      <tr className="bg-gray-50 font-medium">
        <td colSpan={8} className="px-3 py-2 text-right text-gray-700">{group.section.section_code} 小計</td>
        <td className="px-3 py-2 text-right text-gray-900 font-mono">
          {fmt$(group.items.reduce((s: number, i: any) => s + Number(i.current_amount), 0))}
        </td>
        <td className="px-3 py-2 text-right text-gray-900 font-mono">
          {fmt$(group.items.reduce((s: number, i: any) => s + Number(i.this_period_amount), 0))}
        </td>
      </tr>
    </>
  );
}

function VoGroup({ voKey, group, editable, onVoChange }: { voKey: string; group: any; editable: boolean; onVoChange: (voItemId: number, qty: number) => void }) {
  return (
    <>
      <tr className="bg-green-50">
        <td colSpan={10} className="px-3 py-2 font-semibold text-green-800">
          {group.vo.vo_no} - {group.vo.title}
        </td>
      </tr>
      {group.items.map((item: any) => {
        const voItem = item.vo_item;
        return (
          <tr key={item.id}>
            <td className="px-3 py-2 text-gray-700">{voItem?.item_no}</td>
            <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{voItem?.description}</td>
            <td className="px-3 py-2 text-center text-gray-600">{voItem?.unit}</td>
            <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmtQty(voItem?.quantity)}</td>
            <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt$(item.unit_rate)}</td>
            <td className="px-3 py-2 text-right text-gray-500 font-mono">{fmtQty(item.prev_cumulative_qty)}</td>
            <td className="px-3 py-2 text-right">
              {editable ? (
                <input
                  type="number"
                  step="any"
                  value={Number(item.current_cumulative_qty)}
                  onChange={e => onVoChange(voItem.id, parseFloat(e.target.value) || 0)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none font-mono"
                />
              ) : (
                <span className="font-mono">{fmtQty(item.current_cumulative_qty)}</span>
              )}
            </td>
            <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmtQty(item.this_period_qty)}</td>
            <td className="px-3 py-2 text-right text-gray-900 font-mono">{fmt$(item.current_amount)}</td>
            <td className="px-3 py-2 text-right font-medium text-gray-900 font-mono">{fmt$(item.this_period_amount)}</td>
          </tr>
        );
      })}
      {/* VO subtotal */}
      <tr className="bg-gray-50 font-medium">
        <td colSpan={8} className="px-3 py-2 text-right text-gray-700">{group.vo.vo_no} 小計</td>
        <td className="px-3 py-2 text-right text-gray-900 font-mono">
          {fmt$(group.items.reduce((s: number, i: any) => s + Number(i.current_amount), 0))}
        </td>
        <td className="px-3 py-2 text-right text-gray-900 font-mono">
          {fmt$(group.items.reduce((s: number, i: any) => s + Number(i.this_period_amount), 0))}
        </td>
      </tr>
    </>
  );
}
