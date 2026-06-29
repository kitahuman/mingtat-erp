'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Cookies from 'js-cookie';
import Sidebar from '@/components/Sidebar';
import { ChatWidget } from '@/components/ChatWidget';
import { useAuth } from '@/lib/auth';

// Path to Chinese page name mapping for browser tab title
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '儀表板',
  '/chat': '對話助手',
  '/ai-knowledge': 'AI 知識庫',
  '/work-logs': '工作記錄',
  '/document-management': '文件管理',
  '/verification': '核對工作台',
  '/verification/matching': '六來源比對',
  '/verification/upload': '上傳資料',
  '/verification/batches': '匯入紀錄',
  '/verification/records': '已匯入資料',
  '/verification/whatsapp': 'WhatsApp Order',
  '/company-profiles': '公司資料',
  '/companies': '公司管理',
  '/employees': '員工管理',
  '/vehicles': '車輛管理',
  '/machinery': '機械管理',
  '/partners': '合作單位',
  '/subcon-fleet-drivers': '街車車隊管理',
  '/projects': '工程項目',
  '/daily-reports': '工程日報',
  '/acceptance-reports': '工程收貨',
  '/daily-report-stats': '日報統計',
  '/salary-config': '員工薪酬',
  '/payroll': '計糧管理',
  '/payroll-records': '糧單記錄',
  '/subcon-payroll': '供應商計糧',
  '/subcon-payroll/records': '判頭糧單記錄',
  '/clock-in': '公司打卡',
  '/attendances': '打卡紀錄',
  '/leaves': '請假紀錄',
  '/expenses': '支出管理',
  '/invoices': '發票管理',
  '/payment-in': '收款記錄',
  '/payment-out': '付款記錄',
  '/bank-reconciliation': '銀行對帳',
  '/quotations': '報價單',
  '/project-rate-cards': '工程價目表',
  '/rental-rate-cards': '客戶價目表',
  '/fleet-rate-cards': '租賃價目表',
  '/subcon-rate-cards': '供應商價目表',
  '/profit-loss': '工程損益總覽',
  '/company-profit-loss': '公司損益表',
  '/reports/fixed-expenses': '固定支出統計',
  '/equipment-profit': '機械收支',
  '/settings/users': '用戶管理',
  '/settings/custom-fields': '自定義欄位',
  '/settings/field-options': '選項管理',
  '/options/payment-terms': '付款條款',
  '/settings/expense-categories': '支出類別管理',
  '/settings/payment-in-source-types': '收款來源類型',
  '/settings/bank-accounts': '銀行帳戶管理',
  '/settings/statutory-holidays': '法定假期',
  '/settings/system': '系統參數',
  '/audit-logs': '操作歷史',
  '/recycle-bin': '垃圾桶',
  '/invoice-statements': '發票清單',
  '/contracts': '合約管理',
  '/rate-cards': '價目表',
  '/reports': '報表',
  '/settings/profile': '個人設定',
};

function getPageTitle(pathname: string): string {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Try matching without trailing segments (e.g. /invoices/123 → /invoices)
  const segments = pathname.split('/');
  while (segments.length > 1) {
    segments.pop();
    const parent = segments.join('/') || '/';
    if (PAGE_TITLES[parent]) return PAGE_TITLES[parent];
  }
  return '';
}

// Keep layout in sync with Sidebar's collapsed state via a shared context-free approach:
// Sidebar emits a CSS class on <body> so layout can respond without prop drilling.
// We use a custom event instead to avoid refactoring the entire auth context.

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, canAccessPath } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // Dynamic browser tab title
  useEffect(() => {
    const pageTitle = getPageTitle(pathname || '');
    document.title = pageTitle ? `明達 ERP - ${pageTitle}` : '明達 ERP';
  }, [pathname]);

  useEffect(() => {
    if (!loading && !Cookies.get('token')) {
      router.replace('/login');
    }
  }, [loading, router]);

  // Page-level permission check
  useEffect(() => {
    if (!loading && user && pathname) {
      // Skip guard for profile page (always accessible)
      if (pathname === '/settings/profile') {
        setAccessDenied(false);
        return;
      }
      const allowed = canAccessPath(pathname);
      setAccessDenied(!allowed);
    }
  }, [loading, user, pathname, canAccessPath]);

  // Listen for sidebar collapse state changes broadcast via custom event
  useEffect(() => {
    const handler = (e: CustomEvent) => setSidebarCollapsed(e.detail?.collapsed ?? false);
    window.addEventListener('sidebar-toggle' as any, handler);
    return () => window.removeEventListener('sidebar-toggle' as any, handler);
  }, []);

  const handleMainContentClick = () => {
    if (sidebarCollapsed) return;
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSidebarCollapsed(true);
      window.dispatchEvent(new CustomEvent('sidebar-collapse-request', { detail: { collapsed: true } }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar onCollapse={setSidebarCollapsed} />
      {/* Main content: shifts right by sidebar width, fills remaining space */}
      <main
        onClick={handleMainContentClick}
        className={`
          flex-1 min-w-0 transition-all duration-300
          pt-16 lg:pt-0
          ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}
        `}
      >
        <div className="p-4 sm:p-6 h-full">
          {accessDenied ? (
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">🔒</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">無權限訪問</h2>
                <p className="text-gray-500 mb-4">您沒有權限查看此頁面，請聯繫管理員。</p>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  返回儀表板
                </button>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
      <ChatWidget />
    </div>
  );
}
