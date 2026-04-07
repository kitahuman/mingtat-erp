'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanyClockAuth } from '@/lib/company-clock-auth';
import { companyClockApi } from '@/lib/company-clock-api';

interface Employee {
  id: number;
  emp_code?: string | null;
  name_zh: string;
  name_en?: string | null;
  nickname?: string | null;
  role: string;
  phone?: string | null;
  company_id: number;
  hasStandardPhoto: boolean;
  employee_is_temporary: boolean;
  status: string;
  company?: { id: number; name: string; internal_prefix?: string | null } | null;
}

interface AttendanceRecord {
  id: number;
  type: string;
  timestamp: string;
  attendance_verification_method?: string | null;
  attendance_verification_score?: number | null;
  employee: {
    id: number;
    name_zh: string;
    name_en?: string | null;
    emp_code?: string | null;
    company?: { name: string; internal_prefix?: string | null } | null;
  };
}

type Step = 'list' | 'camera' | 'verifying' | 'result' | 'temp_employee';

export default function CompanyClockPage() {
  const { user, logout, loading: authLoading } = useCompanyClockAuth();
  const router = useRouter();

  // Employee list state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<number | ''>('');
  const [companies, setCompanies] = useState<{ id: number; name: string; internal_prefix?: string | null }[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listTotal, setListTotal] = useState(0);
  const [listPage, setListPage] = useState(1);

  // Flow state
  const [step, setStep] = useState<Step>('list');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [clockType, setClockType] = useState<'clock_in' | 'clock_out'>('clock_in');

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Result state
  const [resultMessage, setResultMessage] = useState('');
  const [resultType, setResultType] = useState<'success' | 'error'>('success');
  const [verificationInfo, setVerificationInfo] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  // Today's records
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [showRecords, setShowRecords] = useState(false);

  // Temp employee form
  const [tempName, setTempName] = useState('');
  const [tempNameEn, setTempNameEn] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [tempCompanyId, setTempCompanyId] = useState<number | ''>('');

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/company-clock/login');
    }
  }, [authLoading, user, router]);

  // Load companies
  useEffect(() => {
    if (user) {
      companyClockApi.getCompanies().then((res) => {
        setCompanies(res.data);
      }).catch(() => {});
    }
  }, [user]);

  // Load employees
  const loadEmployees = useCallback(async (page = 1) => {
    setListLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (search) params.search = search;
      if (companyFilter) params.company_id = companyFilter;
      const res = await companyClockApi.getEmployees(params);
      setEmployees(res.data.data);
      setListTotal(res.data.total);
      setListPage(page);
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setListLoading(false);
    }
  }, [search, companyFilter]);

  useEffect(() => {
    if (user) {
      loadEmployees(1);
    }
  }, [user, loadEmployees]);

  // Load today's records
  const loadTodayRecords = useCallback(async () => {
    try {
      const params: any = {};
      if (companyFilter) params.company_id = companyFilter;
      const res = await companyClockApi.getTodayAttendances(params);
      setTodayRecords(res.data.records || []);
    } catch {}
  }, [companyFilter]);

  useEffect(() => {
    if (user) {
      loadTodayRecords();
    }
  }, [user, loadTodayRecords]);

  // ── Camera Functions ──────────────────────────────────
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      // Fallback to file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'user';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setPhotoDataUrl(ev.target?.result as string);
            setCameraOpen(false);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // Compress to max 800px for smaller payload
    const maxSize = 800;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > maxSize || h > maxSize) {
      if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize; }
      else { w = Math.round((w * maxSize) / h); h = maxSize; }
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    setPhotoDataUrl(dataUrl);
    closeCamera();
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  // ── Select Employee ───────────────────────────────────
  const handleSelectEmployee = (emp: Employee, type: 'clock_in' | 'clock_out') => {
    setSelectedEmployee(emp);
    setClockType(type);
    setPhotoDataUrl(null);
    setStep('camera');
    setResultMessage('');
    setVerificationInfo(null);
  };

  // ── Submit Clock ──────────────────────────────────────
  const handleSubmitClock = async () => {
    if (!selectedEmployee || !photoDataUrl) return;

    setStep('verifying');
    setProcessing(true);
    setResultMessage('');

    try {
      const res = await companyClockApi.clock({
        employee_id: selectedEmployee.id,
        photo_base64: photoDataUrl,
        type: clockType,
      });

      setResultType('success');
      setVerificationInfo(res.data.verification);

      if (res.data.verification?.isFirstTime) {
        setResultMessage(
          `${res.data.employee.name_zh} 首次打卡成功！照片已存為標準照。`
        );
      } else {
        const score = res.data.verification?.score;
        setResultMessage(
          `${res.data.employee.name_zh} ${clockType === 'clock_in' ? '上班' : '下班'}打卡成功！${score ? `（相似度: ${score}%）` : ''}`
        );
      }

      setStep('result');
      await loadTodayRecords();
    } catch (err: any) {
      setResultType('error');
      setResultMessage(err.response?.data?.message || '打卡失敗');
      setStep('result');
    } finally {
      setProcessing(false);
    }
  };

  // ── Create Temporary Employee ─────────────────────────
  const handleCreateTemp = async () => {
    if (!tempName || !tempCompanyId || !photoDataUrl) return;

    setProcessing(true);
    try {
      const res = await companyClockApi.createTemporaryEmployee({
        name_zh: tempName,
        name_en: tempNameEn || undefined,
        phone: tempPhone || undefined,
        photo_base64: photoDataUrl,
        company_id: Number(tempCompanyId),
      });

      setResultType('success');
      setResultMessage(res.data.message);
      setStep('result');
      setTempName('');
      setTempNameEn('');
      setTempPhone('');
      setTempCompanyId('');
      await loadEmployees(1);
      await loadTodayRecords();
    } catch (err: any) {
      setResultType('error');
      setResultMessage(err.response?.data?.message || '建立臨時員工失敗');
      setStep('result');
    } finally {
      setProcessing(false);
    }
  };

  // ── Back to list ──────────────────────────────────────
  const backToList = () => {
    setStep('list');
    setSelectedEmployee(null);
    setPhotoDataUrl(null);
    closeCamera();
    setResultMessage('');
    setVerificationInfo(null);
  };

  // ── Format time ───────────────────────────────────────
  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-emerald-700 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="text-emerald-700 font-bold text-sm">明</span>
          </div>
          <div>
            <h1 className="font-bold text-sm">公司打卡</h1>
            <p className="text-emerald-200 text-xs">操作員: {user.displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRecords(!showRecords)}
            className="px-3 py-1.5 bg-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-500 transition-colors"
          >
            今日記錄 ({todayRecords.length})
          </button>
          <button
            onClick={logout}
            className="px-3 py-1.5 bg-emerald-800 rounded-lg text-xs font-medium hover:bg-emerald-900 transition-colors"
          >
            登出
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {/* Success/Error banner from previous action */}
        {step === 'list' && resultMessage && (
          <div className={`mb-4 p-3 rounded-xl text-sm font-medium text-center ${
            resultType === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {resultType === 'success' ? '✅ ' : '❌ '}{resultMessage}
          </div>
        )}

        {/* Today's Records Panel */}
        {showRecords && (
          <div className="mb-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">今日打卡記錄</h3>
              <button onClick={() => setShowRecords(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {todayRecords.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">今日尚無打卡記錄</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {todayRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.type === 'clock_in' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {r.type === 'clock_in' ? '上班' : '下班'}
                      </span>
                      <span className="font-medium text-gray-900">{r.employee.name_zh}</span>
                      {r.employee.company?.internal_prefix && (
                        <span className="text-gray-400 text-xs">{r.employee.company.internal_prefix}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {r.attendance_verification_method === 'face_ai' && (
                        <span className="text-xs text-blue-500" title={`相似度: ${r.attendance_verification_score}%`}>
                          AI {r.attendance_verification_score}%
                        </span>
                      )}
                      {r.attendance_verification_method === 'first_time' && (
                        <span className="text-xs text-amber-500">首次</span>
                      )}
                      <span className="text-gray-500">{formatTime(r.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step: Employee List ─────────────────────────── */}
        {step === 'list' && (
          <>
            {/* Search & Filter */}
            <div className="mb-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索員工（姓名/編號/電話）"
                  className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                />
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value ? Number(e.target.value) : '')}
                  className="px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm bg-white"
                >
                  <option value="">全部公司</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.internal_prefix || c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Temporary Employee Button */}
              <button
                onClick={() => {
                  setStep('temp_employee');
                  setPhotoDataUrl(null);
                }}
                className="w-full py-2.5 bg-amber-50 border-2 border-amber-200 text-amber-700 font-semibold rounded-xl hover:bg-amber-100 transition-colors text-sm flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                新增臨時員工
              </button>
            </div>

            {/* Employee List */}
            <div className="space-y-2">
              {listLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
                </div>
              ) : employees.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>找不到員工</p>
                </div>
              ) : (
                employees.map((emp) => (
                  <div
                    key={emp.id}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Photo indicator */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        emp.hasStandardPhoto
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {emp.hasStandardPhoto ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm truncate">{emp.name_zh}</span>
                          {emp.employee_is_temporary && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">臨時</span>
                          )}
                          {!emp.hasStandardPhoto && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">無照片</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {emp.name_en && <span>{emp.name_en}</span>}
                          {emp.emp_code && <span>({emp.emp_code})</span>}
                          {emp.company?.internal_prefix && (
                            <span className="text-gray-300">| {emp.company.internal_prefix}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0 ml-2">
                      <button
                        onClick={() => handleSelectEmployee(emp, 'clock_in')}
                        className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
                      >
                        上班
                      </button>
                      <button
                        onClick={() => handleSelectEmployee(emp, 'clock_out')}
                        className="px-3 py-2 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 active:bg-orange-700 transition-colors"
                      >
                        下班
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {listTotal > 50 && (
              <div className="flex justify-center gap-2 mt-4">
                <button
                  onClick={() => loadEmployees(listPage - 1)}
                  disabled={listPage <= 1}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm disabled:opacity-50"
                >
                  上一頁
                </button>
                <span className="px-4 py-2 text-sm text-gray-500">
                  {listPage} / {Math.ceil(listTotal / 50)}
                </span>
                <button
                  onClick={() => loadEmployees(listPage + 1)}
                  disabled={listPage >= Math.ceil(listTotal / 50)}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm disabled:opacity-50"
                >
                  下一頁
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Step: Camera / Photo Capture ────────────────── */}
        {step === 'camera' && selectedEmployee && (
          <div className="space-y-4">
            <button onClick={backToList} className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回列表
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              {/* Employee info */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  clockType === 'clock_in' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'
                }`}>
                  <span className="text-lg font-bold">{selectedEmployee.name_zh.charAt(0)}</span>
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">{selectedEmployee.name_zh}</h2>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    {selectedEmployee.name_en && <span>{selectedEmployee.name_en}</span>}
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      clockType === 'clock_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {clockType === 'clock_in' ? '上班打卡' : '下班打卡'}
                    </span>
                  </div>
                </div>
              </div>

              {/* First-time notice */}
              {!selectedEmployee.hasStandardPhoto && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                  <p className="font-semibold">首次打卡</p>
                  <p className="text-xs mt-1">此員工尚無標準照，拍攝的照片將自動存為標準照。</p>
                </div>
              )}

              {/* Camera / Photo */}
              {cameraOpen ? (
                <div className="bg-black rounded-2xl overflow-hidden relative">
                  <video ref={videoRef} className="w-full" playsInline muted />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                    <button
                      onClick={capturePhoto}
                      className="w-16 h-16 bg-white rounded-full border-4 border-gray-300 shadow-lg active:scale-95 transition-transform"
                    />
                    <button
                      onClick={() => { closeCamera(); }}
                      className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {photoDataUrl ? (
                    <div className="relative mb-4">
                      <img
                        src={photoDataUrl}
                        alt="preview"
                        className="w-full h-64 object-cover rounded-xl"
                      />
                      <button
                        onClick={() => { setPhotoDataUrl(null); openCamera(); }}
                        className="absolute bottom-2 right-2 px-3 py-1.5 bg-white rounded-lg text-xs font-medium shadow border"
                      >
                        重新拍照
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={openCamera}
                      className="w-full h-48 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-emerald-400 hover:text-emerald-500 transition-colors mb-4"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-sm font-medium">點擊拍照</span>
                    </button>
                  )}

                  {/* Submit button */}
                  {photoDataUrl && (
                    <button
                      onClick={handleSubmitClock}
                      disabled={processing}
                      className={`w-full py-3.5 text-white font-bold rounded-xl transition-colors disabled:opacity-50 ${
                        clockType === 'clock_in'
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-orange-500 hover:bg-orange-600'
                      }`}
                    >
                      {processing ? '驗證中...' : selectedEmployee.hasStandardPhoto ? '提交打卡（AI 人臉驗證）' : '提交打卡（首次，存為標準照）'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step: Verifying ─────────────────────────────── */}
        {step === 'verifying' && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
            <p className="text-gray-600 font-medium">AI 人臉驗證中...</p>
            <p className="text-gray-400 text-sm">正在比對照片，請稍候</p>
          </div>
        )}

        {/* ── Step: Result ────────────────────────────────── */}
        {step === 'result' && (
          <div className="space-y-4">
            <div className={`p-6 rounded-2xl text-center ${
              resultType === 'success'
                ? 'bg-green-50 border-2 border-green-200'
                : 'bg-red-50 border-2 border-red-200'
            }`}>
              <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
                resultType === 'success' ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {resultType === 'success' ? (
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <p className={`font-bold text-lg ${
                resultType === 'success' ? 'text-green-700' : 'text-red-700'
              }`}>
                {resultMessage}
              </p>
              {verificationInfo && resultType === 'success' && (
                <div className="mt-3 space-y-1">
                  {verificationInfo.method === 'face_ai' && (
                    <p className="text-sm text-green-600">
                      AI 人臉驗證通過 | 相似度: {verificationInfo.score}%
                    </p>
                  )}
                  {verificationInfo.isFirstTime && (
                    <p className="text-sm text-amber-600">
                      照片已自動存為標準照
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={backToList}
              className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
            >
              繼續打卡
            </button>
          </div>
        )}

        {/* ── Step: Temporary Employee Form ───────────────── */}
        {step === 'temp_employee' && (
          <div className="space-y-4">
            <button onClick={backToList} className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回列表
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
              <h2 className="font-bold text-gray-900 text-lg">新增臨時員工</h2>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">中文姓名 *</label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  placeholder="輸入員工中文姓名"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">英文姓名</label>
                <input
                  type="text"
                  value={tempNameEn}
                  onChange={(e) => setTempNameEn(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  placeholder="輸入員工英文姓名（選填）"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">電話</label>
                <input
                  type="tel"
                  value={tempPhone}
                  onChange={(e) => setTempPhone(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  placeholder="輸入電話號碼（選填）"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">所屬公司 *</label>
                <select
                  value={tempCompanyId}
                  onChange={(e) => setTempCompanyId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm bg-white"
                  required
                >
                  <option value="">選擇公司</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.internal_prefix ? `${c.internal_prefix} - ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Photo capture */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">拍照 *</label>
                {cameraOpen ? (
                  <div className="bg-black rounded-2xl overflow-hidden relative">
                    <video ref={videoRef} className="w-full" playsInline muted />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                      <button
                        onClick={capturePhoto}
                        className="w-16 h-16 bg-white rounded-full border-4 border-gray-300 shadow-lg active:scale-95 transition-transform"
                      />
                      <button
                        onClick={closeCamera}
                        className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : photoDataUrl ? (
                  <div className="relative">
                    <img src={photoDataUrl} alt="preview" className="w-full h-48 object-cover rounded-xl" />
                    <button
                      onClick={() => { setPhotoDataUrl(null); openCamera(); }}
                      className="absolute bottom-2 right-2 px-3 py-1.5 bg-white rounded-lg text-xs font-medium shadow border"
                    >
                      重新拍照
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={openCamera}
                    className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-emerald-400 hover:text-emerald-500 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-sm font-medium">點擊拍照</span>
                  </button>
                )}
              </div>

              <button
                onClick={handleCreateTemp}
                disabled={!tempName || !tempCompanyId || !photoDataUrl || processing}
                className="w-full py-3.5 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? '建立中...' : '建立臨時員工並打卡'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
