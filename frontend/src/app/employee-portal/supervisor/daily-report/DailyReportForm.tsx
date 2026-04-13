'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';
import Combobox from '@/components/Combobox';
import MultiSelectPopup from '@/components/MultiSelectPopup';
import type { MultiSelectOption } from '@/components/MultiSelectPopup';
import SignaturePad from '@/components/SignatureCanvas';
import type { SignatureCanvasRef } from '@/components/SignatureCanvas';

// ── Types ──────────────────────────────────────────────────────────
interface DailyReportItem {
  category: string;
  content: string;
  quantity: string;
  ot_hours: string;
  name_or_plate: string;
  worker_type: string;
  with_operator: boolean;
  employee_ids: string[];
  vehicle_ids: string[];
  shift_quantity: string;
}

const defaultItem = (cat = 'worker'): DailyReportItem => ({
  category: cat,
  content: '',
  quantity: '',
  ot_hours: '',
  name_or_plate: '',
  worker_type: '',
  with_operator: false,
  employee_ids: [],
  vehicle_ids: [],
  shift_quantity: '',
});

interface Props {
  reportId?: number;
}

// ── Component ──────────────────────────────────────────────────────
export default function DailyReportForm({ reportId }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const isEdit = !!reportId;
  const sigRef = useRef<SignatureCanvasRef>(null);

  // Reference data
  const [projects, setProjects] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [machinery, setMachinery] = useState<any[]>([]);
  const [workerTypeOptions, setWorkerTypeOptions] = useState<{ value: string; label: string }[]>([]);
  const [tonnageOptions, setTonnageOptions] = useState<{ value: string; label: string }[]>([]);
  const [machineTypeOptions, setMachineTypeOptions] = useState<{ value: string; label: string }[]>([]);
  const [contractOptions, setContractOptions] = useState<{ value: string; label: string }[]>([]);

  // Form state
  const [form, setForm] = useState({
    project_id: '',
    report_date: new Date().toISOString().split('T')[0],
    shift_type: 'day',
    work_summary: '',
    memo: '',
    client_id: '',
    client_name: '',
    client_contract_no: '',
    project_name: '',
    completed_work: '',
    signature: '',
  });
  const [items, setItems] = useState<DailyReportItem[]>([defaultItem('worker')]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [copying, setCopying] = useState(false);

  // Attachments
  interface AttachmentInfo {
    id?: number;
    file_name: string;
    file_url: string;
    file_type: string;
  }
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Popup state
  const [popupConfig, setPopupConfig] = useState<{
    type: 'employee' | 'vehicle';
    itemIdx: number;
  } | null>(null);

  // ── Load reference data ──────────────────────────────────────────
  useEffect(() => {
    portalSharedApi.getProjectsSimple().then(r => setProjects(r.data || [])).catch(() => {});
    portalSharedApi.getPartnersSimple().then(r => setPartners(r.data || [])).catch(() => {});
    portalSharedApi.getEmployeesSimple().then(r => {
      const list = r.data?.data || r.data || [];
      setEmployees(list);
    }).catch(() => {});
    portalSharedApi.getVehiclesSimple().then(r => setVehicles(r.data || [])).catch(() => {});
    portalSharedApi.getMachinerySimple().then(r => setMachinery(r.data || [])).catch(() => {});

    // Field options
    portalSharedApi.getFieldOptions('worker_type').then(r => {
      const data = r.data || [];
      setWorkerTypeOptions(data.filter((o: any) => o.is_active !== false).map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {
      // Seed default worker types if empty
      setWorkerTypeOptions([
        '什工', '叻架', '中工石矢工', '中工燒焊工', '中工木工', '中工泥水匠',
        '搬車司機', '吊車司機', '吊車機手', '大貨車司機', '機手',
      ].map(v => ({ value: v, label: v })));
    });
    portalSharedApi.getFieldOptions('tonnage').then(r => {
      setTonnageOptions((r.data || []).filter((o: any) => o.is_active !== false).map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {});
    portalSharedApi.getFieldOptions('machine_type').then(r => {
      setMachineTypeOptions((r.data || []).filter((o: any) => o.is_active !== false).map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {});
    portalSharedApi.getFieldOptions('client_contract_no').then(r => {
      setContractOptions((r.data || []).filter((o: any) => o.is_active !== false).map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {});
  }, []);

  // ── Load existing report ─────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    employeePortalApi.getDailyReport(reportId).then(res => {
      const r = res.data;
      setForm({
        project_id: r.daily_report_project_id ? String(r.daily_report_project_id) : '',
        report_date: r.daily_report_date?.split('T')[0] || '',
        shift_type: r.daily_report_shift_type,
        work_summary: r.daily_report_work_summary || '',
        memo: r.daily_report_memo || '',
        client_id: r.daily_report_client_id ? String(r.daily_report_client_id) : '',
        client_name: r.daily_report_client_name || '',
        client_contract_no: r.daily_report_client_contract_no || '',
        project_name: r.daily_report_project_name || '',
        completed_work: r.daily_report_completed_work || '',
        signature: r.daily_report_signature || '',
      });
      if (r.items?.length) {
        setItems(r.items.map((item: any) => ({
          category: item.daily_report_item_category,
          content: item.daily_report_item_content || '',
          quantity: item.daily_report_item_quantity?.toString() || '',
          ot_hours: item.daily_report_item_ot_hours?.toString() || '',
          name_or_plate: item.daily_report_item_name_or_plate || '',
          worker_type: item.daily_report_item_worker_type || '',
          with_operator: item.daily_report_item_with_operator || false,
          employee_ids: item.daily_report_item_employee_ids ? JSON.parse(item.daily_report_item_employee_ids) : [],
          vehicle_ids: item.daily_report_item_vehicle_ids ? JSON.parse(item.daily_report_item_vehicle_ids) : [],
          shift_quantity: item.daily_report_item_shift_quantity?.toString() || '',
        })));
      }
      if (r.attachments?.length) {
        setAttachments(r.attachments.map((a: any) => ({
          id: a.id,
          file_name: a.daily_report_attachment_file_name,
          file_url: a.daily_report_attachment_file_url,
          file_type: a.daily_report_attachment_file_type,
        })));
      }
      setIsSubmitted(r.daily_report_status === 'submitted');
      setLoading(false);
    }).catch(() => {
      router.push('/employee-portal/supervisor/daily-report');
    });
  }, [reportId]);

  // ── Item helpers ─────────────────────────────────────────────────
  const updateItem = (idx: number, updates: Partial<DailyReportItem>) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };
  const addItem = (cat = 'worker') => setItems(prev => [...prev, defaultItem(cat)]);
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Client selection ─────────────────────────────────────────────
  const partnerOptions = partners.map((p: any) => ({
    value: String(p.id),
    label: p.name,
  }));

  const handleClientChange = (val: string | null) => {
    if (!val) {
      setForm(f => ({ ...f, client_id: '', client_name: '' }));
      return;
    }
    // Check if it's a partner ID
    const partner = partners.find((p: any) => String(p.id) === val);
    if (partner) {
      setForm(f => ({ ...f, client_id: val, client_name: partner.name }));
    } else {
      // Manual input
      setForm(f => ({ ...f, client_id: '', client_name: val }));
    }
  };

  const handleContractChange = (val: string | null) => {
    setForm(f => ({ ...f, client_contract_no: val || '' }));
  };

  const handleCreateContract = async (val: string) => {
    setContractOptions(prev => {
      if (prev.find(o => o.label === val)) return prev;
      return [...prev, { value: val, label: val }];
    });
    try {
      await portalSharedApi.createFieldOption({ category: 'client_contract_no', label: val });
    } catch {}
  };

  const handleCreateWorkerType = async (val: string) => {
    setWorkerTypeOptions(prev => {
      if (prev.find(o => o.label === val)) return prev;
      return [...prev, { value: val, label: val }];
    });
    try {
      await portalSharedApi.createFieldOption({ category: 'worker_type', label: val });
    } catch {}
  };

  // ── Employee & Vehicle multi-select options ──────────────────────
  const employeeOptions: MultiSelectOption[] = employees.map((e: any) => ({
    id: String(e.id),
    label: e.name_zh || e.name_en || `#${e.id}`,
    sublabel: e.emp_code || e.phone || '',
  }));

  const vehicleMachineryOptions: MultiSelectOption[] = [
    ...vehicles.map((v: any) => ({
      id: `v:${v.value}`,
      label: v.label,
      sublabel: `車輛${v.tonnage ? ` ${v.tonnage}T` : ''}${v.type ? ` ${v.type}` : ''}`,
    })),
    ...machinery.map((m: any) => ({
      id: `m:${m.value}`,
      label: m.label,
      sublabel: `機械${m.tonnage ? ` ${m.tonnage}T` : ''}${m.type ? ` ${m.type}` : ''}`,
    })),
  ];
  // ── File upload handlers ───────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const newAttachments: AttachmentInfo[] = [];
      for (let i = 0; i < files.length; i++) {
        const res = await employeePortalApi.uploadDailyReportFile(files[i]);
        const d = res.data;
        newAttachments.push({ file_name: d.file_name, file_url: d.url, file_type: d.file_type });
      }

      if (isEdit && isSubmitted) {
        // For submitted reports, add attachments via dedicated endpoint
        const res = await employeePortalApi.addDailyReportAttachments(reportId!, newAttachments);
        const r = res.data;
        setAttachments((r.attachments || []).map((a: any) => ({
          id: a.id,
          file_name: a.daily_report_attachment_file_name,
          file_url: a.daily_report_attachment_file_url,
          file_type: a.daily_report_attachment_file_type,
        })));
      } else {
        setAttachments(prev => [...prev, ...newAttachments]);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '上傳失敗');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = async (idx: number) => {
    const att = attachments[idx];
    if (att.id && isEdit) {
      try {
        const res = await employeePortalApi.removeDailyReportAttachment(reportId!, att.id);
        const r = res.data;
        setAttachments((r.attachments || []).map((a: any) => ({
          id: a.id,
          file_name: a.daily_report_attachment_file_name,
          file_url: a.daily_report_attachment_file_url,
          file_type: a.daily_report_attachment_file_type,
        })));
      } catch (err: any) {
        alert(err.response?.data?.message || '刪除失敗');
      }
    } else {
      setAttachments(prev => prev.filter((_, i) => i !== idx));
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (status: 'draft' | 'submitted') => {
    if (!form.report_date) {
      alert('請填寫日期');
      return;
    }
    if (status === 'submitted' && !confirm('提交後不可修改，確定要提交嗎？')) return;

    // Capture signature
    let signature = form.signature;
    if (sigRef.current && !sigRef.current.isEmpty()) {
      signature = sigRef.current.getTrimmedCanvas().toDataURL('image/png');
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        signature,
        status,
        items: items.filter(i => i.content.trim() || i.worker_type || i.employee_ids.length > 0 || i.vehicle_ids.length > 0),
        attachments: attachments.map(a => ({ file_name: a.file_name, file_url: a.file_url, file_type: a.file_type })),
      };
      if (isEdit) {
        await employeePortalApi.updateDailyReport(reportId, payload);
      } else {
        await employeePortalApi.createDailyReport(payload);
      }
      router.push('/employee-portal/supervisor/daily-report');
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async () => {
    if (!confirm('確定要刪除此日報嗎？')) return;
    try {
      await employeePortalApi.deleteDailyReport(reportId!);
      router.push('/employee-portal/supervisor/daily-report');
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const handlePrint = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
    window.open(`${apiBase}/daily-reports/${reportId}/export?format=html`, '_blank');
  };

  const handleCopyPrevious = async () => {
    setCopying(true);
    try {
      const params: any = {};
      if (form.project_id) params.project_id = form.project_id;
      if (form.client_id) params.client_id = form.client_id;
      if (form.client_contract_no) params.client_contract_no = form.client_contract_no;
      const res = await employeePortalApi.getPreviousDailyReport(params);
      const prev = res.data;
      if (!prev) {
        alert('找不到前一天的日報，請手動填寫。');
        return;
      }
      // Fill in header fields (keep today's date)
      setForm(f => ({
        ...f,
        project_id: prev.daily_report_project_id ? String(prev.daily_report_project_id) : f.project_id,
        shift_type: prev.daily_report_shift_type || f.shift_type,
        work_summary: prev.daily_report_work_summary || '',
        memo: prev.daily_report_memo || '',
        client_id: prev.daily_report_client_id ? String(prev.daily_report_client_id) : f.client_id,
        client_name: prev.daily_report_client_name || f.client_name,
        client_contract_no: prev.daily_report_client_contract_no || f.client_contract_no,
        project_name: prev.daily_report_project_name || f.project_name,
        completed_work: prev.daily_report_completed_work || '',
        // Keep today's date, do not copy the old date
      }));
      // Fill in items (copy category/content/worker_type/quantity structure, clear actual counts)
      if (prev.items?.length) {
        setItems(prev.items.map((item: any) => ({
          category: item.daily_report_item_category,
          content: item.daily_report_item_content || '',
          quantity: item.daily_report_item_quantity?.toString() || '',
          ot_hours: item.daily_report_item_ot_hours?.toString() || '',
          name_or_plate: item.daily_report_item_name_or_plate || '',
          worker_type: item.daily_report_item_worker_type || '',
          with_operator: item.daily_report_item_with_operator || false,
          employee_ids: item.daily_report_item_employee_ids ? JSON.parse(item.daily_report_item_employee_ids) : [],
          vehicle_ids: item.daily_report_item_vehicle_ids ? JSON.parse(item.daily_report_item_vehicle_ids) : [],
          shift_quantity: item.daily_report_item_shift_quantity?.toString() || '',
        })));
      }
      const prevDate = prev.daily_report_date ? new Date(prev.daily_report_date).toLocaleDateString('zh-HK') : '不明';
      alert(`已從 ${prevDate} 的日報複製內容，請檢查並修改後儲存。`);
    } catch (err: any) {
      alert(err.response?.data?.message || '複製失敗，請重試。');
    } finally {
      setCopying(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────
  const getEmployeeLabel = (id: string) => {
    if (id.startsWith('manual:')) return id.replace('manual:', '');
    const emp = employees.find((e: any) => String(e.id) === id);
    return emp ? (emp.name_zh || emp.name_en || `#${emp.id}`) : id;
  };

  const getVehicleLabel = (id: string) => {
    if (id.startsWith('manual:')) return id.replace('manual:', '');
    const code = id.replace(/^[vm]:/, '');
    const v = vehicles.find((x: any) => x.value === code);
    if (v) return v.label;
    const m = machinery.find((x: any) => x.value === code);
    if (m) return m.label;
    return code;
  };

  if (loading) {
    return <div className="p-4 text-center py-10 text-gray-400">{t('loading')}</div>;
  }

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto pb-72">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/employee-portal/supervisor/daily-report" className="text-blue-600 flex items-center gap-1">
          <span>‹</span> {t('back')}
        </Link>
        <h1 className="text-xl font-bold text-gray-800 ml-2">
          {isEdit ? (isSubmitted ? '查看日報' : '編輯日報') : '新增日報'}
        </h1>
      </div>

      {/* Copy from previous button - only show in create mode */}
      {!isEdit && (
        <button
          type="button"
          onClick={handleCopyPrevious}
          disabled={copying}
          className="w-full py-3 bg-amber-50 border border-amber-300 text-amber-700 rounded-2xl font-bold text-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {copying ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></span>
              複製中...
            </>
          ) : (
            <>
              <span className="text-base">📋</span>
              複製最近一份日報作為模板
            </>
          )}
        </button>
      )}

      {isSubmitted && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-green-700 text-sm font-medium">
          此日報已提交，不可修改。
        </div>
      )}

      {/* ── Header Fields ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-700 text-sm">表頭資料</h2>

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

        {/* Project */}
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

        {/* Date */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">日期 *</label>
          <input
            type="date"
            value={form.report_date}
            onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))}
            disabled={isSubmitted}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60"
          />
        </div>

        {/* Shift Type */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">更次 *</label>
          <div className="flex gap-2">
            {['day', 'night'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => !isSubmitted && setForm(f => ({ ...f, shift_type: s }))}
                disabled={isSubmitted}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  form.shift_type === s
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-500'
                } disabled:opacity-60`}
              >
                {s === 'day' ? '日更' : '夜更'}
              </button>
            ))}
          </div>
        </div>

        {/* Work Summary */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">工作摘要</label>
          <textarea
            value={form.work_summary}
            onChange={e => setForm(f => ({ ...f, work_summary: e.target.value }))}
            disabled={isSubmitted}
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none disabled:opacity-60"
            placeholder="請描述今日工作內容..."
          />
        </div>
      </div>

      {/* ── Labour & Plant Items ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-700 text-sm">Labour and Plant</h2>
        </div>

        {/* Category add buttons */}
        {!isSubmitted && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addItem('worker')} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">+ 工人</button>
            <button type="button" onClick={() => addItem('vehicle')} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium">+ 車輛/機械</button>
            <button type="button" onClick={() => addItem('tool')} className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium">+ 工具</button>
          </div>
        )}

        {items.map((item, idx) => (
          <div key={idx} className={`rounded-xl p-3 space-y-2 relative ${
            item.category === 'worker' ? 'bg-blue-50/50 border border-blue-100' :
            item.category === 'vehicle' ? 'bg-green-50/50 border border-green-100' :
            'bg-orange-50/50 border border-orange-100'
          }`}>
            {/* Category badge + remove */}
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                item.category === 'worker' ? 'bg-blue-100 text-blue-700' :
                item.category === 'vehicle' ? 'bg-green-100 text-green-700' :
                'bg-orange-100 text-orange-700'
              }`}>
                {item.category === 'worker' ? '工人' : item.category === 'vehicle' ? '車輛/機械' : '工具'}
              </span>
              {!isSubmitted && items.length > 1 && (
                <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
              )}
            </div>

            {/* ── Worker fields ── */}
            {item.category === 'worker' && (
              <>
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">工種</label>
                  <Combobox
                    value={item.worker_type || null}
                    onChange={val => updateItem(idx, { worker_type: val || '' })}
                    options={workerTypeOptions}
                    placeholder="選擇或輸入工種"
                    disabled={isSubmitted}
                    onCreateOption={handleCreateWorkerType}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">內容描述</label>
                  <input
                    type="text"
                    value={item.content}
                    onChange={e => updateItem(idx, { content: e.target.value })}
                    disabled={isSubmitted}
                    className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60"
                    placeholder="描述..."
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-0.5 block">數量</label>
                    <input type="number" value={item.quantity} onChange={e => updateItem(idx, { quantity: e.target.value })} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60" placeholder="0" step="0.5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-0.5 block">中直數量</label>
                    <input type="number" value={item.shift_quantity} onChange={e => updateItem(idx, { shift_quantity: e.target.value })} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60" placeholder="0" step="0.5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-0.5 block">OT 數量</label>
                    <input type="number" value={item.ot_hours} onChange={e => updateItem(idx, { ot_hours: e.target.value })} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60" placeholder="0" step="0.5" />
                  </div>
                </div>
                {/* Employee multi-select */}
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">員工</label>
                  <button
                    type="button"
                    onClick={() => !isSubmitted && setPopupConfig({ type: 'employee', itemIdx: idx })}
                    disabled={isSubmitted}
                    className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white text-left disabled:opacity-60 min-h-[38px]"
                  >
                    {item.employee_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.employee_ids.map(id => (
                          <span key={id} className="bg-blue-100 text-blue-800 text-xs px-1.5 py-0.5 rounded">{getEmployeeLabel(id)}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">點擊選擇員工...</span>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ── Vehicle/Machinery fields ── */}
            {item.category === 'vehicle' && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400">連機手/司機</label>
                  <button
                    type="button"
                    onClick={() => !isSubmitted && updateItem(idx, { with_operator: !item.with_operator })}
                    disabled={isSubmitted}
                    className={`w-8 h-8 rounded-lg text-sm font-bold border ${
                      item.with_operator ? 'bg-green-100 border-green-300 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-400'
                    } disabled:opacity-60`}
                  >
                    {item.with_operator ? 'O' : 'X'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-0.5 block">噸數</label>
                    <Combobox
                      value={item.name_or_plate || null}
                      onChange={val => updateItem(idx, { name_or_plate: val || '' })}
                      options={tonnageOptions}
                      placeholder="噸數"
                      disabled={isSubmitted}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-0.5 block">機種</label>
                    <Combobox
                      value={item.worker_type || null}
                      onChange={val => updateItem(idx, { worker_type: val || '' })}
                      options={machineTypeOptions}
                      placeholder="機種"
                      disabled={isSubmitted}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">內容描述</label>
                  <input type="text" value={item.content} onChange={e => updateItem(idx, { content: e.target.value })} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60" placeholder="描述..." />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-0.5 block">數量</label>
                    <input type="number" value={item.quantity} onChange={e => updateItem(idx, { quantity: e.target.value })} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60" placeholder="0" step="0.5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-0.5 block">中直數量</label>
                    <input type="number" value={item.shift_quantity} onChange={e => updateItem(idx, { shift_quantity: e.target.value })} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60" placeholder="0" step="0.5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-0.5 block">OT 數量</label>
                    <input type="number" value={item.ot_hours} onChange={e => updateItem(idx, { ot_hours: e.target.value })} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60" placeholder="0" step="0.5" />
                  </div>
                </div>
                {/* Vehicle multi-select */}
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">機號/車牌</label>
                  <button
                    type="button"
                    onClick={() => !isSubmitted && setPopupConfig({ type: 'vehicle', itemIdx: idx })}
                    disabled={isSubmitted}
                    className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white text-left disabled:opacity-60 min-h-[38px]"
                  >
                    {item.vehicle_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.vehicle_ids.map(id => (
                          <span key={id} className="bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded">{getVehicleLabel(id)}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">點擊選擇機號/車牌...</span>
                    )}
                  </button>
                </div>
                {/* Employee multi-select for operator */}
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">員工</label>
                  <button
                    type="button"
                    onClick={() => !isSubmitted && setPopupConfig({ type: 'employee', itemIdx: idx })}
                    disabled={isSubmitted}
                    className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white text-left disabled:opacity-60 min-h-[38px]"
                  >
                    {item.employee_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.employee_ids.map(id => (
                          <span key={id} className="bg-blue-100 text-blue-800 text-xs px-1.5 py-0.5 rounded">{getEmployeeLabel(id)}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">點擊選擇員工...</span>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ── Tool fields ── */}
            {item.category === 'tool' && (
              <>
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">內容描述</label>
                  <input type="text" value={item.content} onChange={e => updateItem(idx, { content: e.target.value })} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60" placeholder="工具描述..." />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">數量</label>
                  <input type="number" value={item.quantity} onChange={e => updateItem(idx, { quantity: e.target.value })} disabled={isSubmitted} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60" placeholder="0" step="1" />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── Completed Work ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
        <h2 className="font-bold text-gray-700 text-sm">完成的工作</h2>
        <textarea
          value={form.completed_work}
          onChange={e => setForm(f => ({ ...f, completed_work: e.target.value }))}
          disabled={isSubmitted}
          rows={4}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60"
          style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}
          placeholder="測量數、完成項目等..."
        />
      </div>

      {/* ── Memo ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
        <h2 className="font-bold text-gray-700 text-sm">備忘錄</h2>
        <textarea
          value={form.memo}
          onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
          disabled={isSubmitted}
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none disabled:opacity-60"
          placeholder="其他備註事項..."
        />
      </div>

      {/* ── Attachments ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-700 text-sm">附件 / 相片</h2>
          <span className="text-xs text-gray-400">{attachments.length} 個檔案</span>
        </div>

        {/* Attachment list */}
        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl">
                {att.file_type?.startsWith('image/') ? (
                  <img src={att.file_url} alt={att.file_name} className="w-12 h-12 object-cover rounded-lg border" />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg text-blue-600 text-xs font-bold">
                    {att.file_type?.split('/').pop()?.toUpperCase() || 'FILE'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{att.file_name}</p>
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500">查看</a>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(idx)}
                  className="text-red-400 hover:text-red-600 text-lg px-1"
                  title="刪除"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
          >
            {uploading ? '上傳中...' : '+ 點此上傳相片/檔案'}
          </button>
        </div>
      </div>
      {/* ── Signature ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
        <h2 className="font-bold text-gray-700 text-sm">簽收</h2>
        {isSubmitted && form.signature ? (
          <div className="border rounded-xl p-2 bg-gray-50">
            <img src={form.signature} alt="簽名" className="max-h-32 mx-auto" />
          </div>
        ) : !isSubmitted ? (
          <>
            <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-white">
              <SignaturePad
                ref={sigRef}
                canvasProps={{ className: 'w-full', style: { width: '100%', height: '120px' } }}
              />
            </div>
            <button
              type="button"
              onClick={() => sigRef.current?.clear()}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              清除簽名
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-400">未簽名</p>
        )}
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
                  刪除此日報
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

      {/* ── MultiSelect Popup ─────────────────────────────────────── */}
      {popupConfig && (
        <MultiSelectPopup
          title={popupConfig.type === 'employee' ? '選擇員工' : '選擇機號/車牌'}
          options={popupConfig.type === 'employee' ? employeeOptions : vehicleMachineryOptions}
          selected={popupConfig.type === 'employee' ? items[popupConfig.itemIdx].employee_ids : items[popupConfig.itemIdx].vehicle_ids}
          onConfirm={(selected) => {
            if (popupConfig.type === 'employee') {
              updateItem(popupConfig.itemIdx, { employee_ids: selected });
            } else {
              updateItem(popupConfig.itemIdx, { vehicle_ids: selected });
            }
            setPopupConfig(null);
          }}
          onClose={() => setPopupConfig(null)}
          allowManualInput
          manualInputPlaceholder={popupConfig.type === 'employee' ? '手動輸入員工名稱...' : '手動輸入車牌/機號...'}
        />
      )}
    </div>
  );
}
