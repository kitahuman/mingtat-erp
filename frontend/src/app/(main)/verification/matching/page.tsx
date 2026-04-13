'use client';
import { useState, useCallback } from 'react';
import { verificationApi } from '@/lib/api';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

interface FieldScore {
  field: string;
  weight: number;
  score: number;
  ref_value: string;
  src_value: string;
}

interface SourceData {
  source: string;
  status: 'found' | 'missing';
  match_score: number;
  field_scores: FieldScore[];
  details: any[];
}

interface ConfirmationData {
  id: number;
  status: 'confirmed' | 'rejected' | 'manual_match';
  matched_record_id?: number;
  matched_record_type?: string;
  notes?: string;
  confirmed_by: string;
  confirmed_at: string;
}

interface MatchingRow {
  key: string;
  date: string;
  work_log_ids: number[];
  sources: Record<string, SourceData>;
  confirmations: Record<string, ConfirmationData>;
  match_status: 'full_match' | 'partial_match' | 'conflict' | 'missing_source';
  match_count: number;
  total_sources: number;
  avg_score: number;
}

interface Summary {
  total: number;
  full_match: number;
  partial_match: number;
  conflict: number;
  missing_source: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// ══════════════════════════════════════════════════════════════
// 來源定義
// ══════════════════════════════════════════════════════════════

const ALL_SOURCE_COLUMNS = [
  { key: 'whatsapp_order', label: 'WhatsApp', icon: '💬', alwaysOn: false },
  { key: 'work_log', label: '工作紀錄', icon: '📋', alwaysOn: true },
  { key: 'chit', label: '入帳票', icon: '🧾', alwaysOn: false },
  { key: 'delivery_note', label: '飛仔 OCR', icon: '📄', alwaysOn: false },
  { key: 'gps', label: 'GPS', icon: '📍', alwaysOn: false },
  { key: 'attendance', label: '打卡', icon: '⏰', alwaysOn: false },
];

const STATUS_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  full_match: { label: '全部吻合', emoji: '✅', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  partial_match: { label: '部分吻合', emoji: '⚠️', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  conflict: { label: '有衝突', emoji: '❌', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  missing_source: { label: '缺少來源', emoji: '❓', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
};

const REVIEW_STATUS_OPTIONS = [
  { value: 'all', label: '全部', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'unreviewed', label: '未審核', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'confirmed', label: '已確認', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'rejected', label: '已拒絕', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'manual_match', label: '手動配對', color: 'bg-purple-100 text-purple-700 border-purple-300' },
];

const CONFIRM_STATUS_BADGE: Record<string, { label: string; icon: string; color: string }> = {
  confirmed: { label: '已確認', icon: '✅', color: 'text-green-600 bg-green-50 border-green-200' },
  rejected: { label: '已拒絕', icon: '❎', color: 'text-red-600 bg-red-50 border-red-200' },
  manual_match: { label: '手動配對', icon: '🔗', color: 'text-purple-600 bg-purple-50 border-purple-200' },
};

// ══════════════════════════════════════════════════════════════
// 工具函數
// ══════════════════════════════════════════════════════════════

function getDefaultDateRange(): { from: string; to: string } {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return {
    from: weekAgo.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function getScoreColor(score: number): { text: string; bg: string; ring: string } {
  if (score >= 80) return { text: 'text-green-700', bg: 'bg-green-100', ring: 'ring-green-300' };
  if (score >= 60) return { text: 'text-yellow-700', bg: 'bg-yellow-100', ring: 'ring-yellow-300' };
  return { text: 'text-red-700', bg: 'bg-red-100', ring: 'ring-red-300' };
}

// ══════════════════════════════════════════════════════════════
// 子元件
// ══════════════════════════════════════════════════════════════

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const colors = getScoreColor(score);
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold ring-1 ${sizeClass} ${colors.text} ${colors.bg} ${colors.ring}`}
      title={`匹配分數: ${score}%`}
    >
      {score}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// 主頁面元件
// ══════════════════════════════════════════════════════════════

export default function MatchingPage() {
  const defaultRange = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [groupBy, setGroupBy] = useState<'vehicle' | 'employee'>('vehicle');
  const [search, setSearch] = useState('');
  const [reviewStatus, setReviewStatus] = useState('all');
  const [data, setData] = useState<MatchingRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null);

  // 顯示來源篩選器：預設全部開啟（work_log 強制開啟）
  const [visibleSources, setVisibleSources] = useState<Set<string>>(
    new Set(ALL_SOURCE_COLUMNS.map((c) => c.key))
  );

  const toggleSource = (key: string) => {
    if (key === 'work_log') return;
    setVisibleSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const visibleColumns = ALL_SOURCE_COLUMNS.filter((c) => visibleSources.has(c.key));

  const fetchData = useCallback(async (page = 1) => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const res = await verificationApi.getMatchingOverview({
        date_from: dateFrom,
        date_to: dateTo,
        group_by: groupBy,
        search: search || undefined,
        review_status: reviewStatus !== 'all' ? reviewStatus : undefined,
        page,
        limit: 50,
      });
      setData(res.data.data || []);
      setSummary(res.data.summary || null);
      setPagination(res.data.pagination || { page: 1, limit: 50, total: 0, total_pages: 0 });
      setLoaded(true);
    } catch (err) {
      console.error('Failed to fetch matching data:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupBy, search, reviewStatus]);

  const handleSearch = () => {
    setExpandedKey(null);
    setExpandedSource(null);
    fetchData(1);
  };

  const handlePageChange = (newPage: number) => fetchData(newPage);

  const toggleExpand = (rowKey: string) => {
    if (expandedKey === rowKey) {
      setExpandedKey(null);
      setExpandedSource(null);
    } else {
      setExpandedKey(rowKey);
      setExpandedSource(null);
    }
  };

  const toggleSourceDetail = (sourceKey: string) => {
    setExpandedSource(expandedSource === sourceKey ? null : sourceKey);
  };

  // 確認/拒絕操作
  const handleConfirm = async (row: MatchingRow, sourceCode: string, status: 'confirmed' | 'rejected') => {
    const loadingKey = `${row.date}-${row.key}-${sourceCode}`;
    setConfirmLoading(loadingKey);
    try {
      const workLogId = row.work_log_ids[0];
      if (!workLogId) return;
      await verificationApi.upsertConfirmation({
        work_log_id: workLogId,
        source_code: sourceCode,
        status,
      });
      // 更新本地狀態
      setData((prev) =>
        prev.map((r) => {
          if (r.date === row.date && r.key === row.key) {
            return {
              ...r,
              confirmations: {
                ...r.confirmations,
                [sourceCode]: {
                  id: 0,
                  status,
                  confirmed_by: '我',
                  confirmed_at: new Date().toISOString(),
                } as ConfirmationData,
              },
            };
          }
          return r;
        })
      );
    } catch (err) {
      console.error('Confirm failed:', err);
      alert('操作失敗，請重試');
    } finally {
      setConfirmLoading(null);
    }
  };

  // 重置為未審核
  const handleReset = async (row: MatchingRow, sourceCode: string) => {
    const loadingKey = `${row.date}-${row.key}-${sourceCode}`;
    setConfirmLoading(loadingKey);
    try {
      const workLogId = row.work_log_ids[0];
      if (!workLogId) return;
      await verificationApi.deleteConfirmation(workLogId, sourceCode);
      // 更新本地狀態
      setData((prev) =>
        prev.map((r) => {
          if (r.date === row.date && r.key === row.key) {
            const newConfirmations = { ...r.confirmations };
            delete newConfirmations[sourceCode];
            return { ...r, confirmations: newConfirmations };
          }
          return r;
        })
      );
    } catch (err) {
      console.error('Reset failed:', err);
      alert('操作失敗，請重試');
    } finally {
      setConfirmLoading(null);
    }
  };

  // 展開詳情的 colSpan
  const expandColSpan = 7 + visibleColumns.length + 2;

  return (
    <div className="p-4 sm:p-6 max-w-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800">六來源交叉比對</h1>
        <p className="text-sm text-gray-500 mt-1">
          以工作紀錄為主軸，比對入帳票、飛仔 OCR、GPS、打卡、WhatsApp Order 六個數據來源
        </p>
      </div>

      {/* 篩選區 */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">開始日期</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">分組方式</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'vehicle' | 'employee')}
              className="border rounded px-3 py-1.5 text-sm"
            >
              <option value="vehicle">按車牌</option>
              <option value="employee">按員工</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">搜尋</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="車牌/員工名..."
              className="border rounded px-3 py-1.5 text-sm w-40"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="bg-primary-600 text-white px-5 py-1.5 rounded text-sm hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? '查詢中...' : '查詢'}
          </button>
        </div>

        {/* 審核狀態篩選 */}
        <div className="mt-3 pt-3 border-t">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">審核狀態:</span>
            {REVIEW_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setReviewStatus(opt.value)}
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                  ${reviewStatus === opt.value ? opt.color : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 顯示來源篩選 chips */}
        <div className="mt-3 pt-3 border-t">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">顯示欄位:</span>
            {ALL_SOURCE_COLUMNS.map((col) => {
              const isOn = visibleSources.has(col.key);
              const isLocked = col.alwaysOn;
              return (
                <button
                  key={col.key}
                  onClick={() => toggleSource(col.key)}
                  disabled={isLocked}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                    ${isOn
                      ? isLocked
                        ? 'bg-blue-100 text-blue-700 border-blue-300 cursor-default'
                        : 'bg-primary-100 text-primary-700 border-primary-300 hover:bg-primary-200'
                      : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
                    }`}
                  title={isLocked ? '工作紀錄為比對基準，不可隱藏' : isOn ? '點擊隱藏' : '點擊顯示'}
                >
                  <span>{col.icon}</span>
                  <span>{col.label}</span>
                  {!isLocked && (
                    <span className={`ml-0.5 ${isOn ? 'text-primary-500' : 'text-gray-300'}`}>
                      {isOn ? '✓' : '×'}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setVisibleSources(new Set(ALL_SOURCE_COLUMNS.map((c) => c.key)))}
              className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
            >
              全選
            </button>
            <button
              onClick={() => setVisibleSources(new Set(['work_log']))}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              只顯示工作紀錄
            </button>
          </div>
        </div>
      </div>

      {/* 評分說明 */}
      <div className="bg-white rounded-lg shadow-sm border p-3 mb-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="font-medium text-gray-700">評分等級:</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" /> 80%+ 高度吻合
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shrink-0" /> 60-79% 部分吻合
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" /> &lt;60% 低吻合
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" /> 無資料
          </span>
          <span className="text-gray-400 hidden sm:inline">
            權重: 員工 30% | 客戶 25% | 合約 25% | 地點 20%
          </span>
        </div>
      </div>

      {/* 統計摘要 */}
      {summary && (
        <div className="grid grid-cols-5 gap-2 mb-3">
          <div className="bg-white rounded-lg border p-2 sm:p-3 text-center">
            <div className="text-xl sm:text-2xl font-bold text-gray-800">{summary.total}</div>
            <div className="text-xs text-gray-500">總筆數</div>
          </div>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <div key={key} className={`rounded-lg border p-2 sm:p-3 text-center ${config.bg}`}>
              <div className={`text-xl sm:text-2xl font-bold ${config.color}`}>
                {summary[key as keyof Summary] || 0}
              </div>
              <div className="text-xs text-gray-500">{config.emoji} {config.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 比對結果表格 */}
      {!loaded ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <div>請選擇日期範圍並點擊「查詢」開始比對</div>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-blue-100 border-t-blue-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl">🔗</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-gray-700">正在配對中，請稍候...</p>
            <p className="text-sm text-gray-400 mt-1">系統正在比對各來源資料，這可能需要數秒鐘</p>
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <div>所選日期範圍內無工作紀錄</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 w-8"></th>
                  <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">日期</th>
                  <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                    {groupBy === 'vehicle' ? '車牌' : '員工'}
                  </th>
                  <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">司機/員工</th>
                  <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">客戶</th>
                  <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">合約</th>
                  <th className="px-2 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">地點</th>
                  {visibleColumns.map((col) => (
                    <th key={col.key} className="px-2 py-2.5 text-center text-xs font-medium text-gray-500 min-w-[56px]">
                      <div>{col.icon}</div>
                      <div className="whitespace-nowrap">{col.label}</div>
                    </th>
                  ))}
                  <th className="px-2 py-2.5 text-center text-xs font-medium text-gray-500 whitespace-nowrap">平均分</th>
                  <th className="px-2 py-2.5 text-center text-xs font-medium text-gray-500 whitespace-nowrap">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((row) => {
                  const rowKey = `${row.date}-${row.key}`;
                  const isExpanded = expandedKey === rowKey;
                  const statusCfg = STATUS_CONFIG[row.match_status] || STATUS_CONFIG.missing_source;

                  return (
                    <MatchingTableRow
                      key={rowKey}
                      row={row}
                      rowKey={rowKey}
                      isExpanded={isExpanded}
                      statusCfg={statusCfg}
                      groupBy={groupBy}
                      visibleColumns={visibleColumns}
                      expandedSource={expandedSource}
                      expandColSpan={expandColSpan}
                      confirmLoading={confirmLoading}
                      onToggleExpand={toggleExpand}
                      onToggleSourceDetail={toggleSourceDetail}
                      onConfirm={handleConfirm}
                      onReset={handleReset}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 分頁 */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40"
          >
            上一頁
          </button>
          <span className="text-sm text-gray-500">
            {pagination.page} / {pagination.total_pages}
          </span>
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page >= pagination.total_pages}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 表格行元件（避免 Fragment key 問題）
// ══════════════════════════════════════════════════════════════

function MatchingTableRow({
  row,
  rowKey,
  isExpanded,
  statusCfg,
  groupBy,
  visibleColumns,
  expandedSource,
  expandColSpan,
  confirmLoading,
  onToggleExpand,
  onToggleSourceDetail,
  onConfirm,
  onReset,
}: {
  row: MatchingRow;
  rowKey: string;
  isExpanded: boolean;
  statusCfg: { label: string; emoji: string; color: string; bg: string };
  groupBy: string;
  visibleColumns: { key: string; label: string; icon: string; alwaysOn: boolean }[];
  expandedSource: string | null;
  expandColSpan: number;
  confirmLoading: string | null;
  onToggleExpand: (key: string) => void;
  onToggleSourceDetail: (key: string) => void;
  onConfirm: (row: MatchingRow, sourceCode: string, status: 'confirmed' | 'rejected') => void;
  onReset: (row: MatchingRow, sourceCode: string) => void;
}) {
  const wl = row.sources['work_log'];
  const d = wl?.details?.[0];

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? 'bg-blue-50' : ''}`}
        onClick={() => onToggleExpand(rowKey)}
      >
        <td className="px-2 py-2 text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</td>
        <td className="px-2 py-2 text-gray-700 whitespace-nowrap text-xs">{row.date}</td>
        <td className="px-2 py-2 font-medium text-gray-800 whitespace-nowrap font-mono">{row.key}</td>
        <td className="px-2 py-2 text-gray-700 whitespace-nowrap text-xs">{d?.employee || '—'}</td>
        <td className="px-2 py-2 text-gray-700 text-xs max-w-[120px] truncate" title={d?.customer}>{d?.customer || '—'}</td>
        <td className="px-2 py-2 text-gray-700 whitespace-nowrap text-xs font-mono">{d?.contract && d.contract !== '—' ? d.contract : '—'}</td>
        <td className="px-2 py-2 text-gray-700 text-xs max-w-[120px] truncate" title={d?.location}>{d?.location && d.location !== '—' ? d.location : '—'}</td>
        {visibleColumns.map((col) => {
          const src = row.sources[col.key];
          const conf = row.confirmations?.[col.key];

          if (!src) {
            return (
              <td key={col.key} className="px-2 py-2 text-center">
                <span className="text-gray-300 text-xs">—</span>
              </td>
            );
          }

          // 工作紀錄固定顯示 REF
          if (col.key === 'work_log') {
            return (
              <td key={col.key} className="px-2 py-2 text-center">
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-100 text-blue-600 text-xs font-bold ring-1 ring-blue-300"
                  title="工作紀錄（比對基準）"
                >
                  REF
                </span>
              </td>
            );
          }

          // 有確認狀態時覆蓋顯示
          if (conf) {
            const badge = CONFIRM_STATUS_BADGE[conf.status];
            return (
              <td key={col.key} className="px-2 py-2 text-center">
                <span
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold ring-1 ${badge.color}`}
                  title={`${badge.label} - ${conf.confirmed_by}`}
                >
                  {badge.icon}
                </span>
              </td>
            );
          }

          // missing
          if (src.status === 'missing') {
            return (
              <td key={col.key} className="px-2 py-2 text-center">
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-400 text-xs ring-1 ring-gray-200"
                  title="無資料"
                >
                  N/A
                </span>
              </td>
            );
          }

          // found — 顯示分數
          return (
            <td key={col.key} className="px-2 py-2 text-center">
              <ScoreBadge score={src.match_score ?? 0} />
            </td>
          );
        })}
        {/* 平均分 */}
        <td className="px-2 py-2 text-center">
          {row.avg_score > 0 ? (
            <ScoreBadge score={row.avg_score} />
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </td>
        {/* 狀態 */}
        <td className="px-2 py-2 text-center">
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border ${statusCfg.bg} ${statusCfg.color} whitespace-nowrap`}>
            {statusCfg.emoji} <span className="hidden sm:inline">{statusCfg.label}</span>
          </span>
        </td>
      </tr>

      {/* 展開的詳情 */}
      {isExpanded && (
        <tr>
          <td colSpan={expandColSpan} className="p-0">
            <div className="bg-blue-50 border-t border-b border-blue-100 p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ALL_SOURCE_COLUMNS.map((col) => {
                  const src = row.sources[col.key];
                  if (!src) return null;
                  const isSourceExpanded = expandedSource === `${rowKey}-${col.key}`;
                  const conf = row.confirmations?.[col.key];
                  const isLoading = confirmLoading === `${row.date}-${row.key}-${col.key}`;

                  return (
                    <div
                      key={col.key}
                      className={`rounded-lg border p-3 transition-all ${
                        col.key === 'work_log'
                          ? 'bg-blue-50 border-blue-300'
                          : conf
                            ? conf.status === 'confirmed'
                              ? 'bg-green-50 border-green-300'
                              : conf.status === 'rejected'
                                ? 'bg-red-50 border-red-300'
                                : 'bg-purple-50 border-purple-300'
                            : src.status === 'found'
                              ? 'bg-white border-green-200 hover:border-green-400 cursor-pointer'
                              : 'bg-gray-50 border-gray-200'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (col.key !== 'work_log') {
                          onToggleSourceDetail(`${rowKey}-${col.key}`);
                        }
                      }}
                    >
                      {/* 卡片標題 */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-700">
                          {col.icon} {col.label}
                          {col.key === 'work_log' && (
                            <span className="ml-1.5 text-xs text-blue-500 font-normal">基準</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {/* 確認狀態標記 */}
                          {conf && (
                            <span className={`text-xs px-1.5 py-0.5 rounded border ${CONFIRM_STATUS_BADGE[conf.status]?.color}`}>
                              {CONFIRM_STATUS_BADGE[conf.status]?.icon} {CONFIRM_STATUS_BADGE[conf.status]?.label}
                            </span>
                          )}
                          {src.status === 'found' && col.key !== 'work_log' && !conf && (
                            <ScoreBadge score={src.match_score ?? 0} size="sm" />
                          )}
                          {src.status === 'found' ? (
                            <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">
                              {src.details.length} 筆
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">無資料</span>
                          )}
                        </div>
                      </div>

                      {/* 確認者資訊 */}
                      {conf && (
                        <div className="text-xs text-gray-400 mb-1.5">
                          {conf.confirmed_by} · {new Date(conf.confirmed_at).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {conf.notes && <span className="ml-1">({conf.notes})</span>}
                        </div>
                      )}

                      {/* 工作紀錄：直接顯示詳情 */}
                      {col.key === 'work_log' && src.details.length > 0 && (
                        <div className="mt-1 text-xs space-y-0.5 text-gray-700">
                          {src.details.map((detail: any, dIdx: number) => (
                            <div key={dIdx} className={dIdx > 0 ? 'border-t pt-1 mt-1' : ''}>
                              {renderSourceDetail('work_log', detail)}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 展開詳情（點擊後顯示） */}
                      {col.key !== 'work_log' && isSourceExpanded && src.details.length > 0 && (
                        <div className="mt-2 space-y-1.5 text-xs border-t pt-2">
                          {src.details.map((detail: any, dIdx: number) => (
                            <div key={dIdx} className="bg-gray-50 rounded p-2 border">
                              {renderSourceDetail(col.key, detail)}
                            </div>
                          ))}

                          {/* 欄位值對比表 */}
                          {src.field_scores && src.field_scores.length > 0 && (
                            <div className="mt-2 bg-white rounded border p-2">
                              <div className="text-xs font-medium text-gray-600 mb-1.5">欄位值對比</div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-400 text-left">
                                    <th className="py-0.5 pr-2 font-normal">欄位</th>
                                    <th className="py-0.5 pr-2 font-normal">工作紀錄</th>
                                    <th className="py-0.5 pr-2 font-normal">{col.label}</th>
                                    <th className="py-0.5 text-right font-normal">分</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {src.field_scores.map((fs: FieldScore, fsIdx: number) => (
                                    <tr key={fsIdx} className="border-t border-gray-100">
                                      <td className="py-0.5 pr-2 text-gray-500">{fs.field}</td>
                                      <td className="py-0.5 pr-2 font-mono text-gray-700 max-w-[80px] truncate" title={fs.ref_value}>{fs.ref_value || '—'}</td>
                                      <td className="py-0.5 pr-2 font-mono text-gray-700 max-w-[80px] truncate" title={fs.src_value}>{fs.src_value || '—'}</td>
                                      <td className={`py-0.5 text-right font-bold ${
                                        fs.score >= 80 ? 'text-green-600' :
                                        fs.score >= 60 ? 'text-yellow-600' :
                                        fs.score > 0 ? 'text-red-600' : 'text-gray-400'
                                      }`}>
                                        {fs.score}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 提示文字 */}
                      {col.key !== 'work_log' && !isSourceExpanded && src.status === 'found' && src.details.length > 0 && (
                        <div className="text-xs text-gray-400 mt-1.5">
                          點擊展開原始資料
                        </div>
                      )}

                      {/* ✅ ❎ 確認/拒絕按鈕 — 只在非 work_log 且有資料時顯示 */}
                      {col.key !== 'work_log' && src.status === 'found' && (
                        <div className="mt-2 pt-2 border-t flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {!conf ? (
                            <>
                              <button
                                onClick={() => onConfirm(row, col.key, 'confirmed')}
                                disabled={isLoading}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-300 hover:bg-green-200 disabled:opacity-50 transition-all"
                              >
                                ✅ 確認
                              </button>
                              <button
                                onClick={() => onConfirm(row, col.key, 'rejected')}
                                disabled={isLoading}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 disabled:opacity-50 transition-all"
                              >
                                ❎ 拒絕
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => onReset(row, col.key)}
                              disabled={isLoading}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200 disabled:opacity-50 transition-all"
                            >
                              ↩ 重置為未審核
                            </button>
                          )}
                          {isLoading && <span className="text-xs text-gray-400">處理中...</span>}
                        </div>
                      )}

                      {/* 手動配對按鈕 — 只在 missing 且沒有確認記錄時顯示 */}
                      {col.key !== 'work_log' && src.status === 'missing' && !conf && (
                        <div className="mt-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                          <span className="text-xs text-gray-400">
                            系統未自動配對到此來源
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// 來源詳情渲染
// ══════════════════════════════════════════════════════════════

function renderSourceDetail(sourceKey: string, detail: any) {
  switch (sourceKey) {
    case 'work_log':
      return (
        <div className="space-y-0.5">
          {detail.vehicle && (
            <div><span className="text-gray-400">車牌:</span> <span className="font-mono font-medium">{detail.vehicle}</span></div>
          )}
          {detail.employee && (
            <div><span className="text-gray-400">員工:</span> {detail.employee}</div>
          )}
          {detail.customer && (
            <div><span className="text-gray-400">客戶:</span> {detail.customer}</div>
          )}
          {detail.contract && detail.contract !== '—' && (
            <div><span className="text-gray-400">合約:</span> <span className="font-mono">{detail.contract}</span></div>
          )}
          {detail.location && detail.location !== '—' && (
            <div><span className="text-gray-400">路線:</span> {detail.location}</div>
          )}
          {detail.service_type && (
            <div><span className="text-gray-400">類型:</span> {detail.service_type}</div>
          )}
          {detail.receipt_no && detail.receipt_no !== '—' && (
            <div><span className="text-gray-400">入帳票:</span> {detail.receipt_no}</div>
          )}
        </div>
      );

    case 'chit':
      return (
        <div className="space-y-0.5">
          {detail.vehicle && (
            <div><span className="text-gray-400">車牌:</span> <span className="font-mono">{detail.vehicle}</span></div>
          )}
          {detail.employee && (
            <div><span className="text-gray-400">員工:</span> {detail.employee}</div>
          )}
          {detail.customer && (
            <div><span className="text-gray-400">客戶:</span> {detail.customer}</div>
          )}
          {detail.location && (
            <div><span className="text-gray-400">地點:</span> {detail.location}</div>
          )}
          {detail.contract && detail.contract !== '—' && (
            <div><span className="text-gray-400">合約:</span> <span className="font-mono">{detail.contract}</span></div>
          )}
          {detail.chit_nos?.length > 0 && (
            <div><span className="text-gray-400">入帳票號:</span> {detail.chit_nos.join(', ')}</div>
          )}
          {detail.weight && (
            <div><span className="text-gray-400">重量:</span> {detail.weight}</div>
          )}
        </div>
      );

    case 'delivery_note':
      return (
        <div className="space-y-0.5">
          {detail.vehicle && (
            <div><span className="text-gray-400">車牌:</span> <span className="font-mono">{detail.vehicle}</span></div>
          )}
          {detail.slip_no && (
            <div><span className="text-gray-400">飛仔號:</span> {detail.slip_no}</div>
          )}
          {detail.employee && (
            <div><span className="text-gray-400">司機:</span> {detail.employee}</div>
          )}
          {detail.customer && (
            <div><span className="text-gray-400">客戶:</span> {detail.customer}</div>
          )}
          {detail.location && (
            <div><span className="text-gray-400">路線:</span> {detail.location}</div>
          )}
          {detail.chit_nos?.length > 0 && (
            <div><span className="text-gray-400">入帳票號:</span> {detail.chit_nos.join(', ')}</div>
          )}
        </div>
      );

    case 'gps':
      return (
        <div className="space-y-0.5">
          {detail.vehicle && (
            <div><span className="text-gray-400">車牌:</span> <span className="font-mono">{detail.vehicle}</span></div>
          )}
          {detail.distance && (
            <div><span className="text-gray-400">總里程:</span> {detail.distance} km</div>
          )}
          {detail.trip_count && (
            <div><span className="text-gray-400">行程數:</span> {detail.trip_count}</div>
          )}
          {detail.locations && (
            <div><span className="text-gray-400">地點:</span> {detail.locations}</div>
          )}
          {detail.start_time && (
            <div><span className="text-gray-400">開始:</span> {detail.start_time}</div>
          )}
          {detail.end_time && (
            <div><span className="text-gray-400">結束:</span> {detail.end_time}</div>
          )}
        </div>
      );

    case 'attendance':
      return (
        <div className="space-y-0.5">
          {detail.employee && (
            <div><span className="text-gray-400">員工:</span> {detail.employee}</div>
          )}
          <div>
            <span className="text-gray-400">類型:</span>{' '}
            {detail.type === 'clock_in' ? '上班打卡' : '下班打卡'}
          </div>
          {detail.timestamp && (
            <div>
              <span className="text-gray-400">時間:</span>{' '}
              {new Date(detail.timestamp).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          {detail.address && (
            <div><span className="text-gray-400">地址:</span> {detail.address}</div>
          )}
        </div>
      );

    case 'whatsapp_order':
      return (
        <div className="space-y-0.5">
          {detail.vehicle && detail.vehicle !== '—' && (
            <div><span className="text-gray-400">車牌:</span> <span className="font-mono">{detail.vehicle}</span></div>
          )}
          {(detail.employee || detail.driver) && (
            <div><span className="text-gray-400">司機:</span> {detail.employee || detail.driver}</div>
          )}
          {detail.customer && (
            <div><span className="text-gray-400">客戶:</span> {detail.customer}</div>
          )}
          {detail.contract && detail.contract !== '—' && (
            <div><span className="text-gray-400">合約:</span> <span className="font-mono">{detail.contract}</span></div>
          )}
          {detail.location && detail.location !== '—' && (
            <div><span className="text-gray-400">地點:</span> {detail.location}</div>
          )}
          {detail.product_name && (
            <div><span className="text-gray-400">商品:</span> <span className="text-blue-600 font-medium">{detail.product_name}</span></div>
          )}
          {(detail.goods_quantity || detail.product_unit) && (
            <div><span className="text-gray-400">數量:</span> {detail.goods_quantity} {detail.product_unit}</div>
          )}
          {detail.is_suspended && (
            <div className="text-red-600 font-medium">暫停</div>
          )}
          {detail.order_version && (
            <div>
              <span className="text-gray-400">版本:</span> v{detail.order_version}{' '}
              ({detail.order_status === 'confirmed' ? '已確定' : '暫定'})
            </div>
          )}
        </div>
      );

    default:
      return <pre className="text-xs overflow-auto">{JSON.stringify(detail, null, 2)}</pre>;
  }
}
