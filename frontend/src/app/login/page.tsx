'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || '登入失敗，請檢查帳號密碼');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <span className="text-3xl text-white font-bold">明</span>
          </div>
          <h1 className="text-2xl font-bold text-white">明達 ERP 系統</h1>
          <p className="text-blue-200 mt-1">主檔管理系統 - 第一階段</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">系統登入</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="請輸入帳號"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="請輸入密碼"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-base"
          >
            {loading ? '登入中...' : '登入'}
          </button>

          <p className="text-center text-xs text-gray-400 mt-4">
            預設帳號：admin / admin123
          </p>
        </form>
      </div>
    </div>
  );
}
