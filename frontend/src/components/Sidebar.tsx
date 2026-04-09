'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, UserRole, ROLE_LABELS } from '@/lib/auth';
import { useState, useRef, useEffect } from 'react';
import WhatsAppBotStatus from './WhatsAppBotStatus';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  minRole?: UserRole;
  roles?: UserRole[];
  external?: boolean;
}

interface NavGroup {
  label: string;
  icon: string;
  minRole?: UserRole;
  roles?: UserRole[];
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

const navEntries: NavEntry[] = [
  { href: '/dashboard', label: '儀表板', icon: '📊', minRole: 'clerk' },
  { href: '/chat', label: 'AI 助手', icon: '🤖', minRole: 'clerk' },
  { href: '/work-logs', label: '工作記錄', icon: '📝', minRole: 'clerk' },
  {
    label: '工作紀錄核對',
    icon: '🔍',
    minRole: 'clerk',
    items: [
      { href: '/verification', label: '核對工作台', icon: '📋', minRole: 'clerk' },
      { href: '/verification/matching', label: '六來源比對', icon: '🔀', minRole: 'clerk' },
      { href: '/verification/upload', label: '上傳資料', icon: '📤', minRole: 'clerk' },
      { href: '/verification/batches', label: '匯入紀錄', icon: '📦', minRole: 'clerk' },
      { href: '/verification/records', label: '已匯入資料', icon: '📄', minRole: 'clerk' },
      { href: '/verification/whatsapp', label: 'WhatsApp Order', icon: '💬', minRole: 'clerk' },
    ],
  },
  {
    label: '公司內部資料',
    icon: '🏢',
    minRole: 'clerk',
    items: [
      { href: '/company-profiles', label: '公司資料', icon: '🏛️', minRole: 'clerk' },
      { href: '/companies', label: '公司管理', icon: '🏢', minRole: 'clerk' },
      { href: '/employees', label: '員工管理', icon: '👷', minRole: 'clerk' },
      { href: '/vehicles', label: '車輛管理', icon: '🚛', minRole: 'clerk' },
      { href: '/machinery', label: '機械管理', icon: '⚙️', minRole: 'clerk' },
      { href: '/partners', label: '合作單位', icon: '🤝', minRole: 'clerk' },
      { href: '/subcon-fleet-drivers', label: '街車車隊管理', icon: '🚐', minRole: 'clerk' },
    ],
  },
  {
    label: '工程管理',
    icon: '🏗️',
    minRole: 'clerk',
    items: [
      { href: '/contracts', label: '合約管理', icon: '📜', minRole: 'clerk' },
      { href: '/projects', label: '工程項目', icon: '🏗️', minRole: 'clerk' },
    ],
  },
  {
    label: '人力資源',
    icon: '👥',
    minRole: 'clerk',
    items: [
      { href: '/salary-config', label: '員工薪酬', icon: '💵', minRole: 'clerk' },
      { href: '/payroll', label: '計糧管理', icon: '🧮', minRole: 'clerk' },
      { href: '/payroll-records', label: '糧單記錄', icon: '📄', minRole: 'clerk' },
      { href: '/subcon-payroll', label: '供應商計糧', icon: '🚛', minRole: 'clerk' },
      { href: '/clock-in', label: '公司打卡', icon: '📸', minRole: 'clerk' },
      { href: '/attendances', label: '打卡紀錄', icon: '🕐', minRole: 'clerk' },
      { href: '/leaves', label: '請假紀錄', icon: '📅', minRole: 'clerk' },
    ],
  },
  {
    label: '會計部門',
    icon: '💵',
    minRole: 'clerk',
    items: [
      { href: '/expenses', label: '費用報銷', icon: '💸', minRole: 'clerk' },
      { href: '/invoices', label: '發票管理', icon: '🧾', minRole: 'clerk' },
      { href: '/payment-in', label: '收款記錄', icon: '💰', minRole: 'clerk' },
      { href: '/payment-out', label: '付款記錄', icon: '💳', minRole: 'clerk' },
      { href: '/bank-reconciliation', label: '銀行對帳', icon: '🏦', minRole: 'clerk' },
    ],
  },
  {
    label: '報價及價目',
    icon: '💰',
    minRole: 'clerk',
    items: [
      { href: '/quotations', label: '報價單', icon: '📋', minRole: 'clerk' },
      { href: '/project-rate-cards', label: '工程價目表', icon: '🏗️', minRole: 'clerk' },
      { href: '/rental-rate-cards', label: '客戶價目表', icon: '📊', minRole: 'clerk' },
      { href: '/fleet-rate-cards', label: '租賃價目表', icon: '🚚', minRole: 'clerk' },
      { href: '/subcon-rate-cards', label: '供應商價目表', icon: '🚛', minRole: 'clerk' },
    ],
  },
  {
    label: '報表',
    icon: '📈',
    minRole: 'clerk',
    items: [
      { href: '/profit-loss', label: '工程損益總覽', icon: '📊', minRole: 'clerk' },
      { href: '/company-profit-loss', label: '公司損益表', icon: '📈', minRole: 'clerk' },
    ],
  },
  {
    label: '系統設定',
    icon: '⚙️',
    roles: ['admin'],
    items: [
      { href: '/settings/users', label: '用戶管理', icon: '👥', roles: ['admin'] },
      { href: '/settings/custom-fields', label: '自定義欄位', icon: '🔧', roles: ['admin'] },
      { href: '/settings/field-options', label: '選項管理', icon: '📋', roles: ['admin'] },
      { href: '/settings/expense-categories', label: '支出類別管理', icon: '💸', roles: ['admin'] },
      { href: '/settings/bank-accounts', label: '銀行帳戶管理', icon: '🏦', roles: ['admin'] },
    ],
  },
];

// ── Collapsed-mode hover flyout submenu ──────────────────────
function CollapsedGroupItem({
  entry,
  canAccess,
  pathname,
  onNavigate,
}: {
  entry: NavGroup;
  canAccess: (item: { minRole?: UserRole; roles?: UserRole[] }) => boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const filteredItems = entry.items.filter(canAccess);
  if (filteredItems.length === 0) return null;

  const isGroupActive = filteredItems.some(
    item => pathname === item.href || pathname.startsWith(item.href + '/'),
  );

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={`
          flex items-center justify-center px-4 py-2.5 mx-2 rounded-lg cursor-pointer mb-0.5
          ${isGroupActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
        `}
      >
        <span className="text-lg">{entry.icon}</span>
      </div>

      {open && (
        <div className="absolute left-full top-0 ml-1 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[172px]">
          <div className="px-3 py-1.5 text-xs text-gray-400 font-semibold border-b border-gray-700 mb-1 whitespace-nowrap">
            {entry.icon} {entry.label}
          </div>
          {filteredItems.map(item => {
            const isActive = !item.external && (pathname === item.href || pathname.startsWith(item.href + '/'));
            const itemClass = `
              flex items-center gap-2.5 px-3 py-2 text-sm transition-colors whitespace-nowrap
              ${isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}
            `;
            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={itemClass}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                  <svg className="w-3 h-3 ml-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={itemClass}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Sidebar component ────────────────────────────────────
interface SidebarProps {
  onCollapse?: (collapsed: boolean) => void;
}

export default function Sidebar({ onCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, hasRole, hasMinRole } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    '工作紀錄核對': true,
    '公司內部資料': false,
    '工程管理': true,
    '人力資源': false,
    '會計部門': false,
    '報價及價目': true,
    '報表': true,
    '系統設定': false,
  });

  const handleCollapse = (val: boolean) => {
    setCollapsed(val);
    onCollapse?.(val);
    // Also broadcast via custom event for layout.tsx
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: val } }));
  };

  const canAccess = (item: { minRole?: UserRole; roles?: UserRole[] }) => {
    if (item.roles) return hasRole(...item.roles);
    if (item.minRole) return hasMinRole(item.minRole);
    return true;
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const roleLabel = user?.role ? ROLE_LABELS[user.role] || '使用者' : '使用者';

  // ── Expanded: plain nav item ──────────────────────────
  const renderNavItem = (item: NavItem, nested = false) => {
    const isActive = !item.external && (pathname === item.href || pathname.startsWith(item.href + '/'));
    const className = `
      flex items-center px-4 py-2.5 mx-2 rounded-lg transition-colors mb-0.5
      ${isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
      ${nested ? 'pl-10' : ''}
    `;
    if (item.external) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          <span className="text-lg">{item.icon}</span>
          <span className="ml-3 text-sm font-medium">{item.label}</span>
          <svg className="w-3 h-3 ml-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={className}
      >
        <span className="text-lg">{item.icon}</span>
        <span className="ml-3 text-sm font-medium">{item.label}</span>
      </Link>
    );
  };

  // ── Expanded: accordion group ─────────────────────────────
  const renderGroup = (entry: NavGroup) => {
    if (!canAccess(entry)) return null;
    const filteredItems = entry.items.filter(canAccess);
    if (filteredItems.length === 0) return null;

    const isExpanded = expandedGroups[entry.label];
    const isGroupActive = filteredItems.some(
      item => pathname === item.href || pathname.startsWith(item.href + '/'),
    );

    return (
      <div key={entry.label} className="mb-1">
        <button
          onClick={() => toggleGroup(entry.label)}
          className={`
            flex items-center justify-between w-full px-4 py-2.5 rounded-none transition-colors
            ${isGroupActive ? 'text-white' : 'text-gray-400 hover:text-white'}
          `}
        >
          <div className="flex items-center">
            <span className="text-lg">{entry.icon}</span>
            <span className="ml-3 text-sm font-medium">{entry.label}</span>
          </div>
          <svg
            className={`w-4 h-4 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {isExpanded && (
          <div className="mt-0.5">
            {filteredItems.map(item => renderNavItem(item, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-white p-2 rounded-lg shadow-md border"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar panel */}
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
            onClick={() => handleCollapse(!collapsed)}
            title={collapsed ? '展開側邊欄' : '收起側邊欄'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={collapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'} />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto overflow-x-visible">
          {navEntries.map((entry) => {
            if (isGroup(entry)) {
              if (!canAccess(entry)) return null;

              // Collapsed: icon + hover flyout
              if (collapsed) {
                return (
                  <CollapsedGroupItem
                    key={entry.label}
                    entry={entry}
                    canAccess={canAccess}
                    pathname={pathname}
                    onNavigate={() => setMobileOpen(false)}
                  />
                );
              }

              // Expanded: accordion
              return renderGroup(entry);
            }

            // Plain item
            if (!canAccess(entry)) return null;

            if (collapsed) {
              const isActive = pathname === entry.href || pathname.startsWith(entry.href + '/');
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={() => setMobileOpen(false)}
                  title={entry.label}
                  className={`
                    flex items-center justify-center px-4 py-2.5 mx-2 rounded-lg transition-colors mb-0.5
                    ${isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
                  `}
                >
                  <span className="text-lg">{entry.icon}</span>
                </Link>
              );
            }

            return renderNavItem(entry);
          })}
        </nav>

        {/* WhatsApp Bot Status */}
        <div className={`px-2 pb-1 ${collapsed ? 'text-center' : ''}`}>
          <WhatsAppBotStatus collapsed={collapsed} />
        </div>

        {/* Employee Portal Quick Link */}
        <div className={`px-2 pb-2 ${collapsed ? 'text-center' : ''}`}>
          <a
            href="/employee-portal"
            target="_blank"
            rel="noopener noreferrer"
            title="員工手機入口"
            className={`
              flex items-center gap-2.5 px-4 py-2.5 mx-0 rounded-lg transition-colors
              bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium
              ${collapsed ? 'justify-center px-0' : ''}
            `}
          >
            <span className="text-lg">📱</span>
            {!collapsed && <span>員工手機入口</span>}
            {!collapsed && (
              <svg className="w-3.5 h-3.5 ml-auto opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            )}
          </a>
        </div>

        {/* User section */}
        <div className={`p-4 border-t border-gray-700 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed && (
            <div className="mb-2">
              <Link href="/settings/profile" className="hover:text-primary-400 transition-colors">
                <p className="text-sm font-medium">{user?.displayName || user?.username}</p>
                <p className="text-xs text-gray-400">{roleLabel}{user?.department ? ` - ${user.department}` : ''}</p>
              </Link>
            </div>
          )}
          <button
            onClick={logout}
            className={`text-gray-400 hover:text-red-400 transition-colors text-sm ${collapsed ? '' : 'w-full text-left'}`}
            title={collapsed ? '登出系統' : undefined}
          >
            {collapsed ? '🚪' : '登出系統'}
          </button>
        </div>
      </aside>
    </>
  );
}
