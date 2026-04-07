'use client';
import { useState, useEffect, useCallback } from 'react';
import { verificationApi } from '@/lib/api';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

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

  return (
    <div className="p-6 max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">WhatsApp Order 記錄</h1>
        <p className="text-sm text-gray-500 mt-1">查看從 WhatsApp 群組接收並解析的工作分配指令</p>
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
          {orders.map((order) => (
            <div key={order.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
              {/* Order 標題列 */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(order.id)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-lg">{expandedId === order.id ? '▼' : '▶'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">{formatDate(order.wa_order_date)}</span>
                      {statusBadge(order.wa_order_status)}
                      <span className="text-xs text-gray-400">v{order.wa_order_version}</span>
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
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">客戶/合約</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">工作描述</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">地點/路線</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">司機</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">車牌</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">機械</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">聯絡人</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">狀態</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {order.items.map((item) => (
                          <tr key={item.id} className={item.wa_item_is_suspended ? 'bg-red-50 opacity-60' : ''}>
                            <td className="px-3 py-2 text-gray-400">{item.wa_item_seq}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-800">{item.wa_item_customer || '—'}</div>
                              {item.wa_item_contract_no && (
                                <div className="text-xs text-gray-400">{item.wa_item_contract_no}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{item.wa_item_work_desc || '—'}</td>
                            <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{item.wa_item_location || '—'}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{item.wa_item_driver_nickname || '—'}</td>
                            <td className="px-3 py-2">
                              {item.wa_item_vehicle_no ? (
                                <span className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 font-mono">
                                  {item.wa_item_vehicle_no}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2">
                              {item.wa_item_machine_code ? (
                                <span className="px-2 py-0.5 text-xs rounded bg-purple-50 text-purple-700 font-mono">
                                  {item.wa_item_machine_code}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">{item.wa_item_contact_person || '—'}</td>
                            <td className="px-3 py-2">
                              {item.wa_item_is_suspended ? (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">暫停</span>
                              ) : (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">正常</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 原始訊息 */}
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
          ))}
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
