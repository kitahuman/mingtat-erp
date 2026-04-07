'use client';
import { useState, useEffect, useCallback } from 'react';
import { verificationApi } from '@/lib/api';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

interface ModLogMessage {
  wa_msg_body: string | null;
  wa_msg_sender_name: string | null;
  wa_msg_timestamp: string | null;
}

interface ModLog {
  id: number;
  mod_type: string;
  mod_description: string;
  mod_prev_value: Record<string, any> | null;
  mod_new_value: Record<string, any> | null;
  mod_ai_confidence: number | null;
  mod_created_at: string;
  message: ModLogMessage | null;
}

interface WaOrderItem {
  id: number;
  wa_item_seq: number;
  wa_item_contract_no: string | null;
  wa_item_customer: string | null;
  wa_item_work_desc: string | null;
  wa_item_location: string | null;
  wa_item_driver_nickname: string | null;
  wa_item_vehicle_no: string | null;
  wa_item_machine_code: string | null;
  wa_item_contact_person: string | null;
  wa_item_slip_write_as: string | null;
  wa_item_is_suspended: boolean;
  wa_item_remarks: string | null;
  wa_item_mod_status: string | null;
  wa_item_mod_prev_data: Record<string, any> | null;
  mod_logs: ModLog[];
}

interface WaMessage {
  wa_msg_group_name: string | null;
  wa_msg_sender_name: string | null;
  wa_msg_timestamp: string | null;
  wa_msg_ai_classified: string | null;
}

interface WaOrder {
  id: number;
  wa_order_date: string;
  wa_order_status: string;
  wa_order_version: number;
  wa_order_sender_name: string | null;
  wa_order_raw_text: string | null;
  wa_order_item_count: number;
  wa_order_ai_model: string | null;
  wa_order_ai_confidence: number | null;
  wa_order_created_at: string;
  message: WaMessage | null;
  items: WaOrderItem[];
  mod_logs: ModLog[];
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('zh-HK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('zh-HK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatShortTime(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('zh-HK', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
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

// ══════════════════════════════════════════════════════════════
// 修改前後對比元件
// ══════════════════════════════════════════════════════════════

function ModChangeDisplay({ item }: { item: WaOrderItem }) {
  if (!item.wa_item_mod_status || !item.wa_item_mod_prev_data) return null;

  const prev = item.wa_item_mod_prev_data;

  if (item.wa_item_mod_status === 'reassigned') {
    const changes: JSX.Element[] = [];
    if (prev.wa_item_driver_nickname && prev.wa_item_driver_nickname !== item.wa_item_driver_nickname) {
      changes.push(
        <span key="driver" className="inline-flex items-center gap-1 text-xs">
          <span className="text-gray-400 line-through">{prev.wa_item_driver_nickname}</span>
          <svg className="w-3 h-3 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="font-medium text-orange-700">{item.wa_item_driver_nickname}</span>
        </span>
      );
    }
    if (prev.wa_item_vehicle_no && prev.wa_item_vehicle_no !== item.wa_item_vehicle_no) {
      changes.push(
        <span key="vehicle" className="inline-flex items-center gap-1 text-xs">
          <span className="text-gray-400 line-through font-mono">{prev.wa_item_vehicle_no}</span>
          <svg className="w-3 h-3 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="font-medium text-orange-700 font-mono">{item.wa_item_vehicle_no}</span>
        </span>
      );
    }
    if (changes.length > 0) {
      return <div className="flex flex-col gap-0.5 mt-1">{changes}</div>;
    }
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// 修改日誌元件（單個 item 的修改歷史）
// ══════════════════════════════════════════════════════════════

function ItemModLogs({ logs }: { logs: ModLog[] }) {
  if (!logs || logs.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-1">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-start gap-2 p-1.5 rounded bg-amber-50 border border-amber-200 text-xs"
        >
          <ModTypeBadge type={log.mod_type} />
          <div className="flex-1 min-w-0">
            <div className="text-gray-700">{log.mod_description}</div>
            {log.message && (
              <div className="mt-0.5 text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="truncate">
                  {log.message.wa_msg_sender_name && `${log.message.wa_msg_sender_name}: `}
                  &ldquo;{(log.message.wa_msg_body || '').substring(0, 80)}{(log.message.wa_msg_body || '').length > 80 ? '...' : ''}&rdquo;
                </span>
                <span className="flex-shrink-0 text-gray-300 ml-1">
                  {formatShortTime(log.message.wa_msg_timestamp || log.mod_created_at)}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
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

// ══════════════════════════════════════════════════════════════
// Order 級別修改日誌（不關聯到特定 item 的修改）
// ══════════════════════════════════════════════════════════════

function OrderModLogs({ logs }: { logs: ModLog[] }) {
  // 只顯示沒有關聯到 item 的 order-level 修改
  if (!logs || logs.length === 0) return null;

  return (
    <div className="px-4 py-3 border-t bg-amber-50">
      <div className="text-xs font-medium text-amber-800 mb-2 flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        修改記錄 ({logs.length})
      </div>
      <div className="space-y-1.5">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 p-2 rounded bg-white border border-amber-200 text-xs">
            <ModTypeBadge type={log.mod_type} />
            <div className="flex-1 min-w-0">
              <div className="text-gray-700">{log.mod_description}</div>
              {log.message && (
                <div className="mt-0.5 text-gray-400 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="truncate">
                    {log.message.wa_msg_sender_name && `${log.message.wa_msg_sender_name}: `}
                    &ldquo;{(log.message.wa_msg_body || '').substring(0, 100)}{(log.message.wa_msg_body || '').length > 100 ? '...' : ''}&rdquo;
                  </span>
                  <span className="flex-shrink-0 text-gray-300 ml-1">
                    {formatShortTime(log.message.wa_msg_timestamp || log.mod_created_at)}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 主頁面元件
// ══════════════════════════════════════════════════════════════

export default function WhatsappOrdersPage() {
  const [orders, setOrders] = useState<WaOrder[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showRawId, setShowRawId] = useState<number | null>(null);
  const [showModLogsItemId, setShowModLogsItemId] = useState<number | null>(null);

  const fetchOrders = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await verificationApi.getWhatsappOrders(params);
      setOrders(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 });
    } catch (err) {
      console.error('Failed to fetch WhatsApp orders:', err);
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearch = () => fetchOrders(1);
  const handlePageChange = (newPage: number) => fetchOrders(newPage);

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleRaw = (id: number) => {
    setShowRawId(showRawId === id ? null : id);
  };

  const toggleItemModLogs = (id: number) => {
    setShowModLogsItemId(showModLogsItemId === id ? null : id);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">已確定</span>;
      case 'tentative':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800">暫定</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{status}</span>;
    }
  };

  // 計算 order 的修改統計
  const getModStats = (order: WaOrder) => {
    const modifiedItems = order.items.filter((i) => i.wa_item_mod_status);
    const cancelled = modifiedItems.filter((i) => i.wa_item_mod_status === 'cancelled').length;
    const reassigned = modifiedItems.filter((i) => i.wa_item_mod_status === 'reassigned').length;
    const suspended = modifiedItems.filter((i) => i.wa_item_mod_status === 'suspended').length;
    const added = modifiedItems.filter((i) => i.wa_item_mod_status === 'added').length;
    return { total: modifiedItems.length, cancelled, reassigned, suspended, added };
  };

  // 取得 item 的行樣式
  const getItemRowClass = (item: WaOrderItem): string => {
    if (item.wa_item_mod_status === 'cancelled') {
      return 'bg-red-50';
    }
    if (item.wa_item_mod_status === 'suspended' || item.wa_item_is_suspended) {
      return 'bg-yellow-50';
    }
    if (item.wa_item_mod_status === 'reassigned') {
      return 'bg-orange-50';
    }
    if (item.wa_item_mod_status === 'added') {
      return 'bg-green-50';
    }
    return '';
  };

  // 取得文字裝飾樣式
  const getTextClass = (item: WaOrderItem): string => {
    if (item.wa_item_mod_status === 'cancelled') {
      return 'line-through text-red-400';
    }
    if (item.wa_item_mod_status === 'suspended' || item.wa_item_is_suspended) {
      return 'text-yellow-700';
    }
    return '';
  };

  return (
    <div className="p-6 max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">WhatsApp Order 記錄</h1>
        <p className="text-sm text-gray-500 mt-1">查看從 WhatsApp 群組接收並解析的工作分配指令及修改記錄</p>
      </div>

      {/* 篩選區 */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">搜尋</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="車牌/司機/客戶/合約..."
              className="border rounded px-3 py-1.5 text-sm w-56"
            />
          </div>
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
          <button
            onClick={handleSearch}
            className="bg-primary-600 text-white px-4 py-1.5 rounded text-sm hover:bg-primary-700"
          >
            搜尋
          </button>
        </div>
      </div>

      {/* 統計 */}
      <div className="text-sm text-gray-500 mb-3">
        共 {pagination.total} 筆 WhatsApp Order
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暫無 WhatsApp Order 記錄</div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const modStats = getModStats(order);
            return (
              <div key={order.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {/* Order 標題列 */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpand(order.id)}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-lg">{expandedId === order.id ? '▼' : '▶'}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">{formatDate(order.wa_order_date)}</span>
                        {statusBadge(order.wa_order_status)}
                        <span className="text-xs text-gray-400">v{order.wa_order_version}</span>
                        {/* 修改統計 */}
                        {modStats.total > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            {modStats.total} 項已修改
                            {modStats.cancelled > 0 && ` (${modStats.cancelled} 取消)`}
                            {modStats.reassigned > 0 && ` (${modStats.reassigned} 換人)`}
                            {modStats.suspended > 0 && ` (${modStats.suspended} 暫停)`}
                            {modStats.added > 0 && ` (${modStats.added} 新增)`}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        發送者: {order.wa_order_sender_name || order.message?.wa_msg_sender_name || '—'}
                        {order.message?.wa_msg_group_name && ` | 群組: ${order.message.wa_msg_group_name}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{order.wa_order_item_count} 項工作</span>
                    {order.wa_order_ai_confidence && (
                      <span className="text-xs text-gray-400">
                        AI 信心: {(Number(order.wa_order_ai_confidence) * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{formatDateTime(order.wa_order_created_at)}</span>
                  </div>
                </div>

                {/* 展開的詳情 */}
                {expandedId === order.id && (
                  <div className="border-t">
                    {/* 工作項目表格 */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">狀態</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">客戶/合約</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">工作描述</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">地點/路線</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">司機</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">車牌</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">機械</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">聯絡人</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {order.items.map((item) => {
                            const rowClass = getItemRowClass(item);
                            const textClass = getTextClass(item);
                            const hasModLogs = item.mod_logs && item.mod_logs.length > 0;
                            const isModLogsOpen = showModLogsItemId === item.id;

                            return (
                              <tr key={item.id} className="group">
                                <td colSpan={9} className="p-0">
                                  {/* 主行 */}
                                  <div
                                    className={`flex items-start ${rowClass} ${hasModLogs ? 'cursor-pointer hover:bg-opacity-80' : ''}`}
                                    onClick={() => hasModLogs && toggleItemModLogs(item.id)}
                                  >
                                    <div className="px-3 py-2 w-10 flex-shrink-0 text-gray-400">
                                      {item.wa_item_seq}
                                    </div>
                                    <div className="px-3 py-2 w-24 flex-shrink-0">
                                      <div className="flex flex-col gap-1">
                                        <ModStatusBadge status={item.wa_item_mod_status} />
                                        {!item.wa_item_mod_status && (
                                          item.wa_item_is_suspended ? (
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 inline-block w-fit">暫停</span>
                                          ) : (
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 inline-block w-fit">正常</span>
                                          )
                                        )}
                                        {hasModLogs && (
                                          <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            {item.mod_logs.length} 筆修改
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className={`px-3 py-2 flex-1 min-w-0 ${textClass}`}>
                                      <div className="font-medium text-gray-800">{item.wa_item_customer || '—'}</div>
                                      {item.wa_item_contract_no && (
                                        <div className="text-xs text-gray-400">{item.wa_item_contract_no}</div>
                                      )}
                                    </div>
                                    <div className={`px-3 py-2 flex-1 min-w-0 max-w-xs truncate ${textClass}`}>
                                      {item.wa_item_work_desc || '—'}
                                    </div>
                                    <div className={`px-3 py-2 flex-1 min-w-0 max-w-xs truncate ${textClass}`}>
                                      {item.wa_item_location || '—'}
                                    </div>
                                    <div className="px-3 py-2 w-24 flex-shrink-0">
                                      <div className={`font-medium ${textClass || 'text-gray-800'}`}>
                                        {item.wa_item_driver_nickname || '—'}
                                      </div>
                                      <ModChangeDisplay item={item} />
                                    </div>
                                    <div className="px-3 py-2 w-24 flex-shrink-0">
                                      {item.wa_item_vehicle_no ? (
                                        <span className={`px-2 py-0.5 text-xs rounded font-mono ${
                                          item.wa_item_mod_status === 'cancelled'
                                            ? 'bg-red-50 text-red-400 line-through'
                                            : 'bg-blue-50 text-blue-700'
                                        }`}>
                                          {item.wa_item_vehicle_no}
                                        </span>
                                      ) : '—'}
                                    </div>
                                    <div className="px-3 py-2 w-20 flex-shrink-0">
                                      {item.wa_item_machine_code ? (
                                        <span className={`px-2 py-0.5 text-xs rounded font-mono ${
                                          item.wa_item_mod_status === 'cancelled'
                                            ? 'bg-red-50 text-red-400 line-through'
                                            : 'bg-purple-50 text-purple-700'
                                        }`}>
                                          {item.wa_item_machine_code}
                                        </span>
                                      ) : '—'}
                                    </div>
                                    <div className={`px-3 py-2 w-28 flex-shrink-0 text-xs text-gray-500 truncate ${textClass}`}>
                                      {item.wa_item_contact_person || '—'}
                                    </div>
                                  </div>

                                  {/* 修改日誌展開區 */}
                                  {isModLogsOpen && hasModLogs && (
                                    <div className="px-4 pb-2">
                                      <ItemModLogs logs={item.mod_logs} />
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Order 級別修改日誌 */}
                    {order.mod_logs && order.mod_logs.length > 0 && (
                      <OrderModLogs logs={order.mod_logs} />
                    )}

                    {/* 原始訊息和額外資訊 */}
                    <div className="px-4 py-3 border-t bg-gray-50">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleRaw(order.id); }}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        {showRawId === order.id ? '隱藏原始訊息' : '查看原始訊息'}
                      </button>
                      {showRawId === order.id && order.wa_order_raw_text && (
                        <pre className="mt-2 p-3 bg-white border rounded text-xs text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto font-mono">
                          {order.wa_order_raw_text}
                        </pre>
                      )}
                      {item_extras(order)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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

// 額外資訊顯示
function item_extras(order: WaOrder) {
  const slipItems = order.items.filter((i) => i.wa_item_slip_write_as);
  const remarkItems = order.items.filter((i) => i.wa_item_remarks);

  if (slipItems.length === 0 && remarkItems.length === 0) return null;

  return (
    <div className="mt-2 text-xs text-gray-500">
      {slipItems.map((item) => (
        <div key={`slip-${item.id}`}>
          飛仔寫: <span className="font-medium text-gray-700">{item.wa_item_slip_write_as}</span>
          {item.wa_item_driver_nickname && ` (${item.wa_item_driver_nickname})`}
        </div>
      ))}
      {remarkItems.map((item) => (
        <div key={`remark-${item.id}`}>
          備註: <span className="text-gray-700">{item.wa_item_remarks}</span>
        </div>
      ))}
    </div>
  );
}
