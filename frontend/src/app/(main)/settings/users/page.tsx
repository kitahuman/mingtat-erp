'use client';
import { useState, useEffect, useCallback } from 'react';
import { usersApi, authApi } from '@/lib/api';
import { useAuth, UserRole, ROLE_LABELS, DEPARTMENT_OPTIONS } from '@/lib/auth';
import RoleGuard from '@/components/RoleGuard';
import Modal from '@/components/Modal';

interface UserItem {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  department: string | null;
  isActive: boolean;
  user_can_company_clock: boolean;
  can_approve_mid_shift: boolean;
  can_daily_report: boolean;
  can_acceptance_report: boolean;
  page_permissions: { grant?: string[]; deny?: string[] } | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface PageDef {
  key: string;
  label: string;
  group: string;
  path: string;
}

// Role default pages (must match backend page-permissions.ts)
const ALL_SETTINGS_KEYS = ['settings-users', 'settings-custom-fields', 'settings-field-options', 'settings-expense-categories', 'settings-bank-accounts'];
function getRoleDefaultPages(role: string, allPageKeys: string[]): string[] {
  switch (role) {
    case 'admin': return [...allPageKeys];
    case 'manager': return allPageKeys.filter(k => !k.startsWith('settings-'));
    case 'clerk': return allPageKeys.filter(k => !k.startsWith('settings-'));
    case 'worker': return [];
    default: return [];
  }
}

function computeEffectivePages(role: string, allPageKeys: string[], pagePermissions?: { grant?: string[]; deny?: string[] } | null): Set<string> {
  if (role === 'admin') return new Set(allPageKeys);
  const defaults = new Set(getRoleDefaultPages(role, allPageKeys));
  if (pagePermissions) {
    if (Array.isArray(pagePermissions.grant)) {
      for (const key of pagePermissions.grant) defaults.add(key);
    }
    if (Array.isArray(pagePermissions.deny)) {
      for (const key of pagePermissions.deny) defaults.delete(key);
    }
  }
  return defaults;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: '管理員' },
  { value: 'manager', label: '主管' },
  { value: 'clerk', label: '文員' },
  { value: 'worker', label: '司機/工人' },
];

const emptyForm = {
  username: '',
  password: '',
  displayName: '',
  role: 'clerk' as UserRole,
  email: '',
  phone: '',
  department: '',
  isActive: true,
  user_can_company_clock: false,
  can_approve_mid_shift: false,
  can_daily_report: false,
  can_acceptance_report: false,
};

function UsersPageContent() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterActive, setFilterActive] = useState('');

  // Page permissions
  const [pageDefs, setPageDefs] = useState<PageDef[]>([]);
  const [showPermModal, setShowPermModal] = useState(false);
  const [permUser, setPermUser] = useState<UserItem | null>(null);
  const [permChecked, setPermChecked] = useState<Set<string>>(new Set());
  const [permSaving, setPermSaving] = useState(false);

  // Load page definitions once
  useEffect(() => {
    authApi.getPageDefinitions().then(res => setPageDefs(res.data)).catch(() => {});
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (search) params.search = search;
      if (filterRole) params.role = filterRole;
      if (filterActive) params.isActive = filterActive;
      const res = await usersApi.list(params);
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [search, filterRole, filterActive]);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (u: UserItem) => {
    setEditingUser(u);
    setForm({
      username: u.username,
      password: '',
      displayName: u.displayName,
      role: u.role,
      email: u.email || '',
      phone: u.phone || '',
      department: u.department || '',
      isActive: u.isActive,
      user_can_company_clock: u.user_can_company_clock,
      can_approve_mid_shift: u.can_approve_mid_shift ?? false,
      can_daily_report: u.can_daily_report ?? false,
      can_acceptance_report: u.can_acceptance_report ?? false,
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');

      if (editingUser) {
        const payload: any = {
          displayName: form.displayName,
          role: form.role,
          email: form.email || undefined,
          phone: form.phone || undefined,
          department: form.department || undefined,
          isActive: form.isActive,
          user_can_company_clock: form.user_can_company_clock,
          can_approve_mid_shift: form.can_approve_mid_shift,
          can_daily_report: form.can_daily_report,
          can_acceptance_report: form.can_acceptance_report,
        };
        if (form.password) {
          payload.password = form.password;
        }
        await usersApi.update(editingUser.id, payload);
      } else {
        if (!form.username || !form.password || !form.displayName) {
          setError('請填寫用戶名、密碼和顯示名稱');
          setSaving(false);
          return;
        }
        await usersApi.create({
          username: form.username,
          password: form.password,
          displayName: form.displayName,
          role: form.role,
          email: form.email || undefined,
          phone: form.phone || undefined,
          department: form.department || undefined,
          isActive: form.isActive,
          user_can_company_clock: form.user_can_company_clock,
          can_approve_mid_shift: form.can_approve_mid_shift,
          can_daily_report: form.can_daily_report,
          can_acceptance_report: form.can_acceptance_report,
        });
      }

      setShowModal(false);
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || '操作失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: UserItem) => {
    if (u.id === currentUser?.id) {
      alert('不能停用自己的帳號');
      return;
    }
    try {
      await usersApi.toggleActive(u.id);
      loadUsers();
    } catch (err) {
      console.error('Failed to toggle user:', err);
    }
  };

  // ── Page permissions modal ──────────────────────────────
  const openPermissions = (u: UserItem) => {
    setPermUser(u);
    const allKeys = pageDefs.map(p => p.key);
    const effective = computeEffectivePages(u.role, allKeys, u.page_permissions);
    setPermChecked(effective);
    setShowPermModal(true);
  };

  const handlePermToggle = (key: string) => {
    setPermChecked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handlePermGroupToggle = (group: string, checked: boolean) => {
    const groupKeys = pageDefs.filter(p => p.group === group).map(p => p.key);
    setPermChecked(prev => {
      const next = new Set(prev);
      groupKeys.forEach(k => checked ? next.add(k) : next.delete(k));
      return next;
    });
  };

  const handlePermSelectAll = (selectAll: boolean) => {
    if (selectAll) {
      setPermChecked(new Set(pageDefs.map(p => p.key)));
    } else {
      setPermChecked(new Set());
    }
  };

  const savePermissions = async () => {
    if (!permUser) return;
    setPermSaving(true);
    try {
      const allKeys = pageDefs.map(p => p.key);
      const roleDefaults = new Set(getRoleDefaultPages(permUser.role, allKeys));
      const grant: string[] = [];
      const deny: string[] = [];
      for (const key of allKeys) {
        const isDefault = roleDefaults.has(key);
        const isChecked = permChecked.has(key);
        if (isChecked && !isDefault) grant.push(key);
        if (!isChecked && isDefault) deny.push(key);
      }
      const pagePermissions = (grant.length === 0 && deny.length === 0) ? null : { grant, deny };
      await usersApi.update(permUser.id, { page_permissions: pagePermissions });
      setShowPermModal(false);
      loadUsers();
    } catch (err) {
      console.error('Failed to save permissions:', err);
    } finally {
      setPermSaving(false);
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

  const hasSupervisorPerms = (u: UserItem) =>
    u.can_approve_mid_shift || u.can_daily_report || u.can_acceptance_report;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">用戶管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理系統用戶帳號和權限</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          + 新增用戶
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="搜尋用戶名、顯示名稱或電郵..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">所有角色</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">所有狀態</option>
            <option value="true">啟用</option>
            <option value="false">停用</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-500">沒有找到用戶</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '720px' }}>
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">用戶名</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">顯示名稱</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">角色</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">部門</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">狀態</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">公司打卡</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">監工權限</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">最後登入</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className={`hover:bg-gray-50 ${!u.isActive ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-medium">{u.username}</td>
                    <td className="px-4 py-3">{u.displayName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                        u.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                        u.role === 'clerk' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.department || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {u.isActive ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(u.role === 'admin' || u.user_can_company_clock) ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">✓</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {hasSupervisorPerms(u) ? (
                        <div className="flex flex-wrap gap-1">
                          {u.can_approve_mid_shift && (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold border border-indigo-200">中直</span>
                          )}
                          {u.can_daily_report && (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold border border-indigo-200">日報</span>
                          )}
                          {u.can_acceptance_report && (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold border border-indigo-200">收貨</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(u.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="text-primary-600 hover:text-primary-800 text-xs font-medium"
                        >
                          編輯
                        </button>
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => openPermissions(u)}
                            className="text-amber-600 hover:text-amber-800 text-xs font-medium"
                          >
                            權限
                          </button>
                        )}
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={`text-xs font-medium ${
                              u.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'
                            }`}
                          >
                            {u.isActive ? '停用' : '啟用'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingUser ? '編輯用戶' : '新增用戶'}>
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {!editingUser && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">用戶名 *</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="登入用的帳號名稱"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {editingUser ? '新密碼（留空不修改）' : '密碼 *'}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder={editingUser ? '留空表示不修改密碼' : '至少 6 個字元'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">顯示名稱 *</label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="中文名或顯示名稱"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色 *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">部門</label>
                <select
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">未指定</option>
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {editingUser && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">帳號啟用</label>
              </div>
            )}

            {/* Portal Permissions Section */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">員工 Portal 權限</p>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="canCompanyClock"
                  checked={form.user_can_company_clock}
                  onChange={(e) => setForm({ ...form, user_can_company_clock: e.target.checked })}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="canCompanyClock" className="text-sm text-gray-700">公司打卡</label>
                <span className="text-xs text-gray-400">(允許登入公司打卡頁面)</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="canApproveMidShift"
                  checked={form.can_approve_mid_shift}
                  onChange={(e) => setForm({ ...form, can_approve_mid_shift: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="canApproveMidShift" className="text-sm text-gray-700">中直批核</label>
                <span className="text-xs text-gray-400">(可進行中直批核)</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="canDailyReport"
                  checked={form.can_daily_report}
                  onChange={(e) => setForm({ ...form, can_daily_report: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="canDailyReport" className="text-sm text-gray-700">工程日報</label>
                <span className="text-xs text-gray-400">(可填寫工程日報)</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="canAcceptanceReport"
                  checked={form.can_acceptance_report}
                  onChange={(e) => setForm({ ...form, can_acceptance_report: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="canAcceptanceReport" className="text-sm text-gray-700">工程收貨</label>
                <span className="text-xs text-gray-400">(可填寫工程收貨報告)</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </Modal>

      {/* Page Permissions Modal */}
      <Modal isOpen={showPermModal} onClose={() => setShowPermModal(false)} title={`頁面權限 - ${permUser?.displayName || ''}`}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              角色：<span className="font-medium">{permUser ? (ROLE_LABELS[permUser.role] || permUser.role) : ''}</span>
              <span className="text-xs text-gray-400 ml-2">(勾選的頁面將可以訪問)</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handlePermSelectAll(true)}
                className="text-xs text-primary-600 hover:text-primary-800 font-medium"
              >
                全選
              </button>
              <button
                onClick={() => handlePermSelectAll(false)}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                取消全選
              </button>
              {permUser && (
                <button
                  onClick={() => {
                    const allKeys = pageDefs.map(p => p.key);
                    setPermChecked(new Set(getRoleDefaultPages(permUser.role, allKeys)));
                  }}
                  className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                >
                  重置預設
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto space-y-4 border rounded-lg p-3">
            {(() => {
              const groups = Array.from(new Set(pageDefs.map(p => p.group)));
              return groups.map(group => {
                const groupPages = pageDefs.filter(p => p.group === group);
                const allChecked = groupPages.every(p => permChecked.has(p.key));
                const someChecked = groupPages.some(p => permChecked.has(p.key));
                return (
                  <div key={group} className="space-y-1">
                    <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                        onChange={(e) => handlePermGroupToggle(group, e.target.checked)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm font-semibold text-gray-700">{group}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 pl-6">
                      {groupPages.map(page => {
                        const allKeys = pageDefs.map(p => p.key);
                        const isDefault = permUser ? getRoleDefaultPages(permUser.role, allKeys).includes(page.key) : false;
                        const isChecked = permChecked.has(page.key);
                        const isOverride = isChecked !== isDefault;
                        return (
                          <label
                            key={page.key}
                            className={`flex items-center gap-2 py-1 px-2 rounded text-sm cursor-pointer hover:bg-gray-50 ${
                              isOverride ? 'bg-amber-50 border border-amber-200' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handlePermToggle(page.key)}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-gray-700">{page.label}</span>
                            {isOverride && (
                              <span className="text-[10px] font-bold text-amber-600 ml-auto">
                                {isChecked ? '+新增' : '-移除'}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => setShowPermModal(false)}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={savePermissions}
              disabled={permSaving}
              className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {permSaving ? '儲存中...' : '儲存權限'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function UsersPage() {
  return (
    <RoleGuard pageKey="settings-users">
      <UsersPageContent />
    </RoleGuard>
  );
}
