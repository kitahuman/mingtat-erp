'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { verificationApi } from '@/lib/api';

// ══════════════════════════════════════════════════════════════
// 來源類型 Tab 定義
// ══════════════════════════════════════════════════════════════
const SOURCE_TABS = [
  { key: 'all', label: '全部' },
  { key: 'receipt', label: '入帳票' },
  { key: 'slip_chit', label: '飛仔（有票）' },
  { key: 'slip_no_chit', label: '飛仔（無票）' },
  { key: 'driver_sheet', label: '功課表' },
  { key: 'customer_record', label: '客戶紀錄' },
  { key: 'gps', label: 'GPS' },
  { key: 'clock', label: '打卡' },
];

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════
interface ChitItem {
  chit_no: string;
  chit_seq: number;
}

interface BatchInfo {
  batch_code: string;
  batch_period_year: number | null;
  batch_period_month: number | null;
  batch_upload_time: string;
}

interface SourceInfo {
  source_code: string;
  source_name: string;
  source_type: string;
}

interface RecordItem {
  id: number;
  record_batch_id: number;
  record_work_date: string | null;
  record_vehicle_no: string | null;
  record_driver_name: string | null;
  record_customer: string | null;
  record_location_from: string | null;
  record_location_to: string | null;
  record_time_in: string | null;
  record_time_out: string | null;
  record_slip_no: string | null;
  record_contract_no: string | null;
  record_quantity: string | null;
  record_weight_net: string | null;
  record_raw_data: any;
  record_created_at: string;
  batch: BatchInfo;
  source: SourceInfo;
  chits: ChitItem[];
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

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '—';
  // Time fields are stored as ISO timestamps with date 1970-01-01
  try {
    const d = new Date(timeStr);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return timeStr;
  }
}

function formatGpsTime(datetimeStr: string | null): string {
  if (!datetimeStr) return '—';
  try {
    // GPS datetime format: "2026-04-01 07:10:59"
    const match = datetimeStr.match(/(\d{2}:\d{2}:\d{2})/);
    if (match) return match[1].slice(0, 5);
    return datetimeStr;
  } catch {
    return datetimeStr;
  }
}

function getSourceBadgeColor(sourceCode: string): string {
  const colors: Record<string, string> = {
    receipt: 'bg-blue-100 text-blue-800',
    slip_chit: 'bg-green-100 text-green-800',
    slip_no_chit: 'bg-teal-100 text-teal-800',
    driver_sheet: 'bg-purple-100 text-purple-800',
    customer_record: 'bg-orange-100 text-orange-800',
    gps: 'bg-yellow-100 text-yellow-800',
    clock: 'bg-gray-100 text-gray-800',
  };
  return colors[sourceCode] || 'bg-gray-100 text-gray-700';
}

// ══════════════════════════════════════════════════════════════
// 主頁面元件
// ══════════════════════════════════════════════════════════════
export default function VerificationRecordsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'all';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 篩選條件
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const isGpsTab = activeTab === 'gps';

  const fetchRecords = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params: any = { page, limit: 20 };
        if (activeTab !== 'all') params.source_type = activeTab;
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        if (search) params.search = search;

        const res = await verificationApi.getRecords(params);
        setRecords(res.data.data || []);
        setPagination(res.data.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 });
      } catch (err: any) {
        setError(err?.response?.data?.message || '載入失敗');
      } finally {
        setLoading(false);
      }
    },
    [activeTab, dateFrom, dateTo, search],
  );

  useEffect(() => {
    fetchRecords(1);
  }, [fetchRecords]);

  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleClearFilters = () => {
    setSearch('');
    setSearchInput('');
    setDateFrom('');
    setDateTo('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    fetchRecords(newPage);
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  return (
    <div className="p-6 space-y-6">
      {/* 頁面標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">已匯入資料</h1>
          <p className="text-sm text-gray-500 mt-1">
            查看所有已匯入的核對記錄，包括入帳票、飛仔、功課表、GPS 等
          </p>
        </div>
        <div className="text-sm text-gray-500">
          共 <span className="font-semibold text-gray-900">{pagination.total}</span> 筆記錄
        </div>
      </div>

      {/* 來源類型 Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`
                whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 篩選區域 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* 搜尋 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">搜尋</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={isGpsTab ? '車牌、地點...' : '車牌、司機、客戶、地點...'}
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleSearch}
                className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 transition-colors"
              >
                搜尋
              </button>
            </div>
          </div>

          {/* 日期範圍 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">開始日期</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">結束日期</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* 清除篩選 */}
          {(search || dateFrom || dateTo) && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-md hover:bg-gray-50 transition-colors"
            >
              清除篩選
            </button>
          )}
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 資料表格 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              {isGpsTab ? (
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    來源
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    日期
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    車牌
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    首次開引擎
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    最後關引擎
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    行駛里程
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    GPS 點數
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    主要位置
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    批次編號
                  </th>
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    來源
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    日期
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    車牌
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    司機
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    客戶
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    出發地
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    目的地
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    進入時間
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    離開時間
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    入帳票號
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    重量
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    批次編號
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={isGpsTab ? 9 : 12} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5 text-primary-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      載入中...
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={isGpsTab ? 9 : 12} className="px-4 py-12 text-center text-gray-400">
                    沒有符合條件的記錄
                  </td>
                </tr>
              ) : isGpsTab ? (
                records.map((record) => {
                  const raw = record.record_raw_data || {};
                  const gpsLocations: string[] = raw.gps_locations || [];
                  const gpsRawPointCount = raw.gps_raw_point_count || 0;
                  const gpsTotalKm = raw.gps_total_km;
                  const gpsFirstOn = raw.gps_first_engine_on;
                  const gpsLastOff = raw.gps_last_engine_off;

                  return (
                    <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getSourceBadgeColor(record.source?.source_code)}`}
                        >
                          {record.source?.source_name || record.source?.source_code || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                        {formatDate(record.record_work_date)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium text-gray-900">
                        {record.record_vehicle_no || '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                        {gpsFirstOn ? formatGpsTime(gpsFirstOn) : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                        {gpsLastOff ? formatGpsTime(gpsLastOff) : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right text-gray-700">
                        {gpsTotalKm != null && gpsTotalKm > 0
                          ? `${Number(gpsTotalKm).toFixed(1)} km`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right text-gray-500">
                        {gpsRawPointCount || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 max-w-[250px]">
                        {gpsLocations.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {gpsLocations.slice(0, 5).map((loc, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-1.5 py-0.5 bg-yellow-50 text-yellow-800 text-xs rounded"
                              >
                                {loc}
                              </span>
                            ))}
                            {gpsLocations.length > 5 && (
                              <span className="text-xs text-gray-400">
                                +{gpsLocations.length - 5} 個
                              </span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500">
                        {record.batch?.batch_code || '—'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getSourceBadgeColor(record.source?.source_code)}`}
                      >
                        {record.source?.source_name || record.source?.source_code || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                      {formatDate(record.record_work_date)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium text-gray-900">
                      {record.record_vehicle_no || '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                      {record.record_driver_name || '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 max-w-[120px] truncate">
                      {record.record_customer || '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 max-w-[120px] truncate">
                      {record.record_location_from || '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 max-w-[120px] truncate">
                      {record.record_location_to || '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                      {formatTime(record.record_time_in)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                      {formatTime(record.record_time_out)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                      {record.chits && record.chits.length > 0
                        ? record.chits.map((c) => c.chit_no).join(', ')
                        : record.record_slip_no || '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                      {record.record_weight_net != null
                        ? `${record.record_weight_net} t`
                        : record.record_quantity || '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500">
                      {record.batch?.batch_code || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分頁 */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500">
              第 {pagination.page} 頁，共 {pagination.total_pages} 頁（{pagination.total} 筆）
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
              >
                上一頁
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
