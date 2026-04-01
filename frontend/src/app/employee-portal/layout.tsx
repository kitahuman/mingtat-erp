'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { EmployeePortalAuthProvider, useEmployeePortalAuth } from '@/lib/employee-portal-auth';
import { I18nProvider, useI18n } from '@/lib/i18n/i18n-context';

// Bottom navigation icons as SVG
function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}
function ClockIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function DocumentIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
function WalletIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}
function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function UserIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 2} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function PortalInner({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useEmployeePortalAuth();
  const { t, lang, toggleLang } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === '/employee-portal/login';

  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.push('/employee-portal/login');
    }
  }, [user, loading, isLoginPage, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!user) return null;

  const navItems = [
    { href: '/employee-portal', label: t('home'), icon: HomeIcon },
    { href: '/employee-portal/clock', label: t('clockInOut'), icon: ClockIcon },
    { href: '/employee-portal/work-report', label: t('workReport'), icon: DocumentIcon },
    { href: '/employee-portal/expense', label: t('expense'), icon: WalletIcon },
    { href: '/employee-portal/leave', label: t('leave'), icon: CalendarIcon },
    { href: '/employee-portal/records', label: t('myRecords'), icon: UserIcon },
  ];

  const isActive = (href: string) => {
    if (href === '/employee-portal') return pathname === '/employee-portal';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">
      {/* Top Header */}
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="text-blue-700 font-bold text-sm">明</span>
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">{t('appName')}</p>
            <p className="text-blue-200 text-xs leading-tight">{t('appSubtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <button
            onClick={toggleLang}
            className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-600 hover:bg-blue-500 border border-blue-400 transition-colors"
          >
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
          {/* User info + logout */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-blue-200 max-w-[80px] truncate">
              {user.employee?.name_zh || user.displayName}
            </span>
            <button
              onClick={logout}
              className="text-blue-200 hover:text-white transition-colors"
              title={t('logout')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 z-40 shadow-lg">
        <div className="grid grid-cols-6 h-16">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon active={active} />
                <span className="text-[9px] font-medium leading-tight text-center px-0.5 truncate w-full text-center">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function EmployeePortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <EmployeePortalAuthProvider>
        <PortalInner>{children}</PortalInner>
      </EmployeePortalAuthProvider>
    </I18nProvider>
  );
}
