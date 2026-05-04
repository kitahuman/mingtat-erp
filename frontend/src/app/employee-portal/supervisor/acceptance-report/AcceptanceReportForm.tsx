'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { TranslationKey } from '@/lib/i18n/translations';
import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';
import Combobox from '@/components/Combobox';
import SignaturePad from '@/components/SignatureCanvas';
import type { SignatureCanvasRef } from '@/components/SignatureCanvas';

interface AcceptanceItem {
  description: string;
  quantity_unit: string;
}

interface Attachment {
  file_name: string;
  file_url: string;
  file_type: string;
}

interface Props {
  reportId?: number;
}

export default function AcceptanceReportForm({ reportId }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const isEdit = !!reportId;

  const mingtatSigRef = useRef<SignatureCanvasRef>(null);
  const clientSigRef = useRef<SignatureCanvasRef>(null);

  // Reference data
  const [projects, setProjects] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [contractOptions, setContractOptions] = useState<{ value: string; label: string }[]>([]);

  // Form state
  const [form, setForm] = useState({
    report_date: new Date().toISOString().split('T')[0],
    acceptance_date: new Date().toISOString().split('T')[0],
    client_id: '',
    client_name: '',
    client_contract_no: '',
    project_id: '',
    project_name: '',
    contract_ref: '',
    site_address: '',
    acceptance_items: '',
    quantity_unit: '',
    mingtat_inspector_id: '',
    mingtat_inspector_name: '',
    mingtat_inspector_title: '監工',
    client_inspector_name: '',
    client_inspector_title: '',
    supplementary_notes: '',
  });

  // Dynamic acceptance items
  const [acceptanceItemsList, setAcceptanceItemsList] = useState<AcceptanceItem[]>([
    { description: '', quantity_unit: '' },
  ]);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [mingtatSigUrl, setMingtatSigUrl] = useState('');
  const [clientSigUrl, setClientSigUrl] = useState('');

  // ── Load reference data ──────────────────────────────────────────
  useEffect(() => {
    portalSharedApi.getProjectsSimple().then(r => setProjects(r.data || [])).catch(() => {});
    portalSharedApi.getPartnersSimple().then(r => setPartners(r.data || [])).catch(() => {});   portalSharedApi.getFieldOptions('client_contract_no').then(r => {  setContractOptions((r.data || []).filter((o: any) => o.is_active !== false).map((o: any) => ({ value: o.label, label: t(o.label as TranslationKey) })));
    }).catch(() => {});
  }, []);

  // ── Load existing report ─────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    employeePortalApi.getAcceptanceReport(reportId).then(res => {
      const r = res.data;
      setForm({
        report_date: r.acceptance_report_date?.split('T')[0] || '',
        acceptance_date: r.acceptance_report_acceptance_date?.split('T')[0] || '',
        client_id: r.acceptance_report_client_id ? String(r.acceptance_report_client_id) : '',
        client_name: r.acceptance_report_client_name || '',
        client_contract_no: r.acceptance_report_client_contract_no || '',
        project_id: r.acceptance_report_project_id ? String(r.acceptance_report_project_id) : '',
        project_name: r.acceptance_report_project_name || '',
        contract_ref: r.acceptance_report_contract_ref || '',
        site_address: r.acceptance_report_site_address || '',
        acceptance_items: r.acceptance_report_items || '',
        quantity_unit: r.acceptance_report_quantity_unit || '',
        mingtat_inspector_id: r.acceptance_report_mingtat_inspector_id ? String(r.acceptance_report_mingtat_inspector_id) : '',
        mingtat_inspector_name: r.acceptance_report_mingtat_inspector_name || '',
        mingtat_inspector_title: r.acceptance_report_mingtat_inspector_title || '監工',
        client_inspector_name: r.acceptance_report_client_inspector_name || '',
        client_inspector_title: r.acceptance_report_client_inspector_title || '',
        supplementary_notes: r.acceptance_report_supplementary_notes || '',
      });
      if (r.acceptance_report_mingtat_signature) setMingtatSigUrl(r.acceptance_report_mingtat_signature);
      if (r.acceptance_report_client_signature) setClientSigUrl(r.acceptance_report_client_signature);
      // Load dynamic items
      if (r.acceptance_items?.length > 0) {
        setAcceptanceItemsList(r.acceptance_items.map((item: any) => ({
          description: item.acceptance_report_item_description || '',
          quantity_unit: item.acceptance_report_item_quantity_unit || '',
        })));
      }
      if (r.attachments?.length) {
        setAttachments(r.attachments.map((a: any) => ({
          file_name: a.acceptance_report_attachment_file_name,
          file_url: a.acceptance_report_attachment_file_url,
          file_type: a.acceptance_report_attachment_file_type,
        })));
      }
      setIsSubmitted(r.acceptance_report_status === 'submitted');
      setLoading(false);
    }).catch(() => {
      router.push('/employee-portal/supervisor/acceptance-report');
    });
  }, [reportId]);

  // ── Client selection (Combobox: select partner or manual input) ──
  const partnerOptions = partners.map((p: any) => ({
    value: String(p.id),
    label: p.name,
  }));

  const handleClientChange = (val: string | null) => {
    if (!val) {
      setForm(f => ({ ...f, client_id: '', client_name: '' }));
      return;
    }
    const partner = partners.find((p: any) => String(p.id) === val);
    if (partner) {
      setForm(f => ({ ...f, client_id: val, client_name: partner.name }));
    } else {
      setForm(f => ({ ...f, client_id: '', client_name: val }));
    }
  };

  const handleContractChange = (val: string | null) => {
    setForm(f => ({ ...f, client_contract_no: val || '' }));
  };

  const handleCreateContract = async (val: string) => {
    setContractOptions(prev => {
      if (prev.find(o => o.label === val)) return prev;
      return [...prev, { value: val, label: t(val as TranslationKey) }];
    });
    try {
      await portalSharedApi.createFieldOption({ category: 'client_contract_no', label: val });
    } catch {}
  };

  // ── Acceptance items helpers ─────────────────────────────────────
  const updateAcceptanceItem = (idx: number, field: keyof AcceptanceItem, value: string) => {
    setAcceptanceItemsList(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };
  const addAcceptanceItem = () => setAcceptanceItemsList(prev => [...prev, { description: '', quantity_unit: '' }]);
  const removeAcceptanceItem = (idx: number) => {
    if (acceptanceItemsList.length <= 1) return;
    setAcceptanceItemsList(prev => prev.filter((_, i) => i !== idx));
  };

  // ── File upload ──────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments(prev => [...prev, {
          file_name: file.name,
          file_url: reader.result as string,
          file_type: file.type,
        }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (status: 'draft' | 'submitted') => {
    if (!form.report_date || !form.acceptance_date) {
      alert('請填寫日期');
      return;
    }
    if (status === 'submitted' && !confirm('提交後不可修改，確定要提交嗎？')) return;

    setSubmitting(true);
    try {
      let mingtatSig = mingtatSigUrl;
      let clientSig = clientSigUrl;
      if (mingtatSigRef.current && !mingtatSigRef.current.isEmpty()) {
        mingtatSig = mingtatSigRef.current.getTrimmedCanvas().toDataURL('image/png');
      }
      if (clientSigRef.current && !clientSigRef.current.isEmpty()) {
        clientSig = clientSigRef.current.getTrimmedCanvas().toDataURL('image/png');
      }

      const payload = {
        ...form,
        mingtat_signature: mingtatSig || null,
        client_signature: clientSig || null,
        status,
        attachments,
        acceptance_items_list: acceptanceItemsList.filter(i => i.description.trim()),
      };
      if (isEdit) {
        await employeePortalApi.updateAcceptanceReport(reportId, payload);
      } else {
        await employeePortalApi.createAcceptanceReport(payload);
      }
      router.push('/employee-portal/supervisor/acceptance-report');
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此收貨報告嗎？')) return;
    try {
      await employeePortalApi.deleteAcceptanceReport(reportId!);
      router.push('/employee-portal/supervisor/acceptance-report');
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const handlePrint = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
    window.open(`${apiBase}/acceptance-reports/${reportId}/export?format=html`, '_blank');
  };

  if (loading) {
    return <div className="p-4 text-center py-10 text-gray-400">{t('loading')}</div>;
  }

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto pb-72">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/employee-portal/supervisor/acceptance-report" className="text-blue-600 flex items-center gap-1">
          <span>‹</span> {t('back')}
        </Link>
        <h1 className="text-xl font-bold text-gray-800 ml-2">
          {isEdit ? (isSubmitted ? '查看收貨報告' : '編輯收貨報告') : '新增收貨報告'}
        </h1>
      </div>

      {isSubmitted && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-green-700 text-sm font-medium">
          此收貨報告已提交，不可修改。
        </div>
      )}

      {/* ── Basic Info ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-700 text-sm">基本資料</h2>

        {/* Client */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">客戶</label>
          <Combobox
            value={form.client_id ? String(form.client_id) : form.client_name || null}
            onChange={handleClientChange}
            options={partnerOptions}
            placeholder="選擇或輸入客戶名稱"
            disabled={isSubmitted}
          />
        </div>

        {/* Client Contract */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">客戶合約</label>
          <Combobox
            value={form.client_contract_no || null}
            onChange={handleContractChange}
            options={contractOptions}
            placeholder="選擇或輸入客戶合約"
            disabled={isSubmitted}
            onCreateOption={handleCreateContract}
          />
        </div>

        {/* Project (non-required) */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">工程</label>
          <select
            value={form.project_id}
            onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
            disabled={isSubmitted}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60"
          >
            <option value="">請選擇工程（非必填）</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>
            ))}
          </select>
        </div>

        {/* Project Name (manual) */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">工程名稱</label>
          <input
            type="text"
            value={form.project_name}
            onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
            disabled={isSubmitted}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60"
            placeholder="手動填寫工程名稱"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 mb-1 block">報告日期 *</label>
            <input type="date" value={form.report_date} onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))} disabled={isSubmitted} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-500 mb-1 block">驗收日期 *</label>
            <input type="date" value={form.acceptance_date} onChange={e => setForm(f => ({ ...f, acceptance_date: e.target.value }))} disabled={isSubmitted} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">合約參考</label>
          <input type="text" value={form.contract_ref} onChange={e => setForm(f => ({ ...f, contract_ref: e.target.value }))} disabled={isSubmitted} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60" placeholder="合約編號" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">地盤地址</label>
          <textarea value={form.site_address} onChange={e => setForm(f => ({ ...f, site_address: e.target.value }))} disabled={isSubmitted} rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none disabled:opacity-60" placeholder="地盤地址" />
        </div>
      </div>

      {/* ── Acceptance Items (Dynamic) ────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-700 text-sm">收貨項目</h2>
          {!isSubmitted && (
            <button type="button" onClick={addAcceptanceItem} className="text-blue-600 text-sm font-bold">+ 新增項目</button>
          )}
        </div>

        {acceptanceItemsList.map((item, idx) => (
          <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2 relative">
            {!isSubmitted && acceptanceItemsList.length > 1 && (
              <button type="button" onClick={() => removeAcceptanceItem(idx)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 text-lg">&times;</button>
            )}
            <div>
              <label className="text-xs text-gray-400 mb-0.5 block">項目描述 #{idx + 1}</label>
              <textarea
                value={item.description}
                onChange={e => updateAcceptanceItem(idx, 'description', e.target.value)}
                disabled={isSubmitted}
                rows={2}
                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60"
                placeholder="收貨項目描述..."
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-0.5 block">數量/單位</label>
              <input
                type="text"
                value={item.quantity_unit}
                onChange={e => updateAcceptanceItem(idx, 'quantity_unit', e.target.value)}
                disabled={isSubmitted}
                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60"
                placeholder="例：100 m2"
              />
            </div>
          </div>
        ))}
      </div>

      {/* ── Inspector Info ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-700 text-sm">驗收人資料</h2>

        <div className="bg-blue-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-blue-700">明達方</p>
          <div>
            <label className="text-xs text-gray-400 mb-0.5 block">驗收人名稱</label>
            <input
              type="text"
              value={form.mingtat_inspector_name}
              onChange={e => setForm(f => ({ ...f, mingtat_inspector_name: e.target.value }))}
              disabled={isSubmitted}
              className="w-full px-2 py-2 rounded-lg border border-blue-200 text-sm bg-white disabled:opacity-60"
              placeholder="填寫驗收人名稱"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-0.5 block">職位</label>
            <input type="text" value={form.mingtat_inspector_title} onChange={e => setForm(f => ({ ...f, mingtat_inspector_title: e.target.value }))} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-blue-200 text-sm bg-white disabled:opacity-60" placeholder="職位" />
          </div>
        </div>

        <div className="bg-orange-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-orange-700">客戶方</p>
          <div>
            <label className="text-xs text-gray-400 mb-0.5 block">驗收人名稱</label>
            <input type="text" value={form.client_inspector_name} onChange={e => setForm(f => ({ ...f, client_inspector_name: e.target.value }))} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-orange-200 text-sm bg-white disabled:opacity-60" placeholder="客戶驗收人" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-0.5 block">職位</label>
            <input type="text" value={form.client_inspector_title} onChange={e => setForm(f => ({ ...f, client_inspector_title: e.target.value }))} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-orange-200 text-sm bg-white disabled:opacity-60" placeholder="職位" />
          </div>
        </div>
      </div>

      {/* ── Signatures ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-700 text-sm">簽名</h2>

        {/* Mingtat Signature */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-blue-600">明達簽名</span>
            {!isSubmitted && (
              <button type="button" onClick={() => { mingtatSigRef.current?.clear(); setMingtatSigUrl(''); }} className="text-xs text-blue-600 font-medium">清除</button>
            )}
          </div>
          {isSubmitted && mingtatSigUrl ? (
            <img src={mingtatSigUrl} alt="明達簽名" className="h-24 border rounded-xl bg-gray-50" />
          ) : !isSubmitted ? (
            <div className="border-2 border-dashed border-blue-200 rounded-xl bg-white overflow-hidden">
              <SignaturePad ref={mingtatSigRef} canvasProps={{ className: 'w-full', style: { width: '100%', height: '100px' } }} />
            </div>
          ) : (
            <div className="text-xs text-gray-400">未簽名</div>
          )}
        </div>

        {/* Client Signature */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-orange-600">客戶簽名</span>
            {!isSubmitted && (
              <button type="button" onClick={() => { clientSigRef.current?.clear(); setClientSigUrl(''); }} className="text-xs text-orange-600 font-medium">清除</button>
            )}
          </div>
          {isSubmitted && clientSigUrl ? (
            <img src={clientSigUrl} alt="客戶簽名" className="h-24 border rounded-xl bg-gray-50" />
          ) : !isSubmitted ? (
            <div className="border-2 border-dashed border-orange-200 rounded-xl bg-white overflow-hidden">
              <SignaturePad ref={clientSigRef} canvasProps={{ className: 'w-full', style: { width: '100%', height: '100px' } }} />
            </div>
          ) : (
            <div className="text-xs text-gray-400">未簽名</div>
          )}
        </div>
      </div>

      {/* ── Attachments ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-700 text-sm">附件</h2>
          {!isSubmitted && (
            <label className="text-blue-600 text-sm font-bold cursor-pointer">
              + 上傳
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" />
            </label>
          )}
        </div>
        {attachments.length === 0 ? (
          <p className="text-xs text-gray-400">暫無附件</p>
        ) : (
          <div className="space-y-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-xl p-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {att.file_type?.startsWith('image/') && att.file_url ? (
                    <img src={att.file_url} alt={att.file_name} className="w-10 h-10 object-cover rounded-lg" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center text-xs">PDF</div>
                  )}
                  <span className="text-xs text-gray-600 truncate">{att.file_name}</span>
                </div>
                {!isSubmitted && (
                  <button type="button" onClick={() => removeAttachment(idx)} className="text-red-400 hover:text-red-600 text-lg ml-2">&times;</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Supplementary Notes ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
        <h2 className="font-bold text-gray-700 text-sm">補充說明</h2>
        <textarea value={form.supplementary_notes} onChange={e => setForm(f => ({ ...f, supplementary_notes: e.target.value }))} disabled={isSubmitted} rows={3} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none disabled:opacity-60" placeholder="其他補充說明..." />
      </div>

      {/* ── Actions ───────────────────────────────────────────────── */}
      {!isSubmitted && (
        <div className="fixed bottom-16 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-xl z-30" style={{ padding: '0.75rem 1rem' }}>
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => handleSubmit('draft')} disabled={submitting} className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-2xl font-bold text-sm active:scale-95 disabled:opacity-50">
                {submitting ? '儲存中...' : '儲存草稿'}
              </button>
              <button type="button" onClick={() => handleSubmit('submitted')} disabled={submitting} className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-md active:scale-95 disabled:opacity-50">
                {submitting ? '提交中...' : '正式提交'}
              </button>
            </div>
            {isEdit && (
              <div className="flex gap-2">
                <button type="button" onClick={handlePrint} className="flex-1 py-2 text-blue-600 text-sm font-medium border border-blue-200 rounded-xl">
                  列印
                </button>
                <button type="button" onClick={handleDelete} className="flex-1 py-2 text-red-500 text-sm font-medium border border-red-200 rounded-xl">
                  刪除此報告
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Print button for submitted reports */}
      {isSubmitted && isEdit && (
        <div className="fixed bottom-16 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-xl z-30" style={{ padding: '0.75rem 1rem' }}>
          <div className="max-w-md mx-auto">
            <button type="button" onClick={handlePrint} className="w-full py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-md active:scale-95">
              列印
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
