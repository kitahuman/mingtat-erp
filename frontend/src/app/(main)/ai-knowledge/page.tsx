'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { aiKnowledgeApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type KnowledgeEntry = Record<string, any>;

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

const STATUS_OPTIONS = [
  { value: '', label: '全部狀態' },
  { value: 'candidate', label: '候選' },
  { value: 'pending_review', label: '待審核' },
  { value: 'active', label: '已啟用' },
  { value: 'disabled', label: '已停用' },
  { value: 'rejected', label: '已拒絕' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  candidate: { label: '候選', color: 'bg-blue-100 text-blue-800' },
  pending_review: { label: '待審核', color: 'bg-yellow-100 text-yellow-800' },
  active: { label: '已啟用', color: 'bg-green-100 text-green-800' },
  disabled: { label: '已停用', color: 'bg-gray-100 text-gray-700' },
  rejected: { label: '已拒絕', color: 'bg-red-100 text-red-800' },
};

function moduleLabel(value?: string) {
  return MODULE_OPTIONS.find((m) => m.value === value)?.label || value || '—';
}

function getEntryId(entry: KnowledgeEntry) {
  return entry.id ?? entry.entry_id ?? entry.knowledge_id;
}

function getListPayload(data: any) {
  const rows = Array.isArray(data)
    ? data
    : data?.data || data?.entries || data?.items || data?.results || [];
  const pagination = data?.pagination || {
    page: data?.page || 1,
    limit: data?.limit || 20,
    total: data?.total || rows.length,
    total_pages: data?.total_pages || data?.pages || 1,
  };
  return { rows, pagination };
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

export default function AiKnowledgePage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('ai-knowledge');
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [filters, setFilters] = useState({ module: '', category: '', status: '', q: '' });
  const [actionLoading, setActionLoading] = useState(false);

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

  useEffect(() => {
    fetchEntries(1);
  }, [fetchEntries]);

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

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">AI 知識庫管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理跨模組學習得出的修正规則、業務知識與可審核證據。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
                  const score = Number(entry.confidence_score ?? entry.trust_score ?? entry.credibility_score ?? 0);
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
                        <div className="text-xs text-gray-400 truncate max-w-[360px]">{entry.description || entry.summary || entry.content_summary || '—'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{entry.category || entry.knowledge_category || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{moduleLabel(entry.module || entry.module_scope || entry.target_module)}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${scoreColor(score)}`}>{score ? (score <= 1 ? `${Math.round(score * 100)}%` : `${Math.round(score)}%`) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono">{entry.support_count ?? entry.supporting_count ?? 0}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-600">{entry.conflict_count ?? entry.contradiction_count ?? 0}</td>
                      <td className="px-4 py-3 text-right font-mono">{entry.reference_count ?? entry.usage_count ?? entry.citation_count ?? 0}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{formatDate(entry.last_used_at ?? entry.updated_at)}</td>
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
    </div>
  );
}
