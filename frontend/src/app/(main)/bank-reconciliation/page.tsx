'use client';
import { useState, useEffect, useCallback } from 'react';
import DateInput from '@/components/DateInput';
import { companiesApi, bankAccountsApi, bankReconciliationApi } from '@/lib/api';
import { format } from 'date-fns';
import ImportModal from './ImportModal';
import MatchModal from './MatchModal';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';

export default function BankReconciliationPage() {
  // ── Filter state ──
  const { isReadOnly } = useAuth();
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

  // ── Selection mode state ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ── Edit modal state ──
  const [editTx, setEditTx] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ date: '', description: '', amount: '', reference_no: '', bank_txn_remark: '' });
  const [editLoading, setEditLoading] = useState(false);

  // ── Add modal state ──
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ date: '', description: '', amount: '', reference_no: '', bank_txn_remark: '' });
  const [addLoading, setAddLoading] = useState(false);

  // ── Remark edit state ──
  const [remarkTxId, setRemarkTxId] = useState<number | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkLoading, setRemarkLoading] = useState(false);

  // ── Batch move modal state ──
  const [isBatchMoveOpen, setIsBatchMoveOpen] = useState(false);
  const [moveTargetCompanyId, setMoveTargetCompanyId] = useState<number | null>(null);
  const [moveTargetAccountId, setMoveTargetAccountId] = useState<number | null>(null);
  const [moveFilteredAccounts, setMoveFilteredAccounts] = useState<any[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // ── Delete confirm state ──
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

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

  // ── Filter accounts for batch move ──
  useEffect(() => {
    if (moveTargetCompanyId) {
      setMoveFilteredAccounts(accounts.filter((a: any) => a.company_id === moveTargetCompanyId));
    } else {
      setMoveFilteredAccounts(accounts);
    }
  }, [moveTargetCompanyId, accounts]);

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

  // ── Selection helpers ──
  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t: any) => t.id)));
    }
  };
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // ── Single delete ──
  const handleDelete = async (id: number) => {
    try {
      await bankReconciliationApi.deleteTransaction(id);
      setDeleteConfirmId(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('刪除失敗');
    }
  };

  // ── Edit transaction ──
  const openEditModal = (tx: any) => {
    setEditTx(tx);
    setEditForm({
      date: format(new Date(tx.date), 'yyyy-MM-dd'),
      description: tx.description || '',
      amount: String(Number(tx.amount)),
      reference_no: tx.reference_no || '',
      bank_txn_remark: tx.bank_txn_remark || '',
    });
    setIsEditModalOpen(true);
  };
  const handleEditSave = async () => {
    if (!editTx) return;
    setEditLoading(true);
    try {
      await bankReconciliationApi.updateTransaction(editTx.id, {
        date: editForm.date,
        description: editForm.description,
        amount: parseFloat(editForm.amount),
        reference_no: editForm.reference_no || undefined,
        bank_txn_remark: editForm.bank_txn_remark || undefined,
      });
      setIsEditModalOpen(false);
      setEditTx(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('更新失敗');
    } finally {
      setEditLoading(false);
    }
  };

  // ── Add transaction ──
  const handleAddSave = async () => {
    if (!selectedAccountId) return;
    setAddLoading(true);
    try {
      await bankReconciliationApi.createTransaction({
        bank_account_id: selectedAccountId,
        date: addForm.date,
        description: addForm.description,
        amount: parseFloat(addForm.amount),
        reference_no: addForm.reference_no || undefined,
        bank_txn_remark: addForm.bank_txn_remark || undefined,
      });
      setIsAddModalOpen(false);
      setAddForm({ date: '', description: '', amount: '', reference_no: '', bank_txn_remark: '' });
      loadData();
    } catch (err) {
      console.error(err);
      alert('新增失敗');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Remark edit ──
  const handleRemarkSave = async () => {
    if (remarkTxId == null) return;
    setRemarkLoading(true);
    try {
      await bankReconciliationApi.updateRemark(remarkTxId, remarkText);
      setRemarkTxId(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('備註更新失敗');
    } finally {
      setRemarkLoading(false);
    }
  };

  // ── Batch delete ──
  const handleBatchDelete = async () => {
    setBatchLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await bankReconciliationApi.batchDelete(ids);
      alert(`已刪除 ${res.data.deleted} 筆交易`);
      setBatchDeleteConfirm(false);
      exitSelectionMode();
      loadData();
    } catch (err) {
      console.error(err);
      alert('批量刪除失敗');
    } finally {
      setBatchLoading(false);
    }
  };

  // ── Batch move ──
  const handleBatchMove = async () => {
    if (!moveTargetAccountId) { alert('請選擇目標銀行帳戶'); return; }
    setBatchLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await bankReconciliationApi.batchMove(ids, moveTargetAccountId);
      alert(`已移動 ${res.data.moved} 筆交易`);
      setIsBatchMoveOpen(false);
      exitSelectionMode();
      loadData();
    } catch (err) {
      console.error(err);
      alert('批量移動失敗');
    } finally {
      setBatchLoading(false);
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

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'manual': return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">手動</span>;
      case 'pdf': return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800">PDF</span>;
      case 'csv': return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">CSV</span>;
      default: return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">{source}</span>;
    }
  };

  const selectedAccount = accounts.find((a: any) => a.id === selectedAccountId);

  return (
    <div className="p-6 space-y-5">
      {/* ═══ Header ═══ */}
      <div className="flex justify-between items-start">
        <h1 className="text-2xl font-bold">銀行對帳</h1>
        <div className="flex gap-2">
          {selectionMode ? (
            <>
              <span className="text-sm text-gray-500 self-center">已選 {selectedIds.size} 筆</span>
              <button
                onClick={() => { if (selectedIds.size > 0) setBatchDeleteConfirm(true); }}
                disabled={selectedIds.size === 0}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                刪除所選
              </button>
              <button
                onClick={() => { if (selectedIds.size > 0) { setMoveTargetCompanyId(null); setMoveTargetAccountId(null); setIsBatchMoveOpen(true); } }}
                disabled={selectedIds.size === 0}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                批量移動
              </button>
              <button
                onClick={exitSelectionMode}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消選取
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectionMode(true)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
              >
                選取
              </button>
              <button
                onClick={() => { setAddForm({ date: format(new Date(), 'yyyy-MM-dd'), description: '', amount: '', reference_no: '', bank_txn_remark: '' }); setIsAddModalOpen(true); }}
                disabled={!selectedAccountId}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors text-green-700 border-green-300 hover:bg-green-50"
              >
                + 新增
              </button>
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
            </>
          )}
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
            <DateInput
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(v) => { setDateFrom(v); setPage(1); }}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日期（至）</label>
            <DateInput
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={dateTo}
              onChange={(v) => { setDateTo(v); setPage(1); }}
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
            {/* Checkbox column in selection mode */}
            {selectionMode && (
              <div className="col-span-1 px-2 py-3 flex items-center justify-center border-r border-gray-200">
                <input
                  type="checkbox"
                  checked={transactions.length > 0 && selectedIds.size === transactions.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300"
                />
              </div>
            )}
            {/* Left: From Statement */}
            <div className={`${selectionMode ? 'col-span-6' : 'col-span-7'} px-4 py-3 border-r border-gray-200`}>
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
            {selectionMode && <div className="col-span-1" />}
            <div className={`${selectionMode ? '' : 'col-span-1'} px-4 py-2 border-r border-gray-100 ${selectionMode ? 'col-span-1' : ''}`}>Date</div>
            <div className="col-span-2 px-2 py-2 border-r border-gray-100">Transaction</div>
            <div className={`px-2 py-2 border-r border-gray-100 text-center ${selectionMode ? 'col-span-1' : 'col-span-1'}`}>Ref No</div>
            <div className="col-span-1 px-2 py-2 border-r border-gray-100 text-right">Withdrawals</div>
            <div className="col-span-1 px-2 py-2 border-r border-gray-200 text-right">Deposits</div>
            {!selectionMode && <div className="col-span-1 px-2 py-2 border-r border-gray-200 text-right">Balance</div>}
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
              const isSelected = selectedIds.has(tx.id);
              return (
                <div key={tx.id} className={`group grid grid-cols-12 text-sm hover:bg-gray-50 transition-colors ${tx.match_status === 'unmatched' ? 'bg-red-50/30' : ''} ${isSelected ? 'bg-blue-50' : ''}`}>
                  {/* Checkbox */}
                  {selectionMode && (
                    <div className="col-span-1 px-2 py-2.5 flex items-center justify-center border-r border-gray-50">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(tx.id)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </div>
                  )}

                  {/* Left: Statement columns */}
                  <div className={`${selectionMode ? '' : 'col-span-1'} px-4 py-2.5 border-r border-gray-50 text-xs text-gray-600 ${selectionMode ? 'col-span-1' : ''}`}>
                    <div>{format(new Date(tx.date), 'dd/MM/yy')}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {getSourceBadge(tx.bank_txn_source || 'csv')}
                      {tx.bank_txn_remark && (
                        <button
                          onClick={() => { setRemarkTxId(tx.id); setRemarkText(tx.bank_txn_remark || ''); }}
                          className="text-amber-500 hover:text-amber-700" title={tx.bank_txn_remark}
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2z" clipRule="evenodd" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 px-2 py-2.5 border-r border-gray-50 truncate text-xs" title={tx.description}>
                    {tx.description || '—'}
                  </div>
                  <div className={`px-2 py-2.5 border-r border-gray-50 text-center text-xs text-gray-500 ${selectionMode ? 'col-span-1' : 'col-span-1'}`}>
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
                  {!selectionMode && (
                    <div className="col-span-1 px-2 py-2.5 border-r border-gray-200 text-right text-xs text-gray-500">
                      {tx.balance != null ? fmtMoney(Number(tx.balance)) : '—'}
                    </div>
                  )}

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
                  <div className="col-span-1 px-2 py-2 flex items-center justify-center gap-1 relative">
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
                    {/* Hover action buttons (edit / delete / remark) */}
                    {!selectionMode && (
                      <div className="hidden group-hover:flex absolute right-0 top-0 h-full items-center gap-0.5 pr-1 bg-gradient-to-l from-white via-white to-transparent pl-4">
                        <button
                          onClick={() => { setRemarkTxId(tx.id); setRemarkText(tx.bank_txn_remark || ''); }}
                          className="p-1 text-gray-400 hover:text-amber-600 transition-colors rounded hover:bg-amber-50"
                          title="備註"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                        </button>
                        <button
                          onClick={() => openEditModal(tx)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded hover:bg-blue-50"
                          title="編輯"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(tx.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded hover:bg-red-50"
                          title="刪除"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
        companies={companies}
        bankAccounts={accounts}
      />
      <MatchModal
        isOpen={isMatchModalOpen}
        onClose={() => { setIsMatchModalOpen(false); setSelectedTx(null); }}
        tx={selectedTx}
        onSuccess={loadData}
      />

      {/* ── Delete Confirm Dialog ── */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2">確認刪除</h3>
            <p className="text-sm text-gray-600 mb-4">確定要刪除這筆交易記錄嗎？此操作無法復原。</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={() => handleDelete(deleteConfirmId)} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">確認刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Delete Confirm Dialog ── */}
      {batchDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setBatchDeleteConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2">確認批量刪除</h3>
            <p className="text-sm text-gray-600 mb-4">確定要刪除選中的 <strong>{selectedIds.size}</strong> 筆交易記錄嗎？此操作無法復原。</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBatchDeleteConfirm(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50" disabled={batchLoading}>取消</button>
              <button onClick={handleBatchDelete} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50" disabled={batchLoading}>
                {batchLoading ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Transaction Modal ── */}
      <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditTx(null); }} title="編輯交易" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日期</label>
            <DateInput value={editForm.date} onChange={v => setEditForm(f => ({ ...f, date: v }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">描述</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">金額（正=存入，負=提取）</label>
              <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">參考號</label>
              <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm" value={editForm.reference_no} onChange={e => setEditForm(f => ({ ...f, reference_no: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">備註</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={editForm.bank_txn_remark} onChange={e => setEditForm(f => ({ ...f, bank_txn_remark: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setIsEditModalOpen(false); setEditTx(null); }} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">取消</button>
            <button onClick={handleEditSave} disabled={editLoading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {editLoading ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Add Transaction Modal ── */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="手動新增交易" size="md">
        <div className="space-y-4">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
            手動新增的交易將標記為「手動」來源，與 CSV/PDF 匯入的記錄做區分。
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日期 *</label>
            <DateInput value={addForm.date} onChange={v => setAddForm(f => ({ ...f, date: v }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">描述 *</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="交易描述" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">金額 *（正=存入，負=提取）</label>
              <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：-5000 或 10000" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">參考號</label>
              <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="支票號碼等" value={addForm.reference_no} onChange={e => setAddForm(f => ({ ...f, reference_no: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">備註</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="可選備註" value={addForm.bank_txn_remark} onChange={e => setAddForm(f => ({ ...f, bank_txn_remark: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">取消</button>
            <button
              onClick={handleAddSave}
              disabled={addLoading || !addForm.date || !addForm.description || !addForm.amount}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {addLoading ? '新增中...' : '新增交易'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Remark Edit Modal ── */}
      {remarkTxId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRemarkTxId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-3">編輯備註</h3>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={4}
              placeholder="輸入備註..."
              value={remarkText}
              onChange={e => setRemarkText(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRemarkTxId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleRemarkSave} disabled={remarkLoading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {remarkLoading ? '儲存中...' : '儲存備註'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Move Modal ── */}
      <Modal isOpen={isBatchMoveOpen} onClose={() => setIsBatchMoveOpen(false)} title="批量移動交易" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">將選中的 <strong>{selectedIds.size}</strong> 筆交易移動到其他銀行帳戶。移動後配對狀態將重置為「未核對」。</p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">目標公司</label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={moveTargetCompanyId || ''}
              onChange={e => { setMoveTargetCompanyId(e.target.value ? Number(e.target.value) : null); setMoveTargetAccountId(null); }}
            >
              <option value="">全部公司</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">目標銀行帳戶 *</label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={moveTargetAccountId || ''}
              onChange={e => setMoveTargetAccountId(Number(e.target.value))}
            >
              <option value="">— 請選擇 —</option>
              {moveFilteredAccounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.bank_name} - {a.account_name} ({a.account_no}){a.company?.name ? ` [${a.company.name}]` : ''}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setIsBatchMoveOpen(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50" disabled={batchLoading}>取消</button>
            <button onClick={handleBatchMove} disabled={batchLoading || !moveTargetAccountId} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {batchLoading ? '移動中...' : '確認移動'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
