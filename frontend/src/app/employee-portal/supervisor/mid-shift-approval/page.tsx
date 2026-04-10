'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi } from '@/lib/employee-portal-api';
import { fmtDate } from '@/lib/dateUtils';

// Dynamic import to avoid SSR issues with canvas-based signature pad
const SignaturePad = dynamic(() => import('react-signature-canvas'), { ssr: false }) as any;

interface AttendanceRecord {
  id: number;
  employee_id: number;
  type: string;
  timestamp: string;
  address: string | null;
  remarks: string | null;
  work_notes: string | null;
  is_mid_shift: boolean;
  employee: {
    id: number;
    name_zh: string;
    emp_code: string;
  };
}

export default function MidShiftApprovalPage() {
  const { t } = useI18n();
  const [pending, setPending] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showSignature, setShowSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const sigPad = useRef<any>(null);

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await employeePortalApi.getPendingMidShiftApprovals();
      setPending(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === pending.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pending.map(r => r.id));
    }
  };

  const handleApprove = () => {
    if (selectedIds.length === 0) {
      alert('請先選擇要批核的記錄');
      return;
    }
    setShowSignature(true);
  };

  const clearSignature = () => {
    sigPad.current?.clear();
  };

  const submitApproval = async () => {
    if (sigPad.current?.isEmpty()) {
      alert('請先簽名');
      return;
    }

    const signatureBase64 = sigPad.current?.getTrimmedCanvas().toDataURL('image/png');
    if (!signatureBase64) return;

    setSubmitting(true);
    try {
      await employeePortalApi.approveMidShift({
        attendance_ids: selectedIds,
        signature_base64: signatureBase64,
      });
      alert('批核成功');
      setSelectedIds([]);
      setShowSignature(false);
      loadPending();
    } catch (err) {
      alert('批核失敗');
    } finally {
      setSubmitting(false);
    }
  };

  // Group by date
  const grouped = pending.reduce((acc, record) => {
    const date = fmtDate(record.timestamp);
    if (!acc[date]) acc[date] = [];
    acc[date].push(record);
    return acc;
  }, {} as Record<string, AttendanceRecord[]>);

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const typeLabel = (type: string) => type === 'clock_in' ? '上班' : '下班';

  return (
    <div className="p-4 space-y-4 pb-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/employee-portal/supervisor" className="text-blue-600">
            <span>‹</span> {t('back')}
          </Link>
          <h1 className="text-xl font-bold text-gray-800 ml-2">{t('midShiftApproval')}</h1>
        </div>
        <Link href="/employee-portal/supervisor/mid-shift-approval/history" className="text-sm text-gray-500 underline">
          歷史紀錄
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">{t('loading')}</div>
      ) : pending.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-10 text-center border border-dashed border-gray-300">
          <p className="text-gray-500">暫無待批核中直記錄</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-gray-100">
            <span className="text-sm font-medium text-gray-600">已選擇 {selectedIds.length} 條</span>
            <button onClick={toggleSelectAll} className="text-sm text-blue-600 font-medium">
              {selectedIds.length === pending.length ? '取消全選' : '全選'}
            </button>
          </div>

          <div className="space-y-6">
            {sortedDates.map(date => (
              <div key={date} className="space-y-2">
                <h3 className="text-sm font-bold text-gray-500 px-1">{date}</h3>
                <div className="space-y-2">
                  {grouped[date].map(record => (
                    <div
                      key={record.id}
                      onClick={() => toggleSelect(record.id)}
                      className={`flex items-start gap-3 p-4 bg-white rounded-2xl border-2 transition-all shadow-sm cursor-pointer ${
                        selectedIds.includes(record.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-50'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        selectedIds.includes(record.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                      }`}>
                        {selectedIds.includes(record.id) && <span className="text-white text-[10px]">✓</span>}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Name + type badge */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-800">{record.employee.name_zh}</p>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">中直</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            record.type === 'clock_in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>{typeLabel(record.type)}</span>
                        </div>

                        {/* Emp code + time */}
                        <p className="text-xs text-gray-500">
                          {record.employee.emp_code} · {new Date(record.timestamp).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
                        </p>

                        {/* Location */}
                        {record.address && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-gray-400 text-xs mt-0.5">📍</span>
                            <p className="text-xs text-gray-600 leading-relaxed">{record.address}</p>
                          </div>
                        )}

                        {/* Remarks */}
                        {record.remarks && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-gray-400 text-xs mt-0.5">💬</span>
                            <p className="text-xs text-gray-600 leading-relaxed">{record.remarks}</p>
                          </div>
                        )}

                        {/* Work notes */}
                        {record.work_notes && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-gray-400 text-xs mt-0.5">📋</span>
                            <p className="text-xs text-gray-600 leading-relaxed">{record.work_notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-gray-100 shadow-lg z-10">
            <button
              onClick={handleApprove}
              disabled={selectedIds.length === 0}
              className={`w-full py-4 rounded-2xl font-bold text-white shadow-md transition-all active:scale-95 ${
                selectedIds.length > 0 ? 'bg-blue-600' : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              批核已選記錄 ({selectedIds.length})
            </button>
          </div>
        </>
      )}

      {/* Signature Modal */}
      {showSignature && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">批核確認</h2>
              <button onClick={() => setShowSignature(false)} className="text-gray-400 text-2xl">×</button>
            </div>

            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
              <p className="text-blue-800 text-sm font-medium leading-relaxed">
                本人確認以上 {selectedIds.length} 條中直記錄屬實，並以此簽署作為正式批核記錄。
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-500">請在下方簽名</span>
                <button onClick={clearSignature} className="text-xs text-blue-600 font-medium">清除簽名</button>
              </div>
              <div className="border-2 border-gray-100 rounded-2xl bg-gray-50 overflow-hidden">
                <SignaturePad
                  ref={sigPad}
                  canvasProps={{
                    className: "w-full h-48 cursor-crosshair"
                  }}
                />
              </div>
            </div>

            <button
              onClick={submitApproval}
              disabled={submitting}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg active:scale-95 disabled:bg-gray-400"
            >
              {submitting ? '提交中...' : '確認並提交批核'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
