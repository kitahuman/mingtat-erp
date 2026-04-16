'use client';

import { useState, useEffect, useCallback } from 'react';
import { workLogsApi } from '@/lib/api';

interface UnmatchedRow {
  company_id: number | null;
  company_name: string | null;
  client_id: number | null;
  client_name: string | null;
  client_contract_no: string | null;
  service_type: string | null;
  quotation_id: number | null;
  quotation_no: string | null;
  day_night: string | null;
  tonnage: string | null;
  machine_type: string | null;
  start_location: string | null;
  end_location: string | null;
  count: number;
}

interface ApiResponse {
  data: UnmatchedRow[];
  total: number;
  totalUnmatched: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ColumnDef {
  key: string;
  label: string;
  filterKey: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'company_name', label: '公司', filterKey: 'company_id' },
  { key: 'client_name', label: '客戶', filterKey: 'client_id' },
  { key: 'client_contract_no', label: '客戶合約', filterKey: 'client_contract_no' },
  { key: 'service_type', label: '服務類型', filterKey: 'service_type' },
  { key: 'quotation_no', label: '報價單', filterKey: 'quotation_id' },
  { key: 'day_night', label: '日夜', filterKey: 'day_night' },
  { key: 'tonnage', label: '噸數', filterKey: 'tonnage' },
  { key: 'machine_type', label: '機種', filterKey: 'machine_type' },
  { key: 'start_location', label: '起點', filterKey: 'start_location' },
  { key: 'end_location', label: '終點', filterKey: 'end_location' },
  { key: 'count', label: '受影響筆數', filterKey: '' },
];

export default function MissingPriceTab() {
  const [data, setData] = useState<UnmatchedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalUnmatched, setTotalUnmatched] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('count');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [successRows, setSuccessRows] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const rowKey = (row: UnmatchedRow) =>
    `${row.company_id}-${row.client_id}-${row.client_contract_no}-${row.service_type}-${row.quotation_id}-${row.day_night}-${row.tonnage}-${row.machine_type}-${row.start_location}-${row.end_location}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page,
        limit,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      // Add active filters
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      const res = await workLogsApi.unmatchedCombinations(params);
      const result: ApiResponse = res.data;
      setData(result.data);
      setTotal(result.total);
      setTotalUnmatched(result.totalUnmatched);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('Failed to fetch unmatched combinations:', err);
      setToast({ message: '載入失敗', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(col);
      setSortOrder('DESC');
    }
    setPage(1);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleAddRate = async (row: UnmatchedRow) => {
    const key = rowKey(row);
    const rateStr = rateInputs[key];
    if (!rateStr || isNaN(Number(rateStr)) || Number(rateStr) <= 0) {
      setToast({ message: '請輸入有效的價錢', type: 'error' });
      return;
    }

    setSubmitting((prev) => ({ ...prev, [key]: true }));
    try {
      const payload: Record<string, unknown> = {
        company_id: row.company_id,
        client_id: row.client_id,
        client_contract_no: row.client_contract_no,
        service_type: row.service_type,
        quotation_id: row.quotation_id,
        day_night: row.day_night,
        tonnage: row.tonnage,
        machine_type: row.machine_type,
        start_location: row.start_location,
        end_location: row.end_location,
        rate: Number(rateStr),
      };
      const res = await workLogsApi.addRateAndRematch(payload);
      const result = res.data as { rateCard: { id: number }; rematchedCount: number };
      setToast({
        message: `已新增價目 #${result.rateCard.id}，重新匹配了 ${result.rematchedCount} 筆工作記錄`,
        type: 'success',
      });
      setSuccessRows((prev) => new Set(prev).add(key));
      // Refresh data
      await fetchData();
    } catch (err) {
      console.error('Failed to add rate:', err);
      setToast({ message: '新增價目失敗', type: 'error' });
    } finally {
      setSubmitting((prev) => ({ ...prev, [key]: false }));
    }
  };

  const getCellValue = (row: UnmatchedRow, key: string): string => {
    const val = row[key as keyof UnmatchedRow];
    if (val == null) return '-';
    return String(val);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900">缺單價組合</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              共 <span className="font-semibold text-red-600">{total}</span> 個缺單價組合，
              影響 <span className="font-semibold text-red-600">{totalUnmatched}</span> 筆工作記錄
            </p>
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            {loading ? '載入中…' : '🔄 重新整理'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse min-w-[1400px]">
          <thead className="sticky top-0 z-10 bg-gray-50">
            {/* Column headers */}
            <tr className="border-b border-gray-200">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-2 text-left text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap select-none"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {sortBy === col.key && (
                    <span className="ml-1 text-blue-600">
                      {sortOrder === 'ASC' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                價錢
              </th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                操作
              </th>
            </tr>
            {/* Filter row */}
            <tr className="border-b border-gray-200 bg-gray-50">
              {COLUMNS.map((col) => (
                <th key={`filter-${col.key}`} className="px-1 py-1">
                  {col.filterKey ? (
                    <input
                      type="text"
                      placeholder="篩選…"
                      className="w-full px-1.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={filters[col.filterKey] || ''}
                      onChange={(e) => handleFilterChange(col.filterKey, e.target.value)}
                    />
                  ) : null}
                </th>
              ))}
              <th className="px-1 py-1" />
              <th className="px-1 py-1" />
            </tr>
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="text-center py-12 text-gray-400">
                  載入中…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="text-center py-12 text-gray-400">
                  沒有缺單價的組合 🎉
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const key = rowKey(row);
                const isSuccess = successRows.has(key);
                return (
                  <tr
                    key={key}
                    className={`border-b border-gray-100 hover:bg-blue-50/30 ${
                      isSuccess ? 'bg-green-50 opacity-60' : ''
                    }`}
                  >
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="px-2 py-1.5 text-xs text-gray-700 whitespace-nowrap">
                        {col.key === 'count' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            {row.count}
                          </span>
                        ) : (
                          getCellValue(row, col.key)
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="輸入價錢"
                        className="w-24 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={rateInputs[key] || ''}
                        onChange={(e) =>
                          setRateInputs((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        disabled={isSuccess || submitting[key]}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {isSuccess ? (
                        <span className="text-xs text-green-600 font-medium">✅ 已新增</span>
                      ) : (
                        <button
                          onClick={() => handleAddRate(row)}
                          disabled={submitting[key] || !rateInputs[key]}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {submitting[key] ? '處理中…' : '新增'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            第 {page} / {totalPages} 頁（共 {total} 個組合）
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              上一頁
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              下一頁
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
            }`}
          >
            <span>{toast.type === 'error' ? '⚠️' : '✅'}</span>
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
