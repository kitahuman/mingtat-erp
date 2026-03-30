'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/lib/auth';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !Cookies.get('token')) {
      router.replace('/login');
    }
  }, [loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="lg:ml-64 p-4 sm:p-6 lg:p-8 pt-16 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
