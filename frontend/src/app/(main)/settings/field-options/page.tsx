'use client';
import { useState, useEffect, useRef } from 'react';
import { fieldOptionsApi } from '@/lib/api';
import RoleGuard from '@/components/RoleGuard';

const CATEGORY_LABELS: Record<string, string> = {
  employee_role: '員工職位',
  certificate_type: '證書/牌照類型',
  machine_type: '機種',
  tonnage: '噸數',
  wage_unit: '工資單位',
  service_type: '服務類型',
  day_night: '日夜班',
  payment_method: '付款方法',
  client_contract_no: '客戶合約',
  location: '地點（起點/終點）',
  worker_type: '工程工人分類',
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

interface FieldOption {
  id: number;
  category: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

// Draggable item row
function DraggableRow({
  option,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  option: FieldOption;
  onEdit: (o: FieldOption) => void;
  onDelete: (o: FieldOption) => void;
  onDragStart: (id: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (targetId: number) => void;
}) {
  return (
    <tr
      draggable
      onDragStart={() => onDragStart(option.id)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(option.id)}
      className="border-b hover:bg-gray-50 cursor-grab active:cursor-grabbing"
    >
      <td className="px-3 py-2 text-gray-400 w-8 text-center select-none">⠿</td>
      <td className="px-3 py-2 text-sm font-medium">{option.label}</td>
      <td className="px-3 py-2 text-center w-20">
        <span className={option.is_active ? 'badge-green' : 'badge-gray'}>
          {option.is_active ? '啟用' : '停用'}
        </span>
      </td>
      <td className="px-3 py-2 w-28">
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => onEdit(option)}
            className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
          >
            編輯
          </button>
          <button
            onClick={() => onDelete(option)}
            className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
          >
            刪除
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function FieldOptionsPage() {
  const [activeTab, setActiveTab] = useState(CATEGORY_KEYS[0]);
  const [allOptions, setAllOptions] = useState<Record<string, FieldOption[]>>({});
  const [loading, setLoading] = useState(true);

  // Add/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingOption, setEditingOption] = useState<FieldOption | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [saving, setSaving] = useState(false);

  // Drag state
  const dragId = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fieldOptionsApi.getAll();
      setAllOptions(res.data || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const currentOptions = allOptions[activeTab] || [];

  const openAdd = () => {
    setEditingOption(null);
    setFormLabel('');
    setShowModal(true);
  };

  const openEdit = (o: FieldOption) => {
    setEditingOption(o);
    setFormLabel(o.label);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formLabel.trim()) return;
    setSaving(true);
    try {
      if (editingOption) {
        await fieldOptionsApi.update(editingOption.id, { label: formLabel.trim() });
      } else {
        await fieldOptionsApi.create({ category: activeTab, label: formLabel.trim() });
      }
      setShowModal(false);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (o: FieldOption) => {
    if (!confirm(`確定刪除「${o.label}」？`)) return;
    try {
      await fieldOptionsApi.remove(o.id);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const handleToggleActive = async (o: FieldOption) => {
    try {
      await fieldOptionsApi.update(o.id, { is_active: !o.is_active });
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || '更新失敗');
    }
  };

  // Drag & drop reorder
  const handleDragStart = (id: number) => {
    dragId.current = id;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetId: number) => {
    if (dragId.current === null || dragId.current === targetId) return;
    const opts = [...currentOptions];
    const fromIdx = opts.findIndex(o => o.id === dragId.current);
    const toIdx = opts.findIndex(o => o.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = opts.splice(fromIdx, 1);
    opts.splice(toIdx, 0, moved);
    // Optimistic update
    setAllOptions(prev => ({ ...prev, [activeTab]: opts }));
    dragId.current = null;
    try {
      await fieldOptionsApi.reorder(activeTab, opts.map(o => o.id));
    } catch {
      await load(); // Revert on error
    }
  };

  return (
    <RoleGuard minRole="admin">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">選項管理</h1>
            <p className="text-gray-500 text-sm mt-1">管理工作記錄和報價單中各下拉欄位的選項</p>
          </div>
        </div>

        <div className="card">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-4 -mx-6 px-6 overflow-x-auto">
            {CATEGORY_KEYS.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === cat
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{CATEGORY_LABELS[activeTab]}</h2>
                <p className="text-xs text-gray-400 mt-0.5">拖拽行可調整排序；點擊「編輯」可修改名稱</p>
              </div>
              <button onClick={openAdd} className="btn-primary text-sm py-1.5 px-3">
                + 新增選項
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: '360px' }}>
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">選項名稱</th>
                      <th className="px-3 py-2 text-center w-20 whitespace-nowrap">狀態</th>
                      <th className="px-3 py-2 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentOptions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-gray-400">
                          暫無選項，點擊「新增選項」添加
                        </td>
                      </tr>
                    ) : (
                      currentOptions.map(opt => (
                        <DraggableRow
                          key={opt.id}
                          option={opt}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingOption ? '編輯選項' : `新增${CATEGORY_LABELS[activeTab]}選項`}
                </h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">選項名稱 *</label>
                  <input
                    autoFocus
                    type="text"
                    value={formLabel}
                    onChange={e => setFormLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                    className="input-field"
                    placeholder={`例如：${activeTab === 'machine_type' ? '平斗' : activeTab === 'tonnage' ? '13噸' : '輸入選項名稱'}`}
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
                <button onClick={handleSave} disabled={saving || !formLabel.trim()} className="btn-primary disabled:opacity-50">
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
