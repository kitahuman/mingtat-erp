'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useEmployeePortalAuth } from '@/lib/employee-portal-auth';
import { employeePortalApi } from '@/lib/employee-portal-api';

interface DashboardData {
  todayAttendance: any[];
  monthWorkLogs: number;
  pendingExpenses: number;
  pendingLeaves: number;
  employeeId: number | null;
}

interface ExpiringCert {
  key: string;
  name_zh: string;
  name_en: string;
  expiry_date: string;
  days_left: number;
  is_expired: boolean;
}

export default function EmployeePortalHome() {
  const { t, lang } = useI18n();
  const { user } = useEmployeePortalAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [expiringCerts, setExpiringCerts] = useState<ExpiringCert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      employeePortalApi.getDashboard(),
      employeePortalApi.getExpiringCerts(90),
    ]).then(([dashRes, certRes]) => {
      if (dashRes.status === 'fulfilled') setDashboard(dashRes.value.data);
      if (certRes.status === 'fulfilled') setExpiringCerts(certRes.value.data.expiring || []);
    }).finally(() => setLoading(false));
  }, []);

  const displayName = user?.employee?.name_zh || user?.displayName || '';

  const todayClockIn = dashboard?.todayAttendance?.find((r: any) => r.type === 'clock_in');
  const todayClockOut = dashboard?.todayAttendance?.find((r: any) => r.type === 'clock_out');

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });

  const quickActions = [
    {
      href: '/employee-portal/clock',
      label: t('clockInOut'),
      icon: '⏰',
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      iconBg: 'bg-blue-100',
    },
    ...(user?.canCompanyClock ? [{
      href: '/company-clock',
      label: '公司打卡',
      icon: '🏢',
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      iconBg: 'bg-emerald-100',
    }] : []),
    {
      href: '/employee-portal/work-report',
      label: t('workReport'),
      icon: '📋',
      color: 'bg-green-50 border-green-200 text-green-700',
      iconBg: 'bg-green-100',
    },
    {
      href: '/employee-portal/expense',
      label: t('expense'),
      icon: '💰',
      color: 'bg-orange-50 border-orange-200 text-orange-700',
      iconBg: 'bg-orange-100',
    },
    {
      href: '/employee-portal/leave',
      label: t('leave'),
      icon: '📅',
      color: 'bg-purple-50 border-purple-200 text-purple-700',
      iconBg: 'bg-purple-100',
    },
    {
      href: '/employee-portal/certificates',
      label: t('certificates'),
      icon: '🪴',
      color: 'bg-teal-50 border-teal-200 text-teal-700',
      iconBg: 'bg-teal-100',
    },
    {
      href: '/employee-portal/records',
      label: t('myRecords'),
      icon: '👤',
      color: 'bg-gray-50 border-gray-200 text-gray-700',
      iconBg: 'bg-gray-100',
    },
  ];

  const expiredCerts = expiringCerts.filter(c => c.is_expired);
  const urgentCerts = expiringCerts.filter(c => !c.is_expired && c.days_left <= 30);
  const warnCerts = expiringCerts.filter(c => !c.is_expired && c.days_left > 30 && c.days_left <= 90);

  return (
    <div className="p-4 space-y-4">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-600 rounded-2xl p-5 text-white shadow-md">
        <p className="text-blue-200 text-sm mb-1">
          {t('today')} · {new Date().toLocaleDateString('zh-HK', { month: 'long', day: 'numeric', weekday: 'short' })}
        </p>
        <h2 className="text-xl font-bold">{t('appSubtitle')} 👋</h2>
        <p className="text-blue-100 text-sm mt-1">{displayName}</p>
      </div>

      {/* Certificate Expiry Alerts */}
      {!loading && expiringCerts.length > 0 && (
        <div className="space-y-2">
          {expiredCerts.length > 0 && (
            <Link href="/employee-portal/certificates">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">🔴</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-red-800 text-sm">{t('certExpiredAlert')}</p>
                    <div className="mt-1 space-y-0.5">
                      {expiredCerts.map(c => (
                        <p key={c.key} className="text-xs text-red-700">
                          • {lang === 'zh' ? c.name_zh : c.name_en} — {t('certExpired')}
                        </p>
                      ))}
                    </div>
                  </div>
                  <span className="text-red-400 text-sm shrink-0">›</span>
                </div>
              </div>
            </Link>
          )}

          {urgentCerts.length > 0 && (
            <Link href="/employee-portal/certificates">
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-orange-800 text-sm">{t('certExpiringAlert')}</p>
                    <div className="mt-1 space-y-0.5">
                      {urgentCerts.map(c => (
                        <p key={c.key} className="text-xs text-orange-700">
                          • {lang === 'zh' ? c.name_zh : c.name_en} — {c.days_left} {t('daysLeft')}
                        </p>
                      ))}
                    </div>
                  </div>
                  <span className="text-orange-400 text-sm shrink-0">›</span>
                </div>
              </div>
            </Link>
          )}

          {warnCerts.length > 0 && expiredCerts.length === 0 && urgentCerts.length === 0 && (
            <Link href="/employee-portal/certificates">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">🟡</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-amber-800 text-sm">{t('certExpiringWarn')}</p>
                    <div className="mt-1 space-y-0.5">
                      {warnCerts.slice(0, 3).map(c => (
                        <p key={c.key} className="text-xs text-amber-700">
                          • {lang === 'zh' ? c.name_zh : c.name_en} — {c.days_left} {t('daysLeft')}
                        </p>
                      ))}
                      {warnCerts.length > 3 && (
                        <p className="text-xs text-amber-600">+{warnCerts.length - 3} {t('more')}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-amber-400 text-sm shrink-0">›</span>
                </div>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Today's Attendance Summary */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span>⏰</span> {t('todayRecord')}
        </h3>
        {loading ? (
          <div className="text-center py-3 text-gray-400 text-sm">{t('loading')}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xs text-green-600 font-medium mb-1">{t('clockInTime')}</p>
              <p className="text-lg font-bold text-green-700">
                {todayClockIn ? formatTime(todayClockIn.timestamp) : '--:--'}
              </p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs text-red-600 font-medium mb-1">{t('clockOutTime')}</p>
              <p className="text-lg font-bold text-red-700">
                {todayClockOut ? formatTime(todayClockOut.timestamp) : '--:--'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      {!loading && dashboard && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-bold text-blue-700">{dashboard.monthWorkLogs}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{t('thisMonth')}<br />{t('workRecords')}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-bold text-orange-600">{dashboard.pendingExpenses}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{t('pending')}<br />{t('expense')}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-bold text-purple-600">{dashboard.pendingLeaves}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{t('pending')}<br />{t('leave')}</p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3 text-sm">{t('quickActions')}</h3>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 ${action.color} transition-all active:scale-95`}
            >
              <div className={`w-10 h-10 ${action.iconBg} rounded-xl flex items-center justify-center text-xl flex-shrink-0`}>
                {action.icon}
              </div>
              <span className="font-semibold text-sm leading-tight">{action.label}</span>
            </Link>
          ))}
          {/* Company Clock shortcut: only shown when user has company clock permission */}
          {(user?.canCompanyClock || user?.isAdmin) && (
            <Link
              href="/company-clock"
              className="flex items-center gap-3 p-4 rounded-2xl border-2 bg-emerald-50 border-emerald-200 text-emerald-700 transition-all active:scale-95"
            >
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                🏢
              </div>
              <span className="font-semibold text-sm leading-tight">公司打卡</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
