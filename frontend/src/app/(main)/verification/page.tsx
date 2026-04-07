'use client';
import { useState, useEffect, useCallback } from 'react';
import { verificationApi } from '@/lib/api';
import Link from 'next/link';

// ── 狀態圖標 ──────────────────────────────────────────────
const STATUS_ICON: Record<string, string> = {
  matched: '✅',
  diff: '⚠️',
  missing: '❌',
  source_missing: '🔍',
  unverified: '·',
  na: '—',
};

const STATUS_LABEL: Record<string, string> = {
  matched: '已匹配',
  diff: '有差異',
  missing: '系統缺失',
  source_missing: '來源缺失',
  unverified: '未核對',
  na: '不適用',
};

const STATUS_COLOR: Record<string, string> = {
  matched: 'text-green-600',
  diff: 'text-amber-500',
  missing: 'text-red-500',
  source_missing: 'text-orange-500',
  unverified: 'text-gray-400',
  na: 'text-gray-300',
};

const MATCH_METHOD_LABEL: Record<string, string> = {
  chit_no: '入帳票號配對',
  slip_no: '飛仔號配對',
  date_vehicle: '日期+車牌配對',
  date_employee: '日期+員工配對',
  bidirectional_check: '雙向檢查',
  none: '未配對',
};

const SOURCE_LABELS: Record<string, string> = {
  receipt: '入帳票',
  slip: '飛仔',
  sheet: '功課表',
  customer: '客戶記錄',
  gps: 'GPS',
  clock: '打卡',
  whatsapp: 'WhatsApp',
};

const DIFF_FIELD_LABELS: Record<string, string> = {
  date: '日期',
  time_in: '進入時間',
  time_out: '離開時間',
  weight: '重量',
  vehicle: '車牌',
  location: '地點',
  location_to: '終點',
  reason: '原因',
};

const SOURCE_KEYS = ['receipt', 'slip', 'sheet', 'customer', 'gps', 'clock', 'whatsapp'];

interface WorkbenchRecord {
  work_record_id: number;
  date: string | null;
  driver: string;
  vehicle: string;
  work_type: string;
  customer: string;
  location: string;
  contract: string;
  chit_no: string;
  status_receipt: string;
  status_slip: string;
  status_sheet: string;
  status_customer: string;
  status_gps: string;
  status_clock: string;
  status_whatsapp: string;
  match_id_receipt: number | null;
  match_id_slip: number | null;
  match_id_sheet: number | null;
  match_id_customer: number | null;
  match_id_gps: number | null;
  match_id_clock: number | null;
  match_id_whatsapp: number | null;
  overall_status: string;
}

interface Summary {
  total_records: number;
  matched_count: number;
  diff_count: number;
  missing_count: number;
  unverified_count: number;
}

interface Pagination {
  page: number;
  page_size: number;
  total_pages: number;
  total: number;
}

// ── 統計卡片 ──────────────────────────────────────────────
function StatCard({ label, count, color, icon, active, onClick }: {
  label: string; count: number; color: string; icon: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[140px] rounded-xl border-2 p-4 text-left transition-all ${
        active ? `${color} border-current shadow-lg scale-[1.02]` : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <span className={`text-2xl font-bold ${active ? '' : 'text-gray-800'}`}>{count}</span>
      </div>
      <div className={`text-sm ${active ? '' : 'text-gray-500'}`}>{label}</div>
    </button>
  );
}

// ── 詳情 Popup（增強版：逐欄對比 + 橙色高亮 + 操作按鈕）──
function DetailPopup({ matchId, sourceKey, onClose }: { matchId: number | null; sourceKey: string; onClose: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId || matchId <= 0) return;
    setLoading(true);
    verificationApi.getMatchDetail(matchId)
      .then(res => setDetail(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [matchId]);

  if (!matchId) return null;

  const handleAction = async (action: string) => {
    if (!detail?.match?.id) return;
    setActionLoading(action);
    try {
      // For override, build override_data from source record diff fields
      let overrideData: any = undefined;
      if (action === 'override' && detail.diff_fields) {
        overrideData = {};
        for (const [key, val] of Object.entries(detail.diff_fields) as [string, any][]) {
          if (val.src) overrideData[key] = val.src;
        }
      }
      await verificationApi.performMatchAction(detail.match.id, { action, override_data: overrideData });
      onClose();
    } catch {
      // ignore
    }
    setActionLoading(null);
  };

  // Build comparison rows for side-by-side display
  const buildComparisonRows = () => {
    if (!detail) return [];
    const wl = detail.work_log || {};
    const sr = detail.source_record || {};
    const diffs = detail.diff_fields || {};

    const rows: Array<{ label: string; sysVal: string; srcVal: string; isDiff: boolean }> = [];

    rows.push({
      label: '日期',
      sysVal: wl.scheduled_date?.slice(0, 10) || '—',
      srcVal: sr.record_work_date?.slice(0, 10) || '—',
      isDiff: !!diffs['date'],
    });
    rows.push({
      label: '車牌',
      sysVal: wl.equipment_number || '—',
      srcVal: sr.record_vehicle_no || '—',
      isDiff: !!diffs['vehicle'],
    });
    rows.push({
      label: '進入時間',
      sysVal: wl.start_time || '—',
      srcVal: sr.record_time_in ? formatTimeField(sr.record_time_in) : '—',
      isDiff: !!diffs['time_in'],
    });
    rows.push({
      label: '離開時間',
      sysVal: wl.end_time || '—',
      srcVal: sr.record_time_out ? formatTimeField(sr.record_time_out) : '—',
      isDiff: !!diffs['time_out'],
    });
    rows.push({
      label: '重量/數量',
      sysVal: wl.quantity != null ? String(wl.quantity) : '—',
      srcVal: sr.record_weight_net != null ? String(sr.record_weight_net) : '—',
      isDiff: !!diffs['weight'],
    });
    rows.push({
      label: '起點',
      sysVal: wl.start_location || '—',
      srcVal: sr.record_location_from || '—',
      isDiff: !!diffs['location'],
    });
    rows.push({
      label: '終點',
      sysVal: wl.end_location || '—',
      srcVal: sr.record_location_to || '—',
      isDiff: !!diffs['location_to'],
    });
    rows.push({
      label: '入帳票號',
      sysVal: wl.receipt_no || '—',
      srcVal: sr.chits?.map((c: any) => c.chit_no).join(', ') || '—',
      isDiff: false,
    });

    return rows;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-semibold">
            {SOURCE_LABELS[sourceKey] || sourceKey} 核對詳情
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-400">載入中...</div>
          ) : detail ? (
            <div className="space-y-4">
              {/* 狀態列 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl">{STATUS_ICON[detail.match?.match_status] || '·'}</span>
                <span className="font-medium">{STATUS_LABEL[detail.match?.match_status] || '未知'}</span>
                {detail.match?.match_confidence != null && (
                  <span className="text-sm text-gray-500 ml-2">信心度: {Number(detail.match.match_confidence).toFixed(0)}%</span>
                )}
                {detail.match?.match_method && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded ml-2">
                    {MATCH_METHOD_LABEL[detail.match.match_method] || detail.match.match_method}
                  </span>
                )}
              </div>

              {/* 逐欄對比表格 */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-28">欄位</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">系統記錄</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">來源資料</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildComparisonRows().map((row, idx) => (
                      <tr key={idx} className={`border-t ${row.isDiff ? 'bg-orange-50' : ''}`}>
                        <td className={`px-4 py-2.5 font-medium ${row.isDiff ? 'text-orange-700' : 'text-gray-600'}`}>
                          {row.label}
                          {row.isDiff && <span className="ml-1 text-orange-500 text-xs">●</span>}
                        </td>
                        <td className={`px-4 py-2.5 ${row.isDiff ? 'text-orange-700 font-medium' : ''}`}>{row.sysVal}</td>
                        <td className={`px-4 py-2.5 ${row.isDiff ? 'text-orange-700 font-medium' : ''}`}>{row.srcVal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 差異摘要 */}
              {detail.diff_fields && Object.keys(detail.diff_fields).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <div className="text-sm font-medium text-amber-800 mb-1">差異摘要</div>
                  <div className="text-sm text-amber-700">
                    {Object.entries(detail.diff_fields).map(([key, val]: [string, any]) => (
                      <div key={key}>
                        <span className="font-medium">{DIFF_FIELD_LABELS[key] || key}：</span>
                        {val.diff || `${val.sys} → ${val.src}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 操作按鈕 */}
              {detail.match?.match_status !== 'matched' && (
                <div className="flex gap-2 pt-2 flex-wrap border-t mt-4 pt-4">
                  <button
                    onClick={() => handleAction('confirm')}
                    disabled={!!actionLoading}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === 'confirm' ? '處理中...' : '✓ 確認匹配'}
                  </button>
                  <button
                    onClick={() => handleAction('override')}
                    disabled={!!actionLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === 'override' ? '處理中...' : '↻ 以來源資料覆蓋'}
                  </button>
                  <button
                    onClick={() => handleAction('ignore')}
                    disabled={!!actionLoading}
                    className="bg-gray-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === 'ignore' ? '處理中...' : '— 忽略差異'}
                  </button>
                  <button
                    onClick={() => handleAction('manual_correct')}
                    disabled={!!actionLoading}
                    className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === 'manual_correct' ? '處理中...' : '✎ 手動修正'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">無資料</div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTimeField(val: string | null): string {
  if (!val) return '—';
  // Handle ISO datetime string
  if (val.includes('T')) {
    const d = new Date(val);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return val;
}

// ── 主頁面 ──────────────────────────────────────────────────
export default function VerificationWorkbenchPage() {
  const [records, setRecords] = useState<WorkbenchRecord[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_records: 0, matched_count: 0, diff_count: 0, missing_count: 0, unverified_count: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 20, total_pages: 0, total: 0 });
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterWorkType, setFilterWorkType] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [page, setPage] = useState(1);

  // Popup
  const [popupMatchId, setPopupMatchId] = useState<number | null>(null);
  const [popupSourceKey, setPopupSourceKey] = useState<string>('');

  // Batch selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: 20 };
      if (filterStatus !== 'all') params.filter_status = filterStatus;
      if (filterWorkType) params.filter_work_type = filterWorkType;
      if (searchKeyword) params.search_keyword = searchKeyword;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await verificationApi.getWorkbench(params);
      setRecords(res.data.records || []);
      setSummary(res.data.summary || { total_records: 0, matched_count: 0, diff_count: 0, missing_count: 0, unverified_count: 0 });
      setPagination(res.data.pagination || { page: 1, page_size: 20, total_pages: 0, total: 0 });
    } catch (err) {
      console.error('Failed to fetch workbench data', err);
    }
    setLoading(false);
  }, [page, filterStatus, filterWorkType, searchKeyword, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Clear selection when data changes
  useEffect(() => { setSelected(new Set()); }, [records]);

  const handleStatusClick = (status: string) => {
    setFilterStatus(prev => prev === status ? 'all' : status);
    setPage(1);
  };

  // 點擊狀態圖標 — 使用 match_id 直接打開 popup
  const handleCellClick = (record: WorkbenchRecord, sourceKey: string) => {
    const statusField = `status_${sourceKey}` as keyof WorkbenchRecord;
    const status = record[statusField] as string;
    if (status === 'unverified' || status === 'na') return;

    const matchIdField = `match_id_${sourceKey}` as keyof WorkbenchRecord;
    const matchId = record[matchIdField] as number | null;
    if (!matchId) return;

    setPopupSourceKey(sourceKey);
    setPopupMatchId(matchId);
  };

  // Batch selection helpers
  const toggleSelect = (workRecordId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(workRecordId)) next.delete(workRecordId);
      else next.add(workRecordId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map(r => r.work_record_id)));
    }
  };

  // Collect all match IDs for selected records (non-null, non-matched)
  const getSelectedMatchIds = (): number[] => {
    const matchIds: number[] = [];
    for (const rec of records) {
      if (!selected.has(rec.work_record_id)) continue;
      for (const key of SOURCE_KEYS) {
        const matchIdField = `match_id_${key}` as keyof WorkbenchRecord;
        const statusField = `status_${key}` as keyof WorkbenchRecord;
        const mid = rec[matchIdField] as number | null;
        const st = rec[statusField] as string;
        if (mid && st !== 'matched' && st !== 'na' && st !== 'unverified') {
          matchIds.push(mid);
        }
      }
    }
    return Array.from(new Set(matchIds));
  };

  const handleBatchAction = async (action: string) => {
    const matchIds = getSelectedMatchIds();
    if (matchIds.length === 0) return;
    setBatchLoading(true);
    try {
      await verificationApi.batchAction({ match_ids: matchIds, action });
      setSelected(new Set());
      fetchData();
    } catch (err) {
      console.error('Batch action failed', err);
    }
    setBatchLoading(false);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: any = {};
      if (filterStatus !== 'all') params.filter_status = filterStatus;
      if (filterWorkType) params.filter_work_type = filterWorkType;
      if (searchKeyword) params.search_keyword = searchKeyword;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await verificationApi.exportExcel(params);
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verification_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    }
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      {/* 頂部標題列 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">工作紀錄核對</h1>
          <p className="text-sm text-gray-500 mt-1">核對多來源工作紀錄，確保資料一致性</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {exporting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>匯出中...</span>
              </>
            ) : (
              <>
                <span>📊</span>
                <span>匯出 Excel</span>
              </>
            )}
          </button>
          <Link
            href="/verification/upload"
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 text-sm"
          >
            <span>📤</span>
            <span>上傳資料</span>
          </Link>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="flex gap-4 flex-wrap">
        <StatCard
          label="已匹配" count={summary.matched_count} color="text-green-600"
          icon="✅" active={filterStatus === 'matched'} onClick={() => handleStatusClick('matched')}
        />
        <StatCard
          label="有差異" count={summary.diff_count} color="text-amber-500"
          icon="⚠️" active={filterStatus === 'diff'} onClick={() => handleStatusClick('diff')}
        />
        <StatCard
          label="缺失" count={summary.missing_count} color="text-red-500"
          icon="❌" active={filterStatus === 'missing'} onClick={() => handleStatusClick('missing')}
        />
        <StatCard
          label="未核對" count={summary.unverified_count} color="text-gray-400"
          icon="·" active={filterStatus === 'unverified'} onClick={() => handleStatusClick('unverified')}
        />
      </div>

      {/* 篩選列 */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">搜尋</label>
            <input
              type="text"
              placeholder="入帳票號、地點、司機..."
              value={searchKeyword}
              onChange={e => { setSearchKeyword(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm w-56"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">日期從</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">日期到</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">工作類型</label>
            <select
              value={filterWorkType}
              onChange={e => { setFilterWorkType(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">全部</option>
              <option value="泥車">泥車</option>
              <option value="機械">機械</option>
              <option value="租車">租車</option>
            </select>
          </div>
          <button
            onClick={() => { setSearchKeyword(''); setDateFrom(''); setDateTo(''); setFilterWorkType(''); setFilterStatus('all'); setPage(1); }}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            清除篩選
          </button>
        </div>
      </div>

      {/* 批量操作列 */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-blue-700">
            已選擇 <span className="font-bold">{selected.size}</span> 筆記錄
            {getSelectedMatchIds().length > 0 && (
              <span className="ml-1">（{getSelectedMatchIds().length} 筆待處理配對）</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleBatchAction('confirm')}
              disabled={batchLoading || getSelectedMatchIds().length === 0}
              className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {batchLoading ? '處理中...' : '批量確認'}
            </button>
            <button
              onClick={() => handleBatchAction('ignore')}
              disabled={batchLoading || getSelectedMatchIds().length === 0}
              className="bg-gray-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {batchLoading ? '處理中...' : '批量忽略'}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-gray-500 hover:text-gray-700 px-3 py-1.5 text-sm"
            >
              取消選擇
            </button>
          </div>
        </div>
      )}

      {/* 工作紀錄表格 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="w-10 px-2 py-3">
                  <input
                    type="checkbox"
                    checked={records.length > 0 && selected.size === records.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">日期</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">司機</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">車牌</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">工作類型</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">客戶</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">入帳票號</th>
                {SOURCE_KEYS.map(key => (
                  <th key={key} className="text-center px-2 py-3 font-medium text-gray-600 whitespace-nowrap" title={SOURCE_LABELS[key]}>
                    {SOURCE_LABELS[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-12 text-gray-400">暫無資料</td></tr>
              ) : records.map((rec) => (
                <tr key={rec.work_record_id} className={`border-b hover:bg-gray-50 transition-colors ${selected.has(rec.work_record_id) ? 'bg-blue-50' : ''}`}>
                  <td className="w-10 px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(rec.work_record_id)}
                      onChange={() => toggleSelect(rec.work_record_id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{rec.date || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{rec.driver}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">{rec.vehicle}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{rec.work_type}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap max-w-[120px] truncate">{rec.customer}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">{rec.chit_no}</td>
                  {SOURCE_KEYS.map(key => {
                    const statusField = `status_${key}` as keyof WorkbenchRecord;
                    const status = rec[statusField] as string;
                    const matchIdField = `match_id_${key}` as keyof WorkbenchRecord;
                    const matchId = rec[matchIdField] as number | null;
                    const clickable = !!matchId && status !== 'unverified' && status !== 'na';
                    return (
                      <td key={key} className="text-center px-2 py-2.5">
                        <button
                          onClick={() => handleCellClick(rec, key)}
                          className={`text-lg transition-transform ${clickable ? 'cursor-pointer hover:scale-125' : 'cursor-default'} ${STATUS_COLOR[status] || 'text-gray-400'}`}
                          title={`${SOURCE_LABELS[key]}: ${STATUS_LABEL[status] || status}`}
                          disabled={!clickable}
                        >
                          {STATUS_ICON[status] || '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分頁 */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <div className="text-sm text-gray-500">
              共 {pagination.total} 筆，第 {pagination.page} / {pagination.total_pages} 頁
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50 hover:bg-gray-100"
              >
                上一頁
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))}
                disabled={page >= pagination.total_pages}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50 hover:bg-gray-100"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 詳情 Popup */}
      {popupMatchId && (
        <DetailPopup
          matchId={popupMatchId}
          sourceKey={popupSourceKey}
          onClose={() => { setPopupMatchId(null); fetchData(); }}
        />
      )}
    </div>
  );
}
