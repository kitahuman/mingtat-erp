'use client';
import { useState } from 'react';
import { bankReconciliationApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';

export default function ImportModal({ isOpen, onClose, bankAccountId, onSuccess }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const rows = text.split('\n').slice(1).filter(r => r.trim()); // Simple CSV parse
        const data = rows.map(r => {
          const parts = r.split(',').map(s => s.trim().replace(/"/g, ''));
          const [date, description, amount, balance, ref] = parts;
          return { date, description, amount: parseFloat(amount), balance: parseFloat(balance), reference_no: ref };
        });
        setPreview(data.slice(0, 10));
      };
      reader.readAsText(f);
    }
  };

  const handleImport = async () => {
    if (!file || !bankAccountId) return;
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        const rows = text.split('\n').slice(1).filter(r => r.trim()).map(r => {
          const parts = r.split(',').map(s => s.trim().replace(/"/g, ''));
          const [date, description, amount, balance, ref] = parts;
          // Handle DD/MM/YYYY
          const [d, m, y] = date.split('/');
          const isoDate = `${y}-${m}-${d}`;
          return { date: isoDate, description, amount: parseFloat(amount), balance: parseFloat(balance), reference_no: ref };
        });
        await bankReconciliationApi.importTransactions(bankAccountId, rows);
        onSuccess();
        onClose();
        setFile(null);
        setPreview([]);
      };
      reader.readAsText(file);
    } catch (err) {
      console.error(err);
      alert('匯入失敗，請檢查 CSV 格式。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="匯入銀行月結單" size="lg">
      <div className="space-y-4">
        <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-2">
          <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-upload" />
          <label htmlFor="csv-upload" className="cursor-pointer text-blue-600 hover:underline block">
            {file ? file.name : '點擊或拖拽上傳 CSV 檔案'}
          </label>
          <p className="text-xs text-gray-500">格式：日期 (DD/MM/YYYY), 描述, 金額, 餘額, 參考號</p>
        </div>

        {preview.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">預覽（前 10 筆）</h3>
            <div className="max-h-60 overflow-auto border rounded text-xs">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left border-b">日期</th>
                    <th className="p-2 text-left border-b">描述</th>
                    <th className="p-2 text-right border-b">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{fmtDate(p.date)}</td>
                      <td className="p-2 truncate max-w-[150px]">{p.description}</td>
                      <td className={`p-2 text-right ${p.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{p.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded transition-colors">取消</button>
          <button 
            onClick={handleImport} 
            disabled={!file || loading}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? '匯入中...' : '確認匯入'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
