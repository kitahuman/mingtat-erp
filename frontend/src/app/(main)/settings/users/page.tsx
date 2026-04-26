'use client';
import { useState, useEffect } from 'react';
import { usersApi, authApi } from '@/lib/api';
import { useAuth, UserRole, ROLE_LABELS, DEPARTMENT_OPTIONS } from '@/lib/auth';
import RoleGuard from '@/components/RoleGuard';
import Modal from '@/components/Modal';

interface LinkedEmployee {
  id: number;
  name_zh: string;
  name_en: string | null;
  emp_code: string | null;
  role?: string | null;
  company_id?: number | null;
  phone?: string | null;
}

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
  employee?: LinkedEmployee | null;
}

interface PageDef {
  key: string;
  label: string;
  group: string;
  path: string;
}

interface UpdatePayload {
  username?: string;
  displayName?: string;
  role?: UserRole;
  email?: string;
  phone?: string;
  department?: string;
  isActive?: boolean;
  user_can_company_clock?: boolean;
  can_approve_mid_shift?: boolean;
  can_daily_report?: boolean;
  can_acceptance_report?: boolean;
  password?: string;
  page_permissions?: { grant?: string[]; deny?: string[] } | null;
  sync_employee_phone?: boolean;
}

interface EmployeePhonePendingSync {
  employee_id: number;
  employee_name: string;
  old_phone: string | null;
  new_phone: string | null;
}

interface UpdateUserResponse {
  user: UserItem;
  employee_phone_pending_sync: EmployeePhonePendingSync | null;
}

interface DeleteCheckResponse {
  user_id: number;
  username: string;
  display_name: string;
  related: Record<string, number>;
  total: number;
  can_hard_delete: boolean;
  linked_employee: LinkedEmployee | null;
}

// Role default pages (must match backend page-permissions.ts)
function getRoleDefaultPages(role: string, allPageKeys: string[]): string[] {
  switch (role) {
    case 'admin': return [...allPageKeys];
    case 'director': return [...allPageKeys];
    case 'manager': return allPageKeys.filter(k => !k.startsWith('settings-'));
    case 'clerk': return allPageKeys.filter(k => !k.startsWith('settings-'));
    case 'worker': return [];
    default: return [];
  }
}

function computeEffectivePages(
  role: string,
  allPageKeys: string[],
  pagePermissions?: { grant?: string[]; deny?: string[] } | null,
): Set<string> {
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
  { value: 'director', label: '董事' },
  { value: 'manager', label: '主管' },
  { value: 'clerk', label: '文員' },
  { value: 'worker', label: '司機/工人' },
];

const RELATED_LABELS: Record<string, string> = {
  work_logs_published: '工作紀錄（發佈人）',
  payrolls: '糧單操作紀錄',
  expenses: '報銷操作紀錄',
  payment_ins: '收款操作紀錄',
  payment_outs: '付款操作紀錄',
  daily_reports_created: '工程日報（建立人）',
  acceptance_reports_created: '工程收貨報告（建立人）',
  audit_logs: '系統審計日誌',
  verification_confirmations: '對帳確認紀錄',
  employee_attendances: '員工考勤（用戶）',
  employee_attendance_operator: '員工考勤（操作員）',
  mid_shift_approvals: '中直批核紀錄',
  employee_leaves_submitted: '請假申請（提交人）',
  employee_leaves_approved: '請假申請（批核人）',
  web_push_subscriptions: '推播訂閱',
  deleted_record_marks: '已刪除記錄的「刪除人」標記',
};

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
  const { user: currentUser, isReadOnly } = useAuth();
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

  // Employee phone follow-up sync prompt
  const [phoneSyncPrompt, setPhoneSyncPrompt] = useState<{
    user: UserItem;
    pending: EmployeePhonePendingSync;
  } | null>(null);
  const [phoneSyncRunning, setPhoneSyncRunning] = useState(false);

  // Delete flow
  const [deleteCheck, setDeleteCheck] = useState<{
    user: UserItem;
    info: DeleteCheckResponse;
  } | null>(null);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  // Load page definitions once
  useEffect(() => {
    authApi.getPageDefinitions().then(res => setPageDefs(res.data)).catch(() => {});
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterRole) params.role = filterRole;
      if (filterActive) params.isActive = filterActive;
      const res = await usersApi.list(params);
      setUsers(res.data as UserItem[]);
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
        const phoneTrimmed = form.phone.trim();
        const linkedEmployee = editingUser.employee;
        const phoneChanged = (editingUser.phone || '') !== phoneTrimmed;

        // ── If phone changed AND user has linked employee, ask first ──
        let syncEmployeePhone: boolean | undefined;
        if (phoneChanged && linkedEmployee) {
          const employeeName = linkedEmployee.name_zh || linkedEmployee.name_en || `員工 #${linkedEmployee.id}`;
          const empPhoneText = linkedEmployee.phone ? `（目前：${linkedEmployee.phone}）` : '（員工未設定電話）';
          const confirmMsg =
            `此用戶關聯了員工 ${employeeName}${empPhoneText}\n\n` +
            `是否同時將員工的手機號碼更新為「${phoneTrimmed || '（清空）'}」？\n\n` +
            `「確定」= 同時更新員工手機\n「取消」= 只更新登入號碼`;
          syncEmployeePhone = window.confirm(confirmMsg);
        }

        const payload: UpdatePayload = {
          username: form.username.trim(),
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
        if (syncEmployeePhone !== undefined) {
          payload.sync_employee_phone = syncEmployeePhone;
        }
        const res = await usersApi.update(editingUser.id, payload);
        const data = res.data as UpdateUserResponse;
        setShowModal(false);
        await loadUsers();

        // Optional fallback: if backend still surfaced a pending sync hint
        // (e.g. user changed phone but skipped the dialog above), show
        // a non-blocking confirm.
        if (data.employee_phone_pending_sync) {
          setPhoneSyncPrompt({ user: data.user, pending: data.employee_phone_pending_sync });
        }
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
        setShowModal(false);
        await loadUsers();
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || '操作失敗');
    } finally {
      setSaving(false);
    }
  };

  const confirmPhoneSync = async () => {
    if (!phoneSyncPrompt) return;
    try {
      setPhoneSyncRunning(true);
      await usersApi.update(phoneSyncPrompt.user.id, {
        phone: phoneSyncPrompt.pending.new_phone ?? '',
        sync_employee_phone: true,
      });
      setPhoneSyncPrompt(null);
      await loadUsers();
    } catch (err) {
      console.error('Failed to sync employee phone:', err);
    } finally {
      setPhoneSyncRunning(false);
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

  // ── Delete flow ───────────────────────────────────────────
  const openDelete = async (u: UserItem) => {
    if (u.id === currentUser?.id) {
      alert('不能刪除自己的帳號');
      return;
    }
    setDeleteError('');
    setDeleteResult(null);
    try {
      const res = await usersApi.checkDelete(u.id);
      const info = res.data as DeleteCheckResponse;
      if (info.can_hard_delete) {
        // No related history — allow direct delete with simple confirm
        if (!window.confirm(`確定要刪除用戶「${u.displayName}（${u.username}）」嗎？\n\n此用戶沒有任何關聯記錄，可直接硬刪除。`)) {
          return;
        }
        setDeleteRunning(true);
        await usersApi.delete(u.id, false);
        setDeleteRunning(false);
        await loadUsers();
        return;
      }
      // Has related history — open detailed dialog
      setDeleteCheck({ user: u, info });
    } catch (err) {
      console.error('Failed to check delete:', err);
      alert('檢查關聯記錄失敗');
    }
  };

  const confirmDelete = async () => {
    if (!deleteCheck) return;
    setDeleteRunning(true);
    setDeleteError('');
    try {
      const res = await usersApi.delete(deleteCheck.user.id, true);
      const data = res.data as { detached: number };
      setDeleteResult(`已刪除用戶並處理 ${data.detached} 筆關聯記錄`);
      await loadUsers();
      // Auto-close after a short pause so the admin sees the success state
      setTimeout(() => {
        setDeleteCheck(null);
        setDeleteResult(null);
      }, 1500);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setDeleteError(e.response?.data?.message || '刪除失敗');
    } finally {
      setDeleteRunning(false);
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
        {!isReadOnly() && (
          <button
            onClick={openCreate}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            + 新增用戶
          </button>
        )}
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
                        u.role === 'director' ? 'bg-amber-100 text-amber-800' :
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
                        {!isReadOnly() && (
                          <button
                            onClick={() => openEdit(u)}
                            className="text-primary-600 hover:text-primary-800 text-xs font-medium"
                          >
                            編輯
                          </button>
                        )}
                        {!isReadOnly() && u.role !== 'admin' && (
                          <button
                            onClick={() => openPermissions(u)}
                            className="text-amber-600 hover:text-amber-800 text-xs font-medium"
                          >
                            權限
                          </button>
                        )}
                        {!isReadOnly() && u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={`text-xs font-medium ${
                              u.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'
                            }`}
                          >
                            {u.isActive ? '停用' : '啟用'}
                          </button>
                        )}
                        {!isReadOnly() && u.id !== currentUser?.id && (
                          <button
                            onClick={() => openDelete(u)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            刪除
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
                {editingUser?.employee && (
                  <p className="text-xs text-gray-500 mt-1">
                    已關聯員工：<span className="font-medium">{editingUser.employee.name_zh || editingUser.employee.name_en}</span>
                    {editingUser.employee.phone && (
                      <>（員工電話：{editingUser.employee.phone}）</>
                    )}
                    <br />
                    <span className="text-amber-600">改動電話時系統會詢問是否同步更新員工資料。</span>
                  </p>
                )}
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

      {/* Employee Phone Sync Prompt (shown if backend reports a pending sync) */}
      <Modal
        isOpen={!!phoneSyncPrompt}
        onClose={() => setPhoneSyncPrompt(null)}
        title="是否同步更新員工手機號碼？"
      >
        {phoneSyncPrompt && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
              此用戶關聯了員工 <strong>{phoneSyncPrompt.pending.employee_name}</strong>。
              <br />
              <span className="text-gray-700">
                員工目前電話：{phoneSyncPrompt.pending.old_phone || '（未設定）'}
                <br />
                新登入電話：{phoneSyncPrompt.pending.new_phone || '（已清空）'}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              是否同時將員工資料中的手機號碼也更新為新登入電話？
              如選「只更新登入號碼」，員工資料中的手機號碼將維持不變。
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setPhoneSyncPrompt(null)}
                disabled={phoneSyncRunning}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                只更新登入號碼
              </button>
              <button
                onClick={confirmPhoneSync}
                disabled={phoneSyncRunning}
                className="px-4 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {phoneSyncRunning ? '同步中...' : '同時更新員工手機'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteCheck}
        onClose={() => { if (!deleteRunning) { setDeleteCheck(null); setDeleteError(''); setDeleteResult(null); } }}
        title={`刪除用戶 - ${deleteCheck?.user.displayName || ''}`}
      >
        {deleteCheck && (
          <div className="space-y-4">
            {deleteResult ? (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
                {deleteResult}
              </div>
            ) : (
              <>
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                  <p className="font-semibold">⚠️ 此用戶有以下關聯記錄（共 {deleteCheck.info.total} 筆）：</p>
                </div>
                <div className="border rounded-lg divide-y max-h-[40vh] overflow-y-auto">
                  {Object.entries(deleteCheck.info.related)
                    .filter(([, count]) => count > 0)
                    .map(([key, count]) => (
                      <div key={key} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span className="text-gray-700">{RELATED_LABELS[key] || key}</span>
                        <span className="font-mono font-semibold text-red-600">{count} 筆</span>
                      </div>
                    ))}
                </div>
                <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm space-y-2">
                  <p className="font-semibold">確認刪除後將執行以下動作：</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>所有關聯記錄中的 user_id / created_by 等欄位將被設為 <code>NULL</code></li>
                    <li>歷史記錄會保留發佈人/操作人「<strong>{deleteCheck.user.displayName}</strong>」的名字快照，不再可點擊跳轉</li>
                    <li>用戶帳號將被<strong>硬刪除</strong>，無法復原</li>
                    <li>系統審計日誌（audit_logs）和推播訂閱會一併移除</li>
                  </ul>
                </div>
                {deleteCheck.info.linked_employee && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-lg text-sm">
                    此用戶關聯了員工「<strong>{deleteCheck.info.linked_employee.name_zh || deleteCheck.info.linked_employee.name_en}</strong>」，
                    員工資料不會被刪除，僅會解除帳號關聯。
                  </div>
                )}
                {deleteError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {deleteError}
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => { setDeleteCheck(null); setDeleteError(''); }}
                    disabled={deleteRunning}
                    className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={deleteRunning}
                    className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleteRunning ? '刪除中...' : '確認刪除'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
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
