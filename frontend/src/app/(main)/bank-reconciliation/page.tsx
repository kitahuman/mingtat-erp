'use client';
import { useState, useEffect, useCallback } from 'react';
import { companiesApi, bankAccountsApi, bankReconciliationApi } from '@/lib/api';
import { format } from 'date-fns';
import ImportModal from './ImportModal';
import MatchModal from './MatchModal';

export default function BankReconciliationPage() {
  // ── Filter state ──
  const [companies, setCompanies] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // ── Data state ──
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // ── Modal state ──
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);

  // ── Load companies & accounts ──
  useEffect(() => {
    (async () => {
      const [compRes, accRes] = await Promise.all([
        companiesApi.simple(),
        bankAccountsApi.simple(),
      ]);
      setCompanies(compRes.data);
      setAccounts(accRes.data);
    })();
  }, []);

  // ── Filter accounts by company ──
  useEffect(() => {
    if (selectedCompanyId) {
      const filtered = accounts.filter((a: any) => a.company_id === selectedCompanyId);
      setFilteredAccounts(filtered);
      if (filtered.length > 0) {
        setSelectedAccountId(filtered[0].id);
      } else {
        setSelectedAccountId(null);
      }
    } else {
      setFilteredAccounts(accounts);
      if (accounts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accounts[0].id);
      }
    }
  }, [selectedCompanyId, accounts]);

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const txParams: any = {
        bank_account_id: selectedAccountId,
        page,
        limit,
      };
      const summaryParams: any = {};
      if (dateFrom) { txParams.date_from = dateFrom; summaryParams.date_from = dateFrom; }
      if (dateTo) { txParams.date_to = dateTo; summaryParams.date_to = dateTo; }
      if (statusFilter) txParams.match_status = statusFilter;

      const [txRes, summaryRes] = await Promise.all([
        bankReconciliationApi.findTransactions(txParams),
        bankReconciliationApi.getSummary(selectedAccountId, Object.keys(summaryParams).length > 0 ? summaryParams : undefined),
      ]);
      setTransactions(txRes.data.items);
      setTotal(txRes.data.total);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, page, dateFrom, dateTo, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Auto match all ──
  const handleAutoMatch = async () => {
    if (!selectedAccountId) return;
    setAutoMatchLoading(true);
    try {
      const res = await bankReconciliationApi.autoMatchAll(selectedAccountId);
      alert(`自動配對完成：共 ${res.data.total_unmatched} 筆未配對，成功配對 ${res.data.matched} 筆`);
      loadData();
    } catch (err) {
      console.error(err);
      alert('自動配對失敗');
    } finally {
      setAutoMatchLoading(false);
    }
  };

  // ── Helpers ──
  const fmtMoney = (val: any) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getMatchStatusIcon = (status: string) => {
    switch (status) {
      case 'matched': return <span className="text-green-600 text-lg" title="已核對">✓</span>;
      case 'excluded': return <span className="text-gray-400 text-lg" title="已排除">—</span>;
      default: return <span className="text-red-500 text-lg" title="未核對">✗</span>;
    }
  };

  const getMatchedInfo = (tx: any) => {
    if (tx.match_status !== 'matched' || !tx.matched_record) {
      return { category: '', name: '', link: '' };
    }
    const rec = tx.matched_record;
    if (tx.matched_type === 'payment_out') {
      const category = rec.expense?.category?.name || '付款';
      const name = rec.expense?.supplier_name || rec.expense?.item || rec.description || '—';
      const link = `/payment-out/${rec.id}`;
      return { category, name, link };
    } else {
      const category = '收款';
      const name = rec.project?.project_name || rec.description || '—';
      const link = `/payment-in`;
      return { category, name, link };
    }
  };

  const selectedAccount = accounts.find((a: any) => a.id === selectedAccountId);

  return (
    <div className="p-6 space-y-5">
      {/* ═══ Header ═══ */}
      <div className="flex justify-between items-start">
        <h1 className="text-2xl font-bold">銀行對帳</h1>
        <div className="flex gap-2">
          <button
            onClick={handleAutoMatch}
            disabled={!selectedAccountId || autoMatchLoading}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {autoMatchLoading ? '配對中...' : '⚡ 自動配對'}
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            disabled={!selectedAccountId}
            className="btn-primary disabled:opacity-50"
          >
            匯入月結單
          </button>
        </div>
      </div>

      {/* ═══ Filters ═══ */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Company */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">公司</label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={selectedCompanyId || ''}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value ? Number(e.target.value) : null);
                setPage(1);
              }}
            >
              <option value="">全部公司</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Bank Account */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">銀行帳戶</label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={selectedAccountId || ''}
              onChange={(e) => { setSelectedAccountId(Number(e.target.value)); setPage(1); }}
            >
              {filteredAccounts.length === 0 && <option value="">— 無帳戶 —</option>}
              {filteredAccounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.bank_name} - {a.account_name} ({a.account_no})</option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日期（從）</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日期（至）</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">核對狀態</label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">全部</option>
              <option value="unmatched">未核對</option>
              <option value="matched">已核對</option>
              <option value="excluded">已排除</option>
            </select>
          </div>
        </div>
      </div>

      {/* ═══ Summary Cards ═══ */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-white p-3 rounded-xl border shadow-sm">
            <div className="text-xs text-gray-500">總交易</div>
            <div className="text-xl font-bold">{summary.total_count}</div>
          </div>
          <div className="bg-white p-3 rounded-xl border shadow-sm border-l-4 border-l-green-500">
            <div className="text-xs text-gray-500">已核對</div>
            <div className="text-xl font-bold text-green-600">{summary.matched_count}</div>
          </div>
          <div className="bg-white p-3 rounded-xl border shadow-sm border-l-4 border-l-red-500">
            <div className="text-xs text-gray-500">未核對</div>
            <div className="text-xl font-bold text-red-600">{summary.unmatched_count}</div>
          </div>
          <div className="bg-white p-3 rounded-xl border shadow-sm border-l-4 border-l-gray-400">
            <div className="text-xs text-gray-500">已排除</div>
            <div className="text-xl font-bold text-gray-500">{summary.excluded_count}</div>
          </div>
          <div className="bg-white p-3 rounded-xl border shadow-sm">
            <div className="text-xs text-gray-500">總存入</div>
            <div className="text-lg font-bold text-green-600">${fmtMoney(summary.total_deposits)}</div>
          </div>
          <div className="bg-white p-3 rounded-xl border shadow-sm">
            <div className="text-xs text-gray-500">總提取</div>
            <div className="text-lg font-bold text-red-600">${fmtMoney(summary.total_withdrawals)}</div>
          </div>
        </div>
      )}

      {/* ═══ Bookkeeping Table (Left-Right Layout) ═══ */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Table Header */}
        <div className="bg-gray-50 border-b">
          <div className="grid grid-cols-12 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            {/* Left: From Statement */}
            <div className="col-span-7 px-4 py-3 border-r border-gray-200">
              <span className="text-blue-700">From Statement（月結單）</span>
            </div>
            {/* Right: From System */}
            <div className="col-span-4 px-4 py-3">
              <span className="text-purple-700">From System（系統記錄）</span>
            </div>
            {/* Status */}
            <div className="col-span-1 px-2 py-3 text-center">狀態</div>
          </div>
          {/* Sub-headers */}
          <div className="grid grid-cols-12 text-[11px] font-medium text-gray-500 border-t border-gray-100">
            <div className="col-span-1 px-4 py-2 border-r border-gray-100">Date</div>
            <div className="col-span-2 px-2 py-2 border-r border-gray-100">Transaction</div>
            <div className="col-span-1 px-2 py-2 border-r border-gray-100 text-center">Ref No</div>
            <div className="col-span-1 px-2 py-2 border-r border-gray-100 text-right">Withdrawals</div>
            <div className="col-span-1 px-2 py-2 border-r border-gray-100 text-right">Deposits</div>
            <div className="col-span-1 px-2 py-2 border-r border-gray-200 text-right">Balance</div>
            <div className="col-span-1 px-2 py-2 border-r border-gray-100">類別</div>
            <div className="col-span-2 px-2 py-2 border-r border-gray-100">名稱</div>
            <div className="col-span-1 px-2 py-2">關聯</div>
            <div className="col-span-1 px-2 py-2 text-center">核對</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-12 text-center text-gray-400">載入中...</div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              {selectedAccountId ? '沒有交易記錄' : '請先選擇銀行帳戶'}
            </div>
          ) : (
            transactions.map((tx: any) => {
              const isWithdrawal = Number(tx.amount) < 0;
              const matchInfo = getMatchedInfo(tx);
              return (
                <div key={tx.id} className={`grid grid-cols-12 text-sm hover:bg-gray-50 transition-colors ${tx.match_status === 'unmatched' ? 'bg-red-50/30' : ''}`}>
                  {/* Left: Statement columns */}
                  <div className="col-span-1 px-4 py-2.5 border-r border-gray-50 text-xs text-gray-600">
                    {format(new Date(tx.date), 'dd/MM/yy')}
                  </div>
                  <div className="col-span-2 px-2 py-2.5 border-r border-gray-50 truncate text-xs" title={tx.description}>
                    {tx.description || '—'}
                  </div>
                  <div className="col-span-1 px-2 py-2.5 border-r border-gray-50 text-center text-xs text-gray-500">
                    {tx.reference_no || '—'}
                  </div>
                  <div className="col-span-1 px-2 py-2.5 border-r border-gray-50 text-right text-xs">
                    {isWithdrawal ? (
                      <span className="text-red-600 font-medium">{fmtMoney(Math.abs(Number(tx.amount)))}</span>
                    ) : '—'}
                  </div>
                  <div className="col-span-1 px-2 py-2.5 border-r border-gray-50 text-right text-xs">
                    {!isWithdrawal ? (
                      <span className="text-green-600 font-medium">{fmtMoney(Number(tx.amount))}</span>
                    ) : '—'}
                  </div>
                  <div className="col-span-1 px-2 py-2.5 border-r border-gray-200 text-right text-xs text-gray-500">
                    {tx.balance != null ? fmtMoney(Number(tx.balance)) : '—'}
                  </div>

                  {/* Right: System columns */}
                  <div className="col-span-1 px-2 py-2.5 border-r border-gray-50 text-xs text-gray-600">
                    {tx.match_status === 'matched' ? matchInfo.category : (
                      tx.match_status === 'excluded' ? <span className="text-gray-400 italic">已排除</span> : ''
                    )}
                  </div>
                  <div className="col-span-2 px-2 py-2.5 border-r border-gray-50 truncate text-xs" title={matchInfo.name}>
                    {tx.match_status === 'matched' ? matchInfo.name : ''}
                  </div>
                  <div className="col-span-1 px-2 py-2.5 text-xs">
                    {tx.match_status === 'matched' && matchInfo.link ? (
                      <a href={matchInfo.link} className="text-blue-600 hover:underline" title="查看詳情">
                        查看 →
                      </a>
                    ) : ''}
                  </div>

                  {/* Status + Actions */}
                  <div className="col-span-1 px-2 py-2 flex items-center justify-center gap-1">
                    {tx.match_status === 'unmatched' ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setSelectedTx(tx); setIsMatchModalOpen(true); }}
                          className="px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                          title="手動配對"
                        >
                          配對
                        </button>
                        <button
                          onClick={async () => { await bankReconciliationApi.exclude(tx.id); loadData(); }}
                          className="px-1.5 py-0.5 text-[10px] bg-gray-50 text-gray-500 rounded hover:bg-gray-100 transition-colors"
                          title="排除此交易"
                        >
                          排除
                        </button>
                      </div>
                    ) : tx.match_status === 'matched' ? (
                      <div className="flex items-center gap-1">
                        {getMatchStatusIcon(tx.match_status)}
                        <button
                          onClick={async () => { await bankReconciliationApi.unmatch(tx.id); loadData(); }}
                          className="px-1 py-0.5 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                          title="取消配對"
                        >
                          ↩
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {getMatchStatusIcon(tx.match_status)}
                        <button
                          onClick={async () => { await bankReconciliationApi.unmatch(tx.id); loadData(); }}
                          className="px-1 py-0.5 text-[10px] text-gray-400 hover:text-blue-500 transition-colors"
                          title="恢復為未核對"
                        >
                          ↩
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm">
            <span className="text-gray-500">
              顯示 {(page - 1) * limit + 1}-{Math.min(page * limit, total)} 筆，共 {total} 筆
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded text-xs hover:bg-white disabled:opacity-50 transition-colors"
              >
                上一頁
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= total}
                className="px-3 py-1 border rounded text-xs hover:bg-white disabled:opacity-50 transition-colors"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Modals ═══ */}
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
