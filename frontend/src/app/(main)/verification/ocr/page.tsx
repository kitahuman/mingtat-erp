'use client';
import { useState, useEffect, useCallback } from 'react';
import { verificationApi } from '@/lib/api';
import Link from 'next/link';

// ══════════════════════════════════════════════════════════════
// 類型定義
// ══════════════════════════════════════════════════════════════
interface OcrResultItem {
  id: number;
  ocr_file_name: string | null;
  ocr_image_url: string | null;
  ocr_image_base64: string | null;
  ocr_extracted_data: Record<string, any> | null;
  ocr_confidence_overall: number | null;
  ocr_field_confidence: Record<string, number> | null;
  ocr_engine: string;
  ocr_status: string;
  ocr_user_confirmed: boolean;
  ocr_created_at: string;
  batch: {
    batch_code: string;
    batch_period_year: number | null;
    batch_period_month: number | null;
  };
  source: {
    source_code: string;
    source_name: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// ══════════════════════════════════════════════════════════════
// 信心度顏色
// ══════════════════════════════════════════════════════════════
function confidenceColor(confidence: number): string {
  if (confidence >= 85) return 'text-green-700 bg-green-50';
  if (confidence >= 70) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-700 bg-red-50';
}

function confidenceBorder(confidence: number): string {
  if (confidence >= 85) return 'border-green-200';
  if (confidence >= 70) return 'border-yellow-200';
  return 'border-red-300';
}

// ══════════════════════════════════════════════════════════════
// 欄位中文標籤
// ══════════════════════════════════════════════════════════════
const FIELD_LABELS: Record<string, string> = {
  slip_no: '飛仔編號',
  company: '公司名稱',
  date: '工作日期',
  cargo: '貨名',
  quantity: '數量',
  vehicle_no: '車牌號碼',
  chit_no_list: '入帳票號碼',
  location_from: '起點',
  location_to: '終點',
  contract: '合約編號',
  remarks: '備註',
  issuer: '發票人',
  driver_name: '司機姓名',
  month_period: '月份期間',
  work_items: '工作項目',
  doc_no: 'DOC 編號',
  machine_type: '機械種類',
  customer: '客戶公司',
  work_area: '工作區域',
  month: '月份',
  daily_records: '每日記錄',
  time_in: '上班時間',
  time_out: '下班時間',
  lunch_break: '中晝休息',
  operator_sign: '機手簽署',
  client_sign: '客戶管工簽署',
  waybill_no: '運單號碼',
  attendance: '出勤標記',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待處理', color: 'bg-yellow-100 text-yellow-800' },
  processing: { label: '辨識中', color: 'bg-blue-100 text-blue-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
  failed: { label: '辨識失敗', color: 'bg-red-100 text-red-800' },
};

// ══════════════════════════════════════════════════════════════
// 取得圖片顯示 URL（優先 base64，fallback 到 URL）
// ══════════════════════════════════════════════════════════════
function getImageSrc(item: { ocr_image_base64?: string | null; ocr_image_url?: string | null }): string {
  // 優先使用 base64（最可靠，不受 Render ephemeral 文件系統影響）
  if (item.ocr_image_base64) {
    return item.ocr_image_base64;
  }
  // Fallback 到 URL
  if (item.ocr_image_url) {
    if (item.ocr_image_url.startsWith('http')) return item.ocr_image_url;
    // 拼接後端 URL（通過 next.config.js rewrite 代理）
    return item.ocr_image_url;
  }
  return '';
}

// ══════════════════════════════════════════════════════════════
// 主頁面元件
// ══════════════════════════════════════════════════════════════
export default function VerificationOcrPage() {
  const [results, setResults] = useState<OcrResultItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<OcrResultItem | null>(null);
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [confirming, setConfirming] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // ── 載入 OCR 結果列表 ──────────────────────────────────────
  const fetchResults = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await verificationApi.ocrPending({
        page,
        limit: 20,
        status: statusFilter || undefined,
      });
      setResults(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 });
    } catch {
      // ignore
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchResults(1);
  }, [fetchResults]);

  // ── 選擇結果進行確認 ──────────────────────────────────────
  const handleSelect = (item: OcrResultItem) => {
    setSelectedResult(item);
    setEditedData(item.ocr_extracted_data ? { ...item.ocr_extracted_data } : {});
  };

  // ── 更新編輯中的欄位值 ────────────────────────────────────
  const handleFieldChange = (key: string, value: any) => {
    setEditedData((prev) => ({ ...prev, [key]: value }));
  };

  // ── 更新巢狀陣列中的欄位值 ────────────────────────────────
  const handleArrayItemChange = (arrayKey: string, index: number, field: string, value: any) => {
    setEditedData((prev) => {
      const arr = [...(prev[arrayKey] || [])];
      arr[index] = { ...arr[index], [field]: value };
      return { ...prev, [arrayKey]: arr };
    });
  };

  // ── 確認 OCR 結果 ─────────────────────────────────────────
  const handleConfirm = async () => {
    if (!selectedResult) return;
    setConfirming(true);
    try {
      // 計算修正的欄位
      const corrections: Record<string, any> = {};
      const original = selectedResult.ocr_extracted_data || {};
      for (const key of Object.keys(editedData)) {
        if (JSON.stringify(editedData[key]) !== JSON.stringify(original[key])) {
          corrections[key] = editedData[key];
        }
      }
      const hasCorrections = Object.keys(corrections).length > 0;

      await verificationApi.ocrConfirm(
        selectedResult.id,
        hasCorrections ? corrections : undefined,
      );

      // 移到下一張或關閉
      const currentIndex = results.findIndex((r) => r.id === selectedResult.id);
      const nextUnconfirmed = results.find((r, i) => i > currentIndex && !r.ocr_user_confirmed && r.ocr_status === 'completed');
      if (nextUnconfirmed) {
        handleSelect(nextUnconfirmed);
      } else {
        setSelectedResult(null);
      }
      fetchResults(pagination.page);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '確認失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setConfirming(false);
  };

  // ── 跳過 ──────────────────────────────────────────────────
  const handleSkip = () => {
    if (!selectedResult) return;
    const currentIndex = results.findIndex((r) => r.id === selectedResult.id);
    const next = results.find((r, i) => i > currentIndex && !r.ocr_user_confirmed && r.ocr_status === 'completed');
    if (next) {
      handleSelect(next);
    } else {
      setSelectedResult(null);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // 渲染
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 max-w-7xl">
      {/* 頂部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/verification" className="text-gray-400 hover:text-gray-600 text-lg">&larr;</Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">AI OCR 辨識結果確認</h1>
            <p className="text-sm text-gray-500 mt-1">
              確認 AI 辨識結果，修正錯誤欄位後匯入系統
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2"
          >
            <option value="">待確認</option>
            <option value="all">全部</option>
            <option value="completed">已辨識</option>
            <option value="failed">辨識失敗</option>
          </select>
          <Link
            href="/verification/upload"
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm"
          >
            上傳新圖片
          </Link>
        </div>
      </div>

      {/* 主內容區 */}
      {selectedResult ? (
        <OcrDetailView
          result={selectedResult}
          editedData={editedData}
          confirming={confirming}
          onFieldChange={handleFieldChange}
          onArrayItemChange={handleArrayItemChange}
          onConfirm={handleConfirm}
          onSkip={handleSkip}
          onClose={() => setSelectedResult(null)}
        />
      ) : (
        <OcrResultList
          results={results}
          loading={loading}
          pagination={pagination}
          onSelect={handleSelect}
          onPageChange={fetchResults}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// OCR 結果列表元件
// ══════════════════════════════════════════════════════════════
function OcrResultList({
  results,
  loading,
  pagination,
  onSelect,
  onPageChange,
}: {
  results: OcrResultItem[];
  loading: boolean;
  pagination: Pagination;
  onSelect: (item: OcrResultItem) => void;
  onPageChange: (page: number) => void;
}) {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {loading ? (
        <div className="p-12 text-center text-gray-400">載入中...</div>
      ) : results.length === 0 ? (
        <div className="p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <div>尚無待確認的 OCR 結果</div>
          <Link href="/verification/upload" className="text-primary-600 hover:underline text-sm mt-2 inline-block">
            前往上傳掃描圖片
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">檔案名稱</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">來源類型</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">批次</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">信心度</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">上傳時間</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => {
                const statusCfg = STATUS_CONFIG[item.ocr_status] || { label: item.ocr_status, color: 'bg-gray-100 text-gray-600' };
                const confidence = item.ocr_confidence_overall ? Number(item.ocr_confidence_overall) : 0;
                const imgSrc = getImageSrc(item);
                return (
                  <tr key={item.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {imgSrc && (
                          <div className="w-10 h-10 rounded border overflow-hidden flex-shrink-0 bg-gray-100">
                            <img
                              src={imgSrc}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        )}
                        <span className="truncate max-w-[200px]" title={item.ocr_file_name || ''}>
                          {item.ocr_file_name || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{item.source?.source_name || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{item.batch?.batch_code || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {item.ocr_status === 'completed' ? (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${confidenceColor(confidence)}`}>
                          {confidence}%
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                        {item.ocr_user_confirmed ? '✅ 已確認' : statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">{formatDate(item.ocr_created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      {item.ocr_status === 'completed' && !item.ocr_user_confirmed ? (
                        <button
                          onClick={() => onSelect(item)}
                          className="text-primary-600 hover:text-primary-800 text-xs font-medium"
                        >
                          確認結果
                        </button>
                      ) : item.ocr_user_confirmed ? (
                        <button
                          onClick={() => onSelect(item)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          查看
                        </button>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 分頁 */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
          <div className="text-xs text-gray-500">
            共 {pagination.total} 筆，第 {pagination.page} / {pagination.total_pages} 頁
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 text-xs border rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              上一頁
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              className="px-3 py-1 text-xs border rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一頁
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// OCR 詳情確認元件（左右分欄）
// ══════════════════════════════════════════════════════════════
function OcrDetailView({
  result,
  editedData,
  confirming,
  onFieldChange,
  onArrayItemChange,
  onConfirm,
  onSkip,
  onClose,
}: {
  result: OcrResultItem;
  editedData: Record<string, any>;
  confirming: boolean;
  onFieldChange: (key: string, value: any) => void;
  onArrayItemChange: (arrayKey: string, index: number, field: string, value: any) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const fieldConfidence = result.ocr_field_confidence || {};
  const overallConfidence = result.ocr_confidence_overall ? Number(result.ocr_confidence_overall) : 0;
  const isConfirmed = result.ocr_user_confirmed;
  const imgSrc = getImageSrc(result);

  // 判斷是否有巢狀陣列（功課表的 work_items 或客戶紀錄的 daily_records）
  const arrayFields = Object.entries(editedData).filter(([, v]) => Array.isArray(v));
  const simpleFields = Object.entries(editedData).filter(([, v]) => !Array.isArray(v));

  return (
    <div className="space-y-4">
      {/* 頂部資訊列 */}
      <div className="flex items-center justify-between bg-white rounded-xl border px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&larr; 返回列表</button>
          <div className="h-6 border-l border-gray-200" />
          <div>
            <span className="text-sm font-medium text-gray-800">{result.ocr_file_name}</span>
            <span className="text-xs text-gray-400 ml-3">{result.source?.source_name}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${confidenceColor(overallConfidence)}`}>
            整體信心度 {overallConfidence}%
          </span>
          {isConfirmed && (
            <span className="text-green-600 text-xs font-medium">✅ 已確認</span>
          )}
        </div>
      </div>

      {/* 左右分欄 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左側：原始掃描圖片 */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="text-sm font-medium text-gray-700">原始掃描圖片</h3>
          </div>
          <div className="p-4">
            {imgSrc ? (
              <div className="relative">
                <img
                  src={imgSrc}
                  alt={result.ocr_file_name || '掃描圖片'}
                  className="w-full rounded-lg border"
                  style={{ maxHeight: '70vh', objectFit: 'contain' }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    // 如果 base64 失敗，嘗試 fallback 到 URL
                    if (result.ocr_image_base64 && target.src === result.ocr_image_base64 && result.ocr_image_url) {
                      target.src = result.ocr_image_url;
                      return;
                    }
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.innerHTML = '<div class="p-8 text-center text-gray-400">圖片載入失敗</div>';
                    }
                  }}
                />
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400">無圖片</div>
            )}
          </div>
        </div>

        {/* 右側：OCR 辨識結果 */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="text-sm font-medium text-gray-700">OCR 辨識結果</h3>
            <p className="text-xs text-gray-400 mt-0.5">紅色/橙色標記的欄位信心度較低，請仔細核對</p>
          </div>
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* 簡單欄位 */}
            {simpleFields.map(([key, value]) => {
              const confidence = fieldConfidence[key] || 0;
              const label = FIELD_LABELS[key] || key;

              return (
                <div key={key} className={`border rounded-lg p-3 ${confidenceBorder(confidence)}`}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-600">{label}</label>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${confidenceColor(confidence)}`}>
                      {confidence}%
                    </span>
                  </div>
                  {key === 'chit_no_list' && Array.isArray(value) ? (
                    <input
                      type="text"
                      value={(value || []).join(', ')}
                      onChange={(e) => onFieldChange(key, e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                      disabled={isConfirmed}
                      className="w-full text-sm border rounded px-2 py-1.5 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                      placeholder="多個號碼用逗號分隔"
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(value || '')}
                      onChange={(e) => onFieldChange(key, e.target.value)}
                      disabled={isConfirmed}
                      className="w-full text-sm border rounded px-2 py-1.5 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  )}
                </div>
              );
            })}

            {/* 巢狀陣列欄位（功課表工作項目 / 客戶紀錄每日記錄）*/}
            {arrayFields.map(([arrayKey, items]) => {
              const arrayLabel = FIELD_LABELS[arrayKey] || arrayKey;
              const arrayConfidence = fieldConfidence[arrayKey] || 0;

              return (
                <div key={arrayKey} className="border rounded-lg overflow-hidden">
                  <div className={`px-3 py-2 bg-gray-50 border-b flex items-center justify-between ${confidenceBorder(arrayConfidence)}`}>
                    <span className="text-xs font-medium text-gray-700">{arrayLabel}（共 {(items as any[]).length} 筆）</span>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${confidenceColor(arrayConfidence)}`}>
                      {arrayConfidence}%
                    </span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {(items as any[]).map((item: Record<string, any>, idx: number) => (
                      <div key={idx} className="p-3 border-b last:border-b-0">
                        <div className="text-xs text-gray-400 mb-2 font-medium">#{idx + 1}</div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(item).map(([field, val]) => {
                            const fieldLabel = FIELD_LABELS[field] || field;
                            return (
                              <div key={field}>
                                <label className="text-[10px] text-gray-500">{fieldLabel}</label>
                                {field === 'chit_no_list' && Array.isArray(val) ? (
                                  <input
                                    type="text"
                                    value={(val || []).join(', ')}
                                    onChange={(e) =>
                                      onArrayItemChange(
                                        arrayKey,
                                        idx,
                                        field,
                                        e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean),
                                      )
                                    }
                                    disabled={isConfirmed}
                                    className="w-full text-xs border rounded px-1.5 py-1 disabled:bg-gray-50 disabled:text-gray-500"
                                    placeholder="逗號分隔"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={String(val || '')}
                                    onChange={(e) => onArrayItemChange(arrayKey, idx, field, e.target.value)}
                                    disabled={isConfirmed}
                                    className="w-full text-xs border rounded px-1.5 py-1 disabled:bg-gray-50 disabled:text-gray-500"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部操作按鈕 */}
          {!isConfirmed && (
            <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
              <button
                onClick={onSkip}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                跳過
              </button>
              <button
                onClick={onConfirm}
                disabled={confirming}
                className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
              >
                {confirming ? '確認中...' : '確認並處理下一張'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
