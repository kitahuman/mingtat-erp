'use client';
import { useState, useEffect } from 'react';
import Modal from '@/components/Modal';
import { attendancesApi } from '@/lib/api';

interface AttendanceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'range' | 'preview' | 'importing' | 'result';

interface ConversionResult {
  dryRun: boolean;
  created: number;
  skipped: number;
  totalCandidates: number;
  results: Array<{
    employee_id: number;
    employee_name?: string;
    scheduled_date: string;
    start_time?: string | null;
    end_time?: string | null;
    gps_location?: string | null;
    status: 'created' | 'skipped' | 'preview';
    reason?: string;
  }>;
}

export default function AttendanceImportModal({ isOpen, onClose, onSuccess }: AttendanceImportModalProps) {
  const [step, setStep] = useState<Step>('range');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);

  // Initialize dates to current month on open
  useEffect(() => {
    if (isOpen && !dateFrom) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const toIso = (d: Date) => d.toISOString().split('T')[0];
      setDateFrom(toIso(firstDay));
      setDateTo(toIso(lastDay));
      setStep('range');
      setError(null);
      setResult(null);
    }
  }, [isOpen]);

  const handlePreview = async () => {
    if (!dateFrom || !dateTo) {
      setError('請選擇日期範圍');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await attendancesApi.convertToWorkLog({
        date_from: dateFrom,
        date_to: dateTo,
        dryRun: true,
      });
      setResult(res.data);
      setStep('preview');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || '預覽失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await attendancesApi.convertToWorkLog({
        date_from: dateFrom,
        date_to: dateTo,
        dryRun: false,
      });
      setResult(res.data);
      setStep('result');
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || '轉入失敗');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('range');
    setError(null);
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const previewItems = result?.results.filter((item) => item.status === 'preview') ?? [];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="從打卡紀錄匯入工作日誌" size="xl">
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded">
            {error}
          </div>
        )}

        {step === 'range' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              請選擇打卡紀錄的日期範圍。系統會自動找出該範圍內有打卡但尚未建立工作日誌的紀錄。
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">開始日期</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">結束日期</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                取消
              </button>
              <button
                onClick={handlePreview}
                disabled={loading || !dateFrom || !dateTo}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '檢查中...' : '下一步：預覽'}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && result && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <h3 className="text-blue-800 font-medium mb-2">匯入預覽結果</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">將建立：</span>
                  <span className="font-bold text-green-600 ml-1">{result.created} 筆</span>
                </div>
                <div>
                  <span className="text-gray-600">將跳過：</span>
                  <span className="font-bold text-gray-600 ml-1">{result.skipped} 筆</span>
                </div>
              </div>
              <p className="text-xs text-blue-600 mt-3 italic">
                * 系統已排除該日期已有工作日誌的員工紀錄。
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-800">即將匯入的打卡紀錄</h4>
                <span className="text-xs text-gray-500">共 {previewItems.length} 筆</span>
              </div>
              {previewItems.length > 0 ? (
                <div className="max-h-80 overflow-y-auto overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">員工姓名</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">日期</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">上班時間</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">下班時間</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[220px]">GPS 地點</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {previewItems.map((item) => (
                        <tr key={`${item.employee_id}-${item.scheduled_date}`} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{item.employee_name || `員工 #${item.employee_id}`}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.scheduled_date}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.start_time || '—'}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.end_time || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{item.gps_location || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-4 py-6 text-sm text-gray-500 text-center bg-white">
                  沒有可匯入的打卡紀錄。
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setStep('range')}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                上一步
              </button>
              <button
                onClick={handleImport}
                disabled={loading || result.created === 0}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? '匯入中...' : '確認匯入'}
              </button>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4 text-center py-4">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 text-green-600 rounded-full mb-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">匯入完成</h3>
            <p className="text-sm text-gray-600">
              成功建立 <span className="font-bold text-green-600">{result.created}</span> 筆工作日誌。<br />
              跳過了 <span className="font-bold text-gray-400">{result.skipped}</span> 筆紀錄。
            </p>
            <div className="pt-4">
              <button
                onClick={handleClose}
                className="w-full px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                關閉
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
