'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';
import SignaturePad from 'react-signature-canvas';

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

  const [projects, setProjects] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [form, setForm] = useState({
    report_date: new Date().toISOString().split('T')[0],
    acceptance_date: new Date().toISOString().split('T')[0],
    client_id: '',
    client_name: '',
    project_id: '',
    project_name: '',
    contract_ref: '',
    site_address: '',
    acceptance_items: '',
    quantity_unit: '',
    mingtat_inspector_id: '',
    mingtat_inspector_title: '監工',
    client_inspector_name: '',
    client_inspector_title: '',
    supplementary_notes: '',
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const mingtatSigRef = useRef<SignaturePad>(null);
  const clientSigRef = useRef<SignaturePad>(null);
  const [mingtatSigUrl, setMingtatSigUrl] = useState<string>('');
  const [clientSigUrl, setClientSigUrl] = useState<string>('');

  useEffect(() => {
    portalSharedApi.getProjectsSimple().then(res => setProjects(res.data || [])).catch(() => {});
    portalSharedApi.getPartners().then(res => setPartners(res.data?.data || res.data || [])).catch(() => {});
    portalSharedApi.getEmployeesSimple().then(res => setEmployees(res.data?.data || res.data || [])).catch(() => {});

    if (isEdit) {
      employeePortalApi.getAcceptanceReport(reportId).then(res => {
        const r = res.data;
        setForm({
          report_date: r.acceptance_report_date?.split('T')[0] || '',
          acceptance_date: r.acceptance_report_acceptance_date?.split('T')[0] || '',
          client_id: r.acceptance_report_client_id?.toString() || '',
          client_name: r.acceptance_report_client_name || '',
          project_id: r.acceptance_report_project_id?.toString() || '',
          project_name: r.acceptance_report_project_name || '',
          contract_ref: r.acceptance_report_contract_ref || '',
          site_address: r.acceptance_report_site_address || '',
          acceptance_items: r.acceptance_report_items || '',
          quantity_unit: r.acceptance_report_quantity_unit || '',
          mingtat_inspector_id: r.acceptance_report_mingtat_inspector_id?.toString() || '',
          mingtat_inspector_title: r.acceptance_report_mingtat_inspector_title || '監工',
          client_inspector_name: r.acceptance_report_client_inspector_name || '',
          client_inspector_title: r.acceptance_report_client_inspector_title || '',
          supplementary_notes: r.acceptance_report_supplementary_notes || '',
        });
        if (r.acceptance_report_mingtat_signature) setMingtatSigUrl(r.acceptance_report_mingtat_signature);
        if (r.acceptance_report_client_signature) setClientSigUrl(r.acceptance_report_client_signature);
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
    }
  }, [reportId]);

  const handleProjectChange = (projectId: string) => {
    setForm(prev => {
      const p = projects.find((proj: any) => String(proj.id) === projectId);
      return {
        ...prev,
        project_id: projectId,
        project_name: p ? `${p.project_no} - ${p.project_name}` : prev.project_name,
        site_address: p?.address || prev.site_address,
        contract_ref: p?.contract?.contract_no || prev.contract_ref,
        client_id: p?.client?.id ? String(p.client.id) : prev.client_id,
        client_name: p?.client?.name || prev.client_name,
      };
    });
  };

  const handleClientChange = (clientId: string) => {
    const c = partners.find((p: any) => String(p.id) === clientId);
    setForm(prev => ({
      ...prev,
      client_id: clientId,
      client_name: c?.name || prev.client_name,
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setAttachments(prev => [...prev, {
          file_name: file.name,
          file_url: base64,
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

  const handleSubmit = async (status: 'draft' | 'submitted') => {
    if (!form.project_name.trim() || !form.client_name.trim() || !form.site_address.trim() || !form.acceptance_items.trim()) {
      alert('請填寫必填欄位（工程名稱、客戶、地盤地址、收貨項目）');
      return;
    }
    if (!form.client_inspector_name.trim() || !form.client_inspector_title.trim()) {
      alert('請填寫客戶驗收人姓名和職銜');
      return;
    }
    if (status === 'submitted') {
      if (!confirm('提交後不可修改，確定要提交嗎？')) return;
    }

    setSubmitting(true);
    try {
      // Capture signatures
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

  if (loading) {
    return <div className="p-4 text-center py-10 text-gray-400">{t('loading')}</div>;
  }

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto pb-32">
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

      {/* Form Header */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-700 text-sm">基本資料</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">報告日期 *</label>
            <input type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} disabled={isSubmitted} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">驗收日期 *</label>
            <input type="date" value={form.acceptance_date} onChange={e => setForm({ ...form, acceptance_date: e.target.value })} disabled={isSubmitted} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">工程 *</label>
          <select value={form.project_id} onChange={e => handleProjectChange(e.target.value)} disabled={isSubmitted} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60">
            <option value="">請選擇工程</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">客戶 *</label>
          <select value={form.client_id} onChange={e => handleClientChange(e.target.value)} disabled={isSubmitted} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60">
            <option value="">請選擇客戶</option>
            {partners.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input type="text" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} disabled={isSubmitted} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50 mt-1 disabled:opacity-60" placeholder="或直接輸入客戶名稱" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">合約編號</label>
          <input type="text" value={form.contract_ref} onChange={e => setForm({ ...form, contract_ref: e.target.value })} disabled={isSubmitted} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60" placeholder="合約編號" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">地盤地址 *</label>
          <textarea value={form.site_address} onChange={e => setForm({ ...form, site_address: e.target.value })} disabled={isSubmitted} rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none disabled:opacity-60" placeholder="地盤地址" />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-700 text-sm">收貨項目</h2>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">收貨項目描述 *</label>
          <textarea value={form.acceptance_items} onChange={e => setForm({ ...form, acceptance_items: e.target.value })} disabled={isSubmitted} rows={4} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none disabled:opacity-60" placeholder="請描述收貨項目..." />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">數量/單位</label>
          <input type="text" value={form.quantity_unit} onChange={e => setForm({ ...form, quantity_unit: e.target.value })} disabled={isSubmitted} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60" placeholder="例：100 m²" />
        </div>
      </div>

      {/* Inspectors */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-700 text-sm">驗收人資料</h2>
        <div className="bg-blue-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-blue-700">明達驗收人</p>
          <select value={form.mingtat_inspector_id} onChange={e => setForm({ ...form, mingtat_inspector_id: e.target.value })} disabled={isSubmitted} className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm bg-white disabled:opacity-60">
            <option value="">請選擇驗收人</option>
            {employees.map((emp: any) => (
              <option key={emp.id} value={emp.id}>{emp.name_zh || emp.name_en} ({emp.emp_code})</option>
            ))}
          </select>
          <input type="text" value={form.mingtat_inspector_title} onChange={e => setForm({ ...form, mingtat_inspector_title: e.target.value })} disabled={isSubmitted} className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm bg-white disabled:opacity-60" placeholder="職銜" />
        </div>
        <div className="bg-orange-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-orange-700">客戶驗收人</p>
          <input type="text" value={form.client_inspector_name} onChange={e => setForm({ ...form, client_inspector_name: e.target.value })} disabled={isSubmitted} className="w-full px-3 py-2 rounded-lg border border-orange-200 text-sm bg-white disabled:opacity-60" placeholder="客戶驗收人姓名 *" />
          <input type="text" value={form.client_inspector_title} onChange={e => setForm({ ...form, client_inspector_title: e.target.value })} disabled={isSubmitted} className="w-full px-3 py-2 rounded-lg border border-orange-200 text-sm bg-white disabled:opacity-60" placeholder="職銜 *" />
        </div>
      </div>

      {/* Signatures */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-700 text-sm">簽名</h2>

        {/* Mingtat Signature */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">明達簽名</span>
            {!isSubmitted && (
              <button type="button" onClick={() => { mingtatSigRef.current?.clear(); setMingtatSigUrl(''); }} className="text-xs text-blue-600 font-medium">清除</button>
            )}
          </div>
          {isSubmitted && mingtatSigUrl ? (
            <img src={mingtatSigUrl} alt="明達簽名" className="h-24 border rounded-xl bg-gray-50" />
          ) : !isSubmitted ? (
            <div className="border-2 border-gray-100 rounded-2xl bg-gray-50 overflow-hidden">
              <SignaturePad ref={mingtatSigRef} canvasProps={{ className: "w-full h-32 cursor-crosshair" }} />
            </div>
          ) : (
            <div className="text-xs text-gray-400">未簽名</div>
          )}
        </div>

        {/* Client Signature */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">客戶簽名</span>
            {!isSubmitted && (
              <button type="button" onClick={() => { clientSigRef.current?.clear(); setClientSigUrl(''); }} className="text-xs text-blue-600 font-medium">清除</button>
            )}
          </div>
          {isSubmitted && clientSigUrl ? (
            <img src={clientSigUrl} alt="客戶簽名" className="h-24 border rounded-xl bg-gray-50" />
          ) : !isSubmitted ? (
            <div className="border-2 border-gray-100 rounded-2xl bg-gray-50 overflow-hidden">
              <SignaturePad ref={clientSigRef} canvasProps={{ className: "w-full h-32 cursor-crosshair" }} />
            </div>
          ) : (
            <div className="text-xs text-gray-400">未簽名</div>
          )}
        </div>
      </div>

      {/* Supplementary Notes */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
        <h2 className="font-bold text-gray-700 text-sm">補充說明</h2>
        <textarea value={form.supplementary_notes} onChange={e => setForm({ ...form, supplementary_notes: e.target.value })} disabled={isSubmitted} rows={3} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none disabled:opacity-60" placeholder="其他補充說明..." />
      </div>

      {/* Attachments */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-700 text-sm">附件</h2>
          {!isSubmitted && (
            <label className="text-blue-600 text-sm font-bold cursor-pointer">
              + 上傳
              <input type="file" multiple accept="image/*,.pdf" onChange={handleFileUpload} className="hidden" />
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
                  <button type="button" onClick={() => removeAttachment(idx)} className="text-red-400 hover:text-red-600 text-lg ml-2">×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isSubmitted && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 shadow-lg z-10">
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
              <button type="button" onClick={handleDelete} className="w-full py-2 text-red-500 text-sm font-medium">
                刪除此收貨報告
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
