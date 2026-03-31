'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: '儀表板', icon: '📊' },
  { href: '/company-profiles', label: '公司資料', icon: '🏛️' },
  { href: '/companies', label: '公司管理', icon: '🏢' },
  { href: '/employees', label: '員工管理', icon: '👷' },
  { href: '/vehicles', label: '車輛管理', icon: '🚛' },
  { href: '/machinery', label: '機械管理', icon: '⚙️' },
  { href: '/partners', label: '合作單位', icon: '🤝' },
  { href: '/settings/custom-fields', label: '自定義欄位', icon: '🔧' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-white p-2 rounded-lg shadow-md border"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full bg-gray-900 text-white z-40 transition-all duration-300 flex flex-col
        ${collapsed ? 'w-16' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className={`p-4 border-b border-gray-700 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold">明達 ERP</h1>
              <p className="text-xs text-gray-400">主檔管理系統</p>
            </div>
          )}
          <button
            className="hidden lg:block text-gray-400 hover:text-white"
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={collapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7m8 14l-7-7 7-7"} />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center px-4 py-3 mx-2 rounded-lg transition-colors mb-1
                  ${isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
                  ${collapsed ? 'justify-center' : ''}
                `}
              >
                <span className="text-xl">{item.icon}</span>
                {!collapsed && <span className="ml-3 text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className={`p-4 border-t border-gray-700 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed && (
            <div className="mb-2">
              <p className="text-sm font-medium">{user?.display_name}</p>
              <p className="text-xs text-gray-400">{user?.role === 'admin' ? '管理員' : '使用者'}</p>
            </div>
          )}
          <button
            onClick={logout}
            className={`text-gray-400 hover:text-red-400 transition-colors text-sm ${collapsed ? '' : 'w-full text-left'}`}
          >
            {collapsed ? '🚪' : '登出系統'}
          </button>
        </div>
      </aside>
    </>
  );
}
