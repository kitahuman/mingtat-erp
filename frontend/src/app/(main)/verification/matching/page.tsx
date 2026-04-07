'use client';
import { useState, useCallback } from 'react';
import { verificationApi } from '@/lib/api';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

interface SourceData {
  source: string;
  status: 'found' | 'missing';
  details: any[];
}

interface MatchingRow {
  key: string;
  date: string;
  sources: Record<string, SourceData>;
  match_status: 'full_match' | 'partial_match' | 'conflict' | 'missing_source';
  match_count: number;
  total_sources: number;
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
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">比對狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((row, idx) => {
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
                          return (
                            <td key={col.key} className="px-3 py-2 text-center">
                              {src.status === 'found' ? (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-600 text-sm" title={`${src.details.length} 筆`}>
                                  ✓
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-400 text-sm" title="無資料">
                                  ✗
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusCfg.bg} ${statusCfg.color}`}>
                            {statusCfg.emoji} {statusCfg.label}
                          </span>
                        </td>
                      </tr>

                      {/* 展開的詳情 */}
                      {isExpanded && (
                        <tr key={`${rowKey}-detail`}>
                          <td colSpan={SOURCE_COLUMNS.length + 4} className="p-0">
                            <div className="bg-blue-50 border-t border-b border-blue-100 p-4">
                              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                {SOURCE_COLUMNS.map((col) => {
                                  const src = row.sources[col.key];
                                  if (!src) return null;
                                  const isSourceExpanded = expandedSource === `${rowKey}-${col.key}`;

                                  return (
                                    <div
                                      key={col.key}
                                      className={`rounded-lg border p-3 cursor-pointer transition-all ${
                                        src.status === 'found'
                                          ? 'bg-white border-green-200 hover:border-green-400'
                                          : 'bg-gray-50 border-gray-200'
                                      }`}
                                      onClick={(e) => { e.stopPropagation(); toggleSourceDetail(`${rowKey}-${col.key}`); }}
                                    >
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-gray-700">
                                          {col.icon} {col.label}
                                        </span>
                                        {src.status === 'found' ? (
                                          <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                            {src.details.length} 筆
                                          </span>
                                        ) : (
                                          <span className="text-xs text-gray-400">無資料</span>
                                        )}
                                      </div>

                                      {/* 來源詳情 */}
                                      {isSourceExpanded && src.details.length > 0 && (
                                        <div className="mt-2 space-y-1.5 text-xs">
                                          {src.details.map((detail: any, dIdx: number) => (
                                            <div key={dIdx} className="bg-gray-50 rounded p-2 border">
                                              {renderSourceDetail(col.key, detail)}
                                            </div>
                                          ))}
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
          {detail.customer && <div><span className="text-gray-400">客戶:</span> {detail.customer}</div>}
          {detail.driver && <div><span className="text-gray-400">司機:</span> {detail.driver}</div>}
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
          <div><span className="text-gray-400">司機:</span> {detail.driver}</div>
          <div><span className="text-gray-400">客戶:</span> {detail.customer}</div>
          <div><span className="text-gray-400">合約:</span> {detail.contract}</div>
          {detail.is_suspended && (
            <div className="text-red-600 font-medium">暫停</div>
          )}
          <div><span className="text-gray-400">版本:</span> v{detail.order_version} ({detail.order_status === 'confirmed' ? '已確定' : '暫定'})</div>
        </div>
      );

    default:
      return <pre className="text-xs">{JSON.stringify(detail, null, 2)}</pre>;
  }
}
