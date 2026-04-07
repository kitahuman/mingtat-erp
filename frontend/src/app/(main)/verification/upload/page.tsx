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

export default function VerificationUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sources
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('receipt');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    batch_id: number;
    batch_code: string;
    total_rows: number;
    imported_rows: number;
    matched_plate_rows: number;
    preview_data: PreviewRow[];
  } | null>(null);

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

  // 判斷是否為打卡紀錄（system 類型）
  const isClockSource = selectedSource === 'clock';
  // 判斷是否為需要上傳的來源
  const isUploadSource = !isClockSource;

  // ── 檔案處理 ──────────────────────────────────────────────────────
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

  const handleFile = useCallback(async (f: File) => {
    doUpload(f, false);
  }, [doUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

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
    setUploadResult(null);
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
          <p className="text-sm text-gray-500 mt-1">上傳入帳票 Excel 或同步系統資料</p>
        </div>
      </div>

      {/* 步驟 1: 選擇來源 */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-sm font-bold mr-2">1</span>
          選擇來源類型
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Excel 上傳類來源 */}
          {sources.filter(s => s.source_type === 'excel').map(s => (
            <button
              key={s.source_code}
              onClick={() => { setSelectedSource(s.source_code); handleReset(); }}
              className={`border-2 rounded-lg p-4 text-left transition-all ${
                selectedSource === s.source_code
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">{s.source_name}</div>
              <div className="text-xs text-gray-500 mt-1">{s.source_description}</div>
            </button>
          ))}
          {/* 打卡紀錄（system 類型）— 同步按鈕 */}
          {sources.filter(s => s.source_code === 'clock').map(s => (
            <button
              key={s.source_code}
              onClick={() => { setSelectedSource(s.source_code); handleReset(); }}
              className={`border-2 rounded-lg p-4 text-left transition-all ${
                selectedSource === s.source_code
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium flex items-center gap-2">
                <span>&#128337;</span>
                {s.source_name}
              </div>
              <div className="text-xs text-gray-500 mt-1">從系統自動同步打卡記錄</div>
            </button>
          ))}
          {/* 如果沒有任何來源，顯示預設 */}
          {sources.filter(s => s.source_type === 'excel' || s.source_code === 'clock').length === 0 && (
            <button
              onClick={() => setSelectedSource('receipt')}
              className={`border-2 rounded-lg p-4 text-left transition-all ${
                selectedSource === 'receipt'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">政府入帳票 Excel</div>
              <div className="text-xs text-gray-500 mt-1">香港環保署廢物處理設施管理系統匯出的入帳票紀錄</div>
            </button>
          )}
        </div>

        {/* 期間選擇 */}
        <div className="flex gap-4 mt-4">
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

      {/* 步驟 2: 上傳檔案 或 同步打卡 */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-sm font-bold mr-2">2</span>
          {isClockSource ? '同步打卡紀錄' : '上傳檔案'}
        </h2>

        {isClockSource ? (
          /* ── 打卡紀錄同步模式 ── */
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
                  onClick={handleSyncClock}
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
                    onClick={handleReset}
                    className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    重新同步
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── 檔案上傳模式 ── */
          <>
            {!uploadResult ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
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
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
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
                {uploadResult.preview_data.length > 0 && (
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
                          {uploadResult.preview_data.map((row, idx) => (
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
                      onClick={handleReset}
                      className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      繼續上傳
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
