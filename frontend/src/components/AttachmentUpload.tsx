'use client';

import { useEffect, useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { attachmentsApi, AttachmentEntityType } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

interface AttachmentUploadProps {
  entityType: AttachmentEntityType;
  entityId: number;
  title?: string;
  readOnly?: boolean;
}

interface AttachmentRecord {
  id: number;
  attachment_filename: string;
  attachment_file_size?: number | null;
  attachment_mime_type?: string | null;
  attachment_description?: string | null;
  attachment_remarks?: string | null;
  attachment_created_at?: string | null;
}

interface ApiErrorResponse {
  response?: {
    data?: {
      message?: string | string[];
    };
  };
}

const getErrorMessage = (error: unknown, fallback: string) => {
  const apiError = error as ApiErrorResponse;
  const message = apiError.response?.data?.message;
  if (Array.isArray(message)) return message.join('、');
  return message || fallback;
};

export default function AttachmentUpload({
  entityType,
  entityId,
  title = '文件管理',
  readOnly = false,
}: AttachmentUploadProps) {
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [editingRemarks, setEditingRemarks] = useState<Record<number, string>>({});
  const [savingRemarks, setSavingRemarks] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  const loadAttachments = async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const res = await attachmentsApi.list(entityType, entityId);
      setAttachments(res.data || []);
      // Initialize editingRemarks with current remarks
      const remarks: Record<number, string> = {};
      (res.data || []).forEach((att: AttachmentRecord) => {
        remarks[att.id] = att.attachment_remarks || '';
      });
      setEditingRemarks(remarks);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttachments();
  }, [entityType, entityId]);

  const getUrl = (id: number, action: 'download' | 'preview') => {
    const token = Cookies.get('token') || '';
    const baseUrl = action === 'download' ? attachmentsApi.download(id) : attachmentsApi.preview(id);
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileTypeLabel = (mimeType?: string | null) => {
    if (!mimeType) return '文件';
    if (mimeType.startsWith('image/')) return '圖片';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'Word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel';
    if (mimeType.includes('text')) return '文字';
    return mimeType.split('/').pop()?.toUpperCase() || '文件';
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter') {
      dragCounterRef.current += 1;
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      dragCounterRef.current -= 1;
      if (dragCounterRef.current === 0) {
        setDragActive(false);
      }
    } else if (e.type === 'dragover') {
      setDragActive(true);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    // Auto-upload files directly from drag-and-drop
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        await attachmentsApi.upload(entityType, entityId, formData);
      }
      await loadAttachments();
    } catch (err: unknown) {
      alert(getErrorMessage(err, '上傳失敗'));
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    const files = Array.from(fileRef.current?.files || []);
    if (files.length === 0) {
      alert('請選擇文件');
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        if (description.trim()) {
          formData.append('attachment_description', description.trim());
        }
        await attachmentsApi.upload(entityType, entityId, formData);
      }
      setShowForm(false);
      setDescription('');
      setSelectedFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      await loadAttachments();
    } catch (err: unknown) {
      alert(getErrorMessage(err, '上傳失敗'));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveRemarks = async (attachmentId: number) => {
    const remarks = editingRemarks[attachmentId] || '';
    setSavingRemarks((prev) => ({ ...prev, [attachmentId]: true }));
    try {
      await attachmentsApi.update(attachmentId, { attachment_remarks: remarks });
      await loadAttachments();
    } catch (err: unknown) {
      alert(getErrorMessage(err, '保存備註失敗'));
    } finally {
      setSavingRemarks((prev) => ({ ...prev, [attachmentId]: false }));
    }
  };

  const handleDelete = async (attachment: AttachmentRecord) => {
    if (readOnly) return;
    if (!confirm(`確定要刪除文件「${attachment.attachment_filename}」？`)) return;
    try {
      await attachmentsApi.remove(attachment.id);
      await loadAttachments();
    } catch (err: unknown) {
      alert(getErrorMessage(err, '刪除失敗'));
    }
  };

  return (
    <div
      ref={cardRef}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`bg-white rounded-xl border-2 shadow-sm p-5 space-y-4 transition-all relative ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      }`}
    >
      {/* Drag & Drop Overlay */}
      {dragActive && (
        <div className="absolute inset-0 bg-blue-500 bg-opacity-10 rounded-xl flex items-center justify-center pointer-events-none z-10">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 mb-2">放開以上傳文件</div>
            <div className="text-sm text-blue-500">將文件拖放到此區域</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-1">可上傳圖則、掃描本、PDF、Office 文件、圖片及其他類型文件。</p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary text-sm whitespace-nowrap"
          >
            {showForm ? '取消' : '上傳文件'}
          </button>
        )}
      </div>

      {showForm && !readOnly && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">選擇文件 *</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition bg-gray-50">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setSelectedFiles(files);
                  }}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input" className="cursor-pointer block">
                  {selectedFiles.length > 0 ? (
                    <div className="text-sm">
                      <div className="font-medium text-green-700 mb-1">已選擇 {selectedFiles.length} 個文件：</div>
                      <div className="space-y-0.5">
                        {selectedFiles.map((file, idx) => (
                          <div key={idx} className="text-xs text-gray-700 truncate max-w-[300px]" title={file.name}>
                            {file.name} ({(file.size / 1024).toFixed(0)} KB)
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-blue-500 mt-1">點擊重新選擇</div>
                    </div>
                  ) : (
                    <div className="text-gray-600 text-sm">
                      <div className="font-medium">點擊選擇文件或拖放到此處</div>
                      <div className="text-xs text-gray-500 mt-1">單個文件最大 100MB</div>
                    </div>
                  )}
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註（可選）</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field"
                placeholder="例如：正本掃描、圖則、往來文件"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={handleUpload} disabled={uploading} className="btn-primary text-sm">
              {uploading ? '上傳中...' : '確認上傳'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500">載入中...</div>
      ) : attachments.length === 0 ? (
        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          暫無文件
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left font-semibold text-gray-600">文件名稱</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">類型</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">大小</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">備註</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">上傳日期</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((attachment) => (
                <tr key={attachment.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-900 truncate max-w-[260px] inline-block" title={attachment.attachment_filename}>
                      {attachment.attachment_filename}
                    </span>
                  </td>
                  <td className="px-4 py-2"><span className="badge-blue">{getFileTypeLabel(attachment.attachment_mime_type)}</span></td>
                  <td className="px-4 py-2 text-gray-500">{formatFileSize(attachment.attachment_file_size)}</td>
                  <td className="px-4 py-2">
                    {readOnly ? (
                      <span className="text-gray-500 max-w-[240px] truncate inline-block" title={attachment.attachment_remarks || ''}>
                        {attachment.attachment_remarks || '-'}
                      </span>
                    ) : (
                      <div className="flex gap-2 items-center max-w-[240px]">
                        <input
                          type="text"
                          value={editingRemarks[attachment.id] || ''}
                          onChange={(e) =>
                            setEditingRemarks((prev) => ({
                              ...prev,
                              [attachment.id]: e.target.value,
                            }))
                          }
                          className="input-field text-xs flex-1 py-1"
                          placeholder="添加備註..."
                        />
                        {editingRemarks[attachment.id] !== (attachment.attachment_remarks || '') && (
                          <button
                            type="button"
                            onClick={() => handleSaveRemarks(attachment.id)}
                            disabled={savingRemarks[attachment.id]}
                            className="text-blue-600 hover:underline text-xs whitespace-nowrap"
                          >
                            {savingRemarks[attachment.id] ? '保存中...' : '保存'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{attachment.attachment_created_at ? fmtDate(attachment.attachment_created_at) : '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2 whitespace-nowrap">
                      <a href={getUrl(attachment.id, 'preview')} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">預覽</a>
                      <a href={getUrl(attachment.id, 'download')} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">下載</a>
                      {!readOnly && (
                        <button type="button" onClick={() => handleDelete(attachment)} className="text-red-600 hover:underline text-xs">刪除</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
