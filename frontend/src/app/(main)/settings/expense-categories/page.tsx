'use client';
import { useState, useEffect, useRef } from 'react';
import { expenseCategoriesApi } from '@/lib/api';
import RoleGuard from '@/components/RoleGuard';
import { useAuth } from '@/lib/auth';

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  type?: string | null;
  sort_order: number;
  is_active: boolean;
  children?: Category[];
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  DIRECT: { label: '直接成本', color: 'bg-blue-100 text-blue-700' },
  OVERHEAD: { label: '營運開支', color: 'bg-amber-100 text-amber-700' },
};

function DraggableRow({
  item,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  indent = false,
}: {
  item: Category;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  onDragStart: (id: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (targetId: number) => void;
  indent?: boolean;
}) {
  return (
    <tr
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(item.id)}
      className="border-b hover:bg-gray-50 cursor-grab active:cursor-grabbing"
    >
      <td className="px-3 py-2 text-gray-400 w-8 text-center select-none">⠿</td>
      <td className={`px-3 py-2 text-sm font-medium ${indent ? 'pl-10' : ''}`}>
        {indent && <span className="text-gray-400 mr-1">└</span>}
        {item.name}
      </td>
      <td className="px-3 py-2 text-center w-24">
        {item.type && TYPE_LABELS[item.type] ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_LABELS[item.type].color}`}>
            {TYPE_LABELS[item.type].label}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">-</span>
        )}
      </td>
      <td className="px-3 py-2 text-center w-20">
        <span className={item.is_active ? 'badge-green' : 'badge-gray'}>
          {item.is_active ? '啟用' : '停用'}
        </span>
      </td>
      <td className="px-3 py-2 w-28">
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => onEdit(item)}
            className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
          >
            編輯
          </button>
          <button
            onClick={() => onDelete(item)}
            className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
          >
            刪除
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ExpenseCategoriesPage() {
  const { isReadOnly } = useAuth();
  const [tree, setTree] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Category | null>(null);
  const [formName, setFormName] = useState('');
  const [formParentId, setFormParentId] = useState<string>('');
  const [formType, setFormType] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Drag state
  const dragId = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await expenseCategoriesApi.getTree();
      setTree(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAddParent = () => {
    setEditingItem(null);
    setFormName('');
    setFormParentId('');
    setFormType('');
    setShowModal(true);
  };

  const openAddChild = (parentId: number) => {
    setEditingItem(null);
    setFormName('');
    setFormParentId(String(parentId));
    // Inherit type from parent
    const parent = tree.find(p => p.id === parentId);
    setFormType(parent?.type || '');
    setShowModal(true);
  };

  const openEdit = (c: Category) => {
    setEditingItem(c);
    setFormName(c.name);
    setFormParentId(c.parent_id ? String(c.parent_id) : '');
    setFormType(c.type || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editingItem) {
        const updateData: any = { name: formName.trim() };
        if (formType) updateData.type = formType;
        await expenseCategoriesApi.update(editingItem.id, updateData);
      } else {
        const createData: any = {
          name: formName.trim(),
          parent_id: formParentId ? Number(formParentId) : undefined,
        };
        if (formType) createData.type = formType;
        await expenseCategoriesApi.create(createData);
      }
      setShowModal(false);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Category) => {
    const isParent = !c.parent_id;
    const msg = isParent
      ? `確定刪除大類別「${c.name}」及其所有子類別？`
      : `確定刪除子類別「${c.name}」？`;
    if (!confirm(msg)) return;
    try {
      await expenseCategoriesApi.remove(c.id);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  // Drag & drop reorder (within same level)
  const handleDragStart = (id: number) => {
    dragId.current = id;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropParent = async (targetId: number) => {
    if (dragId.current === null || dragId.current === targetId) return;
    const items = [...tree];
    const fromIdx = items.findIndex((c) => c.id === dragId.current);
    const toIdx = items.findIndex((c) => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    setTree(items);
    dragId.current = null;
    try {
      await expenseCategoriesApi.reorder(
        null,
        items.map((c) => c.id)
      );
    } catch {
      await load();
    }
  };

  const handleDropChild = async (parentId: number, targetId: number) => {
    if (dragId.current === null || dragId.current === targetId) return;
    const parent = tree.find((p) => p.id === parentId);
    if (!parent?.children) return;
    const items = [...parent.children];
    const fromIdx = items.findIndex((c) => c.id === dragId.current);
    const toIdx = items.findIndex((c) => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    // Optimistic update
    setTree((prev) =>
      prev.map((p) => (p.id === parentId ? { ...p, children: items } : p))
    );
    dragId.current = null;
    try {
      await expenseCategoriesApi.reorder(
        parentId,
        items.map((c) => c.id)
      );
    } catch {
      await load();
    }
  };

  // Check if editing/creating a parent-level category (show type selector)
  const isParentLevel = editingItem ? !editingItem.parent_id : !formParentId;

  return (
    <RoleGuard pageKey="settings-expense-categories">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">支出類別管理</h1>
            <p className="text-gray-500 text-sm mt-1">
              管理支出的大類別和子類別，拖拽可調整排序
            </p>
          </div>
          <button onClick={openAddParent} className="btn-primary">
            + 新增大類別
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {tree.map((parent) => (
              <div key={parent.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-gray-900">
                      {parent.name}
                    </h2>
                    {parent.type && TYPE_LABELS[parent.type] && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_LABELS[parent.type].color}`}>
                        {TYPE_LABELS[parent.type].label}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openAddChild(parent.id)}
                      className="text-sm px-3 py-1.5 bg-primary-50 text-primary-600 rounded hover:bg-primary-100"
                    >
                      + 新增子類別
                    </button>
                    <button
                      onClick={() => openEdit(parent)}
                      className="text-sm px-3 py-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => handleDelete(parent)}
                      className="text-sm px-3 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                    >
                      刪除
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: '420px' }}>
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 w-8"></th>
                        <th className="px-3 py-2 text-left whitespace-nowrap">
                          子類別名稱
                        </th>
                        <th className="px-3 py-2 text-center w-24 whitespace-nowrap">
                          類型
                        </th>
                        <th className="px-3 py-2 text-center w-20 whitespace-nowrap">
                          狀態
                        </th>
                        <th className="px-3 py-2 w-28"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!parent.children || parent.children.length === 0) ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                            暫無子類別
                          </td>
                        </tr>
                      ) : (
                        parent.children.map((child) => (
                          <DraggableRow
                            key={child.id}
                            item={child}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={(targetId) => handleDropChild(parent.id, targetId)}
                            indent
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {tree.length === 0 && (
              <div className="card text-center py-12 text-gray-400">
                暫無類別，點擊「新增大類別」開始設定
              </div>
            )}
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingItem
                    ? '編輯類別'
                    : formParentId
                    ? '新增子類別'
                    : '新增大類別'}
                </h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                {!editingItem && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      所屬大類別
                    </label>
                    <select
                      value={formParentId}
                      onChange={(e) => {
                        setFormParentId(e.target.value);
                        // Inherit type from selected parent
                        if (e.target.value) {
                          const parent = tree.find(p => p.id === Number(e.target.value));
                          if (parent?.type) setFormType(parent.type);
                        }
                      }}
                      className="input-field"
                    >
                      <option value="">（頂層大類別）</option>
                      {tree.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    類別名稱 *
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave();
                    }}
                    className="input-field"
                    placeholder="輸入類別名稱"
                  />
                </div>
                {/* Type selector - shown for parent categories */}
                {isParentLevel && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      類別類型
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="input-field"
                    >
                      <option value="">請選擇</option>
                      <option value="DIRECT">直接成本</option>
                      <option value="OVERHEAD">營運開支</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      直接成本：材料費、分判費等工程相關支出；營運開支：薪金、租金等公司營運支出
                    </p>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button onClick={() => setShowModal(false)} className="btn-secondary">
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim()}
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? '儲存中...' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
