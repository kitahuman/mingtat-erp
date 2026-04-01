'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEmployeePortalAuth } from '@/lib/employee-portal-auth';
import { useI18n } from '@/lib/i18n/i18n-context';

export default function EmployeeLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useEmployeePortalAuth();
  const { t, lang, toggleLang } = useI18n();
  const router = useRouter();

  // Detect if input looks like a phone number (digits only)
  const isPhoneInput = /^\d+$/.test(identifier);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
      router.push('/employee-portal');
    } catch (err: any) {
      setError(err.response?.data?.message || t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900">
      {/* Language toggle */}
      <div className="flex justify-end p-4">
        <button
          onClick={toggleLang}
          className="px-3 py-1.5 rounded-full text-sm font-semibold bg-blue-700 hover:bg-blue-600 text-white border border-blue-500 transition-colors"
        >
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl mb-4 shadow-xl">
            <span className="text-4xl text-blue-700 font-bold">明</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{t('appName')}</h1>
          <p className="text-blue-300 mt-1 text-sm">{t('appSubtitle')}</p>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">{t('loginTitle')}</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('loginIdentifier')}
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base"
                placeholder={t('loginIdentifierPlaceholder')}
                required
                autoComplete="username"
                inputMode={isPhoneInput || identifier === '' ? 'text' : 'text'}
              />
              {/* Hint text below input */}
              <p className="text-xs text-gray-400 mt-1">
                {lang === 'zh'
                  ? '員工輸入電話號碼，管理員輸入用戶名'
                  : 'Employees enter phone number, admins enter username'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base"
                placeholder={t('passwordPlaceholder')}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-700 text-white font-bold rounded-xl hover:bg-blue-800 active:bg-blue-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base mt-2"
            >
              {loading ? t('loginLoading') : t('loginButton')}
            </button>
          </form>

          {/* Login hint */}
          <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              {t('defaultPasswordHint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
