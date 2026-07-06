'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import DateInput from '@/components/DateInput';
import {
  companiesApi,
  bankAccountsApi,
  bankReconciliationApi,
} from '@/lib/api';
import { format } from 'date-fns';
import ImportModal from './ImportModal';
import MatchModal from './MatchModal';
import ExportExcelModal from './ExportExcelModal';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';

export default function BankReconciliationPage() {
  // ── Filter state ──
  const { isReadOnly } = useAuth();
  const [companies, setCompanies] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    null,
  );
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    null,
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  // ── Transaction list filter panel state ──
  const [showTxFilters, setShowTxFilters] = useState(false);
  const [searchDescription, setSearchDescription] = useState('');
  const [searchRefNo, setSearchRefNo] = useState('');
  const [searchAmount, setSearchAmount] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchRelation, setSearchRelation] = useState('');

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
  const reconciliationGridColumns = selectionMode
    ? '2.75rem minmax(5rem, 0.7fr) minmax(20rem, 3fr) minmax(5rem, 0.75fr) minmax(6rem, 0.85fr) minmax(6rem, 0.85fr) minmax(5rem, 0.75fr) minmax(8rem, 1.1fr) minmax(4rem, 0.55fr) minmax(4.5rem, 0.65fr)'
    : 'minmax(5rem, 0.7fr) minmax(22rem, 3.4fr) minmax(5rem, 0.75fr) minmax(6rem, 0.85fr) minmax(6rem, 0.85fr) minmax(6rem, 0.9fr) minmax(5rem, 0.75fr) minmax(8rem, 1.1fr) minmax(4rem, 0.55fr) minmax(4.5rem, 0.65fr)';

  // ── Edit modal state ──
  const [editTx, setEditTx] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    date: '',
    description: '',
    amount: '',
    reference_no: '',
    bank_txn_remark: '',
  });
  const [editLoading, setEditLoading] = useState(false);

  // ── Add modal state ──
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    date: '',
    description: '',
    amount: '',
    reference_no: '',
    bank_txn_remark: '',
  });
  const [addLoading, setAddLoading] = useState(false);

  // ── Remark edit state ──
  const [remarkTxId, setRemarkTxId] = useState<number | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkLoading, setRemarkLoading] = useState(false);

  // ── Resizable splitter state ──
  const [splitPct, setSplitPct] = useState(55); // left panel % width
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.min(80, Math.max(30, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplitPct(Math.round(pct));
    };
    const onUp = () => { isDragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Batch move modal state ──
  const [isBatchMoveOpen, setIsBatchMoveOpen] = useState(false);
  const [moveTargetCompanyId, setMoveTargetCompanyId] = useState<number | null>(
    null,
  );
  const [moveTargetAccountId, setMoveTargetAccountId] = useState<number | null>(
    null,
  );
  const [moveFilteredAccounts, setMoveFilteredAccounts] = useState<any[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // ── Export Excel modal state ──
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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

  useRefetchOnFocus(() => {
    (async () => {
      const [compRes, accRes] = await Promise.all([
        companiesApi.simple(),
        bankAccountsApi.simple(),
      ]);
      setCompanies(compRes.data);
      setAccounts(accRes.data);
    })();
  });

  // ── Filter accounts by company ──
  useEffect(() => {
    if (selectedCompanyId) {
      const filtered = accounts.filter(
        (a: any) => a.company_id === selectedCompanyId,
      );
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
      setMoveFilteredAccounts(
        accounts.filter((a: any) => a.company_id === moveTargetCompanyId),
      );
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
        sort_order: sortOrder,
      };
      const summaryParams: any = {};
      if (dateFrom) {
        txParams.date_from = dateFrom;
        summaryParams.date_from = dateFrom;
      }
      if (dateTo) {
        txParams.date_to = dateTo;
        summaryParams.date_to = dateTo;
      }
      if (statusFilter) txParams.match_status = statusFilter;
      if (searchDescription.trim())
        txParams.search_description = searchDescription.trim();
      if (searchRefNo.trim()) txParams.search_ref_no = searchRefNo.trim();
      if (searchAmount.trim()) txParams.search_amount = searchAmount.trim();
      if (searchName.trim()) txParams.search_name = searchName.trim();
      if (searchRelation.trim())
        txParams.search_relation = searchRelation.trim();

      const [txRes, summaryRes] = await Promise.all([
        bankReconciliationApi.findTransactions(txParams),
        bankReconciliationApi.getSummary(
          selectedAccountId,
          Object.keys(summaryParams).length > 0 ? summaryParams : undefined,
        ),
      ]);
      const items = txRes.data.items;
      setTransactions(items);
      setTotal(txRes.data.total);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [
    selectedAccountId,
    page,
    dateFrom,
    dateTo,
    statusFilter,
    sortOrder,
    searchDescription,
    searchRefNo,
    searchAmount,
    searchName,
    searchRelation,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Reset to first page whenever a transaction-list text filter changes ──
  // (debounced so we don't hammer the API on every keystroke)
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    const t = setTimeout(() => setPage(1), 300);
    return () => clearTimeout(t);
  }, [searchDescription, searchRefNo, searchAmount, searchName, searchRelation]);

  // ── Clear all transaction-list filters ──
  const resetTxFilters = () => {
    setStatusFilter('');
    setSearchDescription('');
    setSearchRefNo('');
    setSearchAmount('');
    setSearchName('');
    setSearchRelation('');
    setPage(1);
  };

  // ── Auto match all ──
  const handleAutoMatch = async () => {
    if (!selectedAccountId) return;
    setAutoMatchLoading(true);
    try {
      const res = await bankReconciliationApi.autoMatchAll(selectedAccountId);
      alert(
        `自動配對完成：共 ${res.data.total_unmatched} 筆未配對，成功配對 ${res.data.matched} 筆`,
      );
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      setAddForm({
        date: '',
        description: '',
        amount: '',
        reference_no: '',
        bank_txn_remark: '',
      });
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
    if (!moveTargetAccountId) {
      alert('請選擇目標銀行帳戶');
      return;
    }
    setBatchLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await bankReconciliationApi.batchMove(
        ids,
        moveTargetAccountId,
      );
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
  const selectedAccount = accounts.find((a: any) => a.id === selectedAccountId);

  const fmtMoney = (val: any) =>
    Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDateInput = (date: Date) => format(date, 'yyyy-MM-dd');

  const applyMonthShortcut = (monthOffset: number) => {
    const now = new Date();
    const firstDay = new Date(
      now.getFullYear(),
      now.getMonth() + monthOffset,
      1,
    );
    const lastDay = new Date(
      now.getFullYear(),
      now.getMonth() + monthOffset + 1,
      0,
    );
    setDateFrom(formatDateInput(firstDay));
    setDateTo(formatDateInput(lastDay));
    setPage(1);
  };

  const getMatchStatusIcon = (status: string) => {
    switch (status) {
      case 'matched':
        return (
          <span className="text-green-600 text-lg" title="已核對">
            ✓
          </span>
        );
      case 'excluded':
        return (
          <span className="text-gray-400 text-lg" title="已排除">
            —
          </span>
        );
      default:
        return (
          <span className="text-red-500 text-lg" title="未核對">
            ✗
          </span>
        );
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'pdf':
        return (
          <span className="px-1 text-[9px] bg-red-100 text-red-700 rounded uppercase font-bold">
            PDF
          </span>
        );
      case 'manual':
        return (
          <span className="px-1 text-[9px] bg-amber-100 text-amber-700 rounded uppercase font-bold">
            MAN
          </span>
        );
      default:
        return (
          <span className="px-1 text-[9px] bg-blue-100 text-blue-700 rounded uppercase font-bold">
            CSV
          </span>
        );
    }
  };

  const getMatchedInfo = (tx: any) => {
    // Multi-match: multiple records
    if (tx.match_status === 'matched' && tx.matched_records && tx.matched_records.length > 1) {
      const type = tx.matched_records[0]._matched_type;
      return {
        category: type === 'payment_in' ? '收款' : '支出',
        name: `${tx.matched_records.length} 筆配對`,
        link: '',
        isMulti: true,
        records: tx.matched_records,
      };
    }
    // Single match
    if (tx.match_status !== 'matched' || !tx.matched_record)
      return { category: '', name: '', link: '', isMulti: false, records: [] };
    const r = tx.matched_record;
    if ((tx.matched_type || r._matched_type) === 'payment_in') {
      const sourceLabels: Record<string, string> = {
        payment_certificate: 'PC',
        invoice: '發票',
        retention_release: '扣留金',
        other: '其他',
      };
      const sourceLabel = sourceLabels[r.source_type] || r.source_type || '';
      const payerShort = r.payer_partner?.name || r.payer_name || r.project?.client?.code || r.project?.client?.name || '';
      const nameParts = [sourceLabel, payerShort, r.reference_no, r.remarks].filter(Boolean);
      return {
        category: '收款',
        name: nameParts.join(' ') || r.project?.project_name || '未命名項目',
        link: `/payment-in/${r.id}`,
        isMulti: false,
        records: [r],
      };
    } else {
      return {
        category: '支出',
        name: r.expense?.item || r.payment_out_description || r.description || '未命名支出',
        link: `/payment-out/${r.id}`,
        isMulti: false,
        records: [r],
      };
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">銀行月結單核對</h1>
          <p className="text-sm text-gray-500">核對銀行流水與系統財務記錄</p>
        </div>
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <button
                onClick={() => setBatchDeleteConfirm(true)}
                disabled={selectedIds.size === 0}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                刪除所選
              </button>
              <button
                onClick={() => {
                  if (selectedIds.size > 0) {
                    setMoveTargetCompanyId(null);
                    setMoveTargetAccountId(null);
                    setIsBatchMoveOpen(true);
                  }
                }}
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
                onClick={() => {
                  setAddForm({
                    date: format(new Date(), 'yyyy-MM-dd'),
                    description: '',
                    amount: '',
                    reference_no: '',
                    bank_txn_remark: '',
                  });
                  setIsAddModalOpen(true);
                }}
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
                onClick={() => setIsExportModalOpen(true)}
                disabled={!selectedAccountId}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors text-green-700 border-green-300 hover:bg-green-50"
              >
                ⇩ 匯出 Excel
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
            <label className="block text-xs font-medium text-gray-500 mb-1">
              公司
            </label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={selectedCompanyId || ''}
              onChange={(e) => {
                setSelectedCompanyId(
                  e.target.value ? Number(e.target.value) : null,
                );
                setPage(1);
              }}
            >
              <option value="">全部公司</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Bank Account */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              銀行帳戶
            </label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={selectedAccountId || ''}
              onChange={(e) => {
                setSelectedAccountId(Number(e.target.value));
                setPage(1);
              }}
            >
              {filteredAccounts.length === 0 && (
                <option value="">— 無帳戶 —</option>
              )}
              {filteredAccounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.bank_name} - {a.account_name} ({a.account_no})
                </option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              日期（從）
            </label>
            <DateInput
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(v) => {
                setDateFrom(v);
                setPage(1);
              }}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              日期（至）
            </label>
            <DateInput
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={dateTo}
              onChange={(v) => {
                setDateTo(v);
                setPage(1);
              }}
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              核對狀態
            </label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">全部</option>
              <option value="unmatched">未核對</option>
              <option value="matched">已核對</option>
              <option value="excluded">已排除</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <span className="text-xs font-medium text-gray-500">日期快捷：</span>
        {[
          { label: '本月', offset: 0 },
          { label: '上月', offset: -1 },
          { label: '上上月', offset: -2 },
        ].map((shortcut) => (
          <button
            key={shortcut.label}
            type="button"
            onClick={() => applyMonthShortcut(shortcut.offset)}
            className="px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
          >
            {shortcut.label}
          </button>
        ))}
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
            <div className="text-xl font-bold text-green-600">
              {summary.matched_count}
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border shadow-sm border-l-4 border-l-red-500">
            <div className="text-xs text-gray-500">未核對</div>
            <div className="text-xl font-bold text-red-600">
              {summary.unmatched_count}
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border shadow-sm border-l-4 border-l-gray-400">
            <div className="text-xs text-gray-500">已排除</div>
            <div className="text-xl font-bold text-gray-500">
              {summary.excluded_count}
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border shadow-sm">
            <div className="text-xs text-gray-500">總存入</div>
            <div className="text-lg font-bold text-green-600">
              ${fmtMoney(summary.total_deposits)}
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border shadow-sm">
            <div className="text-xs text-gray-500">總提取</div>
            <div className="text-lg font-bold text-red-600">
              ${fmtMoney(summary.total_withdrawals)}
            </div>
          </div>
        </div>
      )}

      {/* ═══ B/F & C/D Balance Cards ═══ */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-sm">
            <div className="text-xs text-blue-600 font-medium">
              B/F 結餘（期初）
            </div>
            <div className="mt-2 text-2xl font-bold text-blue-700">
              ${fmtMoney(summary.bf_balance)}
            </div>
            <div className="text-[10px] text-blue-500 mt-1">
              篩選期間開始前的結餘
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-xl border border-green-200 shadow-sm">
            <div className="text-xs text-green-600 font-medium">
              C/D 結餘（結轉）
            </div>
            <div className="mt-2 text-2xl font-bold text-green-700">
              ${fmtMoney(summary.cd_balance)}
            </div>
            <div className="text-[10px] text-green-500 mt-1">
              篩選期間結束時的結餘
            </div>
          </div>
        </div>
      )}

      {/* ═══ Bookkeeping Table (Left-Right Layout) ═══ */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b bg-white">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">交易列表</h2>
            <p className="text-xs text-gray-500">
              目前排序：
              {sortOrder === 'desc'
                ? '倒序（日期由新到舊）'
                : '順序（日期由舊到新）'}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Filter toggle */}
            <button
              type="button"
              onClick={() => setShowTxFilters((v) => !v)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${showTxFilters || statusFilter || searchDescription || searchRefNo || searchAmount || searchName || searchRelation ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:text-gray-800'}`}
              title="篩選交易"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
              篩選
              <svg className={`w-3 h-3 transition-transform ${showTxFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className="inline-flex rounded-lg border bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => {
                  setSortOrder('asc');
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sortOrder === 'asc' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
              >
                順序
              </button>
              <button
                type="button"
                onClick={() => {
                  setSortOrder('desc');
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sortOrder === 'desc' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
              >
                倒序
              </button>
            </div>
          </div>
        </div>

        {/* ═══ Collapsible filter panel ═══ */}
        {showTxFilters && (
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-[11px] font-medium text-gray-500">核對狀態</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-7 text-xs border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">全部</option>
                  <option value="matched">已核對</option>
                  <option value="unmatched">未核對</option>
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[11px] font-medium text-gray-500">Transaction</label>
                <input
                  type="text"
                  value={searchDescription}
                  onChange={(e) => setSearchDescription(e.target.value)}
                  placeholder="搜尋交易描述"
                  className="h-7 w-36 text-xs border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[11px] font-medium text-gray-500">Ref No</label>
                <input
                  type="text"
                  value={searchRefNo}
                  onChange={(e) => setSearchRefNo(e.target.value)}
                  placeholder="搜尋編號"
                  className="h-7 w-28 text-xs border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[11px] font-medium text-gray-500">金額</label>
                <input
                  type="text"
                  value={searchAmount}
                  onChange={(e) => setSearchAmount(e.target.value)}
                  placeholder="例如 1000"
                  className="h-7 w-24 text-xs border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[11px] font-medium text-gray-500">名稱</label>
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="搜尋名稱"
                  className="h-7 w-32 text-xs border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[11px] font-medium text-gray-500">關聯</label>
                <input
                  type="text"
                  value={searchRelation}
                  onChange={(e) => setSearchRelation(e.target.value)}
                  placeholder="搜尋關聯"
                  className="h-7 w-32 text-xs border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <button
                type="button"
                onClick={resetTxFilters}
                className="h-7 px-3 text-xs font-medium text-gray-600 border border-gray-300 rounded bg-white hover:bg-gray-100 transition-colors"
              >
                重設
              </button>
            </div>
          </div>
        )}
        {/* Two-panel layout with resizable splitter */}
        <div ref={containerRef} style={{ userSelect: 'none' }}>
        {/* Header row */}
        <div className="flex bg-gray-50 border-b">
          {/* Left header */}
          <div className="flex-none overflow-hidden" style={{ width: `${splitPct}%` }}>
            <div className="px-4 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-blue-700">From Statement（月結單）</span>
            </div>
            <div className="grid text-[11px] font-medium text-gray-500 min-w-[420px]" style={{ gridTemplateColumns: selectionMode ? '2.75rem 5rem 1fr 5rem 6rem 6rem 3.5rem' : '5rem 1fr 5rem 6rem 6rem 6rem 3.5rem' }}>
              {selectionMode && (
                <div className="px-2 py-2 flex items-center justify-center">
                  <input type="checkbox" checked={transactions.length > 0 && selectedIds.size === transactions.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300" />
                </div>
              )}
              <div className="px-4 py-2">Date</div>
              <div className="px-2 py-2">Transaction</div>
              <div className="px-2 py-2 text-center">Ref No</div>
              <div className="px-2 py-2 text-right">Withdrawals</div>
              <div className="px-2 py-2 text-right">Deposits</div>
              {!selectionMode && <div className="px-2 py-2 text-right">Balance</div>}
              <div className="px-2 py-2 text-center">操作</div>
            </div>
          </div>
          {/* Splitter placeholder in header */}
          <div className="flex-none w-1.5" />
          {/* Right header */}
          <div className="flex-1 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-purple-700">From System（系統記錄）</span>
            </div>
            <div className="grid text-[11px] font-medium text-gray-500 min-w-[360px]" style={{ gridTemplateColumns: '1fr 2fr 5rem 5rem' }}>
              <div className="px-2 py-2">類別</div>
              <div className="px-2 py-2">名稱</div>
              <div className="px-2 py-2">關聯</div>
              <div className="px-2 py-2 text-center">核對</div>
            </div>
          </div>
        </div>

        {/* Body rows — left and right cells in the SAME row div for height sync */}
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-12 text-center text-gray-400">載入中...</div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center text-gray-400">{selectedAccountId ? '沒有交易記錄' : '請先選擇銀行帳戶'}</div>
          ) : (
            transactions.map((tx: any) => {
              const isWithdrawal = Number(tx.amount) < 0;
              const isSelected = selectedIds.has(tx.id);
              const matchInfo = getMatchedInfo(tx);
              const rowBg = tx.match_status === 'unmatched' ? 'bg-red-50/30' : isSelected ? 'bg-blue-50' : '';
              return (
                <div key={tx.id} className={`flex items-stretch hover:bg-gray-50 transition-colors ${rowBg}`}>
                  {/* Left cell: Statement */}
                  <div className="flex-none overflow-hidden" style={{ width: `${splitPct}%` }}>
                    <div className={`grid min-w-[420px] h-full text-sm`} style={{ gridTemplateColumns: selectionMode ? '2.75rem 5rem 1fr 5rem 6rem 6rem 3.5rem' : '5rem 1fr 5rem 6rem 6rem 6rem 3.5rem' }}>
                      {selectionMode && (
                        <div className="px-2 py-2.5 flex items-center justify-center">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(tx.id)} className="w-4 h-4 rounded border-gray-300" />
                        </div>
                      )}
                      <div className="px-4 py-2.5 text-sm text-gray-600">
                        <div>{format(new Date(tx.date), 'dd/MM/yy')}</div>
                        <div className="flex items-center gap-1 mt-0.5">{getSourceBadge(tx.bank_txn_source || 'csv')}</div>
                      </div>
                      <div className="px-2 py-2.5 whitespace-normal break-words leading-relaxed text-sm" title={tx.description}>{tx.description || '—'}</div>
                      <div className="px-2 py-2.5 text-center text-sm text-gray-500">{tx.reference_no || '—'}</div>
                      <div className="px-2 py-2.5 text-right text-sm">
                        {isWithdrawal ? <span className="text-red-600 font-medium">{fmtMoney(Math.abs(Number(tx.amount)))}</span> : '—'}
                      </div>
                      <div className="px-2 py-2.5 text-right text-sm">
                        {!isWithdrawal ? <span className="text-green-600 font-medium">{fmtMoney(Number(tx.amount))}</span> : '—'}
                      </div>
                      {!selectionMode && (
                        <div className="px-2 py-2.5 text-right text-sm text-gray-500">{tx.balance != null ? fmtMoney(Number(tx.balance)) : '—'}</div>
                      )}
                      {/* Action buttons on statement side */}
                      <div className="px-1 py-2 flex items-center justify-center gap-0.5">
                        <button onClick={() => { setRemarkTxId(tx.id); setRemarkText(tx.bank_txn_remark || ''); }} className={`p-1 rounded transition-colors ${tx.bank_txn_remark ? 'text-amber-500 hover:text-amber-700' : 'text-gray-300 hover:text-amber-500'}`} title={tx.bank_txn_remark || '備註'}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                        </button>
                        {!selectionMode && (
                          <>
                            <button onClick={() => openEditModal(tx)} className="p-1 text-gray-300 hover:text-blue-600 transition-colors rounded hover:bg-blue-50" title="編輯">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button onClick={() => setDeleteConfirmId(tx.id)} className="p-1 text-gray-300 hover:text-red-600 transition-colors rounded hover:bg-red-50" title="刪除">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6" /></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Splitter column */}
                  <div
                    className="flex-none w-1.5 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors select-none"
                    onMouseDown={handleSplitterMouseDown}
                    title="拖動調整寬度"
                  />

                  {/* Right cell: System */}
                  <div className="flex-1 overflow-x-auto">
                    <div className={`min-w-[360px]`}>
                      <div className={`grid text-sm`} style={{ gridTemplateColumns: '1fr 2fr 5rem 5rem' }}>
                        <div className="px-2 py-2.5 text-sm text-gray-600">
                          {tx.match_status === 'matched' ? (
                            <span>{matchInfo.category}{matchInfo.isMulti ? ` (${matchInfo.records?.length}筆)` : ''}</span>
                          ) : tx.match_status === 'excluded' ? <span className="text-gray-400 italic">已排除</span> : ''}
                        </div>
                        <div className="px-2 py-2.5 truncate text-sm" title={matchInfo.name}>
                          {tx.match_status === 'matched' ? matchInfo.name : ''}
                        </div>
                        <div className="px-2 py-2.5 text-sm">
                          {tx.match_status === 'matched' && matchInfo.link ? (
                            <a href={matchInfo.link} className="text-blue-600 hover:underline" title="查看詳情">查看 →</a>
                          ) : ''}
                        </div>
                        <div className="px-2 py-2 flex items-center justify-center gap-1">
                          {tx.match_status === 'unmatched' ? (
                            <div className="flex gap-1">
                              <button onClick={() => { setSelectedTx(tx); setIsMatchModalOpen(true); }} className="px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors" title="手動配對">配對</button>
                              <button onClick={async () => { await bankReconciliationApi.exclude(tx.id); loadData(); }} className="px-1.5 py-0.5 text-[10px] bg-gray-50 text-gray-500 rounded hover:bg-gray-100 transition-colors" title="排除此交易">排除</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              {getMatchStatusIcon(tx.match_status)}
                              <button onClick={async () => { await bankReconciliationApi.unmatch(tx.id); loadData(); }} className="px-1 py-0.5 text-[10px] text-gray-400 hover:text-red-500 transition-colors" title={tx.match_status === 'matched' ? '取消配對' : '恢復為未核對'}>↩</button>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Multi-match expanded records */}
                      {matchInfo.isMulti && matchInfo.records && matchInfo.records.length > 1 && (
                        <div className="pl-4 pr-2 pb-2 space-y-1">
                          {matchInfo.records.map((r: any, idx: number) => {
                            const isPayIn = r._matched_type === 'payment_in';
                            let rName: string;
                            if (isPayIn) {
                              const srcLabels: Record<string, string> = { payment_certificate: 'PC', invoice: '發票', retention_release: '扣留金', other: '其他' };
                              const parts = [srcLabels[r.source_type] || r.source_type || '', r.payer_partner?.name || r.payer_name || r.project?.client?.code || r.project?.client?.name || '', r.reference_no, r.remarks].filter(Boolean);
                              rName = parts.join(' ') || r.project?.project_name || '未命名項目';
                            } else {
                              rName = r.expense?.item || r.payment_out_description || r.company?.name || '未命名支出';
                            }
                            const rLink = isPayIn ? `/payment-in/${r.id}` : `/payment-out/${r.id}`;
                            return (
                              <div key={r.id || idx} className="flex items-center gap-2 text-[11px] text-gray-600 bg-gray-50 rounded px-2 py-1">
                                <span className="font-medium truncate flex-1" title={rName}>{rName}</span>
                                <span className="font-mono text-gray-700">${Number(r.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                <a href={rLink} className="text-blue-500 hover:underline flex-shrink-0">查看</a>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        </div>{/* end containerRef wrapper */}
      </div>

      {/* ── Pagination ── */}
      {total > limit && (
        <div className="flex justify-center gap-2 py-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            上一頁
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">
            第 {page} 頁 / 共 {Math.ceil(total / limit)} 頁
          </span>
          <button
            onClick={() =>
              setPage((p) => Math.min(Math.ceil(total / limit), p + 1))
            }
            disabled={page >= Math.ceil(total / limit)}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            下一頁
          </button>
        </div>
      )}

      {/* ── Export Excel Modal ── */}
      <ExportExcelModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        selectedAccount={selectedAccount ? {
          id: selectedAccount.id,
          bank_name: selectedAccount.bank_name,
          account_name: selectedAccount.account_name,
          account_no: selectedAccount.account_no,
          currency: selectedAccount.currency,
          company: selectedAccount.company,
        } : null}
        defaultDateFrom={dateFrom}
        defaultDateTo={dateTo}
      />

      {/* ── Modals ── */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        bankAccountId={selectedAccountId}
        onSuccess={loadData}
        companies={companies}
        bankAccounts={accounts}
      />

      {isMatchModalOpen && selectedTx && (
        <MatchModal
          isOpen={isMatchModalOpen}
          onClose={() => {
            setIsMatchModalOpen(false);
            setSelectedTx(null);
          }}
          tx={selectedTx}
          onSuccess={loadData}
        />
      )}

      {/* ── Delete Confirm Dialog ── */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setDeleteConfirmId(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2 text-red-600">確認刪除</h3>
            <p className="text-sm text-gray-600 mb-4">
              確定要刪除這筆交易記錄嗎？此操作無法復原。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Delete Confirm Dialog ── */}
      {batchDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setBatchDeleteConfirm(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2">確認批量刪除</h3>
            <p className="text-sm text-gray-600 mb-4">
              確定要刪除選中的 <strong>{selectedIds.size}</strong>{' '}
              筆交易記錄嗎？此操作無法復原。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBatchDeleteConfirm(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
                disabled={batchLoading}
              >
                取消
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                disabled={batchLoading}
              >
                {batchLoading ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Transaction Modal ── */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditTx(null);
        }}
        title="編輯交易"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              日期
            </label>
            <DateInput
              value={editForm.date}
              onChange={(v) => setEditForm((f) => ({ ...f, date: v }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              描述
            </label>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={editForm.description}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                金額（正=存入，負=提取）
              </label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editForm.amount}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                參考號
              </label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editForm.reference_no}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, reference_no: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              備註
            </label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={2}
              value={editForm.bank_txn_remark}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, bank_txn_remark: e.target.value }))
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setIsEditModalOpen(false);
                setEditTx(null);
              }}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleEditSave}
              disabled={editLoading}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {editLoading ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Add Transaction Modal ── */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="手動新增交易"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
            手動新增的交易將標記為「手動」來源，與 CSV/PDF 匯入的記錄做區分。
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              日期 *
            </label>
            <DateInput
              value={addForm.date}
              onChange={(v) => setAddForm((f) => ({ ...f, date: v }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              描述 *
            </label>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="交易描述"
              value={addForm.description}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                金額 *（正=存入，負=提取）
              </label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="例：-5000 或 10000"
                value={addForm.amount}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                參考號
              </label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="支票號碼等"
                value={addForm.reference_no}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, reference_no: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              備註
            </label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={2}
              placeholder="可選備註"
              value={addForm.bank_txn_remark}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, bank_txn_remark: e.target.value }))
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleAddSave}
              disabled={
                addLoading ||
                !addForm.date ||
                !addForm.description ||
                !addForm.amount
              }
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
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setRemarkTxId(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-md w-full">
            <h3 className="text-lg font-bold mb-3">編輯備註</h3>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={4}
              placeholder="輸入備註..."
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRemarkTxId(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleRemarkSave}
                disabled={remarkLoading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {remarkLoading ? '儲存中...' : '儲存備註'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Move Modal ── */}
      <Modal
        isOpen={isBatchMoveOpen}
        onClose={() => setIsBatchMoveOpen(false)}
        title="批量移動交易"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            將選中的 <strong>{selectedIds.size}</strong>{' '}
            筆交易移動到其他銀行帳戶。移動後配對狀態將重置為「未核對」。
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              目標公司
            </label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={moveTargetCompanyId || ''}
              onChange={(e) => {
                setMoveTargetCompanyId(
                  e.target.value ? Number(e.target.value) : null,
                );
                setMoveTargetAccountId(null);
              }}
            >
              <option value="">全部公司</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              目標銀行帳戶 *
            </label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              value={moveTargetAccountId || ''}
              onChange={(e) => setMoveTargetAccountId(Number(e.target.value))}
            >
              <option value="">— 請選擇 —</option>
              {moveFilteredAccounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.bank_name} - {a.account_name} ({a.account_no})
                  {a.company?.name ? ` [${a.company.name}]` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsBatchMoveOpen(false)}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              disabled={batchLoading}
            >
              取消
            </button>
            <button
              onClick={handleBatchMove}
              disabled={batchLoading || !moveTargetAccountId}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {batchLoading ? '移動中...' : '確認移動'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
