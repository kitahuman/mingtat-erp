'use client';

import { useState, useEffect, useCallback } from 'react';
import { workLogsApi, fleetRateCardsApi } from '@/lib/api';
import ColumnFilter from '@/components/ColumnFilter';

// ── Types ──────────────────────────────────────────────────────────────────

interface UnmatchedRow {
  company_id: number | null;
  company_name: string | null;
  client_id: number | null;
  client_name: string | null;
  client_contract_no: string | null;
  service_type: string | null;
  quotation_id: number | null;
  quotation_no: string | null;
  day_night: string | null;
  tonnage: string | null;
  machine_type: string | null;
  start_location: string | null;
  end_location: string | null;
  count: number;
}

interface ApiResponse {
  data: UnmatchedRow[];
  total: number;
  totalUnmatched: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface RateInputs {
  rate: string;
  ot_rate: string;
  mid_shift_rate: string;
}

interface ColDef {
  key: string;
  label: string;
  sortKey: string;
  filterKey: string;
  width: string;
}

// ── Column definitions ─────────────────────────────────────────────────────

const COLS: ColDef[] = [
  { key: 'company_name',       label: '公司',     sortKey: 'company_name',       filterKey: 'company_name',       width: 'w-28' },
  { key: 'client_name',        label: '客戶',     sortKey: 'client_name',        filterKey: 'client_name',        width: 'w-36' },
  { key: 'client_contract_no', label: '客戶合約', sortKey: 'client_contract_no', filterKey: 'client_contract_no', width: 'w-28' },
  { key: 'service_type',       label: '服務類型', sortKey: 'service_type',       filterKey: 'service_type',       width: 'w-24' },
  { key: 'quotation_no',       label: '報價單',   sortKey: 'quotation_no',       filterKey: 'quotation_no',       width: 'w-36' },
  { key: 'day_night',          label: '日夜',     sortKey: 'day_night',          filterKey: 'day_night',          width: 'w-16' },
  { key: 'tonnage',            label: '噸數',     sortKey: 'tonnage',            filterKey: 'tonnage',            width: 'w-20' },
  { key: 'machine_type',       label: '機種',     sortKey: 'machine_type',       filterKey: 'machine_type',       width: 'w-24' },
  { key: 'start_location',     label: '起點',     sortKey: 'start_location',     filterKey: 'start_location',     width: 'w-28' },
  { key: 'end_location',       label: '終點',     sortKey: 'end_location',       filterKey: 'end_location',       width: 'w-28' },
  { key: 'count',              label: '受影響筆數', sortKey: 'count',            filterKey: '',                   width: 'w-20' },
];

const RATE_COLS = [
  { key: 'rate',           label: '費率',     required: true  },
  { key: 'ot_rate',        label: 'OT費率',   required: false },
  { key: 'mid_shift_rate', label: '中直費率', required: false },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function rowKey(row: UnmatchedRow): string {
  return [
    row.company_id, row.client_id, row.client_contract_no,
    row.service_type, row.quotation_id, row.day_night,
    row.tonnage, row.machine_type, row.start_location, row.end_location,
  ].join('|');
}

function emptyRates(): RateInputs {
  return { rate: '', ot_rate: '', mid_shift_rate: '' };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MissingPriceTab() {
  // Data state
  const [data, setData]                   = useState<UnmatchedRow[]>([]);
  const [total, setTotal]                 = useState(0);
  const [totalUnmatched, setTotalUnmatched] = useState(0);
  const [page, setPage]                   = useState(1);
  const [totalPages, setTotalPages]       = useState(0);
  const [loading, setLoading]             = useState(false);
  const LIMIT = 50;

  // Sort state
  const [sortBy, setSortBy]       = useState('count');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // ColumnFilter state: Record<columnKey, Set<string> | undefined>
  // null means "all selected" (no filter), Set means specific values selected
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});

  // Inline edit state: which row is being edited (by rowKey), and its draft values
  const [editingKey, setEditingKey]   = useState<string | null>(null);
  const [editDraft, setEditDraft]     = useState<Partial<UnmatchedRow>>({});
  const [editRates, setEditRates]     = useState<RateInputs>(emptyRates());
  const [savingEdit, setSavingEdit]   = useState(false);

  // "Add new rate" state: per-row rate inputs (for rows not yet in edit mode)
  const [rateInputs, setRateInputs]   = useState<Record<string, RateInputs>>({});
  const [submitting, setSubmitting]   = useState<Record<string, boolean>>({});
  const [successRows, setSuccessRows] = useState<Set<string>>(new Set());

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Build params: convert columnFilters to API filter params
      const params: Record<string, string | number> = {
        page,
        limit: LIMIT,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      // Map column filter keys to API query params
      const filterKeyToParam: Record<string, string> = {
        company_name:       'company_name',
        client_name:        'client_name',
        client_contract_no: 'client_contract_no',
        service_type:       'service_type',
        quotation_no:       'quotation_no',
        day_night:          'day_night',
        tonnage:            'tonnage',
        machine_type:       'machine_type',
        start_location:     'start_location',
        end_location:       'end_location',
      };
      for (const [col, vals] of Object.entries(columnFilters)) {
        const param = filterKeyToParam[col];
        if (param && vals && vals.size > 0) {
          params[param] = Array.from(vals).join(',');
        }
      }
      const res = await workLogsApi.unmatchedCombinations(params);
      const result: ApiResponse = res.data;
      setData(result.data);
      setTotal(result.total);
      setTotalUnmatched(result.totalUnmatched);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('Failed to fetch unmatched combinations:', err);
      showToast('載入失敗', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, columnFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Sort ─────────────────────────────────────────────────────────────────

  function handleSort(col: string) {
    if (sortBy === col) {
      setSortOrder((p) => (p === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(col);
      setSortOrder('DESC');
    }
    setPage(1);
  }

  // ── ColumnFilter change ───────────────────────────────────────────────────

  function handleColumnFilterChange(key: string, vals: Set<string> | null) {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (vals === null) { delete next[key]; } else { next[key] = vals; }
      return next;
    });
    setPage(1);
  }

  // ── Add new rate (for rows not yet edited) ────────────────────────────────

  function getRateInputs(key: string): RateInputs {
    return rateInputs[key] ?? emptyRates();
  }

  function setRateField(key: string, field: keyof RateInputs, value: string) {
    setRateInputs((prev) => ({ ...prev, [key]: { ...getRateInputs(key), [field]: value } }));
  }

  async function handleAddRate(row: UnmatchedRow) {
    const key = rowKey(row);
    const inputs = getRateInputs(key);
    const rate = Number(inputs.rate);
    if (!inputs.rate || isNaN(rate) || rate <= 0) {
      showToast('請輸入有效的費率（必填）', 'error');
      return;
    }
    setSubmitting((p) => ({ ...p, [key]: true }));
    try {
      const payload: Record<string, unknown> = {
        company_id: row.company_id,
        client_id: row.client_id,
        client_contract_no: row.client_contract_no,
        service_type: row.service_type,
        quotation_id: row.quotation_id,
        day_night: row.day_night,
        tonnage: row.tonnage,
        machine_type: row.machine_type,
        start_location: row.start_location,
        end_location: row.end_location,
        rate,
        ot_rate: inputs.ot_rate ? Number(inputs.ot_rate) : 0,
        mid_shift_rate: inputs.mid_shift_rate ? Number(inputs.mid_shift_rate) : 0,
      };
      const res = await workLogsApi.addRateAndRematch(payload);
      const result = res.data as { rateCard: { id: number }; rematchedCount: number };
      showToast(`已新增價目 #${result.rateCard.id}，重新匹配了 ${result.rematchedCount} 筆工作記錄`, 'success');
      setSuccessRows((p) => new Set(p).add(key));
      await fetchData();
    } catch (err) {
      console.error('Failed to add rate:', err);
      showToast('新增價目失敗', 'error');
    } finally {
      setSubmitting((p) => ({ ...p, [key]: false }));
    }
  }

  // ── Inline edit ───────────────────────────────────────────────────────────

  function startEdit(row: UnmatchedRow) {
    const key = rowKey(row);
    setEditingKey(key);
    setEditDraft({ ...row });
    setEditRates(emptyRates());
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditDraft({});
    setEditRates(emptyRates());
  }

  async function saveEdit(row: UnmatchedRow) {
    const rate = Number(editRates.rate);
    if (!editRates.rate || isNaN(rate) || rate <= 0) {
      showToast('請輸入有效的費率（必填）', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      // Build the fleet_rate_card payload from edited draft + rates
      const payload: Record<string, unknown> = {
        company_id: editDraft.company_id,
        client_id: editDraft.client_id,
        client_contract_no: editDraft.client_contract_no,
        service_type: editDraft.service_type,
        quotation_id: editDraft.quotation_id,
        day_night: editDraft.day_night,
        tonnage: editDraft.tonnage,
        machine_type: editDraft.machine_type,
        start_location: editDraft.start_location,
        end_location: editDraft.end_location,
        rate,
        ot_rate: editRates.ot_rate ? Number(editRates.ot_rate) : 0,
        mid_shift_rate: editRates.mid_shift_rate ? Number(editRates.mid_shift_rate) : 0,
      };
      const res = await workLogsApi.addRateAndRematch(payload);
      const result = res.data as { rateCard: { id: number }; rematchedCount: number };
      showToast(`已儲存價目 #${result.rateCard.id}，重新匹配了 ${result.rematchedCount} 筆工作記錄`, 'success');
      cancelEdit();
      await fetchData();
    } catch (err) {
      console.error('Failed to save edit:', err);
      showToast('儲存失敗', 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Render cell value ─────────────────────────────────────────────────────

  function getCellValue(row: UnmatchedRow, key: string): string {
    const val = row[key as keyof UnmatchedRow];
    if (val == null) return '-';
    return String(val);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900">客戶價目缺價表</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              共 <span className="font-semibold text-red-600">{total}</span> 個缺單價組合，
              影響 <span className="font-semibold text-red-600">{totalUnmatched}</span> 筆工作記錄
            </p>
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            {loading ? '載入中…' : '🔄 重新整理'}
          </button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: '1600px' }}>
          <thead className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300">
            <tr>
              {COLS.map((col) => {
                const isActive = sortBy === col.sortKey;
                return (
                  <th
                    key={col.key}
                    className={`px-2 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer select-none hover:bg-gray-200 ${col.width} ${isActive ? 'bg-blue-50 text-blue-700' : ''}`}
                    onClick={() => handleSort(col.sortKey)}
                  >
                    <span className="flex items-center gap-0.5">
                      {col.label}
                      <span className={`ml-0.5 text-[10px] ${isActive ? 'text-blue-600' : 'text-gray-300'}`}>
                        {isActive ? (sortOrder === 'ASC' ? '▲' : '▼') : '▲▼'}
                      </span>
                      {col.filterKey && (
                        <ColumnFilter
                          columnKey={col.filterKey}
                          data={data}
                          activeFilters={columnFilters}
                          onFilterChange={handleColumnFilterChange}
                          serverSide={true}
                          onFetchOptions={async (key) => {
                            const res = await workLogsApi.unmatchedFilterOptions(key);
                            return res.data as string[];
                          }}
                        />
                      )}
                    </span>
                  </th>
                );
              })}
              {RATE_COLS.map((rc) => (
                <th key={rc.key} className="px-2 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap w-24">
                  {rc.label}{rc.required && <span className="text-red-500 ml-0.5">*</span>}
                </th>
              ))}
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap w-28">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + RATE_COLS.length + 1} className="text-center py-12 text-gray-400">
                  載入中…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + RATE_COLS.length + 1} className="text-center py-12 text-gray-400">
                  沒有缺單價的組合 🎉
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const key = rowKey(row);
                const isEditing = editingKey === key;
                const isSuccess = successRows.has(key);
                const inputs = getRateInputs(key);

                return (
                  <tr
                    key={key}
                    className={`border-b border-gray-100 text-xs ${
                      isEditing
                        ? 'bg-blue-50 ring-1 ring-inset ring-blue-300'
                        : isSuccess
                        ? 'bg-green-50 opacity-60'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* ── Data columns ── */}
                    {COLS.map((col) => {
                      if (col.key === 'count') {
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-gray-700">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              {row.count}
                            </span>
                          </td>
                        );
                      }
                      if (isEditing) {
                        // Editable text input for combination fields
                        const draftVal = String(editDraft[col.key as keyof UnmatchedRow] ?? '');
                        return (
                          <td key={col.key} className="px-1 py-1">
                            <input
                              type="text"
                              value={draftVal === 'null' ? '' : draftVal}
                              onChange={(e) =>
                                setEditDraft((prev) => ({ ...prev, [col.key]: e.target.value || null }))
                              }
                              className="w-full px-1.5 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col.key}
                          className="px-2 py-1.5 text-gray-700 whitespace-nowrap cursor-pointer"
                          onClick={() => startEdit(row)}
                          title="點擊編輯"
                        >
                          {getCellValue(row, col.key)}
                        </td>
                      );
                    })}

                    {/* ── Rate inputs ── */}
                    {RATE_COLS.map((rc) => {
                      if (isEditing) {
                        return (
                          <td key={rc.key} className="px-1 py-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={rc.required ? '必填' : '選填'}
                              value={editRates[rc.key]}
                              onChange={(e) =>
                                setEditRates((prev) => ({ ...prev, [rc.key]: e.target.value }))
                              }
                              className="w-20 px-1.5 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </td>
                        );
                      }
                      return (
                        <td key={rc.key} className="px-1 py-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={rc.required ? '費率 *' : rc.label}
                            value={inputs[rc.key]}
                            onChange={(e) => setRateField(key, rc.key, e.target.value)}
                            disabled={isSuccess || !!submitting[key]}
                            className="w-20 px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
                          />
                        </td>
                      );
                    })}

                    {/* ── Action column ── */}
                    <td className="px-2 py-1.5">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => saveEdit(row)}
                            disabled={savingEdit}
                            className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
                          >
                            {savingEdit ? '儲存…' : '✓ 儲存'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={savingEdit}
                            className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                          >
                            取消
                          </button>
                        </div>
                      ) : isSuccess ? (
                        <span className="text-xs text-green-600 font-medium">✅ 已新增</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleAddRate(row)}
                            disabled={!!submitting[key] || !inputs.rate}
                            className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                          >
                            {submitting[key] ? '處理…' : '新增'}
                          </button>
                          <button
                            onClick={() => startEdit(row)}
                            className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 font-medium"
                            title="編輯組合欄位後新增"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ─────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="px-4 py-2 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            第 {page} / {totalPages} 頁（共 {total} 個組合）
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              上一頁
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              下一頁
            </button>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
            }`}
          >
            <span>{toast.type === 'error' ? '⚠️' : '✅'}</span>
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">×</button>
          </div>
        </div>
      )}
    </div>
  );
}
