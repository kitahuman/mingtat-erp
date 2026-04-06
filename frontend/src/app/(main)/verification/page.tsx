'use client';
import { useState, useEffect, useCallback } from 'react';
import { verificationApi } from '@/lib/api';
import Link from 'next/link';

// ── 狀態圖標 ──────────────────────────────────────────────
const STATUS_ICON: Record<string, string> = {
  matched: '✅',
  diff: '⚠️',
  missing: '❌',
  unverified: '·',
  na: '—',
};

const STATUS_LABEL: Record<string, string> = {
  matched: '已匹配',
  diff: '有差異',
  missing: '缺失',
  unverified: '未核對',
  na: '不適用',
};

const STATUS_COLOR: Record<string, string> = {
  matched: 'text-green-600',
  diff: 'text-amber-500',
  missing: 'text-red-500',
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

// ── 詳情 Popup ──────────────────────────────────────────────
function DetailPopup({ matchId, sourceKey, onClose }: { matchId: number | null; sourceKey: string; onClose: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    verificationApi.getMatchDetail(matchId)
      .then(res => setDetail(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [matchId]);

  if (!matchId) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
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
              {/* 狀態 */}
              <div className="flex items-center gap-2">
                <span className="text-2xl">{STATUS_ICON[detail.match?.match_status] || '·'}</span>
                <span className="font-medium">{STATUS_LABEL[detail.match?.match_status] || '未知'}</span>
                {detail.match?.match_confidence != null && (
                  <span className="text-sm text-gray-500 ml-2">信心度: {Number(detail.match.match_confidence).toFixed(0)}%</span>
                )}
              </div>

              {/* 差異對比 */}
              {detail.diff_fields && Object.keys(detail.diff_fields).length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">差異欄位</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-2">欄位</th>
                        <th className="text-left px-4 py-2">系統值</th>
                        <th className="text-left px-4 py-2">來源值</th>
                        <th className="text-left px-4 py-2">差異</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(detail.diff_fields).map(([key, val]: [string, any]) => (
                        <tr key={key} className="border-t">
                          <td className="px-4 py-2 font-medium">{key}</td>
                          <td className="px-4 py-2">{val.sys}</td>
                          <td className="px-4 py-2">{val.src}</td>
                          <td className="px-4 py-2 text-amber-600">{val.diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 工作紀錄資訊 */}
              {detail.work_log && (
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="text-sm font-medium text-gray-600 mb-2">系統工作紀錄</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">日期：</span>{detail.work_log.scheduled_date?.slice(0, 10) || '—'}</div>
                    <div><span className="text-gray-500">車牌：</span>{detail.work_log.equipment_number || '—'}</div>
                    <div><span className="text-gray-500">入帳票：</span>{detail.work_log.receipt_no || '—'}</div>
                    <div><span className="text-gray-500">數量：</span>{detail.work_log.quantity || '—'}</div>
                    <div><span className="text-gray-500">起點：</span>{detail.work_log.start_location || '—'}</div>
                    <div><span className="text-gray-500">終點：</span>{detail.work_log.end_location || '—'}</div>
                  </div>
                </div>
              )}

              {/* 來源記錄資訊 */}
              {detail.source_record && (
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="text-sm font-medium text-gray-600 mb-2">來源記錄</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">日期：</span>{detail.source_record.record_work_date?.slice(0, 10) || '—'}</div>
                    <div><span className="text-gray-500">車牌：</span>{detail.source_record.record_vehicle_no || '—'}</div>
                    <div><span className="text-gray-500">地點：</span>{detail.source_record.record_location_from || '—'}</div>
                    <div><span className="text-gray-500">重量：</span>{detail.source_record.record_weight_net || '—'}</div>
                  </div>
                </div>
              )}

              {/* 操作按鈕 */}
              {detail.match?.match_status !== 'matched' && (
                <div className="flex gap-2 pt-2">
                  <ActionButton matchId={detail.match?.id} action="confirm" label="確認正確" color="bg-green-600" onDone={onClose} />
                  <ActionButton matchId={detail.match?.id} action="override" label="以來源覆蓋" color="bg-blue-600" onDone={onClose} />
                  <ActionButton matchId={detail.match?.id} action="ignore" label="忽略差異" color="bg-gray-500" onDone={onClose} />
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

function ActionButton({ matchId, action, label, color, onDone }: {
  matchId: number; action: string; label: string; color: string; onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      await verificationApi.performMatchAction(matchId, { action });
      onDone();
    } catch {}
    setLoading(false);
  };
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`${color} text-white px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50`}
    >
      {loading ? '處理中...' : label}
    </button>
  );
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

  // 點擊狀態圖標 — 需要找到對應的 matchId
  const handleCellClick = async (record: WorkbenchRecord, sourceKey: string) => {
    const statusField = `status_${sourceKey}` as keyof WorkbenchRecord;
    const status = record[statusField] as string;
    if (status === 'unverified' || status === 'na') return;

    // 我們需要取得這個工作紀錄對應的 match
    // 先用 workbench 回傳的 work_record_id 去查
    try {
      const res = await verificationApi.getWorkbench({
        search_keyword: record.chit_no !== '—' ? record.chit_no : undefined,
        page: 1,
        page_size: 1,
      });
      // 暫時用一個簡單的方式：直接打開 popup 顯示工作紀錄資訊
      // TODO: 需要後端提供 by work_record_id + source 查詢 match 的 API
      setPopupSourceKey(sourceKey);
      // 暫時設定一個 placeholder matchId
      setPopupMatchId(-1);
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* 頂部標題列 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">工作紀錄核對</h1>
          <p className="text-sm text-gray-500 mt-1">核對多來源工作紀錄，確保資料一致性</p>
        </div>
        <Link
          href="/verification/upload"
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
        >
          <span>📤</span>
          <span>上傳資料</span>
        </Link>
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
                <tr><td colSpan={13} className="text-center py-12 text-gray-400">載入中...</td></tr>
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
                    return (
                      <td key={key} className="text-center px-2 py-2.5">
                        <button
                          onClick={() => handleCellClick(rec, key)}
                          className={`text-lg cursor-pointer hover:scale-125 transition-transform ${STATUS_COLOR[status] || 'text-gray-400'}`}
                          title={`${SOURCE_LABELS[key]}: ${STATUS_LABEL[status] || status}`}
                          disabled={status === 'unverified' || status === 'na'}
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
