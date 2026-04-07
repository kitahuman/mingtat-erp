'use client';
import { useState, useEffect, useCallback } from 'react';
import { verificationApi } from '@/lib/api';
import Link from 'next/link';

interface BatchItem {
  id: number;
  batch_code: string;
  batch_file_name: string | null;
  batch_file_size: number | null;
  batch_upload_time: string;
  batch_period_year: number | null;
  batch_period_month: number | null;
  batch_total_rows: number | null;
  batch_filtered_rows: number | null;
  batch_status: string;
  batch_error_message: string | null;
  batch_notes: string | null;
  source: {
    id: number;
    source_code: string;
    source_name: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待處理', color: 'bg-yellow-100 text-yellow-800' },
  imported: { label: '已匯入', color: 'bg-indigo-100 text-indigo-800' },
  processing: { label: '配對中', color: 'bg-blue-100 text-blue-800' },
  matched: { label: '已配對', color: 'bg-green-100 text-green-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
  failed: { label: '配對失敗', color: 'bg-red-100 text-red-800' },
  cancelled: { label: '已作廢', color: 'bg-gray-100 text-gray-600' },
};

export default function VerificationBatchesPage() {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchBatches = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await verificationApi.getBatches({ page, limit: 20 });
      setBatches(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 });
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBatches(1);
  }, [fetchBatches]);

  const handleDelete = async (batch: BatchItem) => {
    const confirmed = confirm(`確定要刪除批次「${batch.batch_code}」嗎？此操作不可復原。`);
    if (!confirmed) return;
    setActionLoading(batch.id);
    try {
      await verificationApi.deleteBatch(batch.id);
      fetchBatches(pagination.page);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '刪除失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setActionLoading(null);
  };

  const handleMatch = async (batch: BatchItem) => {
    const confirmed = confirm(`確定要對批次「${batch.batch_code}」開始配對嗎？`);
    if (!confirmed) return;
    setActionLoading(batch.id);
    try {
      const res = await verificationApi.confirmBatch(batch.id);
      if (res.data?.status === 'failed') {
        alert(`配對失敗：${res.data.error || '未知錯誤'}`);
      }
      fetchBatches(pagination.page);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '配對失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setActionLoading(null);
  };

  const handleRetry = async (batch: BatchItem) => {
    const confirmed = confirm(`確定要重試批次「${batch.batch_code}」的配對嗎？`);
    if (!confirmed) return;
    setActionLoading(batch.id);
    try {
      const res = await verificationApi.confirmBatch(batch.id);
      if (res.data?.status === 'failed') {
        alert(`配對失敗：${res.data.error || '未知錯誤'}`);
      }
      fetchBatches(pagination.page);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '重試失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setActionLoading(null);
  };

  const handleCancel = async (batch: BatchItem) => {
    const confirmed = confirm(`確定要作廢批次「${batch.batch_code}」嗎？將刪除相關的配對結果。`);
    if (!confirmed) return;
    setActionLoading(batch.id);
    try {
      await verificationApi.cancelBatch(batch.id);
      fetchBatches(pagination.page);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '作廢失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setActionLoading(null);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* 頂部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/verification" className="text-gray-400 hover:text-gray-600 text-lg">&larr;</Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">匯入紀錄</h1>
            <p className="text-sm text-gray-500 mt-1">查看所有匯入批次的狀態與操作</p>
          </div>
        </div>
        <Link
          href="/verification/upload"
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm"
        >
          上傳新資料
        </Link>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">載入中...</div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center text-gray-400">尚無匯入紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">批次編號</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">來源類型</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">檔案名稱</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">上傳時間</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">期間</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">總行數</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">匯入行數</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const statusCfg = STATUS_CONFIG[batch.batch_status] || { label: batch.batch_status, color: 'bg-gray-100 text-gray-600' };
                  const canDelete = ['pending', 'imported', 'processing', 'cancelled', 'failed'].includes(batch.batch_status);
                  const canCancel = batch.batch_status === 'matched' || batch.batch_status === 'completed';
                  const canRetry = ['processing', 'failed'].includes(batch.batch_status);
                  const canMatch = batch.batch_status === 'imported';
                  const isActioning = actionLoading === batch.id;

                  return (
                    <tr key={batch.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{batch.batch_code}</td>
                      <td className="px-4 py-3">{batch.source?.source_name || '—'}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={batch.batch_file_name || ''}>
                        {batch.batch_file_name || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">{formatDate(batch.batch_upload_time)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {batch.batch_period_year && batch.batch_period_month
                          ? `${batch.batch_period_year}/${String(batch.batch_period_month).padStart(2, '0')}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">{batch.batch_total_rows ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{batch.batch_filtered_rows ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                          {batch.batch_error_message && (batch.batch_status === 'failed' || batch.batch_status === 'processing') && (
                            <span
                              className="text-[10px] text-red-500 max-w-[200px] truncate cursor-help"
                              title={batch.batch_error_message}
                            >
                              {batch.batch_error_message.split('\n')[0]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {isActioning ? (
                          <span className="text-gray-400 text-xs">處理中...</span>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            {canMatch && (
                              <button
                                onClick={() => handleMatch(batch)}
                                className="text-primary-600 hover:text-primary-800 text-xs font-medium"
                              >
                                開始配對
                              </button>
                            )}
                            {canRetry && (
                              <button
                                onClick={() => handleRetry(batch)}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                              >
                                重試
                              </button>
                            )}
                            {canCancel && (
                              <button
                                onClick={() => handleCancel(batch)}
                                className="text-amber-600 hover:text-amber-800 text-xs font-medium"
                              >
                                作廢
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(batch)}
                                className="text-red-600 hover:text-red-800 text-xs font-medium"
                              >
                                刪除
                              </button>
                            )}
                            {!canCancel && !canDelete && !canRetry && !canMatch && (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分頁 */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <div className="text-xs text-gray-500">
              共 {pagination.total} 筆，第 {pagination.page} / {pagination.total_pages} 頁
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => fetchBatches(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1 text-xs border rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一頁
              </button>
              <button
                onClick={() => fetchBatches(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="px-3 py-1 text-xs border rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
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
