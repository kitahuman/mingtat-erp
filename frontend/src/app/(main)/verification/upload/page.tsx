'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { verificationApi } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PreviewRow {
  _rowNumber: number;
  facility?: string;
  work_date?: string;
  vehicle_no?: string;
  account_no?: string;
  chit_no?: string;
  time_in?: string;
  time_out?: string;
  net_weight?: number;
  weight_in?: number;
  weight_out?: number;
}

interface SourceOption {
  id: number;
  source_code: string;
  source_name: string;
  source_type: string;
  source_description: string;
}

// ══════════════════════════════════════════════════════════════
// 來源分組配置
// ══════════════════════════════════════════════════════════════
const SOURCE_GROUPS = [
  {
    key: 'direct_import',
    title: '可直接匯入',
    subtitle: '上傳 Excel 檔案，系統自動解析匯入',
    icon: '📊',
    codes: ['receipt', 'gps'],
  },
  {
    key: 'ai_ocr',
    title: '需要 AI OCR',
    subtitle: '上傳掃描圖片，AI 辨識後人工確認',
    icon: '🤖',
    codes: ['slip_chit', 'slip_no_chit', 'driver_sheet', 'customer_record'],
  },
  {
    key: 'auto_receive',
    title: '自動接收',
    subtitle: '從系統自動同步或接收資料',
    icon: '🔄',
    codes: ['clock', 'whatsapp_order'],
  },
];

export default function VerificationUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sources
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('receipt');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    batch_id: number;
    batch_code: string;
    total_rows: number;
    imported_rows: number;
    matched_plate_rows: number;
    preview_data: PreviewRow[];
  } | null>(null);

  // OCR upload result
  const [ocrResult, setOcrResult] = useState<any>(null);

  // GPS upload result
  const [gpsResult, setGpsResult] = useState<any>(null);

  // Confirm state
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<any>(null);

  // Clock sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  // Drag state
  const [dragActive, setDragActive] = useState(false);

  // Period
  const now = new Date();
  const [periodYear, setPeriodYear] = useState<string>(String(now.getFullYear()));
  const [periodMonth, setPeriodMonth] = useState<string>(String(now.getMonth() + 1));

  // Load sources
  useEffect(() => {
    verificationApi.getSources()
      .then(res => setSources(res.data || []))
      .catch(() => {});
  }, []);

  // 判斷來源類型
  const selectedSourceObj = sources.find(s => s.source_code === selectedSource);
  const isClockSource = selectedSource === 'clock';
  const isWhatsAppSource = selectedSource === 'whatsapp_order';
  const isOcrSource = ['slip_chit', 'slip_no_chit', 'driver_sheet', 'customer_record'].includes(selectedSource);
  const isGpsSource = selectedSource === 'gps';
  const isExcelSource = selectedSource === 'receipt';

  // ── Excel 檔案上傳 ──────────────────────────────────────────
  const doUpload = useCallback(async (f: File, forceReimport: boolean) => {
    setFile(f);
    setUploadResult(null);
    setConfirmResult(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', f);
      formData.append('source_type', selectedSource);
      formData.append('period_year', periodYear);
      formData.append('period_month', periodMonth);
      if (forceReimport) {
        formData.append('force_reimport', 'true');
      }

      const res = await verificationApi.upload(formData);

      // 檢查是否為重複檔案警告
      if (res.data?.duplicate) {
        const eb = res.data.existing_batch;
        const confirmed = confirm(
          `此檔案已於 ${eb.upload_time} 上傳過（批次: ${eb.batch_code}，狀態: ${eb.status}，總行數: ${eb.total_rows}），是否確認重新匯入？`
        );
        if (confirmed) {
          setUploading(false);
          doUpload(f, true);
          return;
        } else {
          setUploading(false);
          setFile(null);
          return;
        }
      }

      setUploadResult(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '上傳失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setUploading(false);
  }, [selectedSource, periodYear, periodMonth]);

  // ── OCR 圖片上傳 ──────────────────────────────────────────
  const doOcrUpload = useCallback(async (fileList: File[]) => {
    setFiles(fileList);
    setOcrResult(null);
    setUploading(true);

    try {
      const formData = new FormData();
      fileList.forEach(f => formData.append('files', f));
      formData.append('source_type', selectedSource);
      formData.append('period_year', periodYear);
      formData.append('period_month', periodMonth);

      const res = await verificationApi.ocrProcess(formData);
      setOcrResult(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'OCR 處理失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setUploading(false);
  }, [selectedSource, periodYear, periodMonth]);

  // ── GPS Excel 上傳 ─────────────────────────────────────────
  const doGpsUpload = useCallback(async (f: File) => {
    setFile(f);
    setGpsResult(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', f);
      formData.append('period_year', periodYear);
      formData.append('period_month', periodMonth);

      const res = await verificationApi.gpsUpload(formData);
      setGpsResult(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'GPS 報表處理失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setUploading(false);
  }, [periodYear, periodMonth]);

  // ── 檔案處理分發 ──────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    if (isGpsSource) {
      doGpsUpload(f);
    } else {
      doUpload(f, false);
    }
  }, [isGpsSource, doGpsUpload, doUpload]);

  const handleOcrFiles = useCallback(async (fileList: FileList) => {
    const arr = Array.from(fileList);
    if (arr.length > 0) {
      doOcrUpload(arr);
    }
  }, [doOcrUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (isOcrSource) {
      if (e.dataTransfer.files?.length) {
        handleOcrFiles(e.dataTransfer.files);
      }
    } else if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [isOcrSource, handleFile, handleOcrFiles]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); };
  const handleDragLeave = () => setDragActive(false);

  // ── 確認匯入 ──────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!uploadResult) return;
    setConfirming(true);
    try {
      const res = await verificationApi.confirmBatch(uploadResult.batch_id);
      setConfirmResult(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '確認失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setConfirming(false);
  };

  // ── 同步打卡記錄 ──────────────────────────────────────────
  const handleSyncClock = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await verificationApi.syncClock({
        year: parseInt(periodYear),
        month: parseInt(periodMonth),
      });
      setSyncResult(res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '同步失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    setSyncing(false);
  };

  // ── 重置 ──────────────────────────────────────────────────
  const handleReset = () => {
    setFile(null);
    setFiles([]);
    setUploadResult(null);
    setOcrResult(null);
    setGpsResult(null);
    setConfirmResult(null);
    setSyncResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 頂部 */}
      <div className="flex items-center gap-4">
        <Link href="/verification" className="text-gray-400 hover:text-gray-600 text-lg">&larr;</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">上傳核對資料</h1>
          <p className="text-sm text-gray-500 mt-1">上傳 Excel、掃描圖片或同步系統資料</p>
        </div>
      </div>

      {/* 步驟 1: 選擇來源（三組分類）*/}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-sm font-bold mr-2">1</span>
          選擇來源類型
        </h2>

        <div className="space-y-6">
          {SOURCE_GROUPS.map(group => {
            const groupSources = sources.filter(s => group.codes.includes(s.source_code));
            // 如果沒有 source 資料，用 codes 作為 fallback
            const displayItems = groupSources.length > 0 ? groupSources : group.codes.map(code => ({
              id: 0,
              source_code: code,
              source_name: code,
              source_type: group.key,
              source_description: '',
            }));

            return (
              <div key={group.key}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{group.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-700">{group.title}</div>
                    <div className="text-xs text-gray-400">{group.subtitle}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pl-8">
                  {displayItems.map(s => {
                    const isDisabled = s.source_code === 'whatsapp_order';
                    return (
                      <button
                        key={s.source_code}
                        onClick={() => { if (!isDisabled) { setSelectedSource(s.source_code); handleReset(); } }}
                        disabled={isDisabled}
                        className={`border-2 rounded-lg p-4 text-left transition-all ${
                          isDisabled
                            ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                            : selectedSource === s.source_code
                              ? s.source_code === 'clock'
                                ? 'border-blue-500 bg-blue-50'
                                : group.key === 'ai_ocr'
                                  ? 'border-purple-500 bg-purple-50'
                                  : 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-sm">
                          {s.source_name}
                          {isDisabled && <span className="text-xs text-gray-400 ml-1">（第三階段）</span>}
                        </div>
                        {s.source_description && (
                          <div className="text-xs text-gray-500 mt-1">{s.source_description}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 期間選擇 */}
        <div className="flex gap-4 mt-6 pt-4 border-t">
          <div>
            <label className="block text-xs text-gray-500 mb-1">年份</label>
            <input
              type="number"
              value={periodYear}
              onChange={e => setPeriodYear(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-24"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">月份</label>
            <select
              value={periodMonth}
              onChange={e => setPeriodMonth(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1} 月</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 步驟 2: 操作區域 */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-sm font-bold mr-2">2</span>
          {isClockSource ? '同步打卡紀錄' : isOcrSource ? '上傳掃描圖片' : isGpsSource ? '上傳 GPS 追蹤報表' : '上傳檔案'}
        </h2>

        {/* ═══ 打卡紀錄同步模式 ═══ */}
        {isClockSource && (
          <ClockSyncSection
            periodYear={periodYear}
            periodMonth={periodMonth}
            syncing={syncing}
            syncResult={syncResult}
            onSync={handleSyncClock}
            onReset={handleReset}
          />
        )}

        {/* ═══ WhatsApp（尚未開放）═══ */}
        {isWhatsAppSource && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-gray-500">WhatsApp Order 接收功能將在第三階段開放</p>
          </div>
        )}

        {/* ═══ OCR 圖片上傳模式 ═══ */}
        {isOcrSource && (
          <OcrUploadSection
            fileInputRef={fileInputRef}
            uploading={uploading}
            ocrResult={ocrResult}
            files={files}
            dragActive={dragActive}
            selectedSource={selectedSource}
            selectedSourceName={selectedSourceObj?.source_name || selectedSource}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onFilesSelect={handleOcrFiles}
            onReset={handleReset}
          />
        )}

        {/* ═══ GPS Excel 上傳模式 ═══ */}
        {isGpsSource && (
          <GpsUploadSection
            fileInputRef={fileInputRef}
            uploading={uploading}
            gpsResult={gpsResult}
            file={file}
            dragActive={dragActive}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onFileSelect={(f) => handleFile(f)}
            onReset={handleReset}
          />
        )}

        {/* ═══ Excel 上傳模式（政府入帳票）═══ */}
        {isExcelSource && (
          <ExcelUploadSection
            fileInputRef={fileInputRef}
            uploading={uploading}
            uploadResult={uploadResult}
            confirmResult={confirmResult}
            confirming={confirming}
            file={file}
            dragActive={dragActive}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onFileSelect={(f) => handleFile(f)}
            onConfirm={handleConfirm}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 打卡紀錄同步區塊
// ══════════════════════════════════════════════════════════════
function ClockSyncSection({
  periodYear,
  periodMonth,
  syncing,
  syncResult,
  onSync,
  onReset,
}: {
  periodYear: string;
  periodMonth: string;
  syncing: boolean;
  syncResult: any;
  onSync: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      {!syncResult ? (
        <div className="text-center py-8">
          <div className="text-5xl mb-4">&#128337;</div>
          <p className="text-gray-600 mb-2">
            同步 <span className="font-semibold">{periodYear} 年 {periodMonth} 月</span> 的打卡紀錄
          </p>
          <p className="text-xs text-gray-400 mb-6">
            系統將自動從員工打卡記錄中提取資料，按員工+日期分組後與工作紀錄配對
          </p>
          <button
            onClick={onSync}
            disabled={syncing}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2 text-base"
          >
            {syncing ? (
              <>
                <span className="animate-spin inline-block">&#9203;</span>
                <span>同步中...</span>
              </>
            ) : (
              <>
                <span>&#128260;</span>
                <span>開始同步打卡紀錄</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {syncResult.status === 'empty' ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-yellow-600 text-lg">&#9888;&#65039;</span>
                <span className="font-medium text-yellow-800">無打卡記錄</span>
              </div>
              <p className="text-sm text-yellow-700">{syncResult.message}</p>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-blue-600 text-lg">&#127881;</span>
                <span className="font-medium text-blue-800">同步及配對完成</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">原始打卡數</div>
                  <div className="font-medium">{syncResult.total_attendance_records || 0}</div>
                </div>
                <div>
                  <div className="text-gray-500">同步記錄</div>
                  <div className="font-medium text-blue-600">{syncResult.synced_count}</div>
                </div>
                <div>
                  <div className="text-gray-500">已匹配</div>
                  <div className="font-medium text-green-600">{syncResult.matched_count}</div>
                </div>
                <div>
                  <div className="text-gray-500">有差異</div>
                  <div className="font-medium text-amber-500">{syncResult.diff_count}</div>
                </div>
                <div>
                  <div className="text-gray-500">缺失</div>
                  <div className="font-medium text-red-500">{syncResult.missing_count}</div>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Link
              href="/verification"
              className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm"
            >
              前往核對工作台
            </Link>
            <button
              onClick={onReset}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
            >
              重新同步
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// OCR 圖片上傳區塊
// ══════════════════════════════════════════════════════════════
function OcrUploadSection({
  fileInputRef,
  uploading,
  ocrResult,
  files,
  dragActive,
  selectedSource,
  selectedSourceName,
  onDrop,
  onDragOver,
  onDragLeave,
  onFilesSelect,
  onReset,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  ocrResult: any;
  files: File[];
  dragActive: boolean;
  selectedSource: string;
  selectedSourceName: string;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFilesSelect: (files: FileList) => void;
  onReset: () => void;
}) {
  return (
    <>
      {!ocrResult ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            dragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={e => e.target.files && onFilesSelect(e.target.files)}
          />
          {uploading ? (
            <div className="space-y-2">
              <div className="text-4xl animate-spin inline-block">&#9203;</div>
              <div className="text-gray-600">AI 正在辨識檔案中...</div>
              <div className="text-xs text-gray-400">這可能需要幾秒到幾分鐘，取決於圖片數量</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-4xl">&#128247;</div>
              <div className="text-gray-600">拖放圖片或 PDF 到此處，或點擊選擇檔案</div>
              <div className="text-xs text-gray-400">
                支援 JPG, PNG, PDF 格式，可多選（最多 20 張），每張最大 50MB
              </div>
              <div className="mt-2 inline-block px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs">
                來源類型：{selectedSourceName}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* OCR 結果摘要 */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-purple-600 text-lg">&#129302;</span>
              <span className="font-medium text-purple-800">AI OCR 辨識完成</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500">批次編號</div>
                <div className="font-medium font-mono">{ocrResult.batch_code}</div>
              </div>
              <div>
                <div className="text-gray-500">上傳圖片數</div>
                <div className="font-medium">{ocrResult.total_files}</div>
              </div>
              <div>
                <div className="text-gray-500">辨識成功</div>
                <div className="font-medium text-green-600">{ocrResult.success_count}</div>
              </div>
              <div>
                <div className="text-gray-500">辨識失敗</div>
                <div className="font-medium text-red-500">{ocrResult.failed_count}</div>
              </div>
            </div>
          </div>

          {/* 個別結果列表 */}
          {ocrResult.results && ocrResult.results.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600">
                辨識結果明細
              </div>
              <div className="divide-y max-h-[300px] overflow-y-auto">
                {ocrResult.results.map((r: any, idx: number) => (
                  <div key={idx} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${r.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm">{r.file_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.confidence > 0 && (
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                          r.confidence >= 85 ? 'bg-green-50 text-green-700'
                            : r.confidence >= 70 ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {r.confidence}%
                        </span>
                      )}
                      <span className={`text-xs ${r.status === 'completed' ? 'text-green-600' : 'text-red-500'}`}>
                        {r.status === 'completed' ? '辨識成功' : '辨識失敗'}
                      </span>
                      {r.error && (
                        <span className="text-xs text-red-400" title={r.error}>
                          ({r.error.length > 50 ? r.error.slice(0, 50) + '...' : r.error})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 操作按鈕 */}
          <div className="flex gap-3">
            <Link
              href="/verification/ocr"
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm"
            >
              前往確認 OCR 結果
            </Link>
            <button
              onClick={onReset}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
            >
              繼續上傳
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// GPS Excel 上傳區塊
// ══════════════════════════════════════════════════════════════
function GpsUploadSection({
  fileInputRef,
  uploading,
  gpsResult,
  file,
  dragActive,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onReset,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  gpsResult: any;
  file: File | null;
  dragActive: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFileSelect: (f: File) => void;
  onReset: () => void;
}) {
  return (
    <>
      {!gpsResult ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            dragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => e.target.files?.[0] && onFileSelect(e.target.files[0])}
          />
          {uploading ? (
            <div className="space-y-2">
              <div className="text-4xl animate-spin inline-block">&#9203;</div>
              <div className="text-gray-600">正在解析 GPS 追蹤報表並生成行程摘要...</div>
              <div className="text-xs text-gray-400">AI 正在分析 GPS 軌跡資料，這可能需要幾分鐘</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-4xl">&#128205;</div>
              <div className="text-gray-600">拖放 GPS 追蹤報表 Excel 到此處，或點擊選擇檔案</div>
              <div className="text-xs text-gray-400">支援 Autotoll 格式的 .xlsx, .xls, .csv 檔案，最大 50MB</div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* GPS 結果摘要 */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-green-600 text-lg">&#128205;</span>
              <span className="font-medium text-green-800">GPS 報表處理完成</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500">批次編號</div>
                <div className="font-medium font-mono">{gpsResult.batch_code}</div>
              </div>
              <div>
                <div className="text-gray-500">原始 GPS 點數</div>
                <div className="font-medium">{gpsResult.total_raw_rows}</div>
              </div>
              <div>
                <div className="text-gray-500">車牌/日分組</div>
                <div className="font-medium">{gpsResult.vehicle_day_groups}</div>
              </div>
              <div>
                <div className="text-gray-500">摘要生成</div>
                <div className="font-medium text-green-600">{gpsResult.summaries_completed}</div>
              </div>
            </div>
          </div>

          {/* GPS 摘要列表 */}
          {gpsResult.summaries && gpsResult.summaries.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600">
                行程摘要明細
              </div>
              <div className="divide-y max-h-[300px] overflow-y-auto">
                {gpsResult.summaries.map((s: any, idx: number) => (
                  <div key={idx} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${s.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm font-mono">{s.vehicle_no}</span>
                      <span className="text-xs text-gray-400">{s.date}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {s.trip_count != null && (
                        <span className="text-gray-500">{s.trip_count} 段行程</span>
                      )}
                      {s.total_distance != null && (
                        <span className="text-gray-500">{Number(s.total_distance).toFixed(1)} km</span>
                      )}
                      <span className={s.status === 'completed' ? 'text-green-600' : 'text-red-500'}>
                        {s.status === 'completed' ? '成功' : '失敗'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 操作按鈕 */}
          <div className="flex gap-3">
            <Link
              href="/verification/batches"
              className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm"
            >
              查看匯入紀錄
            </Link>
            <button
              onClick={onReset}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
            >
              繼續上傳
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// Excel 上傳區塊（政府入帳票）
// ══════════════════════════════════════════════════════════════
function ExcelUploadSection({
  fileInputRef,
  uploading,
  uploadResult,
  confirmResult,
  confirming,
  file,
  dragActive,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onConfirm,
  onReset,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  uploadResult: any;
  confirmResult: any;
  confirming: boolean;
  file: File | null;
  dragActive: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFileSelect: (f: File) => void;
  onConfirm: () => void;
  onReset: () => void;
}) {
  return (
    <>
      {!uploadResult ? (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            dragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => e.target.files?.[0] && onFileSelect(e.target.files[0])}
          />
          {uploading ? (
            <div className="space-y-2">
              <div className="text-4xl animate-spin inline-block">&#9203;</div>
              <div className="text-gray-600">正在上傳和解析檔案...</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-4xl">&#128193;</div>
              <div className="text-gray-600">拖放檔案到此處，或點擊選擇檔案</div>
              <div className="text-xs text-gray-400">支援 .xlsx, .xls, .csv 格式，最大 50MB</div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 上傳結果摘要 */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-600 text-lg">&#9989;</span>
              <span className="font-medium text-green-800">檔案解析完成</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500">檔案名稱</div>
                <div className="font-medium">{file?.name}</div>
              </div>
              <div>
                <div className="text-gray-500">批次編號</div>
                <div className="font-medium font-mono">{uploadResult.batch_code}</div>
              </div>
              <div>
                <div className="text-gray-500">總行數</div>
                <div className="font-medium">{uploadResult.total_rows}</div>
              </div>
              <div>
                <div className="text-gray-500">匯入記錄數</div>
                <div className="font-medium text-primary-600">{uploadResult.imported_rows}</div>
              </div>
              <div>
                <div className="text-gray-500">公司車牌匹配</div>
                <div className="font-medium text-blue-600">{uploadResult.matched_plate_rows}</div>
              </div>
            </div>
          </div>

          {/* 預覽表格 */}
          {uploadResult.preview_data && uploadResult.preview_data.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600 flex items-center justify-between">
                <span>預覽資料（前 {Math.min(50, uploadResult.preview_data.length)} 筆）</span>
                <span className="text-xs text-gray-400">共 {uploadResult.imported_rows} 筆匯入（{uploadResult.matched_plate_rows} 筆匹配公司車牌）</span>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">#</th>
                      <th className="text-left px-3 py-2">日期</th>
                      <th className="text-left px-3 py-2">車牌</th>
                      <th className="text-left px-3 py-2">設施</th>
                      <th className="text-left px-3 py-2">入帳票號</th>
                      <th className="text-left px-3 py-2">進入時間</th>
                      <th className="text-left px-3 py-2">離開時間</th>
                      <th className="text-right px-3 py-2">淨重(噸)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.preview_data.map((row: PreviewRow, idx: number) => (
                      <tr key={idx} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-400">{row._rowNumber}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{row.work_date || '—'}</td>
                        <td className="px-3 py-1.5 font-mono">{row.vehicle_no || '—'}</td>
                        <td className="px-3 py-1.5">{row.facility || '—'}</td>
                        <td className="px-3 py-1.5 font-mono">{row.chit_no || '—'}</td>
                        <td className="px-3 py-1.5">{row.time_in || '—'}</td>
                        <td className="px-3 py-1.5">{row.time_out || '—'}</td>
                        <td className="px-3 py-1.5 text-right">{row.net_weight != null ? Number(row.net_weight).toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 匯入成功操作按鈕 */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-green-600 text-lg">&#9989;</span>
              <span className="font-medium text-green-800">匯入成功</span>
            </div>
            <div className="text-sm text-gray-600 mb-3">
              已匯入 {uploadResult.imported_rows} 筆記錄到系統。可在「匯入紀錄」頁面查看或開始配對。
            </div>
            <div className="flex gap-3">
              <Link
                href="/verification/batches"
                className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm"
              >
                查看匯入紀錄
              </Link>
              <button
                onClick={onReset}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
              >
                繼續上傳
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
