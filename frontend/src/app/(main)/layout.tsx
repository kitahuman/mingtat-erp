'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/lib/auth';

// Keep layout in sync with Sidebar's collapsed state via a shared context-free approach:
// Sidebar emits a CSS class on <body> so layout can respond without prop drilling.
// We use a custom event instead to avoid refactoring the entire auth context.

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !Cookies.get('token')) {
      router.replace('/login');
    }
  }, [loading, router]);

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
          {children}
        </div>
      </main>
    </div>
  );
}
