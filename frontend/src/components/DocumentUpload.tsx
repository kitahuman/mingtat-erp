'use client';
import { useState, useEffect, useRef } from 'react';
import { documentsApi, getExpiryStatus, getExpiryColor } from '@/lib/api';
import ExpiryBadge from '@/components/ExpiryBadge';
import Cookies from 'js-cookie';

interface DocumentUploadProps {
  entityType: 'employee' | 'vehicle' | 'machinery' | 'partner' | 'company-profile';
  entityId: number;
  docTypes: string[];
}

export default function DocumentUpload({ entityType, entityId, docTypes }: DocumentUploadProps) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [docType, setDocType] = useState(docTypes[0] || '');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const res = await documentsApi.list(entityType, entityId);
      setDocs(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadDocs(); }, [entityType, entityId]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { alert('請選擇文件'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', entityType);
      formData.append('entity_id', String(entityId));
      formData.append('doc_type', docType);
      if (expiryDate) formData.append('expiry_date', expiryDate);
      if (notes) formData.append('notes', notes);
      await documentsApi.upload(formData);
      setShowForm(false);
      setDocType(docTypes[0] || '');
      setExpiryDate('');
      setNotes('');
      if (fileRef.current) fileRef.current.value = '';
      loadDocs();
    } catch (err: any) {
      alert(err.response?.data?.message || '上傳失敗');
    }
    setUploading(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除此文件嗎？')) return;
    try {
      await documentsApi.remove(id);
      loadDocs();
    } catch {}
  };

  const getDownloadUrl = (id: number) => {
    const base = process.env.NEXT_PUBLIC_API_URL || '/api';
    const token = Cookies.get('token');
    return `${base}/documents/${id}/download?token=${token}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('image/')) return '🖼️';
    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('word') || mimeType?.includes('document')) return '📝';
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return '📊';
    return '📎';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">文件管理</h3>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? '取消' : '上傳文件'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">文件類型</label>
              <select value={docType} onChange={e => setDocType(e.target.value)} className="input-field">
                {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">到期日（可選）</label>
              <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">選擇文件 *</label>
              <input type="file" ref={fileRef} className="input-field text-sm" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} className="input-field" placeholder="可選備註" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleUpload} disabled={uploading} className="btn-primary text-sm">
              {uploading ? '上傳中...' : '確認上傳'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500">載入中...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          暫無文件，點擊「上傳文件」開始管理
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left font-semibold text-gray-600">文件</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">類型</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">到期日</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">大小</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">上傳日期</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span>{getFileIcon(doc.mime_type)}</span>
                      <span className="truncate max-w-[200px]" title={doc.file_name}>{doc.file_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2"><span className="badge-blue">{doc.doc_type}</span></td>
                  <td className="px-4 py-2"><ExpiryBadge date={doc.expiry_date} /></td>
                  <td className="px-4 py-2 text-gray-500">{formatFileSize(doc.file_size)}</td>
                  <td className="px-4 py-2 text-gray-500">{doc.created_at?.split('T')[0]}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <a href={getDownloadUrl(doc.id)} target="_blank" className="text-blue-600 hover:underline text-xs">下載</a>
                      <button onClick={() => handleDelete(doc.id)} className="text-red-600 hover:underline text-xs">刪除</button>
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
