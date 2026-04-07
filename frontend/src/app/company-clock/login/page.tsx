'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanyClockAuth } from '@/lib/company-clock-auth';

export default function CompanyClockLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useCompanyClockAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
      router.push('/company-clock');
    } catch (err: any) {
      setError(err.response?.data?.message || '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-900">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl mb-4 shadow-xl">
            <span className="text-4xl text-emerald-700 font-bold">明</span>
          </div>
          <h1 className="text-2xl font-bold text-white">明達建築 ERP</h1>
          <p className="text-emerald-300 mt-1 text-sm">公司打卡系統</p>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">公司打卡登入</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                帳號
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-base"
                placeholder="輸入用戶名"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                密碼
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-base"
                placeholder="輸入密碼"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-emerald-700 text-white font-bold rounded-xl hover:bg-emerald-800 active:bg-emerald-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base mt-2"
            >
              {loading ? '登入中...' : '登入'}
            </button>
          </form>

          <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              此系統供公司操作員使用，請使用公司帳號登入
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
