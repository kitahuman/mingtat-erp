'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { aiKnowledgeApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type KnowledgeEntry = Record<string, any>;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  candidate: { label: '候選', color: 'bg-blue-100 text-blue-800' },
  pending_review: { label: '待審核', color: 'bg-yellow-100 text-yellow-800' },
  active: { label: '已啟用', color: 'bg-green-100 text-green-800' },
  disabled: { label: '已停用', color: 'bg-gray-100 text-gray-700' },
  rejected: { label: '已拒絕', color: 'bg-red-100 text-red-800' },
};

const MODULE_LABELS: Record<string, string> = {
  global: '全域共用',
  ai_payroll: 'AI計糧',
  bank_reconciliation: '銀行對帳',
  whatsapp_order: 'WhatsApp Order',
  whatsapp_work_report: 'WhatsApp報工',
  ocr: '飛仔OCR',
  face_clock: '人臉打卡',
  issue_report: '問題回報',
  ai_assistant: 'AI助手',
  nickname_matching: '花名配對',
};

function unwrapEntry(data: any) {
  return data?.data || data?.entry || data?.item || data;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-HK', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function getStatus(entry: KnowledgeEntry) {
  return entry.status || entry.knowledge_status || 'candidate';
}

function getPayload(entry: KnowledgeEntry) {
  const payload = entry.knowledge_payload_json ?? entry.payload ?? entry.structured_content ?? {};
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return payload; }
  }
  return payload || {};
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-gray-800">{value}</div>
    </div>
  );
}

function JsonKeyValueView({ value }: { value: any }) {
  if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
    return <div className="text-sm text-gray-400 py-6 text-center">沒有結構化內容</div>;
  }
  if (typeof value !== 'object') {
    return <pre className="text-sm whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{String(value)}</pre>;
  }
  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <tbody>
          {Object.entries(value).map(([key, val]) => (
            <tr key={key} className="border-t first:border-t-0">
              <td className="px-3 py-2 bg-gray-50 text-gray-600 font-medium w-48 align-top">{key}</td>
              <td className="px-3 py-2 align-top">
                {typeof val === 'object'
                  ? <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>
                  : String(val ?? '—')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AiKnowledgeDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('ai-knowledge');
  const [entry, setEntry] = useState<KnowledgeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'evidence' | 'history' | 'stats' | 'reviews'>('content');
  const [form, setForm] = useState({ title: '', description: '', category: '', module: '', keywords: '', payloadJson: '{}' });

  const loadEntry = useCallback(async () => {
    setLoading(true);
    try {
      const res = await aiKnowledgeApi.get(params.id);
      const item = unwrapEntry(res.data);
      setEntry(item);
      const payload = getPayload(item);
      setForm({
        title: item.title || item.knowledge_title || '',
        description: item.description || item.summary || '',
        category: item.category || item.knowledge_category || '',
        module: item.module || item.module_scope || item.target_module || '',
        keywords: Array.isArray(item.keywords) ? item.keywords.join(', ') : (item.keywords || ''),
        payloadJson: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || '載入知識詳情失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { loadEntry(); }, [loadEntry]);

  const status = entry ? getStatus(entry) : 'candidate';
  const statusCfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  const payload = useMemo(() => entry ? getPayload(entry) : {}, [entry]);
  const applicability = entry?.applicability || entry?.conditions || entry?.scope_conditions || {};
  const evidence = entry?.source_evidence || entry?.evidence || entry?.evidences || [];
  const versions = entry?.versions || entry?.version_history || [];
  const reviewLogs = entry?.review_logs || entry?.approval_logs || entry?.audit_logs || [];
  const stats = entry?.usage_statistics || entry?.usage_stats || entry?.stats || {};

  const handleSave = async () => {
    if (readOnly) return;
    let parsedPayload: any;
    try {
      parsedPayload = form.payloadJson.trim() ? JSON.parse(form.payloadJson) : {};
    } catch {
      alert('結構化內容不是有效 JSON，請修正後再儲存。');
      return;
    }
    setSaving(true);
    try {
      await aiKnowledgeApi.update(params.id, {
        title: form.title,
        description: form.description,
        category: form.category,
        module: form.module,
        keywords: form.keywords.split(',').map((item) => item.trim()).filter(Boolean),
        knowledge_payload_json: parsedPayload,
      });
      setEditing(false);
      await loadEntry();
    } catch (err: any) {
      const msg = err?.response?.data?.message || '儲存失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (label: string, fn: () => Promise<any>) => {
    if (readOnly) return;
    if (!confirm(`確定要${label}此知識嗎？`)) return;
    setSaving(true);
    try {
      await fn();
      await loadEntry();
    } catch (err: any) {
      const msg = err?.response?.data?.message || `${label}失敗`;
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (readOnly) return;
    if (!confirm('確定要刪除此知識嗎？此操作不可復原。')) return;
    setSaving(true);
    try {
      await aiKnowledgeApi.delete(params.id);
      router.push('/ai-knowledge');
    } catch (err: any) {
      const msg = err?.response?.data?.message || '刪除失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setSaving(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-gray-400">載入中...</div>;
  if (!entry) return <div className="p-12 text-center text-gray-400">找不到知識記錄</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Link href="/ai-knowledge" className="text-gray-400 hover:text-gray-600 text-lg mt-1">&larr;</Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-800">{entry.title || entry.knowledge_title || '未命名知識'}</h1>
              <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
            </div>
            <p className="text-sm text-gray-500 mt-1 max-w-3xl">{entry.description || entry.summary || '未提供描述'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50">取消</button>
              <button onClick={handleSave} disabled={saving || readOnly} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50">{saving ? '儲存中...' : '儲存'}</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} disabled={readOnly} className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50">編輯</button>
          )}
          <button onClick={() => runAction(status === 'active' ? '停用' : '啟用', () => status === 'active' ? aiKnowledgeApi.disable(params.id) : aiKnowledgeApi.enable(params.id))} disabled={saving || readOnly} className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50">{status === 'active' ? '停用' : '啟用'}</button>
          <button onClick={() => runAction('審核通過', () => aiKnowledgeApi.approve(params.id))} disabled={saving || readOnly} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50">審核通過</button>
          <button onClick={() => runAction('拒絕', () => aiKnowledgeApi.reject(params.id))} disabled={saving || readOnly} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-50">拒絕</button>
          <button onClick={handleDelete} disabled={saving || readOnly} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50">刪除</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard label="可信分" value={entry.confidence_score || entry.trust_score ? `${Math.round(Number(entry.confidence_score ?? entry.trust_score) * (Number(entry.confidence_score ?? entry.trust_score) <= 1 ? 100 : 1))}%` : '—'} />
        <InfoCard label="支持 / 矛盾" value={`${entry.support_count ?? entry.supporting_count ?? 0} / ${entry.conflict_count ?? entry.contradiction_count ?? 0}`} />
        <InfoCard label="引用次數" value={entry.reference_count ?? entry.usage_count ?? entry.citation_count ?? 0} />
        <InfoCard label="最近使用" value={<span className="text-sm font-medium">{formatDate(entry.last_used_at)}</span>} />
      </div>

      {editing ? (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block"><span className="text-xs font-medium text-gray-500">標題</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
            <label className="block"><span className="text-xs font-medium text-gray-500">分類</span><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
            <label className="block"><span className="text-xs font-medium text-gray-500">模組範圍</span><input value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
            <label className="block"><span className="text-xs font-medium text-gray-500">關鍵字（逗號分隔）</span><input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
          </div>
          <label className="block"><span className="text-xs font-medium text-gray-500">描述</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-medium text-gray-500">結構化內容 JSON</span><textarea value={form.payloadJson} onChange={(e) => setForm({ ...form, payloadJson: e.target.value })} rows={12} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" /></label>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="border-b flex overflow-x-auto">
              {[
                ['content', '知識內容'], ['evidence', '來源證據'], ['history', '版本歷史'], ['stats', '使用統計'], ['reviews', '審核紀錄'],
              ].map(([key, label]) => (
                <button key={key} onClick={() => setActiveTab(key as any)} className={`px-5 py-3 text-sm font-medium whitespace-nowrap ${activeTab === key ? 'text-primary-700 border-b-2 border-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
              ))}
            </div>

            <div className="p-5">
              {activeTab === 'content' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-lg font-semibold text-gray-800">結構化內容</h2>
                    <JsonKeyValueView value={payload} />
                  </div>
                  <div className="space-y-4">
                    <div className="border rounded-xl p-4">
                      <h3 className="font-medium text-gray-800 mb-3">適用條件</h3>
                      <div className="space-y-2 text-sm">
                        <div><span className="text-gray-500">模組：</span>{MODULE_LABELS[entry.module || entry.module_scope] || entry.module || entry.module_scope || '—'}</div>
                        <div><span className="text-gray-500">員工：</span>{applicability.employee_name || applicability.employee_id || entry.employee_name || '—'}</div>
                        <div><span className="text-gray-500">地盤：</span>{applicability.project_name || applicability.site_name || entry.project_name || '—'}</div>
                        <div><span className="text-gray-500">日期範圍：</span>{applicability.date_from || '—'} 至 {applicability.date_to || '—'}</div>
                      </div>
                    </div>
                    <div className="border rounded-xl p-4">
                      <h3 className="font-medium text-gray-800 mb-3">關鍵字</h3>
                      <div className="flex flex-wrap gap-2">
                        {(Array.isArray(entry.keywords) ? entry.keywords : String(entry.keywords || '').split(',').filter(Boolean)).map((keyword: string) => <Badge key={keyword} className="bg-gray-100 text-gray-700">{keyword}</Badge>)}
                        {(!entry.keywords || (Array.isArray(entry.keywords) && entry.keywords.length === 0)) && <span className="text-sm text-gray-400">—</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'evidence' && (
                <SimpleTable
                  emptyText="沒有來源證據"
                  rows={Array.isArray(evidence) ? evidence : []}
                  columns={[
                    ['source_module', '來源模組'], ['field_name', '欄位'], ['old_value', '修正前'], ['new_value', '修正後'], ['confirmed_by', '確認人'], ['created_at', '時間'],
                  ]}
                />
              )}
              {activeTab === 'history' && <SimpleTable emptyText="沒有版本歷史" rows={Array.isArray(versions) ? versions : []} columns={[[ 'version', '版本' ], [ 'change_summary', '變更摘要' ], [ 'created_by', '建立人' ], [ 'created_at', '建立時間' ]]} />}
              {activeTab === 'stats' && <JsonKeyValueView value={{ reference_count: entry.reference_count ?? entry.usage_count ?? 0, last_used_at: entry.last_used_at, success_hit_rate: stats.success_hit_rate ?? stats.hit_rate ?? entry.success_hit_rate, ...stats }} />}
              {activeTab === 'reviews' && <SimpleTable emptyText="沒有審核紀錄" rows={Array.isArray(reviewLogs) ? reviewLogs : []} columns={[[ 'action', '操作' ], [ 'reviewer_name', '審核人' ], [ 'remarks', '備註' ], [ 'created_at', '時間' ]]} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SimpleTable({ rows, columns, emptyText }: { rows: any[]; columns: [string, string][]; emptyText: string }) {
  if (!rows || rows.length === 0) return <div className="py-12 text-center text-gray-400">{emptyText}</div>;
  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>{columns.map(([, label]) => <th key={label} className="text-left px-4 py-3 font-medium text-gray-600">{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id || idx} className="border-t">
              {columns.map(([key]) => <td key={key} className="px-4 py-3 align-top">{key.includes('at') ? formatDate(row[key]) : String(row[key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
