'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import DateInput from '@/components/DateInput';
import { bankReconciliationApi } from '@/lib/api';

interface ExportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAccount: {
    id: number;
    bank_name: string;
    account_name: string;
    account_no: string;
    currency?: string;
    company?: { name: string };
  } | null;
  defaultDateFrom?: string;
  defaultDateTo?: string;
}

export default function ExportExcelModal({
  isOpen,
  onClose,
  selectedAccount,
  defaultDateFrom = '',
  defaultDateTo = '',
}: ExportExcelModalProps) {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError('');
    try {
      const res = await bankReconciliationApi.exportExcel({
        bank_account_id: selectedAccount.id,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      // Trigger browser download
      const blob = new Blob([res.data as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      const safeAccountNo = selectedAccount.account_no.replace(/[^a-zA-Z0-9-]/g, '_');
      a.href = url;
      a.download = `bank_reconciliation_${safeAccountNo}_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError('匯出失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="匯出 Excel" size="md">
      <div className="space-y-4">
        {/* Account Info */}
        {selectedAccount ? (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-xs font-semibold text-blue-700 mb-1">銀行帳戶資訊</div>
            {selectedAccount.company?.name && (
              <div className="text-sm text-gray-700">
                <span className="text-gray-500 text-xs">公司：</span>
                <span className="font-medium">{selectedAccount.company.name}</span>
              </div>
            )}
            <div className="text-sm text-gray-700">
              <span className="text-gray-500 text-xs">銀行：</span>
              <span className="font-medium">{selectedAccount.bank_name}</span>
            </div>
            <div className="text-sm text-gray-700">
              <span className="text-gray-500 text-xs">帳戶名稱：</span>
              <span className="font-medium">{selectedAccount.account_name}</span>
            </div>
            <div className="text-sm text-gray-700">
              <span className="text-gray-500 text-xs">帳號：</span>
              <span className="font-mono font-medium">{selectedAccount.account_no}</span>
              {selectedAccount.currency && (
                <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded font-bold">
                  {selectedAccount.currency}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            請先選擇銀行帳戶
          </div>
        )}

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              開始日期
            </label>
            <DateInput
              value={dateFrom}
              onChange={(v) => setDateFrom(v)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              結束日期
            </label>
            <DateInput
              value={dateTo}
              onChange={(v) => setDateTo(v)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <p className="text-xs text-gray-400">
          如不選擇日期範圍，將匯出該帳戶所有交易記錄。
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={loading || !selectedAccount}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                匯出中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                確認匯出
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
