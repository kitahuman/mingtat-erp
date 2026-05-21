'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  documentManagementApi,
  UnifiedDocumentItem,
  UnifiedDocumentListResponse,
} from '@/lib/api';

interface Filters {
  q: string;
  file_name: string;
  module: string;
  source: string;
  date_from: string;
  date_to: string;
}

const defaultFilters: Filters = {
  q: '',
  file_name: '',
  module: '',
  source: '',
  date_from: '',
  date_to: '',
};

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isImage(document: UnifiedDocumentItem) {
  return document.mime_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(document.file_name);
}

function isPreviewable(document: UnifiedDocumentItem) {
  return Boolean(
    document.mime_type?.startsWith('image/') ||
      document.mime_type === 'application/pdf' ||
      /\.(png|jpe?g|gif|webp|bmp|svg|pdf|txt)$/i.test(document.file_name),
  );
}

export default function DocumentManagementPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState<UnifiedDocumentListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewDocument, setPreviewDocument] = useState<UnifiedDocumentItem | null>(null);

  const params = useMemo(() => {
    const query: Record<string, string | number> = { page, limit };
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (value) query[key] = value;
    });
    return query;
  }, [appliedFilters, page, limit]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await documentManagementApi.list(params);
      setData(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '載入文件列表失敗');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const totalPages = data?.total_pages || 1;
  const documents = data?.data || [];

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  };

  const previewUrl = previewDocument
    ? documentManagementApi.preview(previewDocument.source, previewDocument.id)
    : '';

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">文件管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            統一查看所有模組上傳或儲存的文件，包括公司、員工、車輛、機械、報價單、發票、支出、合約及工程管理文件。
          </p>
        </div>
        <button
          type="button"
          onClick={loadDocuments}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? '更新中...' : '重新整理'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-6">
        <div className="xl:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">關鍵字</label>
          <input
            type="text"
            value={filters.q}
            onChange={event => setFilters(prev => ({ ...prev, q: event.target.value }))}
            onKeyDown={event => {
              if (event.key === 'Enter') applyFilters();
            }}
            placeholder="搜尋文件名、關聯記錄、描述"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">文件名</label>
          <input
            type="text"
            value={filters.file_name}
            onChange={event => setFilters(prev => ({ ...prev, file_name: event.target.value }))}
            onKeyDown={event => {
              if (event.key === 'Enter') applyFilters();
            }}
            placeholder="按文件名篩選"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">模組來源</label>
          <select
            value={filters.module}
            onChange={event => setFilters(prev => ({ ...prev, module: event.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">全部模組</option>
            {(data?.modules || []).map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">儲存來源</label>
          <select
            value={filters.source}
            onChange={event => setFilters(prev => ({ ...prev, source: event.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">全部來源</option>
            {(data?.sources || []).map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">每頁</label>
          <select
            value={limit}
            onChange={event => {
              setLimit(Number(event.target.value));
              setPage(1);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {[25, 50, 100, 200].map(value => (
              <option key={value} value={value}>
                {value} 筆
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">開始日期</label>
          <input
            type="date"
            value={filters.date_from}
            onChange={event => setFilters(prev => ({ ...prev, date_from: event.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">結束日期</label>
          <input
            type="date"
            value={filters.date_to}
            onChange={event => setFilters(prev => ({ ...prev, date_to: event.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div className="flex items-end gap-2 xl:col-span-4">
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            搜尋 / 篩選
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            清除條件
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">符合條件文件</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{data?.total || 0}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">目前頁數</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{page} / {totalPages}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">已整合來源</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{data?.sources?.length || 0}</div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">文件</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">模組</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">關聯記錄</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">大小</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">上傳時間</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                    載入文件中...
                  </td>
                </tr>
              )}
              {!loading && documents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                    未找到符合條件的文件。
                  </td>
                </tr>
              )}
              {!loading && documents.map(document => (
                <tr key={`${document.source}-${document.id}`} className="hover:bg-gray-50">
                  <td className="max-w-sm px-4 py-3 align-top">
                    <div className="font-medium text-gray-900 break-words">{document.file_name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {document.mime_type || '未知類型'}
                    </div>
                    {document.description && (
                      <div className="mt-1 text-xs text-gray-400 break-words">{document.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                      {document.module_label}
                    </span>
                    <div className="mt-1 text-xs text-gray-500">{document.source}</div>
                  </td>
                  <td className="max-w-xs px-4 py-3 align-top text-sm text-gray-700">
                    <div className="break-words">{document.entity_label || '-'}</div>
                    <div className="mt-1 text-xs text-gray-400">{document.entity_type} #{document.entity_id ?? '-'}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-gray-700">{formatFileSize(document.file_size)}</td>
                  <td className="px-4 py-3 align-top text-sm text-gray-700">{formatDate(document.uploaded_at)}</td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewDocument(document)}
                        disabled={!isPreviewable(document)}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={isPreviewable(document) ? '預覽文件' : '此文件類型未必支援瀏覽器預覽'}
                      >
                        預覽
                      </button>
                      <a
                        href={documentManagementApi.download(document.source, document.id)}
                        className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                      >
                        下載
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-500">
            顯示第 {documents.length === 0 ? 0 : (page - 1) * limit + 1} 至 {Math.min(page * limit, data?.total || 0)} 筆，共 {data?.total || 0} 筆
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page <= 1 || loading}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              上一頁
            </button>
            <button
              type="button"
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages || loading}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一頁
            </button>
          </div>
        </div>
      </div>

      {previewDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-gray-900">{previewDocument.file_name}</h2>
                <p className="text-sm text-gray-500">{previewDocument.module_label} · {previewDocument.entity_label}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDocument(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                關閉
              </button>
            </div>
            <div className="min-h-[60vh] overflow-auto bg-gray-100 p-4">
              {isImage(previewDocument) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={previewDocument.file_name}
                  className="mx-auto max-h-[72vh] max-w-full rounded bg-white object-contain shadow"
                />
              ) : (
                <iframe
                  title={previewDocument.file_name}
                  src={previewUrl}
                  className="h-[72vh] w-full rounded border border-gray-200 bg-white"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
              <a
                href={documentManagementApi.download(previewDocument.source, previewDocument.id)}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                下載文件
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
