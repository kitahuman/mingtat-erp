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
    return () => { setCandidates([]); };
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
    const type = Number(tx.amount) >= 0 ? 'payment_in' : 'payment_out';
    await bankReconciliationApi.match(tx.id, type, candidateId);
    onSuccess();
    onClose();
  };

  if (!tx) return null;

  const isCredit = Number(tx.amount) >= 0;
  const fmtMoney = (val: any) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="手動配對交易" size="xl">
      <div className="space-y-4">
        {/* Target transaction info */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h3 className="text-xs font-semibold text-blue-600 mb-2 uppercase tracking-wider">待配對月結單交易</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-gray-500 text-xs">日期</span>
              <div className="font-medium">{format(new Date(tx.date), 'dd/MM/yyyy')}</div>
            </div>
            <div>
              <span className="text-gray-500 text-xs">描述</span>
              <div className="font-medium truncate" title={tx.description}>{tx.description || '—'}</div>
            </div>
            <div>
              <span className="text-gray-500 text-xs">參考號</span>
              <div className="font-medium">{tx.reference_no || '—'}</div>
            </div>
            <div>
              <span className="text-gray-500 text-xs">金額</span>
              <div className={`text-lg font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                ${fmtMoney(Math.abs(Number(tx.amount)))}
                <span className="text-xs ml-1 font-normal">{isCredit ? '(存入)' : '(提取)'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Candidates */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            建議配對選項
            <span className="text-xs font-normal text-gray-400">
              ({isCredit ? '收款記錄' : '付款記錄'}，±30日 / ±20%金額)
            </span>
          </h3>

          <div className="max-h-96 overflow-auto border rounded-lg divide-y">
            {loading ? (
              <div className="p-8 text-center text-gray-400">載入中...</div>
            ) : candidates.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <div className="text-lg mb-1">找不到建議的配對選項</div>
                <div className="text-xs">嘗試擴大日期範圍或檢查金額是否匹配</div>
              </div>
            ) : (
              candidates.map((c: any) => {
                const amountMatch = Math.abs(Number(c.amount)) === Math.abs(Number(tx.amount));
                return (
                  <div key={c.id} className={`p-3 hover:bg-gray-50 transition-colors ${amountMatch ? 'bg-green-50/50' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        {/* Line 1: Main info */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {isCredit
                              ? (c.project?.project_name || c.description || '無關聯工程')
                              : (c.expense?.supplier_name || c.expense?.item || c.company?.name || c.description || '—')
                            }
                          </span>
                          {amountMatch && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 rounded-full font-medium">金額吻合</span>
                          )}
                        </div>
                        {/* Line 2: Details */}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                          <span>📅 {format(new Date(c.date), 'dd/MM/yyyy')}</span>
                          {c.reference_no && <span>🔖 {c.reference_no}</span>}
                          {c.cheque_no && <span>📝 支票: {c.cheque_no}</span>}
                          {c.bank_account && <span>🏦 {c.bank_account.bank_name} ({c.bank_account.account_no})</span>}
                          {!isCredit && c.expense?.category?.name && <span>📁 {c.expense.category.name}</span>}
                          {isCredit && c.project?.project_no && <span>📋 {c.project.project_no}</span>}
                          {isCredit && c.contract?.contract_no && <span>📄 合約: {c.contract.contract_no}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        <div className="text-right">
                          <div className={`font-bold ${amountMatch ? 'text-green-700' : ''}`}>
                            ${fmtMoney(Number(c.amount))}
                          </div>
                          <div className="text-[10px] text-gray-400 uppercase">
                            {isCredit ? 'Payment In' : 'Payment Out'}
                          </div>
                        </div>
                        <button
                          onClick={() => handleMatch(c.id)}
                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                        >
                          配對
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
            關閉
          </button>
        </div>
      </div>
    </Modal>
  );
}
