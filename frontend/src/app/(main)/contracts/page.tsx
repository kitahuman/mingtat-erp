'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ContractsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/projects');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-500 animate-pulse">正在導向至工程管理...</div>
    </div>
  );
}
