'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Cookies from 'js-cookie';
import Sidebar from '@/components/Sidebar';
import { ChatWidget } from '@/components/ChatWidget';
import { useAuth } from '@/lib/auth';

// Keep layout in sync with Sidebar's collapsed state via a shared context-free approach:
// Sidebar emits a CSS class on <body> so layout can respond without prop drilling.
// We use a custom event instead to avoid refactoring the entire auth context.

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, canAccessPath } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

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
