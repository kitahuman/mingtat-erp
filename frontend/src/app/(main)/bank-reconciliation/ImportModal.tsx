'use client';
import { useState } from 'react';
import { bankReconciliationApi } from '@/lib/api';
import Modal from '@/components/Modal';

type ImportMode = 'csv' | 'pdf';

export default function ImportModal({ isOpen, onClose, bankAccountId, onSuccess }: any) {
  const [mode, setMode] = useState<ImportMode>('csv');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setFile(null);
    setPreview([]);
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ── CSV parsing ──
  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(r => r.trim());
    if (lines.length < 2) throw new Error('CSV 檔案至少需要標題行和一行資料');

    // Skip header row
    const dataLines = lines.slice(1);
    const rows: any[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      if (!line) continue;

      // Parse CSV (handle quoted fields)
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === ',' && !inQuotes) { parts.push(current.trim()); current = ''; continue; }
        current += char;
      }
      parts.push(current.trim());

      if (parts.length < 3) continue;

      const [dateStr, description, amountStr, balanceStr, refStr] = parts;

      // Parse date: try DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
      let isoDate = '';
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [d, m, y] = dateStr.split('/');
        isoDate = `${y}-${m}-${d}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        isoDate = dateStr;
      } else if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
        const [d, m, y] = dateStr.split('-');
        isoDate = `${y}-${m}-${d}`;
      } else {
        // Try to parse anyway
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          isoDate = parsed.toISOString().split('T')[0];
        } else {
          continue; // Skip unparseable rows
        }
      }

      const amount = parseFloat(amountStr?.replace(/,/g, '') || '0');
      if (isNaN(amount)) continue;

      const balance = balanceStr ? parseFloat(balanceStr.replace(/,/g, '')) : null;

      rows.push({
        date: isoDate,
        description: description || '',
        amount,
        balance: balance && !isNaN(balance) ? balance : null,
        reference_no: refStr || null,
      });
    }

    return rows;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');

    if (mode === 'csv') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const rows = parseCSV(text);
          if (rows.length === 0) {
            setError('無法解析 CSV 檔案，請檢查格式。');
            setPreview([]);
            return;
          }
          setPreview(rows.slice(0, 10));
        } catch (err: any) {
          setError(err.message || '解析 CSV 檔案時出錯');
          setPreview([]);
        }
      };
      reader.readAsText(f);
    }
    // PDF mode: just show file name, no preview
  };

  const handleImport = async () => {
    if (!file || !bankAccountId) return;
    setLoading(true);
    setError('');

    try {
      if (mode === 'csv') {
        const text = await file.text();
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setError('無法解析 CSV 檔案');
          setLoading(false);
          return;
        }
        const result = await bankReconciliationApi.importTransactions(bankAccountId, rows);
        alert(`匯入完成：成功 ${result.data.imported} 筆，跳過重複 ${result.data.skipped} 筆`);
        onSuccess();
        handleClose();
      } else {
        // PDF mode: placeholder for future AI integration
        alert('PDF 匯入功能開發中，請先使用 CSV 格式匯入。');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || '匯入失敗，請檢查檔案格式。');
    } finally {
      setLoading(false);
    }
  };

  const fmtMoney = (val: any) => {
    if (val == null) return '—';
    return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="匯入銀行月結單" size="lg">
      <div className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('csv'); reset(); }}
            className={`px-4 py-2 text-sm rounded-lg border transition-colors ${mode === 'csv' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            CSV 檔案
          </button>
          <button
            onClick={() => { setMode('pdf'); reset(); }}
            className={`px-4 py-2 text-sm rounded-lg border transition-colors ${mode === 'pdf' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            PDF 檔案 <span className="text-[10px] ml-1 opacity-70">(AI 辨識)</span>
          </button>
        </div>

        {/* Upload Area */}
        <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-2 hover:border-blue-300 transition-colors">
          <input
            type="file"
            accept={mode === 'csv' ? '.csv,.txt' : '.pdf'}
            onChange={handleFileChange}
            className="hidden"
            id="statement-upload"
            key={mode} // Reset input when mode changes
          />
          <label htmlFor="statement-upload" className="cursor-pointer block">
            {file ? (
              <div className="text-blue-600 font-medium">{file.name}</div>
            ) : (
              <div className="text-blue-600 hover:underline">
                點擊上傳{mode === 'csv' ? ' CSV' : ' PDF'} 檔案
              </div>
            )}
          </label>
          {mode === 'csv' && (
            <p className="text-xs text-gray-500">
              格式：日期, 描述, 金額, 餘額(可選), 參考號(可選)<br />
              支持日期格式：DD/MM/YYYY、YYYY-MM-DD、DD-MM-YYYY
            </p>
          )}
          {mode === 'pdf' && (
            <div className="text-xs text-gray-500 space-y-1">
              <p>上傳銀行月結單 PDF，系統將使用 AI 自動辨識交易記錄</p>
              <div className="bg-amber-50 border border-amber-200 rounded p-2 mt-2 text-amber-700">
                此功能正在開發中，目前暫不可用。請先使用 CSV 格式匯入。
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* CSV Preview */}
        {mode === 'csv' && preview.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">預覽（前 {preview.length} 筆）</h3>
            <div className="max-h-60 overflow-auto border rounded-lg text-xs">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left border-b">日期</th>
                    <th className="p-2 text-left border-b">描述</th>
                    <th className="p-2 text-right border-b">金額</th>
                    <th className="p-2 text-right border-b">餘額</th>
                    <th className="p-2 text-left border-b">參考號</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="p-2">{p.date}</td>
                      <td className="p-2 truncate max-w-[200px]">{p.description}</td>
                      <td className={`p-2 text-right font-medium ${p.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmtMoney(p.amount)}
                      </td>
                      <td className="p-2 text-right text-gray-500">{fmtMoney(p.balance)}</td>
                      <td className="p-2 text-gray-500">{p.reference_no || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={!file || loading || (mode === 'pdf')}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? '匯入中...' : '確認匯入'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
