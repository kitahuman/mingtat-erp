'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { aiKnowledgeApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const MODULE_OPTIONS = [
  { value: 'global', label: '全域共用' },
  { value: 'ai_payroll', label: 'AI計糧' },
  { value: 'bank_reconciliation', label: '銀行對帳' },
  { value: 'whatsapp_order', label: 'WhatsApp Order' },
  { value: 'whatsapp_work_report', label: 'WhatsApp報工' },
  { value: 'ocr', label: '飛仔OCR' },
  { value: 'face_clock', label: '人臉打卡' },
  { value: 'issue_report', label: '問題回報' },
  { value: 'ai_assistant', label: 'AI助手' },
  { value: 'nickname_matching', label: '花名配對' },
];

export default function NewAiKnowledgePage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('ai-knowledge');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: '',
    module: 'global',
    status: 'pending_review',
    description: '',
    keywords: '',
    employee: '',
    project: '',
    dateFrom: '',
    dateTo: '',
    payloadJson: '{\n  "rule": "",\n  "value": ""\n}',
  });

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (readOnly) return;
    if (!form.title.trim()) {
      alert('請輸入標題');
      return;
    }
    let payload: any;
    try {
      payload = form.payloadJson.trim() ? JSON.parse(form.payloadJson) : {};
    } catch {
      alert('結構化內容不是有效 JSON，請修正後再提交。');
      return;
    }
    setSaving(true);
    try {
      const res = await aiKnowledgeApi.create({
        title: form.title.trim(),
        category: form.category.trim(),
        module: form.module,
        status: form.status,
        description: form.description.trim(),
        keywords: form.keywords.split(',').map((item) => item.trim()).filter(Boolean),
        knowledge_payload_json: payload,
        applicability: {
          employee_name: form.employee || undefined,
          project_name: form.project || undefined,
          date_from: form.dateFrom || undefined,
          date_to: form.dateTo || undefined,
        },
      });
      const item = res.data?.data || res.data?.entry || res.data;
      const id = item?.id || item?.entry_id || item?.knowledge_id;
      router.push(id ? `/ai-knowledge/${id}` : '/ai-knowledge');
    } catch (err: any) {
      const msg = err?.response?.data?.message || '新增知識失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start gap-4">
        <Link href="/ai-knowledge" className="text-gray-400 hover:text-gray-600 text-lg mt-1">&larr;</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">新增 AI 知識</h1>
          <p className="text-sm text-gray-500 mt-1">建立可供 AI 模組引用、審核及版本化管理的結構化知識。</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">標題</span>
            <input value={form.title} onChange={(e) => update('title', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="例如：明達地盤別名修正" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">分類</span>
            <input value={form.category} onChange={(e) => update('category', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="例如：地盤、員工、車牌、計糧規則" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">所屬模組</span>
            <select value={form.module} onChange={(e) => update('module', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
              {MODULE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">狀態</span>
            <select value={form.status} onChange={(e) => update('status', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
              <option value="candidate">候選</option>
              <option value="pending_review">待審核</option>
              <option value="active">已啟用</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">知識摘要</span>
          <textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="描述此知識的來源、用途及適用限制" />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="block"><span className="text-xs font-medium text-gray-500">適用員工</span><input value={form.employee} onChange={(e) => update('employee', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-medium text-gray-500">適用地盤</span><input value={form.project} onChange={(e) => update('project', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-medium text-gray-500">開始日期</span><input type="date" value={form.dateFrom} onChange={(e) => update('dateFrom', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-medium text-gray-500">結束日期</span><input type="date" value={form.dateTo} onChange={(e) => update('dateTo', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">關鍵字（支援地盤名、員工名、車牌、公司簡稱等，以逗號分隔）</span>
          <input value={form.keywords} onChange={(e) => update('keywords', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="明達, 張三, AB1234" />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">結構化內容 JSON</span>
          <textarea value={form.payloadJson} onChange={(e) => update('payloadJson', e.target.value)} rows={14} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" />
        </label>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Link href="/ai-knowledge" className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">取消</Link>
          <button onClick={handleSubmit} disabled={saving || readOnly} className="px-5 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {saving ? '建立中...' : '建立知識'}
          </button>
        </div>
      </div>
    </div>
  );
}
