'use client';
import { useState, useEffect, useCallback } from 'react';
import { verificationApi } from '@/lib/api';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import DateInput from '@/components/DateInput';

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
  diff: '部分匹配',
  missing: '缺失',
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

const SOURCE_LABELS: Record<string, string> = {
  receipt: '入帳票',
  slip: '飛仔',
  sheet: '功課表',
  customer: '客戶記錄',
  gps: 'GPS',
  clock: '打卡',
  whatsapp: 'WhatsApp',
};

// 前端 source key → matchSingle 返回的 source key
const FE_TO_MATCH_SOURCE: Record<string, string> = {
  receipt: 'chit',
  slip: 'delivery_note',
  sheet: 'driver_sheet',
  customer: 'customer_record',
  gps: 'gps',
  clock: 'attendance',
  whatsapp: 'whatsapp_order',
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

// ── 詳情 Popup（使用 matchSingle API）──────────────────────
function DetailPopup({ workRecordId, sourceKey, onClose }: {
  workRecordId: number;
  sourceKey: string;
  onClose: () => void;
}) {
  const { isReadOnly } = useAuth();
  const [matchData, setMatchData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workRecordId) return;
    setLoading(true);
    verificationApi.matchSingle(workRecordId)
      .then(res => setMatchData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workRecordId]);

  if (!workRecordId) return null;

  // 從 matchSingle 結果中取出對應來源的資料
  const matchSourceKey = FE_TO_MATCH_SOURCE[sourceKey] || sourceKey;
  const sourceData = matchData?.sources?.[matchSourceKey];
  const workLogData = matchData?.sources?.['work_log'];

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
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-10 h-10 rounded-full border-4 border-blue-100 border-t-blue-500 animate-spin" />
              <p className="text-sm font-medium text-gray-600">正在配對中...</p>
            </div>
          ) : sourceData ? (
            <div className="space-y-4">
              {/* 狀態列 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl">{STATUS_ICON[sourceData.status] || '·'}</span>
                <span className="font-medium">
                  {sourceData.status === 'found' ? '已匹配' : sourceData.status === 'missing' ? '未找到對應資料' : sourceData.status}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded ml-2">
                  {sourceData.source}
                </span>
              </div>

              {/* 工作紀錄資訊 */}
              {workLogData?.details?.[0] && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="text-sm font-medium text-blue-800 mb-2">工作紀錄</div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-blue-700">
                    <div><span className="text-blue-500">車牌：</span>{workLogData.details[0].vehicle}</div>
                    <div><span className="text-blue-500">員工：</span>{workLogData.details[0].employee}</div>
                    <div><span className="text-blue-500">客戶：</span>{workLogData.details[0].customer}</div>
                    <div><span className="text-blue-500">合約：</span>{workLogData.details[0].contract}</div>
                    <div className="col-span-2"><span className="text-blue-500">地點：</span>{workLogData.details[0].location}</div>
                  </div>
                </div>
              )}

              {/* 來源資料 */}
              {sourceData.status === 'found' && sourceData.details?.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                    找到 {sourceData.details.length} 筆匹配記錄
                  </div>
                  <div className="divide-y max-h-[300px] overflow-y-auto">
                    {sourceData.details.map((detail: any, idx: number) => (
                      <div key={idx} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {Object.entries(detail)
                            .filter(([k]) => k !== 'id')
                            .map(([key, val]) => (
                              <div key={key}>
                                <span className="text-gray-500">{key}：</span>
                                <span className="text-gray-800">
                                  {Array.isArray(val) ? (val as any[]).join(', ') : String(val ?? '—')}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : sourceData.status === 'missing' ? (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  在此來源中未找到匹配的記錄
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">無資料</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 主頁面 ──────────────────────────────────────────────────
export default function VerificationWorkbenchPage() {
  const { isReadOnly } = useAuth();
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

  // Popup (now uses work_record_id instead of match_id)
  const [popupWorkRecordId, setPopupWorkRecordId] = useState<number | null>(null);
  const [popupSourceKey, setPopupSourceKey] = useState<string>('');

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

  const handleStatusClick = (status: string) => {
    setFilterStatus(prev => prev === status ? 'all' : status);
    setPage(1);
  };

  // 點擊狀態圖標 — 使用 work_record_id 打開 popup
  const handleCellClick = (record: WorkbenchRecord, sourceKey: string) => {
    const statusField = `status_${sourceKey}` as keyof WorkbenchRecord;
    const status = record[statusField] as string;
    if (status === 'unverified' || status === 'na') return;

    setPopupSourceKey(sourceKey);
    setPopupWorkRecordId(record.work_record_id);
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
                <span className="animate-spin">&#9203;</span>
                <span>匯出中...</span>
              </>
            ) : (
              <>
                <span>&#128202;</span>
                <span>匯出 Excel</span>
              </>
            )}
          </button>
          <Link
            href="/verification/upload"
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 text-sm"
          >
            <span>&#128228;</span>
            <span>上傳資料</span>
          </Link>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="flex gap-4 flex-wrap">
        <StatCard
          label="已匹配" count={summary.matched_count} color="text-green-600"
          icon="&#9989;" active={filterStatus === 'matched'} onClick={() => handleStatusClick('matched')}
        />
        <StatCard
          label="部分匹配" count={summary.diff_count} color="text-amber-500"
          icon="&#9888;&#65039;" active={filterStatus === 'diff'} onClick={() => handleStatusClick('diff')}
        />
        <StatCard
          label="缺失" count={summary.missing_count} color="text-red-500"
          icon="&#10060;" active={filterStatus === 'missing'} onClick={() => handleStatusClick('missing')}
        />
        <StatCard
          label="未核對" count={summary.unverified_count} color="text-gray-400"
          icon="&#183;" active={filterStatus === 'unverified'} onClick={() => handleStatusClick('unverified')}
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
            <DateInput value={dateFrom}
              onChange={val => { setDateFrom(val || ''); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">日期到</label>
            <DateInput value={dateTo}
              onChange={val => { setDateTo(val || ''); setPage(1); }}
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

      {/* 工作紀錄表格 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
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
                <tr>
                  <td colSpan={13} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-4">
                      <div className="relative">
                        <div className="w-14 h-14 rounded-full border-4 border-blue-100 border-t-blue-500 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lg">🔗</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-700">正在配對中，請稍候...</p>
                        <p className="text-xs text-gray-400 mt-1">系統正在比對各來源資料，這可能需要數秒鐘</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-12 text-gray-400">暫無資料</td></tr>
              ) : records.map((rec) => (
                <tr key={rec.work_record_id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5 whitespace-nowrap">{rec.date || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{rec.driver}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">{rec.vehicle}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{rec.work_type}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap max-w-[120px] truncate">{rec.customer}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">{rec.chit_no}</td>
                  {SOURCE_KEYS.map(key => {
                    const statusField = `status_${key}` as keyof WorkbenchRecord;
                    const status = rec[statusField] as string;
                    const clickable = status !== 'unverified' && status !== 'na';
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
      {popupWorkRecordId && (
        <DetailPopup
          workRecordId={popupWorkRecordId}
          sourceKey={popupSourceKey}
          onClose={() => { setPopupWorkRecordId(null); fetchData(); }}
        />
      )}
    </div>
  );
}
