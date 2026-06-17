'use client';
import { useState, useEffect } from 'react';
import { paymentInSourceTypesApi } from '@/lib/api';
import RoleGuard from '@/components/RoleGuard';
import { useAuth } from '@/lib/auth';

interface SourceType {
  id: number;
  code: string;
  label: string;
  is_system: boolean;
  has_recalculation: boolean;
  is_active: boolean;
  sort_order: number;
}

export default function PaymentInSourceTypesPage() {
  const { isReadOnly } = useAuth();
  const [items, setItems] = useState<SourceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ code: '', label: '', has_recalculation: false, sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const res = await paymentInSourceTypesApi.list(showInactive);
      setItems(res.data);
    } catch (e: any) {
      setError(e.response?.data?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [showInactive]);

  const handleAdd = async () => {
    if (!form.code || !form.label) {
      setError('代碼和名稱為必填');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await paymentInSourceTypesApi.create({
        code: form.code,
        label: form.label,
        has_recalculation: form.has_recalculation,
        sort_order: form.sort_order,
      });
      setForm({ code: '', label: '', has_recalculation: false, sort_order: 0 });
      setShowAddForm(false);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message || '新增失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (item: SourceType) => {
    setSaving(true);
    setError('');
    try {
      await paymentInSourceTypesApi.update(item.id, {
        label: form.label,
        has_recalculation: form.has_recalculation,
        sort_order: form.sort_order,
        ...(item.is_system ? {} : { code: form.code }),
      });
      setEditingId(null);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message || '更新失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: SourceType) => {
    try {
      await paymentInSourceTypesApi.update(item.id, { is_active: !item.is_active });
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message || '操作失敗');
    }
  };

  const handleDelete = async (item: SourceType) => {
    if (!confirm(`確定要刪除「${item.label}」嗎？`)) return;
    try {
      await paymentInSourceTypesApi.delete(item.id);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message || '刪除失敗');
    }
  };

  const startEdit = (item: SourceType) => {
    setEditingId(item.id);
    setForm({
      code: item.code,
      label: item.label,
      has_recalculation: item.has_recalculation,
      sort_order: item.sort_order,
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <RoleGuard>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">收款來源類型管理</h1>
            <p className="text-sm text-gray-500 mt-1">管理收款記錄的來源類型選項</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300"
              />
              顯示已停用
            </label>
            {!isReadOnly() && (
              <button
                onClick={() => {
                  setShowAddForm(true);
                  setForm({ code: '', label: '', has_recalculation: false, sort_order: 0 });
                }}
                className="btn-primary"
              >
                新增類型
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">✕</button>
          </div>
        )}

        {/* Add Form */}
        {showAddForm && (
          <div className="card p-4 mb-4 border-2 border-blue-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">新增來源類型</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">代碼 *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="input-field text-sm"
                  placeholder="例如: refund"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">顯示名稱 *</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="input-field text-sm"
                  placeholder="例如: 退款"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">排序</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  className="input-field text-sm"
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={form.has_recalculation}
                    onChange={(e) => setForm({ ...form, has_recalculation: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  有重算邏輯
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">取消</button>
              <button onClick={handleAdd} disabled={saving} className="btn-primary text-sm">
                {saving ? '儲存中...' : '新增'}
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">代碼</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">顯示名稱</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">系統內建</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">重算邏輯</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">狀態</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">排序</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={`border-b hover:bg-gray-50 ${!item.is_active ? 'opacity-50' : ''}`}>
                  {editingId === item.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={form.code}
                          onChange={(e) => setForm({ ...form, code: e.target.value })}
                          disabled={item.is_system}
                          className="input-field text-sm w-full"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={form.label}
                          onChange={(e) => setForm({ ...form, label: e.target.value })}
                          className="input-field text-sm w-full"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        {item.is_system ? '✓' : ''}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={form.has_recalculation}
                          onChange={(e) => setForm({ ...form, has_recalculation: e.target.checked })}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {item.is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          value={form.sort_order}
                          onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                          className="input-field text-sm w-16 text-center"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleUpdate(item)}
                            disabled={saving}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            儲存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            取消
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm font-mono text-gray-700">{item.code}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.label}</td>
                      <td className="px-4 py-3 text-center text-sm">
                        {item.is_system && <span className="text-blue-600">✓</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        {item.has_recalculation && <span className="text-green-600">✓</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {item.is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-500">{item.sort_order}</td>
                      <td className="px-4 py-3 text-right">
                        {!isReadOnly() && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => startEdit(item)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              編輯
                            </button>
                            <button
                              onClick={() => handleToggleActive(item)}
                              className={`text-xs ${item.is_active ? 'text-yellow-600 hover:text-yellow-800' : 'text-green-600 hover:text-green-800'}`}
                            >
                              {item.is_active ? '停用' : '啟用'}
                            </button>
                            {!item.is_system && (
                              <button
                                onClick={() => handleDelete(item)}
                                className="text-xs text-red-600 hover:text-red-800"
                              >
                                刪除
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    沒有資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </RoleGuard>
  );
}
