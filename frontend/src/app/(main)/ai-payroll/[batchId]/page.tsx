'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { aiPayrollApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Batch = Record<string, any>;
type PageItem = Record<string, any>;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待處理', color: 'bg-yellow-100 text-yellow-800' },
  pending_extract: { label: '待識別', color: 'bg-yellow-100 text-yellow-800' },
  extracting: { label: '識別中', color: 'bg-blue-100 text-blue-800' },
  extracted: { label: '已識別', color: 'bg-indigo-100 text-indigo-800' },
  pending_review: { label: '待覆核', color: 'bg-amber-100 text-amber-800' },
  confirmed: { label: '已確認', color: 'bg-green-100 text-green-800' },
  failed: { label: '失敗', color: 'bg-red-100 text-red-800' },
};

function unwrap(data: any, key: string) {
  return data?.data || data?.[key] || data;
}

function unwrapList(data: any) {
  return Array.isArray(data) ? data : data?.data || data?.pages || data?.items || data?.results || [];
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-HK', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function pageImage(page: PageItem) {
  return page.image_base64 || page.page_image_base64 || page.thumbnail_base64 || page.image_url || page.page_image_url || page.thumbnail_url || '';
}

export default function AiPayrollBatchPage({ params }: { params: { batchId: string } }) {
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('ai-payroll');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [batchRes, pagesRes] = await Promise.all([
        aiPayrollApi.getBatch(params.batchId),
        aiPayrollApi.getPages(params.batchId),
      ]);
      setBatch(unwrap(batchRes.data, 'batch'));
      setPages(unwrapList(pagesRes.data));
    } catch (err: any) {
      const msg = err?.response?.data?.message || '載入 AI 計糧批次失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  }, [params.batchId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setSelectedFiles(Array.from(files));
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0 || readOnly) return;
    setUploading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('files', file));
      formData.append('auto_split_pages', 'true');
      await aiPayrollApi.uploadDocuments(params.batchId, formData);
      setSelectedFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || '上傳文件失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setUploading(false);
    }
  };

  const startExtraction = async () => {
    if (readOnly) return;
    if (!confirm('確定要開始 AI 識別此批次的所有待處理頁面嗎？')) return;
    setActionLoading(true);
    try {
      await aiPayrollApi.triggerBatchExtraction(params.batchId);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || '開始 AI 識別失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setActionLoading(false);
    }
  };

  const exportBatch = async () => {
    setActionLoading(true);
    try {
      const res = await aiPayrollApi.exportBatch(params.batchId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${batch?.batch_code || `ai-payroll-${params.batchId}`}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '匯出失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-gray-400">載入中...</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Link href="/ai-payroll" className="text-gray-400 hover:text-gray-600 text-lg mt-1">&larr;</Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{batch?.batch_name || batch?.title || batch?.batch_code || 'AI 計糧批次'}</h1>
            <p className="text-sm text-gray-500 mt-1">{batch?.payroll_month || batch?.month || '—'} · {batch?.payroll_period || batch?.period || '自動判斷'} · {batch?.notes || '上傳文件後可逐頁識別及覆核。'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={startExtraction} disabled={actionLoading || readOnly || pages.length === 0} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50">開始 AI 識別</button>
          <button onClick={exportBatch} disabled={actionLoading} className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50">匯出結果</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="文件數" value={batch?.document_count ?? batch?.file_count ?? '—'} />
        <Stat label="頁面數" value={batch?.page_count ?? pages.length} />
        <Stat label="已確認" value={batch?.confirmed_count ?? pages.filter((p) => (p.status || p.page_status) === 'confirmed').length} />
        <Stat label="待確認" value={batch?.pending_review_count ?? pages.filter((p) => ['pending_review', 'extracted'].includes(p.status || p.page_status)).length} />
        <Stat label="建立時間" value={<span className="text-sm">{formatDate(batch?.created_at)}</span>} />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div><h2 className="font-semibold text-gray-800">上傳照片或 PDF</h2><p className="text-xs text-gray-500 mt-1">支援多張照片、多頁 PDF；上傳採用 multipart/form-data。</p></div>
          <button onClick={() => inputRef.current?.click()} disabled={readOnly} className="px-4 py-2 rounded-lg border bg-white text-sm hover:bg-gray-50 disabled:opacity-50">選擇文件</button>
        </div>
        <div
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          className="p-6 border-2 border-dashed border-gray-200 m-5 rounded-xl text-center hover:border-primary-300"
        >
          <input ref={inputRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <div className="text-sm text-gray-600">拖放照片或 PDF 到此處，或點擊「選擇文件」。</div>
          {selectedFiles.length > 0 && <div className="mt-3 text-xs text-gray-500">已選擇 {selectedFiles.length} 個文件：{selectedFiles.map((f) => f.name).join(', ')}</div>}
          <button onClick={uploadFiles} disabled={uploading || selectedFiles.length === 0 || readOnly} className="mt-4 px-5 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50">{uploading ? '上傳中...' : '上傳文件'}</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50"><h2 className="font-semibold text-gray-800">文件頁面</h2><p className="text-xs text-gray-500 mt-1">點擊頁面進入左圖右表確認介面。</p></div>
        {pages.length === 0 ? <div className="p-12 text-center text-gray-400">尚未有頁面，請先上傳文件</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">頁面</th><th className="text-left px-4 py-3 font-medium text-gray-600">文件</th><th className="text-left px-4 py-3 font-medium text-gray-600">類型</th><th className="text-right px-4 py-3 font-medium text-gray-600">整體信心度</th><th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th><th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
              </tr></thead>
              <tbody>
                {pages.map((page, idx) => {
                  const pageId = page.id ?? page.page_id;
                  const status = page.status || page.page_status || 'pending';
                  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
                  const confidence = Number(page.confidence_overall ?? page.overall_confidence ?? 0);
                  return (
                    <tr key={String(pageId || idx)} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3"><div className="flex items-center gap-3">{pageImage(page) ? <img src={pageImage(page)} alt="頁面縮圖" className="w-12 h-16 object-cover rounded border" /> : <div className="w-12 h-16 bg-gray-100 rounded border" />}<div><div className="font-medium text-gray-800">第 {page.page_number ?? idx + 1} 頁</div><div className="text-xs text-gray-400 font-mono">ID: {pageId}</div></div></div></td>
                      <td className="px-4 py-3 max-w-[220px] truncate">{page.file_name || page.document_name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{page.form_type || page.detected_form_type || '自動判斷'}</td>
                      <td className="px-4 py-3 text-right font-mono">{confidence ? `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}%` : '—'}</td>
                      <td className="px-4 py-3 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span></td>
                      <td className="px-4 py-3 text-center"><Link href={`/ai-payroll/${params.batchId}/pages/${pageId}`} className="text-primary-600 hover:text-primary-800 font-medium text-xs">覆核確認</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500 mb-1">{label}</div><div className="text-lg font-semibold text-gray-800">{value}</div></div>;
}
