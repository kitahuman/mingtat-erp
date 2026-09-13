'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type AiPayrollReconcileErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AiPayrollReconcileError({ error, reset }: AiPayrollReconcileErrorProps) {
  const router = useRouter();

  useEffect(() => {
    console.error('AI payroll reconcile page crashed', error);
  }, [error]);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-red-700">無法載入 AI 計糧核對頁面</h1>
        <p className="mt-2 text-sm text-gray-600">
          此會話資料可能處於中斷或不一致狀態。你可以重新載入此頁，或先返回糧單記錄後再重試。
        </p>
        {error?.message && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error.message}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            重新載入
          </button>
          <button
            type="button"
            onClick={() => router.push('/payroll-records')}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            返回糧單記錄
          </button>
        </div>
      </div>
    </div>
  );
}
