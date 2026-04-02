'use client';
import { useState, useEffect } from 'react';
import { bankReconciliationApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { format } from 'date-fns';

export default function MatchModal({ isOpen, onClose, tx, onSuccess }: any) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && tx) {
      loadCandidates();
    }
  }, [isOpen, tx]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const res = await bankReconciliationApi.findCandidates(tx.id);
      setCandidates(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMatch = async (candidateId: number) => {
    const type = tx.amount >= 0 ? 'payment_in' : 'payment_out';
    await bankReconciliationApi.match(tx.id, type, candidateId);
    onSuccess();
    onClose();
  };

  if (!tx) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="手動配對交易" size="lg">
      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-lg border">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">待配對銀行交易</h3>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-bold">{tx.description}</div>
              <div className="text-sm text-gray-500">{format(new Date(tx.date), 'dd/MM/yyyy')}</div>
            </div>
            <div className={`text-xl font-bold ${Number(tx.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${Number(tx.amount).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center">
            建議配對選項
          </h3>
          <div className="max-h-80 overflow-auto border rounded divide-y">
            {loading ? (
              <div className="p-8 text-center text-gray-400">載入中...</div>
            ) : candidates.length === 0 ? (
              <div className="p-8 text-center text-gray-400">找不到建議的配對選項</div>
            ) : (
              candidates.map((c: any) => (
                <div key={c.id} className="p-3 flex justify-between items-center hover:bg-gray-50 transition-colors">
                  <div>
                    <div className="font-medium">{c.project?.project_name || '無關聯工程'}</div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(c.date), 'dd/MM/yyyy')} | {c.reference_no || '無參考號'}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-bold">${Number(c.amount).toLocaleString()}</div>
                      <div className="text-[10px] uppercase text-gray-400">{tx.amount >= 0 ? 'Payment In' : 'Payment Out'}</div>
                    </div>
                    <button 
                      onClick={() => handleMatch(c.id)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      配對
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded transition-colors">關閉</button>
        </div>
      </div>
    </Modal>
  );
}
