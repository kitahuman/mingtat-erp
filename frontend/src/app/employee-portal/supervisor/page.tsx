'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useEmployeePortalAuth } from '@/lib/employee-portal-auth';

export default function SupervisorMenuPage() {
  const { t } = useI18n();
  const { user } = useEmployeePortalAuth();

  const menuItems = [
    {
      href: '/employee-portal/supervisor/mid-shift-approval',
      label: t('midShiftApproval'),
      icon: '✅',
      show: !!user?.employee?.can_approve_mid_shift,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      iconBg: 'bg-blue-100',
    },
    {
      href: '/employee-portal/supervisor/daily-report',
      label: t('dailyReport'),
      icon: '📝',
      show: !!user?.employee?.can_daily_report,
      color: 'bg-green-50 border-green-200 text-green-700',
      iconBg: 'bg-green-100',
    },
    {
      href: '/employee-portal/supervisor/acceptance-report',
      label: t('acceptanceReport'),
      icon: '📋',
      show: !!user?.employee?.can_acceptance_report,
      color: 'bg-orange-50 border-orange-200 text-orange-700',
      iconBg: 'bg-orange-100',
    },
  ];

  const visibleItems = menuItems.filter(item => item.show);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/employee-portal" className="text-blue-600 flex items-center gap-1">
          <span>‹</span> {t('back')}
        </Link>
        <h1 className="text-xl font-bold text-gray-800 ml-2">{t('supervisorMenu')}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 p-5 rounded-2xl border-2 ${item.color} transition-all active:scale-95 shadow-sm`}
            >
              <div className={`w-12 h-12 ${item.iconBg} rounded-xl flex items-center justify-center text-2xl flex-shrink-0`}>
                {item.icon}
              </div>
              <div className="flex-1">
                <span className="font-bold text-lg leading-tight">{item.label}</span>
              </div>
              <span className="text-xl opacity-50">›</span>
            </Link>
          ))
        ) : (
          <div className="bg-gray-50 rounded-2xl p-10 text-center border border-dashed border-gray-300">
            <p className="text-gray-500">{t('noData')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
