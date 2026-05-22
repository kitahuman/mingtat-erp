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
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAttachments = async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const res = await attachmentsApi.list(entityType, entityId);
      setAttachments(res.data || []);
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
      if (fileRef.current) fileRef.current.value = '';
      await loadAttachments();
    } catch (err: unknown) {
      alert(getErrorMessage(err, '上傳失敗'));
    } finally {
      setUploading(false);
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
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
              <input ref={fileRef} type="file" multiple className="input-field text-sm" />
              <p className="text-xs text-gray-500 mt-1">可一次選擇多個文件，單個文件最大 100MB。</p>
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
                  <td className="px-4 py-2 text-gray-500 max-w-[240px] truncate" title={attachment.attachment_description || ''}>
                    {attachment.attachment_description || '-'}
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
