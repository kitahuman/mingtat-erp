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

const SOURCE_COLUMNS = [
  { key: 'work_log', label: '工作紀錄', icon: '📋' },
  { key: 'chit', label: '入帳票', icon: '🧾' },
  { key: 'delivery_note', label: '飛仔 OCR', icon: '📄' },
  { key: 'gps', label: 'GPS', icon: '📍' },
  { key: 'attendance', label: '打卡', icon: '⏰' },
  { key: 'whatsapp_order', label: 'WhatsApp', icon: '💬' },
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

/** 根據分數返回顏色等級 */
function getScoreColor(score: number): { text: string; bg: string; ring: string } {
  if (score >= 80) return { text: 'text-green-700', bg: 'bg-green-100', ring: 'ring-green-300' };
  if (score >= 60) return { text: 'text-yellow-700', bg: 'bg-yellow-100', ring: 'ring-yellow-300' };
  return { text: 'text-red-700', bg: 'bg-red-100', ring: 'ring-red-300' };
}

/** 根據分數返回進度條顏色 */
function getBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ══════════════════════════════════════════════════════════════
// 分數徽章元件
// ══════════════════════════════════════════════════════════════

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const colors = getScoreColor(score);
  const sizeClass = size === 'sm'
    ? 'w-8 h-8 text-xs'
    : 'w-9 h-9 text-sm';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold ring-1 ${sizeClass} ${colors.text} ${colors.bg} ${colors.ring}`}
      title={`匹配分數: ${score}%`}
    >
      {score}
    </span>
  );
}

/** 欄位分數進度條 */
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

  return (
    <div className="p-6 max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">六來源交叉比對</h1>
        <p className="text-sm text-gray-500 mt-1">
          以工作紀錄為主軸，比對入帳票、飛仔 OCR、GPS、打卡、WhatsApp Order 六個數據來源
        </p>
      </div>

      {/* 篩選區 */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
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
              className="border rounded px-3 py-1.5 text-sm w-48"
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
      </div>

      {/* 評分說明 */}
      <div className="bg-white rounded-lg shadow-sm border p-3 mb-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="font-medium text-gray-700">評分等級:</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-green-500" /> 80%+ 高度吻合
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-yellow-500" /> 60-79% 部分吻合
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500" /> 60% 以下 低吻合
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-gray-300" /> 無資料
          </span>
          <span className="ml-auto text-gray-400">
            權重: 員工 30% | 客戶 25% | 合約 25% | 地點 20%
          </span>
        </div>
      </div>

      {/* 統計摘要 */}
      {summary && (
        <div className="grid grid-cols-5 gap-3 mb-4">
          <div className="bg-white rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-gray-800">{summary.total}</div>
            <div className="text-xs text-gray-500">總筆數</div>
          </div>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <div key={key} className={`rounded-lg border p-3 text-center ${config.bg}`}>
              <div className={`text-2xl font-bold ${config.color}`}>
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
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-10"></th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">日期</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">
                    {groupBy === 'vehicle' ? '車牌' : '員工'}
                  </th>
                  {SOURCE_COLUMNS.map((col) => (
                    <th key={col.key} className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                      <div>{col.icon}</div>
                      <div>{col.label}</div>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">平均分</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">比對狀態</th>
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
                        <td className="px-3 py-2 text-gray-400">{isExpanded ? '▼' : '▶'}</td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{row.key}</td>
                        {SOURCE_COLUMNS.map((col) => {
                          const src = row.sources[col.key];
                          if (!src) {
                            return (
                              <td key={col.key} className="px-3 py-2 text-center">
                                <span className="text-gray-300">—</span>
                              </td>
                            );
                          }

                          // 工作紀錄固定顯示 ✓
                          if (col.key === 'work_log') {
                            return (
                              <td key={col.key} className="px-3 py-2 text-center">
                                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-100 text-blue-600 text-sm font-bold ring-1 ring-blue-300" title="主軸">
                                  REF
                                </span>
                              </td>
                            );
                          }

                          // missing 顯示灰色
                          if (src.status === 'missing') {
                            return (
                              <td key={col.key} className="px-3 py-2 text-center">
                                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-400 text-xs ring-1 ring-gray-200" title="無資料">
                                  N/A
                                </span>
                              </td>
                            );
                          }

                          // found 顯示分數
                          return (
                            <td key={col.key} className="px-3 py-2 text-center">
                              <ScoreBadge score={src.match_score ?? 0} />
                            </td>
                          );
                        })}
                        {/* 平均分 */}
                        <td className="px-3 py-2 text-center">
                          {row.avg_score > 0 ? (
                            <ScoreBadge score={row.avg_score} />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusCfg.bg} ${statusCfg.color}`}>
                            {statusCfg.emoji} {statusCfg.label}
                          </span>
                        </td>
                      </tr>

                      {/* 展開的詳情 */}
                      {isExpanded && (
                        <tr key={`${rowKey}-detail`}>
                          <td colSpan={SOURCE_COLUMNS.length + 5} className="p-0">
                            <div className="bg-blue-50 border-t border-b border-blue-100 p-4">
                              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                {SOURCE_COLUMNS.map((col) => {
                                  const src = row.sources[col.key];
                                  if (!src) return null;
                                  const isSourceExpanded = expandedSource === `${rowKey}-${col.key}`;
                                  const scoreColors = src.status === 'found' && col.key !== 'work_log'
                                    ? getScoreColor(src.match_score ?? 0)
                                    : null;

                                  return (
                                    <div
                                      key={col.key}
                                      className={`rounded-lg border p-3 cursor-pointer transition-all ${
                                        col.key === 'work_log'
                                          ? 'bg-blue-50 border-blue-200 hover:border-blue-400'
                                          : src.status === 'found'
                                            ? 'bg-white border-green-200 hover:border-green-400'
                                            : 'bg-gray-50 border-gray-200'
                                      }`}
                                      onClick={(e) => { e.stopPropagation(); toggleSourceDetail(`${rowKey}-${col.key}`); }}
                                    >
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-gray-700">
                                          {col.icon} {col.label}
                                        </span>
                                        <div className="flex items-center gap-2">
                                          {src.status === 'found' && col.key !== 'work_log' && (
                                            <ScoreBadge score={src.match_score ?? 0} size="sm" />
                                          )}
                                          {src.status === 'found' ? (
                                            <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                              {src.details.length} 筆
                                            </span>
                                          ) : (
                                            <span className="text-xs text-gray-400">無資料</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* 欄位分數明細 */}
                                      {src.status === 'found' && col.key !== 'work_log' && src.field_scores && src.field_scores.length > 0 && (
                                        <div className="mt-2 space-y-1 border-t pt-2">
                                          {src.field_scores.map((fs: FieldScore, fsIdx: number) => (
                                            <FieldScoreBar key={fsIdx} fieldScore={fs} />
                                          ))}
                                        </div>
                                      )}

                                      {/* 來源詳情 */}
                                      {isSourceExpanded && src.details.length > 0 && (
                                        <div className="mt-2 space-y-1.5 text-xs border-t pt-2">
                                          {src.details.map((detail: any, dIdx: number) => (
                                            <div key={dIdx} className="bg-gray-50 rounded p-2 border">
                                              {renderSourceDetail(col.key, detail)}
                                            </div>
                                          ))}

                                          {/* 欄位值對比表 */}
                                          {col.key !== 'work_log' && src.field_scores && src.field_scores.length > 0 && (
                                            <div className="mt-2 bg-white rounded border p-2">
                                              <div className="text-xs font-medium text-gray-600 mb-1">欄位值對比</div>
                                              <table className="w-full text-xs">
                                                <thead>
                                                  <tr className="text-gray-400">
                                                    <th className="text-left py-0.5 pr-2">欄位</th>
                                                    <th className="text-left py-0.5 pr-2">工作紀錄</th>
                                                    <th className="text-left py-0.5 pr-2">{src.source}</th>
                                                    <th className="text-right py-0.5">分數</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {src.field_scores.map((fs: FieldScore, fsIdx: number) => (
                                                    <tr key={fsIdx} className="border-t border-gray-100">
                                                      <td className="py-0.5 pr-2 text-gray-500">{fs.field}</td>
                                                      <td className="py-0.5 pr-2 font-mono">{fs.ref_value || '—'}</td>
                                                      <td className="py-0.5 pr-2 font-mono">{fs.src_value || '—'}</td>
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

                                      {!isSourceExpanded && src.status === 'found' && src.details.length > 0 && (
                                        <div className="text-xs text-gray-400 mt-1">
                                          點擊展開詳情
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
        <div className="flex items-center justify-center gap-2 mt-6">
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
          <div><span className="text-gray-400">車牌:</span> <span className="font-mono">{detail.vehicle}</span></div>
          <div><span className="text-gray-400">員工:</span> {detail.employee}</div>
          <div><span className="text-gray-400">客戶:</span> {detail.customer}</div>
          <div><span className="text-gray-400">合約:</span> {detail.contract}</div>
          <div><span className="text-gray-400">路線:</span> {detail.location}</div>
          <div><span className="text-gray-400">類型:</span> {detail.service_type}</div>
          {detail.receipt_no && detail.receipt_no !== '—' && (
            <div><span className="text-gray-400">入帳票:</span> {detail.receipt_no}</div>
          )}
        </div>
      );

    case 'chit':
      return (
        <div className="space-y-0.5">
          <div><span className="text-gray-400">車牌:</span> <span className="font-mono">{detail.vehicle}</span></div>
          <div><span className="text-gray-400">員工:</span> {detail.employee || '—'}</div>
          <div><span className="text-gray-400">客戶:</span> {detail.customer || '—'}</div>
          <div><span className="text-gray-400">地點:</span> {detail.location}</div>
          <div><span className="text-gray-400">合約:</span> {detail.contract}</div>
          {detail.chit_nos?.length > 0 && (
            <div><span className="text-gray-400">入帳票號:</span> {detail.chit_nos.join(', ')}</div>
          )}
          {detail.weight && <div><span className="text-gray-400">重量:</span> {detail.weight}</div>}
        </div>
      );

    case 'delivery_note':
      return (
        <div className="space-y-0.5">
          <div><span className="text-gray-400">車牌:</span> <span className="font-mono">{detail.vehicle}</span></div>
          <div><span className="text-gray-400">飛仔號:</span> {detail.slip_no}</div>
          {detail.employee && <div><span className="text-gray-400">司機:</span> {detail.employee}</div>}
          {detail.customer && <div><span className="text-gray-400">客戶:</span> {detail.customer}</div>}
          {detail.location && <div><span className="text-gray-400">路線:</span> {detail.location}</div>}
          {detail.chit_nos?.length > 0 && (
            <div><span className="text-gray-400">入帳票號:</span> {detail.chit_nos.join(', ')}</div>
          )}
        </div>
      );

    case 'gps':
      return (
        <div className="space-y-0.5">
          <div><span className="text-gray-400">車牌:</span> <span className="font-mono">{detail.vehicle}</span></div>
          {detail.distance && <div><span className="text-gray-400">總里程:</span> {detail.distance} km</div>}
          {detail.trip_count && <div><span className="text-gray-400">行程數:</span> {detail.trip_count}</div>}
          {detail.locations && <div><span className="text-gray-400">地點:</span> {detail.locations}</div>}
          {detail.start_time && <div><span className="text-gray-400">開始:</span> {detail.start_time}</div>}
          {detail.end_time && <div><span className="text-gray-400">結束:</span> {detail.end_time}</div>}
        </div>
      );

    case 'attendance':
      return (
        <div className="space-y-0.5">
          {detail.employee && <div><span className="text-gray-400">員工:</span> {detail.employee}</div>}
          <div><span className="text-gray-400">類型:</span> {detail.type === 'clock_in' ? '上班打卡' : '下班打卡'}</div>
          {detail.timestamp && (
            <div>
              <span className="text-gray-400">時間:</span>{' '}
              {new Date(detail.timestamp).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div><span className="text-gray-400">地址:</span> {detail.address}</div>
        </div>
      );

    case 'whatsapp_order':
      return (
        <div className="space-y-0.5">
          {detail.vehicle && detail.vehicle !== '—' && (
            <div><span className="text-gray-400">車牌:</span> <span className="font-mono">{detail.vehicle}</span></div>
          )}
          <div><span className="text-gray-400">司機:</span> {detail.employee || detail.driver || '—'}</div>
          <div><span className="text-gray-400">客戶:</span> {detail.customer}</div>
          <div><span className="text-gray-400">合約:</span> {detail.contract}</div>
          {detail.location && detail.location !== '—' && (
            <div><span className="text-gray-400">地點:</span> {detail.location}</div>
          )}
          {detail.is_suspended && (
            <div className="text-red-600 font-medium">暫停</div>
          )}
          {detail.order_version && (
            <div><span className="text-gray-400">版本:</span> v{detail.order_version} ({detail.order_status === 'confirmed' ? '已確定' : '暫定'})</div>
          )}
        </div>
      );

    default:
      return <pre className="text-xs">{JSON.stringify(detail, null, 2)}</pre>;
  }
}
