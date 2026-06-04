
'use client';

import { FormEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  documentManagementApi,
  documentFoldersApi,
  UnifiedDocumentItem,
  UnifiedDocumentListResponse,
  DocumentTreeNode,
} from '@/lib/api';
import AttachmentUpload from '@/components/AttachmentUpload';
import Modal from '@/components/Modal';

interface Filters {
  q: string;
  file_name: string;
  module: string;
  date_from: string;
  date_to: string;
}

interface SelectedDocument {
  source: UnifiedDocumentItem['source'];
  id: string;
  file_name: string;
}


type FolderModalMode = 'create-root' | 'create-child' | 'rename';

interface FolderModalState {
  isOpen: boolean;
  mode: FolderModalMode;
  parentId: number | null;
  folderId: number | null;
  title: string;
  initialName: string;
}

const closedFolderModal: FolderModalState = {
  isOpen: false,
  mode: 'create-root',
  parentId: null,
  folderId: null,
  title: '',
  initialName: '',
};

const defaultFilters: Filters = {
  q: '',
  file_name: '',
  module: '',
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


function parseCountedLabel(label: string) {
  return label.replace(/\s*\(\d+\)$/, '');
}

function getFolderIdFromNode(node: DocumentTreeNode | null) {
  if (!node || node.type !== 'folder') return null;
  const [, idPart] = node.value.split(':');
  const folderId = Number(idPart);
  return Number.isFinite(folderId) && folderId > 0 ? folderId : null;
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
  const [folderModal, setFolderModal] = useState<FolderModalState>(closedFolderModal);
  const [folderName, setFolderName] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<number | null>(null);

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
    const hasModuleFilter = Boolean(appliedFilters.module);

    if (!selectedNode && !hasModuleFilter) {
      setDocumentList(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params: any = { page, limit };
      if (!hasModuleFilter && selectedNode) {
        if (selectedNode.type === 'module') {
          params.module = selectedNode.value;
        } else if (selectedNode.type === 'entity' || selectedNode.type === 'folder') {
          const [module, entity_id] = selectedNode.value.split(':');
          params.module = module;
          params.entity_id = entity_id;
        } else if (selectedNode.type === 'doc_type') {
          const [module, entity_id, ...docTypeParts] = selectedNode.value.split(':');
          params.module = module;
          params.entity_id = entity_id;
          params.doc_type = docTypeParts.join(':');
        }
      }
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (!value) return;
        if (key === 'module' && value.startsWith('folder:')) {
          params.module = 'document_folder';
          params.entity_id = value.replace('folder:', '');
          return;
        }
        params[key] = value;
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

  const moduleOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const walk = (nodes: DocumentTreeNode[] = [], depth = 0) => {
      nodes.forEach(node => {
        if (node.type === 'module' && node.count > 0) {
          options.push({ value: node.value, label: node.label });
        }
        if (node.type === 'folder') {
          options.push({ value: `folder:${node.value.split(':')[1]}`, label: `${'— '.repeat(depth)}${parseCountedLabel(node.label)}` });
        }
        if (node.children) walk(node.children, depth + 1);
      });
    };
    walk(documentTree || []);
    return options;
  }, [documentTree]);
  const totalPages = documentList?.total_pages || 1;
  const documents = documentList?.data || [];
  const selectedList = Object.values(selectedDocuments);
  const selectedCount = selectedList.length;
  const allCurrentPageSelected = documents.length > 0 && documents.every(document => selectedDocuments[getDocumentKey(document)]);
  const selectedFolderId = getFolderIdFromNode(selectedNode);

  const selectTreeNode = (node: DocumentTreeNode) => {
    setSelectedNode(node);
    setPage(1);
    setSelectedDocuments({});
  };

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  };


  const openCreateRootFolder = () => {
    setOpenFolderMenuId(null);
    setFolderName('');
    setFolderModal({
      isOpen: true,
      mode: 'create-root',
      parentId: null,
      folderId: null,
      title: '新增分類',
      initialName: '',
    });
  };

  const openCreateChildFolder = (parentId: number, parentName: string, event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    setOpenFolderMenuId(null);
    setFolderName('');
    setFolderModal({
      isOpen: true,
      mode: 'create-child',
      parentId,
      folderId: null,
      title: `在「${parentName}」新增文件夾`,
      initialName: '',
    });
  };

  const openRenameFolder = (folderId: number, currentName: string) => {
    setOpenFolderMenuId(null);
    setFolderName(currentName);
    setFolderModal({
      isOpen: true,
      mode: 'rename',
      parentId: null,
      folderId,
      title: '重新命名文件夾',
      initialName: currentName,
    });
  };

  const closeFolderModal = () => {
    if (savingFolder) return;
    setFolderModal(closedFolderModal);
    setFolderName('');
  };

  const handleFolderSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) {
      setError('請輸入分類或文件夾名稱');
      return;
    }

    setSavingFolder(true);
    setError('');
    try {
      if (folderModal.mode === 'rename') {
        if (!folderModal.folderId) throw new Error('找不到要重新命名的文件夾');
        await documentFoldersApi.update(folderModal.folderId, { name });
      } else {
        await documentFoldersApi.create({ name, parent_id: folderModal.parentId });
      }
      setFolderModal(closedFolderModal);
      setFolderName('');
      await loadTree();
      await loadDocumentList();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '儲存文件夾失敗');
    } finally {
      setSavingFolder(false);
    }
  };

  const deleteFolder = async (folderId: number, folderNameToDelete: string) => {
    setOpenFolderMenuId(null);
    if (!confirm(`確定要刪除「${folderNameToDelete}」？此操作會一併移除所有子文件夾。`)) return;

    setLoading(true);
    setError('');
    try {
      await documentFoldersApi.remove(folderId);
      if (selectedFolderId === folderId) {
        setSelectedNode(null);
        setDocumentList(null);
      }
      await loadTree();
      await loadDocumentList();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '刪除文件夾失敗');
    } finally {
      setLoading(false);
    }
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


  const renderTreeNode = (node: DocumentTreeNode, depth = 0) => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = Boolean(expandedNodes[node.value]);
    const folderId = getFolderIdFromNode(node);
    const displayLabel = node.type === 'folder' ? node.label : node.label;
    const rawFolderName = parseCountedLabel(node.label);

    return (
      <div key={node.value}>
        <div
          className={`group flex cursor-pointer items-center justify-between rounded-md p-2 hover:bg-gray-50 ${selectedNode?.value === node.value ? 'bg-primary-50 text-primary-700' : ''}`}
          onClick={() => {
            selectTreeNode(node);
            if (hasChildren) setExpandedNodes(prev => ({ ...prev, [node.value]: !prev[node.value] }));
          }}
        >
          <span className="flex min-w-0 items-center gap-2 font-medium">
            {hasChildren ? (
              <svg
                className={`h-4 w-4 flex-none transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              <span className="h-4 w-4 flex-none" />
            )}
            <span className="truncate">{displayLabel}</span>
          </span>

          {folderId ? (
            <span className="relative ml-2 flex flex-none items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
              <button
                type="button"
                title="新增子文件夾"
                onClick={(event) => openCreateChildFolder(folderId, rawFolderName, event)}
                className="rounded px-1.5 py-0.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
              >
                +
              </button>
              <button
                type="button"
                title="更多操作"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenFolderMenuId(prev => prev === folderId ? null : folderId);
                }}
                className="rounded px-1.5 py-0.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                ⋯
              </button>
              {openFolderMenuId === folderId && (
                <div className="absolute right-0 top-7 z-20 w-32 rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openRenameFolder(folderId, rawFolderName);
                    }}
                    className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                  >
                    重新命名
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteFolder(folderId, rawFolderName);
                    }}
                    className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
                  >
                    刪除
                  </button>
                </div>
              )}
            </span>
          ) : null}
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-2">
            {node.children!.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
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
            disabled={loading || (!selectedNode && !appliedFilters.module)}
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
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">分類</label>
          <select
            value={filters.module}
            onChange={event => setFilters(prev => ({ ...prev, module: event.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">全部分類</option>
            {moduleOptions.map(moduleNode => (
              <option key={moduleNode.value} value={moduleNode.value}>
                {moduleNode.label}
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
        <div className="flex items-end gap-2 xl:col-span-3">
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
              {documentTree.map(moduleNode => renderTreeNode(moduleNode))}
            </div>
          )}
          <div className="mt-4 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={openCreateRootFolder}
              className="w-full rounded-lg border border-dashed border-primary-300 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
            >
              + 新增分類
            </button>
          </div>
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

          {selectedFolderId && (
            <div className="mt-6">
              <AttachmentUpload
                key={selectedFolderId}
                entityType="document_folder"
                entityId={selectedFolderId}
                title={`自訂分類文件：${parseCountedLabel(selectedNode?.label || '')}`}
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    await loadTree();
                    await loadDocumentList();
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white"
                >
                  重新整理自訂分類文件列表
                </button>
              </div>
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

      <Modal isOpen={folderModal.isOpen} onClose={closeFolderModal} title={folderModal.title} size="md">
        <form onSubmit={handleFolderSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">名稱</label>
            <input
              type="text"
              value={folderName}
              onChange={event => setFolderName(event.target.value)}
              placeholder={folderModal.mode === 'create-root' ? '例如：合約文件、保險文件、政府文件' : '輸入文件夾名稱'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={closeFolderModal}
              disabled={savingFolder}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={savingFolder}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingFolder ? '儲存中...' : folderModal.mode === 'rename' ? '更新' : '建立'}
            </button>
          </div>
        </form>
      </Modal>

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
