'use client';

import { DragEvent, useEffect, useRef, useState } from 'react';
import { issueReportsApi } from '@/lib/api';
import { getRecentErrors } from '@/lib/errorCollector';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface UploadedScreenshot {
  path: string;
  fileName: string;
}

const MAX_SCREENSHOT_COUNT = 3;
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_SCREENSHOT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function isValidScreenshot(file: File) {
  const name = file.name.toLowerCase();
  return ALLOWED_SCREENSHOT_TYPES.includes(file.type) && ALLOWED_SCREENSHOT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function IssueReportModal({ open, onClose }: Props) {
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [screenshots, setScreenshots] = useState<UploadedScreenshot[]>([]);
  const [errorCount, setErrorCount] = useState(0);
  const [done, setDone] = useState<null | { id: number }>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setDescription('');
      setScreenshots([]);
      setDragActive(false);
      setDone(null);
      setErrMsg(null);
      setErrorCount(getRecentErrors().length);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  if (!open) return null;

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const remainingSlots = MAX_SCREENSHOT_COUNT - screenshots.length;
    if (remainingSlots <= 0) {
      setErrMsg(`最多只能上傳 ${MAX_SCREENSHOT_COUNT} 張截圖`);
      return;
    }

    const selectedFiles = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setErrMsg(`最多只能上傳 ${MAX_SCREENSHOT_COUNT} 張截圖，已只處理前 ${remainingSlots} 張`);
    } else {
      setErrMsg(null);
    }

    for (const file of selectedFiles) {
      if (!isValidScreenshot(file)) {
        setErrMsg('截圖格式只支援 jpg、jpeg、png、gif、webp');
        return;
      }
      if (file.size > MAX_SCREENSHOT_SIZE) {
        setErrMsg('每張截圖最多 5MB');
        return;
      }
    }

    setUploading(true);
    try {
      const uploaded: UploadedScreenshot[] = [];
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await issueReportsApi.uploadScreenshot(formData);
        const path = res.data?.path || res.data?.file_path;
        if (path) {
          uploaded.push({ path, fileName: file.name });
        }
      }
      setScreenshots((prev) => [...prev, ...uploaded].slice(0, MAX_SCREENSHOT_COUNT));
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message || e?.message || '截圖上傳失敗，請稍後再試');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (submitting || uploading) return;
    await uploadFiles(event.dataTransfer.files);
  };

  const removeScreenshot = (path: string) => {
    setScreenshots((prev) => prev.filter((item) => item.path !== path));
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setErrMsg('請先填寫問題描述');
      return;
    }
    setSubmitting(true);
    setErrMsg(null);
    try {
      const errs = getRecentErrors();
      const res = await issueReportsApi.create({
        description: description.trim(),
        url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : undefined,
        frontend_errors: errs,
        screenshots: screenshots.map((item) => item.path),
      });
      setDone({ id: res.data?.id });
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message || e?.message || '送出失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
      onClick={() => { if (!submitting && !uploading) onClose(); }}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">🐞 問題回報</h3>
          <button onClick={() => { if (!submitting && !uploading) onClose(); }} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {done ? (
          <div className="p-6 space-y-3">
            <div className="text-green-600 text-sm">
              ✅ 已收到您的回報（編號 #{done.id}），系統正在分析當中。
            </div>
            <div className="text-sm text-gray-600">
              分析結果會顯示在儀表板「問題回報」區塊。通常需要 10-30 秒。
            </div>
            <div className="text-right">
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
                onClick={onClose}
              >
                完成
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                問題描述 <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="請描述您遇到的問題，例如：在儲存薪酬配置時出現錯誤..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                maxLength={5000}
              />
              <div className="text-xs text-gray-500 mt-1">{description.length}/5000</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                截圖（選填，最多 {MAX_SCREENSHOT_COUNT} 張）
              </label>
              <div
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
                onDrop={handleDrop}
                onClick={() => { if (!submitting && !uploading && screenshots.length < MAX_SCREENSHOT_COUNT) fileInputRef.current?.click(); }}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${dragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-gray-50'} ${screenshots.length >= MAX_SCREENSHOT_COUNT ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-primary-400 hover:bg-primary-50'}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                  multiple
                  className="hidden"
                  disabled={submitting || uploading || screenshots.length >= MAX_SCREENSHOT_COUNT}
                  onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); }}
                />
                <div className="text-sm text-gray-700">
                  {uploading ? '截圖上傳中...' : screenshots.length >= MAX_SCREENSHOT_COUNT ? '已達截圖上限' : '拖拽圖片到這裡，或點擊選擇圖片'}
                </div>
                <div className="text-xs text-gray-500 mt-1">支援 jpg、jpeg、png、gif、webp；每張最多 5MB</div>
              </div>

              {screenshots.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {screenshots.map((item, index) => (
                    <div key={item.path} className="relative border rounded-lg overflow-hidden bg-gray-100 group">
                      <img src={item.path} alt={`問題截圖 ${index + 1}`} className="w-full h-24 object-cover" />
                      <button
                        type="button"
                        onClick={() => removeScreenshot(item.path)}
                        disabled={submitting || uploading}
                        className="absolute top-1 right-1 bg-black/60 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 disabled:opacity-50"
                        title="刪除截圖"
                      >
                        ✕
                      </button>
                      <div className="px-2 py-1 text-[11px] text-gray-600 truncate" title={item.fileName}>{item.fileName}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs text-gray-600 bg-gray-50 rounded p-3 border">
              <div className="font-medium mb-1">📎 系統將自動附帶</div>
              <ul className="list-disc list-inside space-y-0.5">
                <li>當前頁面網址</li>
                <li>最近 5 分鐘前端錯誤記錄（{errorCount} 筆）</li>
                <li>最近 5 分鐘後端 API 錯誤（由後端從錯誤日誌查詢）</li>
                <li>瀏覽器資訊</li>
                {screenshots.length > 0 && <li>手動上傳截圖（{screenshots.length} 張）</li>}
              </ul>
              <div className="text-[11px] text-gray-500 mt-1">以上資訊用於 AI 輔助分析問題，幫助工程團隊更快定位並修復。</div>
            </div>
            {errMsg && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{errMsg}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                disabled={submitting || uploading}
                onClick={() => { if (!submitting && !uploading) onClose(); }}
                className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                disabled={submitting || uploading || !description.trim()}
                onClick={handleSubmit}
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                {submitting ? '送出中...' : uploading ? '截圖上傳中...' : '送出回報'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
