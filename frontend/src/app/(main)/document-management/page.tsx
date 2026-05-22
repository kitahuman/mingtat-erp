
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  documentManagementApi,
  UnifiedDocumentItem,
  UnifiedDocumentListResponse,
  DocumentTreeNode,
} from '@/lib/api';

interface Filters {
  q: string;
  file_name: string;
  date_from: string;
  date_to: string;
}

interface SelectedDocument {
  source: UnifiedDocumentItem['source'];
  id: string;
  file_name: string;
}

const defaultFilters: Filters = {
  q: '',
  file_name: '',
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

function getDocumentKey(document: Pick<UnifiedDocumentItem, 'source' | 'id'>) {
  return `${document.source}:${document.id}`;
}

export default function DocumentManagementPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [documentTree, setDocumentTree] = useState<DocumentTreeNode[] | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedNode, setSelectedNode] = useState<DocumentTreeNode | null>(null);
  const [documentList, setDocumentList] = useState<UnifiedDocumentListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [error, setError] = useState('');
  const [previewDocument, setPreviewDocument] = useState<UnifiedDocumentItem | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<Record<string, SelectedDocument>>({});

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await documentManagementApi.tree();
      setDocumentTree(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '載入文件樹狀結構失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDocumentList = useCallback(async () => {
    if (!selectedNode) {
      setDocumentList(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params: any = { page, limit };
      if (selectedNode.type === 'module') {
        params.module = selectedNode.value;
      } else if (selectedNode.type === 'entity') {
        const [module, entity_id] = selectedNode.value.split(':');
        params.module = module;
        params.entity_id = entity_id;
      } else if (selectedNode.type === 'doc_type') {
        const [module, entity_id, doc_type] = selectedNode.value.split(':');
        params.module = module;
        params.entity_id = entity_id;
        params.doc_type = doc_type;
      }
      // Apply general filters to the document list
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });

      const response = await documentManagementApi.list(params);
      setDocumentList(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '載入文件列表失敗');
    } finally {
      setLoading(false);
    }
  }, [selectedNode, page, limit, appliedFilters]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    loadDocumentList();
  }, [loadDocumentList]);

  const totalPages = documentList?.total_pages || 1;
  const documents = documentList?.data || [];
  const selectedList = Object.values(selectedDocuments);
  const selectedCount = selectedList.length;
  const allCurrentPageSelected = documents.length > 0 && documents.every(document => selectedDocuments[getDocumentKey(document)]);

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
    // When filters are applied, we should reload the document list for the current selected node
    loadDocumentList();
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
    // When filters are reset, reload the document list for the current selected node
    loadDocumentList();
  };

  const toggleDocumentSelection = (document: UnifiedDocumentItem, checked: boolean) => {
    const key = getDocumentKey(document);
    setSelectedDocuments(prev => {
      const next = { ...prev };
      if (checked) {
        next[key] = { source: document.source, id: document.id, file_name: document.file_name };
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const toggleCurrentPageSelection = (checked: boolean) => {
    setSelectedDocuments(prev => {
      const next = { ...prev };
      documents.forEach(document => {
        const key = getDocumentKey(document);
        if (checked) {
          next[key] = { source: document.source, id: document.id, file_name: document.file_name };
        } else {
          delete next[key];
        }
      });
      return next;
    });
  };

  const batchDownloadSelected = async () => {
    if (selectedCount === 0) return;
    setDownloadingZip(true);
    setError('');
    try {
      const response = await documentManagementApi.batchDownload(
        selectedList.map(document => ({ source: document.source, id: document.id })),
      );
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `文件管理批量下載-${new Date().toISOString().slice(0, 10)}.zip`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '批量下載失敗');
    } finally {
      setDownloadingZip(false);
    }
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadTree}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '更新中...' : '重新整理分類'}
          </button>
          <button
            type="button"
            onClick={loadDocumentList}
            disabled={loading || !selectedNode}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '更新中...' : '重新整理文件列表'}
          </button>
        </div>
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
        {/* Module and Source filters are now handled by the tree structure, but date filters remain */}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Document Tree Sidebar */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-1">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">文件分類</h2>
          {loading && !documentTree && <p className="text-gray-500">載入中...</p>}
          {error && !documentTree && <p className="text-red-500">{error}</p>}
          {!loading && !error && documentTree && documentTree.length === 0 && (
            <p className="text-gray-500">沒有文件分類</p>
          )}
          {documentTree && documentTree.length > 0 && (
            <div className="space-y-2">
              {documentTree.map(moduleNode => (
                <div key={moduleNode.value}>
                  <div
                    className={`flex cursor-pointer items-center justify-between rounded-md p-2 hover:bg-gray-50 ${selectedNode?.value === moduleNode.value ? 'bg-primary-50 text-primary-700' : ''}`}
                    onClick={() => {
                      setSelectedNode(moduleNode);
                      setExpandedNodes(prev => ({ ...prev, [moduleNode.value]: !prev[moduleNode.value] }));
                    }}
                  >
                    <span className="font-medium">{moduleNode.label}</span>
                    <svg
                      className={`h-5 w-5 transform transition-transform ${expandedNodes[moduleNode.value] ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 5l7 7-7 7"
                      ></path>
                    </svg>
                  </div>
                  {expandedNodes[moduleNode.value] && moduleNode.children && moduleNode.children.length > 0 && (
                    <div className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-2">
                      {moduleNode.children.map(entityNode => (
                        <div key={entityNode.value}>
                          <div
                            className={`flex cursor-pointer items-center justify-between rounded-md p-2 hover:bg-gray-50 ${selectedNode?.value === entityNode.value ? 'bg-primary-50 text-primary-700' : ''}`}
                            onClick={() => {
                              setSelectedNode(entityNode);
                              setExpandedNodes(prev => ({ ...prev, [entityNode.value]: !prev[entityNode.value] }));
                            }}
                          >
                            <span className="font-medium">{entityNode.label}</span>
                            <svg
                              className={`h-5 w-5 transform transition-transform ${expandedNodes[entityNode.value] ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M9 5l7 7-7 7"
                              ></path>
                            </svg>
                          </div>
                          {expandedNodes[entityNode.value] && entityNode.children && entityNode.children.length > 0 && (
                            <div className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-2">
                              {entityNode.children.map(docTypeNode => (
                                <div key={docTypeNode.value}>
                                  <div
                                    className={`flex cursor-pointer items-center justify-between rounded-md p-2 hover:bg-gray-50 ${selectedNode?.value === docTypeNode.value ? 'bg-primary-50 text-primary-700' : ''}`}
                                    onClick={() => setSelectedNode(docTypeNode)}
                                  >
                                    <span className="font-medium">{docTypeNode.label}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document List */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">符合條件文件</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{documentList?.total || 0}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">目前頁數</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{documentList?.page || 1} / {documentList?.total_pages || 1}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">已整合來源</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{documentList?.sources?.length || 0}</div>
            </div>
          </div>

          {error && documentTree && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-6">
              {error}
            </div>
          )}

          {!selectedNode && !loading && !error && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm mt-6">
              <p className="text-gray-500">請從左側分類選擇要查看的文件</p>
            </div>
          )}

          {selectedNode && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm mt-6">
              <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-gray-600">
                  已選擇 <span className="font-semibold text-gray-900">{selectedCount}</span> 個文件
                  {selectedCount > 0 && (
                    <span className="ml-2 text-xs text-gray-500">可跨頁選取，ZIP 內檔名會使用頁面顯示的文件名。</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDocuments({})}
                    disabled={selectedCount === 0 || downloadingZip}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    清除選取
                  </button>
                  <button
                    type="button"
                    onClick={batchDownloadSelected}
                    disabled={selectedCount === 0 || downloadingZip}
                    className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {downloadingZip ? '正在打包 ZIP...' : '批量下載 ZIP'}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-12 px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={allCurrentPageSelected}
                          onChange={event => toggleCurrentPageSelection(event.target.checked)}
                          disabled={loading || documents.length === 0}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="選取目前頁所有文件"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">文件名</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">模組</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">關聯記錄</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">文件類型</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">儲存來源</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">大小</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">上傳日期</th>
                      <th className="relative w-24 px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {documents.length === 0 && !loading ? (
                      <tr>
                        <td colSpan={9} className="py-4 text-center text-sm text-gray-500">
                          沒有找到文件。
                        </td>
                      </tr>
                    ) : (
                      documents.map(document => (
                        <tr key={getDocumentKey(document)}>
                          <td className="whitespace-nowrap px-4 py-4 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={!!selectedDocuments[getDocumentKey(document)]}
                              onChange={event => toggleDocumentSelection(document, event.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-900">
                            {document.file_name}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {document.module_label}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {document.entity_label}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {document.doc_type || '-'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {document.source}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {formatFileSize(document.file_size)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {formatDate(document.uploaded_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-medium">
                            {isPreviewable(document) && (
                              <button
                                type="button"
                                onClick={() => setPreviewDocument(document)}
                                className="text-primary-600 hover:text-primary-900"
                              >
                                預覽
                              </button>
                            )}
                            <a
                              href={document.download_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-primary-600 hover:text-primary-900"
                            >
                              下載
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {documentList && documentList.total > 0 && (
                <nav
                  className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6"
                  aria-label="Pagination"
                >
                  <div className="flex flex-1 justify-between sm:justify-end">
                    <button
                      onClick={() => setPage(prev => Math.max(1, prev - 1))}
                      disabled={page === 1 || loading}
                      className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      上一頁
                    </button>
                    <button
                      onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={page === totalPages || loading}
                      className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      下一頁
                    </button>
                  </div>
                </nav>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{previewDocument.file_name}</h3>
              <button
                type="button"
                onClick={() => setPreviewDocument(null)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50 p-6">
              {isImage(previewDocument) ? (
                <div className="flex h-full items-center justify-center">
                  <img
                    src={previewUrl}
                    alt={previewDocument.file_name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : previewDocument.mime_type === 'application/pdf' || /\.pdf$/i.test(previewDocument.file_name) ? (
                <iframe src={previewUrl} className="h-full w-full rounded border border-gray-200" title="PDF Preview" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <iframe src={previewUrl} className="h-full w-full rounded border border-gray-200 bg-white" title="Text Preview" />
                </div>
              )}
            </div>
            <div className="border-t border-gray-200 px-6 py-4 text-right">
              <a
                href={previewDocument.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                下載原檔
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
