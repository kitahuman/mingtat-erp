'use client';
import { useState, useEffect } from 'react';
import { bankReconciliationApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { format, parseISO } from 'date-fns';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  recordType: 'payment_in' | 'payment_out';
  recordId: number;
  recordAmount: number;
  recordDate: string;
  onSuccess: () => void;
}

export default function PaymentMatchModal({
  isOpen,
  onClose,
  recordType,
  recordId,
  recordAmount,
  recordDate,
  onSuccess,
}: Props) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && recordId) {
      loadCandidates();
      setSelectedTxId(null);
    }
    return () => { setCandidates([]); setSelectedTxId(null); };
  }, [isOpen, recordId]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const res = await bankReconciliationApi.findBankCandidates(recordType, recordId);
      setCandidates(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMatch = async () => {
    if (!selectedTxId) return;
    setSubmitting(true);
    try {
      await bankReconciliationApi.matchFromRecord(selectedTxId, recordType, recordId);
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const fmtMoney = (val: any) =>
    Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string) => {
    try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d; }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="手動配對銀行記錄">
      <div className="space-y-4">
        {/* Current record info */}
        <div className="bg-blue-50 rounded-lg p-3 text-sm">
          <div className="font-medium text-blue-800 mb-1">
            {recordType === 'payment_in' ? '收款記錄' : '付款記錄'}
          </div>
          <div className="text-blue-700">
            金額：<span className="font-semibold">HK${fmtMoney(recordAmount)}</span>
            　日期：{fmtDate(recordDate)}
          </div>
        </div>

        {/* Candidates list */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">
            選擇要配對的銀行月結單記錄：
          </div>
          {loading ? (
            <div className="text-center py-6 text-gray-400 text-sm">載入中...</div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              找不到符合條件的銀行記錄（±30 天、相同銀行帳戶）
            </div>
          ) : (
            <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
              {candidates.map((tx) => {
                const isSelected = selectedTxId === tx.id;
                const amountMatch = Math.abs(Math.abs(Number(tx.amount)) - Math.abs(Number(recordAmount))) < 0.01;
                return (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTxId(isSelected ? null : tx.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-l-2 border-l-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => setSelectedTxId(tx.id)}
                      className="flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">
                          {fmtDate(tx.date)}
                        </span>
                        <span className={`text-sm font-semibold ${amountMatch ? 'text-green-600' : 'text-gray-700'}`}>
                          HK${fmtMoney(Math.abs(Number(tx.amount)))}
                        </span>
                        {amountMatch && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">金額吻合</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {tx.description}
                        {tx.reference_no && <span className="ml-2 text-gray-400">Ref: {tx.reference_no}</span>}
                      </div>
                      {tx.bank_account && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {tx.bank_account.company?.internal_prefix} · {tx.bank_account.bank_name} {tx.bank_account.account_no}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleMatch}
            disabled={!selectedTxId || submitting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? '配對中...' : '確認配對'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
