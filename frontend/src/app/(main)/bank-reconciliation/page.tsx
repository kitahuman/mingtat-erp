'use client';
import { useState, useEffect, useCallback } from 'react';
import { bankAccountsApi, bankReconciliationApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import { format } from 'date-fns';
import ImportModal from './ImportModal';
import MatchModal from './MatchModal';

export default function BankReconciliationPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);

  const loadAccounts = async () => {
    const res = await bankAccountsApi.simple();
    setAccounts(res.data);
    if (res.data.length > 0 && !selectedAccountId) {
      setSelectedAccountId(res.data[0].id);
    }
  };

  const loadData = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const [txRes, summaryRes] = await Promise.all([
        bankReconciliationApi.findTransactions({ bank_account_id: selectedAccountId, page, limit: 20 }),
        bankReconciliationApi.getSummary(selectedAccountId)
      ]);
      setTransactions(txRes.data.items);
      setTotal(txRes.data.total);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, page]);

  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const columns = [
    { key: 'date', label: '日期', render: (val: string) => format(new Date(val), 'dd/MM/yyyy') },
    { key: 'description', label: '交易描述' },
    { 
      key: 'amount', 
      label: '金額', 
      render: (val: any) => (
        <span className={Number(val) >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ) 
    },
    { 
      key: 'match_status', 
      label: '狀態', 
      render: (val: string) => {
        const styles: any = {
          matched: { bg: 'bg-green-100', text: 'text-green-800', label: '已配對' },
          unmatched: { bg: 'bg-red-100', text: 'text-red-800', label: '未配對' },
          excluded: { bg: 'bg-gray-100', text: 'text-gray-800', label: '已排除' },
        };
        const s = styles[val] || styles.unmatched;
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
            {s.label}
          </span>
        );
      }
    },
    {
      key: '_actions',
      label: '操作',
      render: (_: any, row: any) => (
        <div className="flex gap-2">
          {row.match_status === 'unmatched' && (
            <button 
              onClick={() => { setSelectedTx(row); setIsMatchModalOpen(true); }}
              className="px-2 py-1 text-xs border rounded hover:bg-gray-50 transition-colors"
            >
              配對
            </button>
          )}
          {row.match_status === 'matched' && (
            <button 
              onClick={async () => { await bankReconciliationApi.unmatch(row.id); loadData(); }}
              className="px-2 py-1 text-xs text-gray-500 hover:text-red-500 transition-colors"
            >
              取消配對
            </button>
          )}
          {row.match_status === 'unmatched' && (
            <button 
              onClick={async () => { await bankReconciliationApi.exclude(row.id); loadData(); }}
              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              排除
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">銀行對帳</h1>
          <select 
            className="border rounded-lg px-3 py-2 bg-white text-sm"
            value={selectedAccountId || ''}
            onChange={(e) => setSelectedAccountId(Number(e.target.value))}
          >
            {accounts.map((a: any) => (
              <option key={a.id} value={a.id}>{a.bank_name} - {a.account_name} ({a.account_no})</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={loadData} 
            disabled={loading}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? '載入中...' : '重新整理'}
          </button>
          <button 
            onClick={() => setIsImportModalOpen(true)} 
            disabled={!selectedAccountId}
            className="btn-primary"
          >
            匯入月結單
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border shadow-sm">
            <div className="text-sm text-gray-500">總交易筆數</div>
            <div className="text-2xl font-bold">{summary.total_count}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border shadow-sm border-l-4 border-l-green-500">
            <div className="text-sm text-gray-500">已配對筆數</div>
            <div className="text-2xl font-bold text-green-600">{summary.matched_count}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border shadow-sm border-l-4 border-l-red-500">
            <div className="text-sm text-gray-500">未配對筆數</div>
            <div className="text-2xl font-bold text-red-600">{summary.unmatched_count}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border shadow-sm border-l-4 border-l-gray-400">
            <div className="text-sm text-gray-500">已配對金額</div>
            <div className="text-2xl font-bold">${Number(summary.matched_amount).toLocaleString()}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <DataTable
          columns={columns}
          data={transactions}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          loading={loading}
        />
      </div>

      <ImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        bankAccountId={selectedAccountId} 
        onSuccess={loadData} 
      />
      <MatchModal
        isOpen={isMatchModalOpen}
        onClose={() => { setIsMatchModalOpen(false); setSelectedTx(null); }}
        tx={selectedTx}
        onSuccess={loadData}
      />
    </div>
  );
}
