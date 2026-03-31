'use client';
import { useState, useEffect } from 'react';
import { profileApi } from '@/lib/api';
import { useAuth, ROLE_LABELS, User } from '@/lib/auth';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await profileApi.get();
      setProfile(res.data);
      setForm({
        displayName: res.data.displayName || '',
        email: res.data.email || '',
        phone: res.data.phone || '',
      });
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('');
      const res = await profileApi.update({
        displayName: form.displayName,
        email: form.email || undefined,
        phone: form.phone || undefined,
      });
      setProfile(res.data);
      setEditing(false);
      setMessage('個人資料已更新');

      // Update auth context
      if (user) {
        updateUser({
          ...user,
          displayName: res.data.displayName,
          email: res.data.email,
          phone: res.data.phone,
        });
      }

      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.response?.data?.message || '更新失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordMessage('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('新密碼與確認密碼不一致');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('新密碼至少需要 6 個字元');
      return;
    }

    try {
      setPasswordSaving(true);
      await profileApi.changePassword({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordMessage('密碼已成功修改');
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordForm(false);
      setTimeout(() => setPasswordMessage(''), 3000);
    } catch (err: any) {
      setPasswordError(err.response?.data?.message || '密碼修改失敗');
    } finally {
      setPasswordSaving(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('zh-HK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">個人資料</h1>
        <p className="text-sm text-gray-500 mt-1">查看和修改您的個人資訊</p>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-6">
          {message}
        </div>
      )}
      {passwordMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-6">
          {passwordMessage}
        </div>
      )}

      {/* Profile Info */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">基本資訊</h2>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-primary-600 hover:text-primary-800 text-sm font-medium"
            >
              編輯
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">顯示名稱</label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電郵</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電話</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {saving ? '儲存中...' : '儲存'}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setForm({
                    displayName: profile?.displayName || '',
                    email: profile?.email || '',
                    phone: profile?.phone || '',
                  });
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">用戶名</p>
                <p className="text-sm font-medium">{profile?.username}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">顯示名稱</p>
                <p className="text-sm font-medium">{profile?.displayName || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">角色</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  profile?.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                  profile?.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                  profile?.role === 'clerk' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {ROLE_LABELS[profile?.role as keyof typeof ROLE_LABELS] || profile?.role}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">部門</p>
                <p className="text-sm font-medium">{profile?.department || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">電郵</p>
                <p className="text-sm font-medium">{profile?.email || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">電話</p>
                <p className="text-sm font-medium">{profile?.phone || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">最後登入</p>
                <p className="text-sm font-medium">{formatDate(profile?.lastLoginAt)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">帳號建立日期</p>
                <p className="text-sm font-medium">{formatDate(profile?.createdAt)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">修改密碼</h2>
          {!showPasswordForm && (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="text-primary-600 hover:text-primary-800 text-sm font-medium"
            >
              修改密碼
            </button>
          )}
        </div>

        {showPasswordForm ? (
          <div className="space-y-4">
            {passwordError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {passwordError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">舊密碼</label>
              <input
                type="password"
                value={passwordForm.oldPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新密碼</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="至少 6 個字元"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">確認新密碼</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleChangePassword}
                disabled={passwordSaving}
                className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {passwordSaving ? '修改中...' : '確認修改'}
              </button>
              <button
                onClick={() => {
                  setShowPasswordForm(false);
                  setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
                  setPasswordError('');
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">如需修改密碼，請點擊右上角的「修改密碼」按鈕。</p>
        )}
      </div>
    </div>
  );
}
