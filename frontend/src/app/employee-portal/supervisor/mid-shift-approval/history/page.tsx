'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { TranslationKey } from '@/lib/i18n/translations';


import { employeePortalApi } from '@/lib/employee-portal-api';
import { fmtDate } from '@/lib/dateUtils';

interface AttendanceRecord {
  id: number;
  employee_id: number;
  timestamp: string;
  mid_shift_approved: boolean;
  mid_shift_approved_at: string;
  employee: {
    id: number;
    name_zh: string;
    emp_code: string;
  };
}

export default function MidShiftApprovalHistoryPage() {
  const { t } = useI18n();
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadHistory();
  }, [page]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await employeePortalApi.getMidShiftApprovalHistory({ page, limit: 20 });
      setHistory(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/employee-portal/supervisor/mid-shift-approval" className="text-blue-600">
          <span>‹</span> {t('back')}
        </Link>
        <h1 className="text-xl font-bold text-gray-800 ml-2">{t("midShiftHistoryTitle")}</h1>
      </div>

      {loading && page === 1 ? (
        <div className="text-center py-10 text-gray-400">{t('loading')}</div>
      ) : history.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-10 text-center border border-dashed border-gray-300">
          <p className="text-gray-500">{t("noMidShiftHistory")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {history.map(record => (
              <div
                key={record.id}
                className="p-4 bg-white rounded-2xl border-2 border-gray-50 shadow-sm"
              >
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800">{record.employee.name_zh}</p>
                    <p className="text-xs text-gray-500">
                      {record.employee.emp_code} · {fmtDate(record.timestamp)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-bold border border-green-100">{t("approved")}</span>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(record.mid_shift_approved_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-4 py-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {t("previousPage")}
              </button>
              <span className="text-sm text-gray-500 flex items-center">
                {t("pageOfTotal", { page, totalPages })}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {t("nextPage")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
