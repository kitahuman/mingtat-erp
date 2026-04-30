'use client';

import { useEffect, useState } from 'react';
import { issueReportsApi } from '@/lib/api';
import { getRecentErrors } from '@/lib/errorCollector';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function IssueReportModal({ open, onClose }: Props) {
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [done, setDone] = useState<null | { id: number }>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDescription('');
      setDone(null);
      setErrMsg(null);
      setErrorCount(getRecentErrors().length);
    }
  }, [open]);

  if (!open) return null;

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
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">🐞 問題回報</h3>
          <button onClick={() => { if (!submitting) onClose(); }} className="text-gray-400 hover:text-gray-600">✕</button>
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
            <div className="text-xs text-gray-600 bg-gray-50 rounded p-3 border">
              <div className="font-medium mb-1">📎 系統將自動附帶</div>
              <ul className="list-disc list-inside space-y-0.5">
                <li>當前頁面網址</li>
                <li>最近 5 分鐘前端錯誤記錄（{errorCount} 筆）</li>
                <li>最近 5 分鐘後端 API 錯誤（由後端從錯誤日誌查詢）</li>
                <li>瀏覽器資訊</li>
              </ul>
              <div className="text-[11px] text-gray-500 mt-1">以上資訊用於 AI 輔助分析問題，幫助工程團隊更快定位並修復。</div>
            </div>
            {errMsg && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{errMsg}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                disabled={submitting}
                onClick={() => { if (!submitting) onClose(); }}
                className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                disabled={submitting || !description.trim()}
                onClick={handleSubmit}
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                {submitting ? '送出中...' : '送出回報'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
