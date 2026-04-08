'use client';

import { useState, useEffect, useCallback } from 'react';
import { verificationApi } from '@/lib/api';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

interface ModLog {
  id: number;
  mod_type: string;
  mod_description: string;
  mod_prev_value: any;
  mod_new_value: any;
  mod_ai_confidence: number | null;
  mod_created_at: string;
  message: {
    wa_msg_body: string | null;
    wa_msg_sender_name: string | null;
    wa_msg_timestamp: string | null;
  } | null;
}

interface SummaryItem {
  id: number;
  seq: number;
  contract_no: string | null;
  customer: string | null;
  work_description: string | null;
  location: string | null;
  driver_nickname: string | null;
  vehicle_no: string | null;
  machine_code: string | null;
  contact_person: string | null;
  slip_write_as: string | null;
  is_suspended: boolean;
  remarks: string | null;
  mod_status: string | null;
  mod_prev_data: any | null;
  mod_logs: ModLog[];
  source_order_id: number;
  source_order_version: number;
}

interface VersionInfo {
  version: number;
  status: string;
  sender: string | null;
  item_count: number;
  ai_confidence: number | null;
  created_at: string;
}

interface MessageInfo {
  id: number;
  sender: string | null;
  body: string | null;
  classification: string | null;
  confidence: number | null;
  timestamp: string | null;
}

interface OrderModLog {
  id: number;
  mod_type: string;
  mod_description: string;
  mod_created_at: string;
  message: {
    wa_msg_body: string | null;
    wa_msg_sender_name: string | null;
    wa_msg_timestamp: string | null;
  } | null;
}

interface DailySummary {
  date: string;
  latest_status: string;
  total_items: number;
  active_items: number;
  cancelled_items: number;
  suspended_items: number;
  reassigned_items: number;
  added_items: number;
  versions: VersionInfo[];
  items: SummaryItem[];
  messages: MessageInfo[];
  order_mod_logs: OrderModLog[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// ══════════════════════════════════════════════════════════════
// 工具函數
// ══════════════════════════════════════════════════════════════

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} (星期${weekdays[d.getDay()]})`;
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ══════════════════════════════════════════════════════════════
// 修改狀態標籤元件
// ══════════════════════════════════════════════════════════════

function ModStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  switch (status) {
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 font-medium">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          已取消
        </span>
      );
    case 'reassigned':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 font-medium">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          已換人
        </span>
      );
    case 'suspended':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 font-medium">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          已暫停
        </span>
      );
    case 'added':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新增
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 font-medium">
          已修改
        </span>
      );
  }
}

function ModTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    cancel: { label: '取消', color: 'bg-red-500' },
    reassign: { label: '換人', color: 'bg-orange-500' },
    suspend: { label: '暫停', color: 'bg-yellow-500' },
    resume: { label: '恢復', color: 'bg-green-500' },
    add: { label: '新增', color: 'bg-blue-500' },
    other: { label: '其他', color: 'bg-gray-500' },
  };
  const c = config[type] || config.other;
  return (
    <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] rounded text-white font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}

function ClassificationBadge({ classification }: { classification: string | null }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    order: { label: 'Order', bg: 'bg-blue-100', text: 'text-blue-700' },
    modification: { label: '修改', bg: 'bg-orange-100', text: 'text-orange-700' },
    chat: { label: '對話', bg: 'bg-gray-100', text: 'text-gray-600' },
    error: { label: '錯誤', bg: 'bg-red-100', text: 'text-red-600' },
  };
  const c = config[classification || ''] || { label: classification || '—', bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// 主頁面組件
// ══════════════════════════════════════════════════════════════

export default function WhatsAppDailySummaryPage() {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [expandedItemLogs, setExpandedItemLogs] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await verificationApi.getWhatsappDailySummaries({
        page,
        limit: 20,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        search: search || undefined,
      });
      setSummaries(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Failed to fetch daily summaries:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleMessages = (date: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleItemLog = (itemId: number) => {
    setExpandedItemLogs((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // ── 項目行樣式 ────────────────────────────────────────────
  const getItemRowClass = (item: SummaryItem) => {
    switch (item.mod_status) {
      case 'cancelled':
        return 'bg-red-50';
      case 'reassigned':
        return 'bg-orange-50';
      case 'suspended':
        return 'bg-yellow-50';
      case 'added':
        return 'bg-green-50';
      default:
        if (item.is_suspended) return 'bg-yellow-50';
        return '';
    }
  };

  // ── 換人前後對比 ──────────────────────────────────────────
  const renderReassignInfo = (item: SummaryItem) => {
    if (item.mod_status !== 'reassigned' || !item.mod_prev_data) return null;
    const prev = item.mod_prev_data;
    const changes: JSX.Element[] = [];

    if (prev.wa_item_driver_nickname && prev.wa_item_driver_nickname !== item.driver_nickname) {
      changes.push(
        <span key="driver" className="inline-flex items-center gap-1 text-xs">
          <span className="text-gray-400 line-through">{prev.wa_item_driver_nickname}</span>
          <svg className="w-3 h-3 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="font-medium text-orange-700">{item.driver_nickname}</span>
        </span>
      );
    }
    if (prev.wa_item_vehicle_no && prev.wa_item_vehicle_no !== item.vehicle_no) {
      changes.push(
        <span key="vehicle" className="inline-flex items-center gap-1 text-xs">
          <span className="text-gray-400 line-through font-mono">{prev.wa_item_vehicle_no}</span>
          <svg className="w-3 h-3 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="font-medium text-orange-700 font-mono">{item.vehicle_no}</span>
        </span>
      );
    }

    if (changes.length === 0) return null;
    return <div className="flex flex-col gap-0.5 mt-1">{changes}</div>;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── 標題 ────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">每日 Order 總結</h1>
        <p className="text-sm text-gray-500 mt-1">
          合併同一天所有 WhatsApp order 和修改指令，顯示最終版本。用於六來源交叉比對的基礎數據。
        </p>
      </div>

      {/* ── 搜尋列 ──────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">開始日期</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">結束日期</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-40"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">搜尋</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="車牌、司機、客戶、合約號..."
              className="border rounded px-3 py-1.5 text-sm w-full"
            />
          </div>
          <button
            onClick={() => fetchData(1)}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition"
          >
            搜尋
          </button>
        </div>
      </div>

      {/* ── 載入中 ──────────────────────────────────────────── */}
      {loading && (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2" />
          <p>載入中...</p>
        </div>
      )}

      {/* ── 無資料 ──────────────────────────────────────────── */}
      {!loading && summaries.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-1">尚無 WhatsApp Order 記錄</p>
          <p className="text-sm">當 WhatsApp bot 收到工作分配訊息後，會自動在此顯示每日總結。</p>
        </div>
      )}

      {/* ── 每日總結卡片列表 ────────────────────────────────── */}
      {!loading && summaries.map((summary) => {
        const isExpanded = expandedDates.has(summary.date);
        const showMessages = expandedMessages.has(summary.date);
        const latestVersion = summary.versions[summary.versions.length - 1];
        const hasModifications = summary.cancelled_items + summary.suspended_items + summary.reassigned_items + summary.added_items > 0;

        return (
          <div key={summary.date} className="bg-white rounded-lg shadow-sm border mb-4 overflow-hidden">
            {/* ── 日期標題列 ──────────────────────────────── */}
            <div
              className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50 transition"
              onClick={() => toggleDate(summary.date)}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-gray-900">
                  {formatDate(summary.date)}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  summary.latest_status === 'confirmed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {summary.latest_status === 'confirmed' ? '已確定' : '暫定'}
                </span>
                <span className="text-sm text-gray-500">
                  v{latestVersion?.version || 1}
                  {summary.versions.length > 1 && ` (共 ${summary.versions.length} 個版本)`}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">
                  {summary.active_items} 項有效
                  {summary.total_items !== summary.active_items && (
                    <span className="text-gray-400"> / {summary.total_items} 總計</span>
                  )}
                </span>
                {summary.cancelled_items > 0 && (
                  <span className="text-red-500">{summary.cancelled_items} 取消</span>
                )}
                {summary.suspended_items > 0 && (
                  <span className="text-yellow-600">{summary.suspended_items} 暫停</span>
                )}
                {summary.reassigned_items > 0 && (
                  <span className="text-orange-500">{summary.reassigned_items} 換人</span>
                )}
                {summary.added_items > 0 && (
                  <span className="text-green-600">{summary.added_items} 新增</span>
                )}

                <span className={`transition-transform text-gray-400 ${isExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>
            </div>

            {/* ── 展開的總結內容 ──────────────────────────── */}
            {isExpanded && (
              <div className="border-t">
                {/* ── 工作項目表格 ────────────────────────── */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-xs">
                        <th className="px-3 py-2 text-left font-medium w-8">#</th>
                        <th className="px-3 py-2 text-left font-medium w-24">狀態</th>
                        <th className="px-3 py-2 text-left font-medium">客戶/合約</th>
                        <th className="px-3 py-2 text-left font-medium">工作描述</th>
                        <th className="px-3 py-2 text-left font-medium">地點/路線</th>
                        <th className="px-3 py-2 text-left font-medium">司機</th>
                        <th className="px-3 py-2 text-left font-medium">車牌</th>
                        <th className="px-3 py-2 text-left font-medium">機械</th>
                        <th className="px-3 py-2 text-left font-medium">飛仔寫</th>
                        <th className="px-3 py-2 text-left font-medium w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.items.map((item) => {
                        const isItemExpanded = expandedItemLogs.has(item.id);
                        const hasLogs = item.mod_logs.length > 0;
                        const isCancelled = item.mod_status === 'cancelled';

                        return (
                          <tr key={item.id} className="contents">
                            {/* Main row */}
                            <td colSpan={10} className="p-0">
                              <div
                                className={`flex items-start border-t ${getItemRowClass(item)} ${hasLogs ? 'cursor-pointer' : ''} hover:bg-gray-50/50 transition`}
                                onClick={() => hasLogs && toggleItemLog(item.id)}
                              >
                                <div className={`px-3 py-2 w-8 text-gray-400 flex-shrink-0 ${isCancelled ? 'line-through' : ''}`}>
                                  {item.seq}
                                </div>
                                <div className="px-3 py-2 w-24 flex-shrink-0">
                                  <ModStatusBadge status={item.mod_status} />
                                  {!item.mod_status && item.is_suspended && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 font-medium">
                                      ⏸ 暫停
                                    </span>
                                  )}
                                  {!item.mod_status && !item.is_suspended && (
                                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-50 text-gray-400 font-medium">
                                      正常
                                    </span>
                                  )}
                                  {renderReassignInfo(item)}
                                </div>
                                <div className={`px-3 py-2 flex-1 min-w-0 ${isCancelled ? 'line-through text-red-300' : ''}`}>
                                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                                    <div className="min-w-[120px]">
                                      <div className="text-xs text-gray-400">客戶/合約</div>
                                      <div>{item.customer || '—'}</div>
                                      {item.contract_no && <div className="text-xs text-gray-400">{item.contract_no}</div>}
                                    </div>
                                    <div className="min-w-[120px] max-w-[200px]">
                                      <div className="text-xs text-gray-400">工作描述</div>
                                      <div className="truncate" title={item.work_description || ''}>{item.work_description || '—'}</div>
                                    </div>
                                    <div className="min-w-[100px] max-w-[150px]">
                                      <div className="text-xs text-gray-400">地點/路線</div>
                                      <div className="truncate" title={item.location || ''}>{item.location || '—'}</div>
                                    </div>
                                    <div className="min-w-[60px]">
                                      <div className="text-xs text-gray-400">司機</div>
                                      <div className="font-medium">{item.driver_nickname || '—'}</div>
                                    </div>
                                    <div className="min-w-[60px]">
                                      <div className="text-xs text-gray-400">車牌</div>
                                      <div className="font-mono text-xs">{item.vehicle_no || '—'}</div>
                                    </div>
                                    {item.machine_code && (
                                      <div className="min-w-[50px]">
                                        <div className="text-xs text-gray-400">機械</div>
                                        <div className="font-mono text-xs">{item.machine_code}</div>
                                      </div>
                                    )}
                                    {item.slip_write_as && (
                                      <div className="min-w-[80px]">
                                        <div className="text-xs text-gray-400">飛仔寫</div>
                                        <div className="text-xs">{item.slip_write_as}</div>
                                      </div>
                                    )}
                                    {item.remarks && (
                                      <div className="min-w-[80px]">
                                        <div className="text-xs text-gray-400">備註</div>
                                        <div className="text-xs text-gray-500">{item.remarks}</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="px-3 py-2 w-8 flex-shrink-0 text-gray-400">
                                  {hasLogs && (
                                    <span className={`text-xs transition-transform inline-block ${isItemExpanded ? 'rotate-90' : ''}`}>
                                      ▶
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* ── 項目修改歷史（展開） ──── */}
                              {isItemExpanded && hasLogs && (
                                <div className="ml-8 mr-4 my-2 border-l-2 border-orange-200 pl-3">
                                  <div className="text-xs font-medium text-gray-500 mb-1.5">修改歷史 ({item.mod_logs.length})</div>
                                  {item.mod_logs.map((log) => (
                                    <div key={log.id} className="flex items-start gap-2 mb-2 text-xs">
                                      <ModTypeBadge type={log.mod_type} />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-gray-700">{log.mod_description}</div>
                                        {log.message && (
                                          <div className="mt-0.5 bg-gray-50 rounded px-2 py-1 text-gray-500 border">
                                            <div className="flex items-center gap-1">
                                              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                              </svg>
                                              <span className="font-medium">{log.message.wa_msg_sender_name || '未知'}</span>
                                              <span className="text-gray-300">|</span>
                                              <span>{formatDateTime(log.message.wa_msg_timestamp)}</span>
                                            </div>
                                            <div className="mt-0.5 text-gray-600 whitespace-pre-wrap break-words max-h-20 overflow-y-auto">
                                              &ldquo;{(log.message.wa_msg_body || '').substring(0, 150)}{(log.message.wa_msg_body || '').length > 150 ? '...' : ''}&rdquo;
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      <span className="text-gray-400 whitespace-nowrap flex-shrink-0">
                                        {formatDateTime(log.mod_created_at)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Order 級別修改日誌 ──────────────────── */}
                {summary.order_mod_logs.length > 0 && (
                  <div className="border-t px-5 py-3 bg-amber-50/50">
                    <div className="text-xs font-medium text-amber-800 mb-2 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      未匹配到具體項目的修改記錄 ({summary.order_mod_logs.length})
                    </div>
                    {summary.order_mod_logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 mb-2 text-xs">
                        <ModTypeBadge type={log.mod_type} />
                        <div className="flex-1">
                          <div className="text-gray-700">{log.mod_description}</div>
                          {log.message && (
                            <div className="mt-0.5 text-gray-400">
                              {log.message.wa_msg_sender_name} — {formatDateTime(log.message.wa_msg_timestamp)}
                              {log.message.wa_msg_body && (
                                <span className="ml-1 text-gray-500">
                                  &ldquo;{(log.message.wa_msg_body).substring(0, 80)}{(log.message.wa_msg_body).length > 80 ? '...' : ''}&rdquo;
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 版本歷史 ────────────────────────────── */}
                {summary.versions.length > 1 && (
                  <div className="border-t px-5 py-3">
                    <div className="text-xs font-medium text-gray-500 mb-2">版本歷史</div>
                    <div className="flex flex-wrap gap-2">
                      {summary.versions.map((v) => (
                        <div key={v.version} className="text-xs bg-gray-50 border rounded px-2.5 py-1.5 flex items-center gap-2">
                          <span className="font-semibold">v{v.version}</span>
                          <span className={`px-1.5 py-0.5 rounded ${v.status === 'confirmed' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                            {v.status === 'confirmed' ? '已確定' : '暫定'}
                          </span>
                          <span className="text-gray-500">{v.item_count} 項</span>
                          <span className="text-gray-400">{v.sender || '—'}</span>
                          <span className="text-gray-400">{formatDateTime(v.created_at)}</span>
                          {v.ai_confidence != null && (
                            <span className="text-gray-300">AI {(v.ai_confidence * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 原始訊息記錄（過程紀錄）─────────────── */}
                <div className="border-t">
                  <div
                    className="flex items-center justify-between px-5 py-2.5 cursor-pointer hover:bg-gray-50 transition text-sm"
                    onClick={() => toggleMessages(summary.date)}
                  >
                    <span className="text-gray-600 font-medium flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      原始訊息記錄 ({summary.messages.length} 條)
                    </span>
                    <span className={`text-gray-400 transition-transform ${showMessages ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </div>

                  {showMessages && (
                    <div className="px-5 pb-3 space-y-2">
                      {summary.messages.map((msg) => (
                        <div key={msg.id} className="bg-gray-50 rounded border px-3 py-2 text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-700">{msg.sender || '未知'}</span>
                            <ClassificationBadge classification={msg.classification} />
                            {msg.confidence != null && (
                              <span className="text-gray-400">
                                信心度 {(msg.confidence * 100).toFixed(0)}%
                              </span>
                            )}
                            <span className="text-gray-400 ml-auto">{formatDateTime(msg.timestamp)}</span>
                          </div>
                          <div className="text-gray-600 whitespace-pre-wrap break-words max-h-40 overflow-y-auto leading-relaxed">
                            {msg.body || '—'}
                          </div>
                        </div>
                      ))}
                      {summary.messages.length === 0 && (
                        <div className="text-gray-400 text-xs py-2">無相關訊息記錄</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── 分頁 ────────────────────────────────────────────── */}
      {!loading && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <span className="text-sm text-gray-500">
            共 {pagination.total} 天，第 {pagination.page} / {pagination.total_pages} 頁
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => fetchData(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50 transition"
            >
              上一頁
            </button>
            <button
              onClick={() => fetchData(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50 transition"
            >
              下一頁
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
