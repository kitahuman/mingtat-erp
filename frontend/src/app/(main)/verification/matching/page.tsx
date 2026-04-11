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

interface MatchingRow {
  key: string;
  date: string;
  sources: Record<string, SourceData>;
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
  { key: 'work_log', label: '工作紀錄', icon: '📋', alwaysOn: true },
  { key: 'chit', label: '入帳票', icon: '🧾', alwaysOn: false },
  { key: 'delivery_note', label: '飛仔 OCR', icon: '📄', alwaysOn: false },
  { key: 'gps', label: 'GPS', icon: '📍', alwaysOn: false },
  { key: 'attendance', label: '打卡', icon: '⏰', alwaysOn: false },
  { key: 'whatsapp_order', label: 'WhatsApp', icon: '💬', alwaysOn: false },
];

const STATUS_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  full_match: { label: '全部吻合', emoji: '✅', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  partial_match: { label: '部分吻合', emoji: '⚠️', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  conflict: { label: '有衝突', emoji: '❌', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  missing_source: { label: '缺少來源', emoji: '❓', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
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

function getBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
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

function FieldScoreBar({ fieldScore }: { fieldScore: FieldScore }) {
  const barColor = getBarColor(fieldScore.score);
  const weightPct = Math.round(fieldScore.weight * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-20 shrink-0 text-gray-500 truncate" title={fieldScore.field}>
        {fieldScore.field}
      </div>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${fieldScore.score}%` }}
        />
      </div>
      <div className="w-8 text-right font-mono text-gray-600">{fieldScore.score}</div>
      <div className="w-10 text-right text-gray-400">({weightPct}%)</div>
    </div>
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
  const [data, setData] = useState<MatchingRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  // 顯示來源篩選器：預設全部開啟（work_log 強制開啟）
  const [visibleSources, setVisibleSources] = useState<Set<string>>(
    new Set(ALL_SOURCE_COLUMNS.map((c) => c.key))
  );

  const toggleSource = (key: string) => {
    // work_log 不可關閉
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

  // 目前顯示的欄位（按原始順序）
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
  }, [dateFrom, dateTo, groupBy, search]);

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

  // 展開詳情的 colSpan = 固定欄(7: ▶+日期+車牌+司機+客戶+合約+地點) + 可見來源欄 + 平均分(1) + 狀態(1)
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
            {/* 全選/全取消 */}
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
        <div className="text-center py-16 text-gray-400">載入中...</div>
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
                    <>
                      <tr
                        key={rowKey}
                        className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? 'bg-blue-50' : ''}`}
                        onClick={() => toggleExpand(rowKey)}
                      >
                        <td className="px-2 py-2 text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</td>
                        <td className="px-2 py-2 text-gray-700 whitespace-nowrap text-xs">{row.date}</td>
                        <td className="px-2 py-2 font-medium text-gray-800 whitespace-nowrap font-mono">{row.key}</td>
                        {/* 工作紀錄主要欄位：直接從 work_log 第一筆 detail 取值 */}
                        {(() => {
                          const wl = row.sources['work_log'];
                          const d = wl?.details?.[0];
                          return (
                            <>
                              <td className="px-2 py-2 text-gray-700 whitespace-nowrap text-xs">{d?.employee || '—'}</td>
                              <td className="px-2 py-2 text-gray-700 text-xs max-w-[120px] truncate" title={d?.customer}>{d?.customer || '—'}</td>
                              <td className="px-2 py-2 text-gray-700 whitespace-nowrap text-xs font-mono">{d?.contract && d.contract !== '—' ? d.contract : '—'}</td>
                              <td className="px-2 py-2 text-gray-700 text-xs max-w-[120px] truncate" title={d?.location}>{d?.location && d.location !== '—' ? d.location : '—'}</td>
                            </>
                          );
                        })()}
                        {visibleColumns.map((col) => {
                          const src = row.sources[col.key];
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
                        <tr key={`${rowKey}-detail`}>
                          <td colSpan={expandColSpan} className="p-0">
                            <div className="bg-blue-50 border-t border-b border-blue-100 p-3 sm:p-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {ALL_SOURCE_COLUMNS.map((col) => {
                                  const src = row.sources[col.key];
                                  if (!src) return null;
                                  const isSourceExpanded = expandedSource === `${rowKey}-${col.key}`;

                                  return (
                                    <div
                                      key={col.key}
                                      className={`rounded-lg border p-3 cursor-pointer transition-all ${
                                        col.key === 'work_log'
                                          ? 'bg-blue-50 border-blue-300 hover:border-blue-500'
                                          : src.status === 'found'
                                            ? 'bg-white border-green-200 hover:border-green-400'
                                            : 'bg-gray-50 border-gray-200'
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSourceDetail(`${rowKey}-${col.key}`);
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
                                          {src.status === 'found' && col.key !== 'work_log' && (
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

                                      {/* 工作紀錄：直接顯示第一筆詳情（不需點擊展開） */}
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
