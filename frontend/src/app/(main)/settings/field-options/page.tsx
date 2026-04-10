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

// Draggable item row — with optional checkbox for merge mode
function DraggableRow({
  option,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  mergeMode,
  checked,
  onCheck,
}: {
  option: FieldOption;
  onEdit: (o: FieldOption) => void;
  onDelete: (o: FieldOption) => void;
  onDragStart: (id: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (targetId: number) => void;
  mergeMode?: boolean;
  checked?: boolean;
  onCheck?: (id: number, checked: boolean) => void;
}) {
  return (
    <tr
      draggable={!mergeMode}
      onDragStart={() => !mergeMode && onDragStart(option.id)}
      onDragOver={onDragOver}
      onDrop={() => !mergeMode && onDrop(option.id)}
      className={`border-b hover:bg-gray-50 ${mergeMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${checked ? 'bg-blue-50' : ''}`}
      onClick={() => mergeMode && onCheck && onCheck(option.id, !checked)}
    >
      {mergeMode ? (
        <td className="px-3 py-2 w-8 text-center">
          <input
            type="checkbox"
            checked={!!checked}
            onChange={e => onCheck && onCheck(option.id, e.target.checked)}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 accent-blue-600"
          />
        </td>
      ) : (
        <td className="px-3 py-2 text-gray-400 w-8 text-center select-none">⠿</td>
      )}
      <td className="px-3 py-2 text-sm font-medium">{option.label}</td>
      <td className="px-3 py-2 text-center w-20">
        <span className={option.is_active ? 'badge-green' : 'badge-gray'}>
          {option.is_active ? '啟用' : '停用'}
        </span>
      </td>
      {!mergeMode && (
        <td className="px-3 py-2 w-28">
          <div className="flex gap-1 justify-end">
            <button
              onClick={e => { e.stopPropagation(); onEdit(option); }}
              className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
            >
              編輯
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(option); }}
              className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
            >
              刪除
            </button>
          </div>
        </td>
      )}
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

  // Merge mode state
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);

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

  // Reset merge state when switching tabs
  useEffect(() => {
    setMergeMode(false);
    setSelectedIds(new Set());
    setPrimaryId(null);
  }, [activeTab]);

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

  // Drag & drop reorder
  const handleDragStart = (id: number) => { dragId.current = id; };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = async (targetId: number) => {
    if (dragId.current === null || dragId.current === targetId) return;
    const opts = [...currentOptions];
    const fromIdx = opts.findIndex(o => o.id === dragId.current);
    const toIdx = opts.findIndex(o => o.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = opts.splice(fromIdx, 1);
    opts.splice(toIdx, 0, moved);
    setAllOptions(prev => ({ ...prev, [activeTab]: opts }));
    dragId.current = null;
    try {
      await fieldOptionsApi.reorder(activeTab, opts.map(o => o.id));
    } catch {
      await load();
    }
  };

  // Merge mode handlers
  const toggleMergeMode = () => {
    setMergeMode(v => !v);
    setSelectedIds(new Set());
    setPrimaryId(null);
  };

  const handleCheck = (id: number, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openMergeModal = () => {
    if (selectedIds.size < 2) {
      alert('請至少勾選 2 個地點才能合併');
      return;
    }
    // Default primary = first selected
    setPrimaryId(Array.from(selectedIds)[0]);
    setShowMergeModal(true);
  };

  const handleMerge = async () => {
    if (!primaryId) return;
    const mergeIds = Array.from(selectedIds).filter(id => id !== primaryId);
    if (mergeIds.length === 0) {
      alert('請選擇不同的主地點');
      return;
    }
    setMerging(true);
    try {
      const res = await fieldOptionsApi.mergeLocations(primaryId, mergeIds);
      setShowMergeModal(false);
      setMergeMode(false);
      setSelectedIds(new Set());
      setPrimaryId(null);
      await load();
      alert(res.data?.message || '合併成功');
    } catch (err: any) {
      alert(err.response?.data?.message || '合併失敗');
    } finally {
      setMerging(false);
    }
  };

  const selectedOptions = currentOptions.filter(o => selectedIds.has(o.id));

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
                {!mergeMode && (
                  <p className="text-xs text-gray-400 mt-0.5">拖拽行可調整排序；點擊「編輯」可修改名稱</p>
                )}
                {mergeMode && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    勾選 2 個或以上相似地點，然後點擊「確認合併」
                    {selectedIds.size > 0 && <span className="ml-2 font-medium">（已選 {selectedIds.size} 個）</span>}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {activeTab === 'location' && (
                  <button
                    onClick={toggleMergeMode}
                    className={`text-sm py-1.5 px-3 rounded-lg border transition-colors ${
                      mergeMode
                        ? 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                        : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {mergeMode ? '取消合併' : '⊕ 合併地點'}
                  </button>
                )}
                {mergeMode && selectedIds.size >= 2 && (
                  <button
                    onClick={openMergeModal}
                    className="text-sm py-1.5 px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >
                    確認合併 ({selectedIds.size})
                  </button>
                )}
                {!mergeMode && (
                  <button onClick={openAdd} className="btn-primary text-sm py-1.5 px-3">
                    + 新增選項
                  </button>
                )}
              </div>
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
                      {!mergeMode && <th className="px-3 py-2 w-28"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {currentOptions.length === 0 ? (
                      <tr>
                        <td colSpan={mergeMode ? 3 : 4} className="px-3 py-8 text-center text-gray-400">
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
                          mergeMode={mergeMode}
                          checked={selectedIds.has(opt.id)}
                          onCheck={handleCheck}
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

        {/* Merge Modal */}
        {showMergeModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">合併地點</h3>
                <p className="text-sm text-gray-500 mt-1">
                  選擇保留哪一個作為主地點，其餘地點的所有引用記錄（工作紀錄、價目表等）將自動更新為主地點，被合併的地點將從選項中移除。
                </p>
              </div>
              <div className="px-6 py-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">選擇主地點（保留的地點）：</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedOptions.map(opt => (
                    <label
                      key={opt.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        primaryId === opt.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="primaryLocation"
                        value={opt.id}
                        checked={primaryId === opt.id}
                        onChange={() => setPrimaryId(opt.id)}
                        className="accent-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                      {primaryId === opt.id && (
                        <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">主地點</span>
                      )}
                    </label>
                  ))}
                </div>

                {primaryId && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <p className="font-medium mb-1">合併預覽：</p>
                    <p>
                      將把{' '}
                      <span className="font-semibold">
                        {selectedOptions.filter(o => o.id !== primaryId).map(o => `「${o.label}」`).join('、')}
                      </span>
                      {' '}合併至{' '}
                      <span className="font-semibold text-blue-700">「{selectedOptions.find(o => o.id === primaryId)?.label}」</span>
                    </p>
                    <p className="mt-1 text-xs text-amber-600">所有工作紀錄、薪資紀錄、核對記錄、價目表中的地點引用將一併更新。此操作不可撤銷。</p>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => { setShowMergeModal(false); setPrimaryId(null); }}
                  className="btn-secondary"
                  disabled={merging}
                >
                  取消
                </button>
                <button
                  onClick={handleMerge}
                  disabled={!primaryId || merging}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {merging ? '合併中...' : '確認合併'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
