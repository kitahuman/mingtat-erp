"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { aiKnowledgeApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type KnowledgeEntry = Record<string, any>;
type ActivityLog = Record<string, any>;

const MODULE_OPTIONS = [
  { value: '', label: '全部模組' },
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

const ACTIVITY_MODULE_OPTIONS = [
  { value: '', label: '全部模組' },
  { value: 'ai_chat', label: 'AI Chat' },
  { value: 'whatsapp_order', label: 'WhatsApp Order' },
  { value: 'whatsapp_clockin', label: 'WhatsApp 打卡' },
  { value: 'delivery_slip_ocr', label: '飛仔 OCR' },
  { value: 'bank_reconciliation', label: '銀行對帳' },
  { value: 'face_clockin', label: '人臉打卡' },
  { value: 'issue_report_ai', label: '問題回報 AI' },
  { value: 'ai_payroll', label: 'AI 計糧' },
  { value: 'nickname_match', label: '花名配對' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部狀態' },
  { value: 'candidate', label: '候選' },
  { value: 'pending_review', label: '待審核' },
  { value: 'active', label: '已啟用' },
  { value: 'disabled', label: '已停用' },
  { value: 'rejected', label: '已拒絕' },
];

const ACTIVITY_TYPE_OPTIONS = [
  { value: '', label: '全部類型' },
  { value: 'action', label: '行動' },
  { value: 'learning', label: '學習' },
  { value: 'correction', label: '修正' },
  { value: 'retrieval', label: '檢索' },
];

const RESULT_OPTIONS = [
  { value: '', label: '全部結果' },
  { value: 'success', label: '成功' },
  { value: 'needs_review', label: '需審核' },
  { value: 'corrected', label: '已修正' },
  { value: 'failed', label: '失敗' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  candidate: { label: '候選', color: 'bg-blue-100 text-blue-800' },
  pending_review: { label: '待審核', color: 'bg-yellow-100 text-yellow-800' },
  active: { label: '已啟用', color: 'bg-green-100 text-green-800' },
  disabled: { label: '已停用', color: 'bg-gray-100 text-gray-700' },
  rejected: { label: '已拒絕', color: 'bg-red-100 text-red-800' },
};

const RESULT_CONFIG: Record<string, { label: string; color: string }> = {
  success: { label: '成功', color: 'bg-green-100 text-green-800' },
  needs_review: { label: '需審核', color: 'bg-yellow-100 text-yellow-800' },
  corrected: { label: '已修正', color: 'bg-blue-100 text-blue-800' },
  failed: { label: '失敗', color: 'bg-red-100 text-red-800' },
};

function moduleLabel(value?: string) {
  return MODULE_OPTIONS.find((m) => m.value === value)?.label || ACTIVITY_MODULE_OPTIONS.find((m) => m.value === value)?.label || value || '—';
}

function activityTypeLabel(value?: string) {
  return ACTIVITY_TYPE_OPTIONS.find((m) => m.value === value)?.label || value || '—';
}

function getEntryId(entry: KnowledgeEntry) {
  return entry.id ?? entry.entry_id ?? entry.knowledge_id;
}

function getListPayload(data: any) {
  const rows = Array.isArray(data)
    ? data
    : data?.data || data?.entries || data?.items || data?.results || [];
  const page = data?.pagination?.page || data?.page || 1;
  const limit = data?.pagination?.limit || data?.pagination?.pageSize || data?.limit || data?.pageSize || 20;
  const total = data?.pagination?.total || data?.total || rows.length;
  const totalPages = data?.pagination?.total_pages || data?.pagination?.totalPages || data?.total_pages || data?.pages || Math.max(1, Math.ceil(total / limit));
  return { rows, pagination: { page, limit, total, total_pages: totalPages } };
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreColor(score: number) {
  if (score >= 0.85 || score >= 85) return 'text-green-700';
  if (score >= 0.6 || score >= 60) return 'text-yellow-700';
  return 'text-red-700';
}

function formatConfidence(value: any) {
  const score = Number(value ?? 0);
  if (!score) return '—';
  return score <= 1 ? `${Math.round(score * 100)}%` : `${Math.round(score)}%`;
}

export default function AiKnowledgePage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('ai-knowledge');
  const [activeTab, setActiveTab] = useState('knowledge');
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [filters, setFilters] = useState({ module: '', category: '', status: '', q: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPagination, setActivityPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [activityFilters, setActivityFilters] = useState({ moduleCode: '', activityType: '', result: '', search: '' });

  const fetchEntries = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
        module: filters.module || undefined,
        category: filters.category || undefined,
        status: filters.status || undefined,
        q: filters.q || undefined,
      };
      const res = await aiKnowledgeApi.list(params);
      const payload = getListPayload(res.data);
      setEntries(payload.rows);
      setPagination(payload.pagination);
      setSelectedIds([]);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '載入 AI 知識庫失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchActivityLogs = useCallback(async (page = 1) => {
    setActivityLoading(true);
    try {
      const params = {
        page,
        pageSize: 20,
        moduleCode: activityFilters.moduleCode || undefined,
        activityType: activityFilters.activityType || undefined,
        result: activityFilters.result || undefined,
        search: activityFilters.search || undefined,
      };
      const res = await aiKnowledgeApi.listActivityLogs(params);
      const payload = getListPayload(res.data);
      setActivityLogs(payload.rows);
      setActivityPagination(payload.pagination);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '載入 AI 歷史紀錄失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  }, [activityFilters]);

  useEffect(() => {
    fetchEntries(1);
  }, [fetchEntries]);

  useEffect(() => {
    if (activeTab === 'activity-logs') {
      fetchActivityLogs(1);
    }
  }, [activeTab, fetchActivityLogs]);

  const selectableEntries = useMemo(
    () => entries.filter((entry) => ['candidate', 'pending_review'].includes(entry.status || entry.knowledge_status)),
    [entries],
  );

  const toggleAll = () => {
    if (selectedIds.length === selectableEntries.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(selectableEntries.map(getEntryId).filter(Boolean));
  };

  const toggleOne = (id: string | number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const handleBatchApprove = async () => {
    if (selectedIds.length === 0 || readOnly) return;
    if (!confirm(`確定要批量審核通過 ${selectedIds.length} 條知識嗎？`)) return;
    setActionLoading(true);
    try {
      await aiKnowledgeApi.batchApprove(selectedIds);
      await fetchEntries(pagination.page);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '批量審核失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setActionLoading(false);
    }
  };

  const handleMigrateExistingData = async () => {
    if (readOnly) return;
    if (!confirm('確定要將現有花名/簡稱資料匯入 AI 知識庫嗎？系統會自動跳過重複資料。')) return;
    setActionLoading(true);
    try {
      const res = await aiKnowledgeApi.migrateExistingData();
      const data = res.data;
      alert(`匯入完成：新增 ${data?.created ?? 0} 條，跳過 ${data?.skipped ?? 0} 條。`);
      await fetchEntries(1);
      if (activeTab === 'activity-logs') await fetchActivityLogs(1);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '匯入既有資料失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">AI 知識庫管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理跨模組學習得出的修正规則、業務知識、AI 行動歷史與可審核證據。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleMigrateExistingData}
            disabled={readOnly || actionLoading}
            className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            匯入既有花名
          </button>
          <button
            onClick={handleBatchApprove}
            disabled={readOnly || selectedIds.length === 0 || actionLoading}
            className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading ? '處理中...' : `批量審核${selectedIds.length ? `（${selectedIds.length}）` : ''}`}
          </button>
          <Link
            href="/ai-knowledge/new"
            className={`px-4 py-2 rounded-lg text-sm font-medium ${readOnly ? 'bg-gray-200 text-gray-500 pointer-events-none' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
          >
            新增知識
          </Link>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="knowledge">AI 知識庫</TabsTrigger>
          <TabsTrigger value="activity-logs">AI 歷史</TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge" className="space-y-4">
          <div className="bg-white rounded-xl border p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">模組</label>
                <select
                  value={filters.module}
                  onChange={(e) => setFilters((prev) => ({ ...prev, module: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                >
                  {MODULE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">分類</label>
                <input
                  value={filters.category}
                  onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="例如：員工別名、地盤、薪酬規則"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">狀態</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                >
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">搜尋</label>
                <input
                  value={filters.q}
                  onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
                  placeholder="地盤、員工、車牌、公司簡稱、關鍵字"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => fetchEntries(1)}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-900"
              >
                重新查詢
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400">載入中...</div>
            ) : entries.length === 0 ? (
              <div className="p-12 text-center text-gray-400">暫無 AI 知識記錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 w-10 text-left">
                        <input
                          type="checkbox"
                          checked={selectableEntries.length > 0 && selectedIds.length === selectableEntries.length}
                          onChange={toggleAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">標題</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">分類</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">所屬模組</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">可信分</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">支持</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">矛盾</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">引用</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">最近使用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => {
                      const id = getEntryId(entry);
                      const status = entry.status || entry.knowledge_status || 'candidate';
                      const statusCfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
                      const score = Number(entry.confidence_score ?? entry.trust_score ?? entry.credibility_score ?? entry.knowledge_confidence_score ?? 0);
                      return (
                        <tr
                          key={String(id || idx)}
                          onClick={() => id && router.push(`/ai-knowledge/${id}`)}
                          className="border-t hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {['candidate', 'pending_review'].includes(status) ? (
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(id)}
                                onChange={() => toggleOne(id)}
                                className="rounded border-gray-300"
                              />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 min-w-[220px]">
                            <div className="font-medium text-gray-800">{entry.title || entry.knowledge_title || '未命名知識'}</div>
                            <div className="text-xs text-gray-400 truncate max-w-[360px]">{entry.description || entry.knowledge_description || entry.summary || entry.content_summary || '—'}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{entry.category || entry.knowledge_category || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{moduleLabel(entry.module || entry.module_scope || entry.knowledge_module_code || entry.target_module)}</td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-semibold ${scoreColor(score)}`}>{formatConfidence(score)}</td>
                          <td className="px-4 py-3 text-right font-mono">{entry.support_count ?? entry.supporting_count ?? entry.knowledge_support_count ?? 0}</td>
                          <td className="px-4 py-3 text-right font-mono text-red-600">{entry.conflict_count ?? entry.contradiction_count ?? entry.knowledge_conflict_count ?? 0}</td>
                          <td className="px-4 py-3 text-right font-mono">{entry.reference_count ?? entry.usage_count ?? entry.citation_count ?? entry.knowledge_usage_count ?? 0}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{formatDate(entry.last_used_at ?? entry.knowledge_last_used_at ?? entry.updated_at ?? entry.knowledge_updated_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between text-sm text-gray-500">
              <span>共 {pagination.total || entries.length} 條記錄</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchEntries(Math.max(1, pagination.page - 1))}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 border rounded bg-white disabled:opacity-40"
                >
                  上一頁
                </button>
                <span>{pagination.page} / {pagination.total_pages || 1}</span>
                <button
                  onClick={() => fetchEntries(Math.min(pagination.total_pages || 1, pagination.page + 1))}
                  disabled={pagination.page >= (pagination.total_pages || 1)}
                  className="px-3 py-1 border rounded bg-white disabled:opacity-40"
                >
                  下一頁
                </button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="activity-logs" className="space-y-4">
          <div className="bg-white rounded-xl border p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">模組</label>
                <select
                  value={activityFilters.moduleCode}
                  onChange={(e) => setActivityFilters((prev) => ({ ...prev, moduleCode: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                >
                  {ACTIVITY_MODULE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">類型</label>
                <select
                  value={activityFilters.activityType}
                  onChange={(e) => setActivityFilters((prev) => ({ ...prev, activityType: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                >
                  {ACTIVITY_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">結果</label>
                <select
                  value={activityFilters.result}
                  onChange={(e) => setActivityFilters((prev) => ({ ...prev, result: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                >
                  {RESULT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">搜尋</label>
                <input
                  value={activityFilters.search}
                  onChange={(e) => setActivityFilters((prev) => ({ ...prev, search: e.target.value }))}
                  placeholder="行動、描述、原因、輸入或輸出摘要"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => fetchActivityLogs(1)}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-900"
              >
                重新查詢
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            {activityLoading ? (
              <div className="p-12 text-center text-gray-400">載入中...</div>
            ) : activityLogs.length === 0 ? (
              <div className="p-12 text-center text-gray-400">暫無 AI 歷史紀錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">時間</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">模組</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">類型</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">行動</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">描述</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">結果</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">信心</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">關聯實體</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLogs.map((log, idx) => {
                      const result = log.activity_result || '';
                      const resultCfg = RESULT_CONFIG[result] || { label: result || '—', color: 'bg-gray-100 text-gray-700' };
                      return (
                        <tr key={String(log.id || idx)} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{formatDate(log.activity_created_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{moduleLabel(log.activity_module_code)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{activityTypeLabel(log.activity_type)}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-700">{log.activity_action || '—'}</td>
                          <td className="px-4 py-3 min-w-[320px]">
                            <div className="font-medium text-gray-800">{log.activity_description || '—'}</div>
                            <div className="text-xs text-gray-400 truncate max-w-[520px]">{log.activity_reason || log.activity_output_summary || log.activity_input_summary || '—'}</div>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${resultCfg.color}`}>{resultCfg.label}</span>
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-semibold ${scoreColor(Number(log.activity_confidence ?? 0))}`}>{formatConfidence(log.activity_confidence)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                            {log.activity_entity_type ? `${log.activity_entity_type}${log.activity_entity_id ? ` #${log.activity_entity_id}` : ''}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between text-sm text-gray-500">
              <span>共 {activityPagination.total || activityLogs.length} 條記錄</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchActivityLogs(Math.max(1, activityPagination.page - 1))}
                  disabled={activityPagination.page <= 1}
                  className="px-3 py-1 border rounded bg-white disabled:opacity-40"
                >
                  上一頁
                </button>
                <span>{activityPagination.page} / {activityPagination.total_pages || 1}</span>
                <button
                  onClick={() => fetchActivityLogs(Math.min(activityPagination.total_pages || 1, activityPagination.page + 1))}
                  disabled={activityPagination.page >= (activityPagination.total_pages || 1)}
                  className="px-3 py-1 border rounded bg-white disabled:opacity-40"
                >
                  下一頁
                </button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
