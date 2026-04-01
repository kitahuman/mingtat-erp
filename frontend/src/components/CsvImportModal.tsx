'use client';
import { useState, useRef } from 'react';
import { csvImportApi } from '@/lib/api';

interface Props {
  module: string;
  moduleName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'upload' | 'preview' | 'result';

export default function CsvImportModal({ module, moduleName, isOpen, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [csvData, setCsvData] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setCsvData('');
    setPreview(null);
    setResult(null);
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await csvImportApi.getTemplate(module);
      const { csvHeader, csvDescription } = res.data;
      const bom = '\uFEFF';
      const content = bom + csvHeader + '\n' + csvDescription + '\n';
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${module}_template.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.message || '下載範本失敗');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvData(ev.target?.result as string);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handlePreview = async () => {
    if (!csvData.trim()) {
      setError('請先選擇 CSV 檔案');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await csvImportApi.preview(module, csvData);
      setPreview(res.data);
      setStep('preview');
    } catch (err: any) {
      setError(err.response?.data?.message || '預覽失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!preview?.rows) return;
    setLoading(true);
    setError('');
    try {
      const res = await csvImportApi.execute(module, preview.rows);
      setResult(res.data);
      setStep('result');
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || '匯入失敗');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            CSV 匯入 - {moduleName}
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Steps indicator */}
        <div className="px-6 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-4 text-sm">
            <span className={`flex items-center gap-1 ${step === 'upload' ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>1</span>
              上傳檔案
            </span>
            <span className="text-gray-300">→</span>
            <span className={`flex items-center gap-1 ${step === 'preview' ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>2</span>
              預覽確認
            </span>
            <span className="text-gray-300">→</span>
            <span className={`flex items-center gap-1 ${step === 'result' ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 'result' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>3</span>
              匯入結果
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">使用說明</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>先下載 CSV 範本取得正確的欄位格式</li>
                  <li>在範本中填入資料（第二行為欄位說明，可刪除）</li>
                  <li>上傳填好的 CSV 檔案</li>
                  <li>預覽確認後執行匯入</li>
                </ol>
              </div>

              <div>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300 text-sm font-medium"
                >
                  下載 CSV 範本
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">選擇 CSV 檔案</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              {csvData && (
                <div>
                  <p className="text-sm text-green-600 mb-2">
                    已載入檔案，共 {csvData.split('\n').filter(l => l.trim()).length - 1} 行數據
                  </p>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-auto">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap">{csvData.slice(0, 500)}{csvData.length > 500 ? '...' : ''}</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">共 {preview.totalRows} 行數據</span>
                {preview.errorCount > 0 && (
                  <span className="text-sm text-red-600 font-medium">{preview.errorCount} 個錯誤</span>
                )}
              </div>

              {preview.errors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-32 overflow-auto">
                  <h4 className="font-medium text-red-800 mb-2 text-sm">錯誤列表</h4>
                  {preview.errors.map((e: any, i: number) => (
                    <p key={i} className="text-xs text-red-700">
                      第 {e.row} 行 - {e.field}: {e.message}
                    </p>
                  ))}
                </div>
              )}

              <div className="overflow-auto max-h-96 border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-600">行號</th>
                      {preview.rows?.[0] && Object.keys(preview.rows[0]).filter(k => k !== '_rowNumber').map(key => (
                        <th key={key} className="px-2 py-1.5 text-left font-medium text-gray-600">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows?.map((row: any, i: number) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="px-2 py-1 text-gray-400">{row._rowNumber}</td>
                        {Object.entries(row).filter(([k]) => k !== '_rowNumber').map(([key, val]) => (
                          <td key={key} className="px-2 py-1">{String(val ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{result.summary.total}</p>
                  <p className="text-xs text-blue-600">總計</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.summary.created}</p>
                  <p className="text-xs text-green-600">新增</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{result.summary.updated}</p>
                  <p className="text-xs text-yellow-600">更新</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{result.summary.errors}</p>
                  <p className="text-xs text-red-600">失敗</p>
                </div>
              </div>

              {result.results?.filter((r: any) => r.status === 'error').length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-auto">
                  <h4 className="font-medium text-red-800 mb-2 text-sm">失敗記錄</h4>
                  {result.results.filter((r: any) => r.status === 'error').map((r: any, i: number) => (
                    <p key={i} className="text-xs text-red-700">第 {r.row} 行: {r.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div>
            {step === 'preview' && (
              <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                返回上一步
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">
              {step === 'result' ? '關閉' : '取消'}
            </button>
            {step === 'upload' && (
              <button
                onClick={handlePreview}
                disabled={!csvData || loading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '處理中...' : '預覽'}
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleExecute}
                disabled={loading || (preview?.errorCount > 0)}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? '匯入中...' : `確認匯入 (${preview?.totalRows} 筆)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
