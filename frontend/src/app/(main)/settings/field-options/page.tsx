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

// Categories that support CSV import and alphabetical sort
const CSV_IMPORT_CATEGORIES = new Set(['location', 'client_contract_no']);

// Categories that support merge functionality
const MERGE_CATEGORIES = new Set(['location', 'client_contract_no']);

interface FieldOption {
  id: number;
  category: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  aliases?: string[];
}

interface ImportResult {
  added: number;
  skipped: number;
  addedLabels: string[];
  skippedLabels: string[];
}

function DraggableRow({
  option, onEdit, onDelete, onDragStart, onDragOver, onDrop,
  mergeMode, checked, onCheck, showAliases,
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
  showAliases?: boolean;
}) {
  const aliases = option.aliases || [];
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
          <input type="checkbox" checked={!!checked}
            onChange={e => onCheck && onCheck(option.id, e.target.checked)}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 accent-blue-600" />
        </td>
      ) : (
        <td className="px-3 py-2 text-gray-400 w-8 text-center select-none">⠿</td>
      )}
      <td className="px-3 py-2">
        <div className="text-sm font-medium">{option.label}</div>
        {showAliases && aliases.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {aliases.map((alias, i) => (
              <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                {alias}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-center w-20">
        <span className={option.is_active ? 'badge-green' : 'badge-gray'}>
          {option.is_active ? '啟用' : '停用'}
        </span>
      </td>
      {!mergeMode && (
        <td className="px-3 py-2 w-28">
          <div className="flex gap-1 justify-end">
            <button onClick={e => { e.stopPropagation(); onEdit(option); }}
              className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">編輯</button>
            <button onClick={e => { e.stopPropagation(); onDelete(option); }}
              className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">刪除</button>
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

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingOption, setEditingOption] = useState<FieldOption | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formAliases, setFormAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState('');
  const [saving, setSaving] = useState(false);

  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);

  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

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
  useEffect(() => {
    setMergeMode(false);
    setSelectedIds(new Set());
    setPrimaryId(null);
    setSearchQuery(''); // Clear search when switching tabs
  }, [activeTab]);

  const isLocationTab = activeTab === 'location';
  const isContractTab = activeTab === 'client_contract_no';
  const isMergeableTab = MERGE_CATEGORIES.has(activeTab);
  const isCsvTab = CSV_IMPORT_CATEGORIES.has(activeTab);

  // For CSV-import tabs, display alphabetically; otherwise use sort_order
  const sortedOptions = (() => {
    const opts = allOptions[activeTab] || [];
    if (isCsvTab) {
      return [...opts].sort((a, b) => a.label.localeCompare(b.label, 'zh-HK'));
    }
    return opts;
  })();

  // Apply search filter: match label or aliases (for mergeable tabs)
  const currentOptions = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedOptions;
    return sortedOptions.filter(opt => {
      if (opt.label.toLowerCase().includes(q)) return true;
      if (isMergeableTab && opt.aliases && opt.aliases.some(a => a.toLowerCase().includes(q))) return true;
      return false;
    });
  })();

  const openAdd = () => {
    setEditingOption(null);
    setFormLabel('');
    setFormAliases([]);
    setNewAlias('');
    setShowModal(true);
  };

  const openEdit = (o: FieldOption) => {
    setEditingOption(o);
    setFormLabel(o.label);
    setFormAliases(o.aliases ? [...o.aliases] : []);
    setNewAlias('');
    setShowModal(true);
  };

  const handleAddAlias = () => {
    const trimmed = newAlias.trim();
    if (!trimmed || formAliases.includes(trimmed)) return;
    setFormAliases(prev => [...prev, trimmed]);
    setNewAlias('');
  };

  const handleRemoveAlias = (alias: string) => {
    setFormAliases(prev => prev.filter(a => a !== alias));
  };

  const handleSave = async () => {
    if (!formLabel.trim()) return;
    setSaving(true);
    try {
      if (editingOption) {
        await fieldOptionsApi.update(editingOption.id, { label: formLabel.trim() });
        if (isMergeableTab) {
          await fieldOptionsApi.updateAliases(editingOption.id, formAliases);
        }
      } else {
        await fieldOptionsApi.create({ category: activeTab, label: formLabel.trim() });
      }
      setShowModal(false);
      await load();
    } catch (err: unknown) {
      const errorMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '儲存失敗';
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (o: FieldOption) => {
    if (!confirm(`確定刪除「${o.label}」？`)) return;
    try {
      await fieldOptionsApi.remove(o.id);
      await load();
    } catch (err: unknown) {
      const errorMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '刪除失敗';
      alert(errorMessage);
    }
  };

  const handleDragStart = (id: number) => { dragId.current = id; };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = async (targetId: number) => {
    if (dragId.current === null || dragId.current === targetId) return;
    const opts = [...(allOptions[activeTab] || [])];
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

  const mergeItemLabel = isContractTab ? '合約' : '地點';

  const openMergeModal = () => {
    if (selectedIds.size < 2) { alert(`請至少勾選 2 個${mergeItemLabel}才能合併`); return; }
    setPrimaryId(Array.from(selectedIds)[0]);
    setShowMergeModal(true);
  };

  const handleMerge = async () => {
    if (!primaryId) return;
    const mergeIds = Array.from(selectedIds).filter(id => id !== primaryId);
    if (mergeIds.length === 0) { alert(`請選擇不同的主${mergeItemLabel}`); return; }
    setMerging(true);
    try {
      let res;
      if (isContractTab) {
        res = await fieldOptionsApi.mergeContractOptions(primaryId, mergeIds);
      } else {
        res = await fieldOptionsApi.mergeLocations(primaryId, mergeIds);
      }
      setShowMergeModal(false);
      setMergeMode(false);
      setSelectedIds(new Set());
      setPrimaryId(null);
      await load();
      alert(res.data?.message || '合併成功');
    } catch (err: unknown) {
      const errorMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '合併失敗';
      alert(errorMessage);
    } finally {
      setMerging(false);
    }
  };

  // ── CSV Import ──────────────────────────────────────────────────────────────

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);
      setImportPreview(lines);
      setImportResult(null);
      setShowImportModal(true);
    };
    reader.readAsText(file, 'UTF-8');
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    try {
      const res = await fieldOptionsApi.bulkImport(activeTab, importPreview);
      setImportResult(res.data);
      await load();
    } catch (err: unknown) {
      const errorMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '匯入失敗';
      alert(errorMessage);
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportPreview([]);
    setImportResult(null);
  };

  // ────────────────────────────────────────────────────────────────────────────

  const selectedOptions = sortedOptions.filter(o => selectedIds.has(o.id));
  const primaryOption = selectedOptions.find(o => o.id === primaryId);
  const mergeTargets = selectedOptions.filter(o => o.id !== primaryId);
  const previewAliases: string[] = primaryOption
    ? [
        ...(primaryOption.aliases || []),
        ...mergeTargets.flatMap(t => [t.label, ...(t.aliases || [])]),
      ].filter((v, i, arr) => v !== primaryOption.label && arr.indexOf(v) === i)
    : [];

  const totalCount = sortedOptions.length;
  const filteredCount = currentOptions.length;
  const isSearchActive = searchQuery.trim().length > 0;

  // Merge description text based on category
  const mergeDescription = isContractTab
    ? '選擇保留哪一個作為主合約，其餘合約的所有引用記錄（工作紀錄、費率卡、發票、項目等）將自動更新，被合併的合約從選項中移除，舊名稱保留為別名。'
    : '選擇保留哪一個作為主地點，其餘地點的所有引用記錄將自動更新，被合併的地點從選項中移除，舊名稱保留為別名。';

  const mergePreviewNote = isContractTab
    ? '所有工作紀錄、糧單工作紀錄、費率卡、發票、項目、日報、驗收報告中的合約引用將一併更新。此操作不可撤銷。'
    : '所有工作紀錄、薪資紀錄、核對記錄、價目表中的地點引用將一併更新。此操作不可撤銷。';

  const aliasHintText = isContractTab
    ? '橙色標籤為別名（合併後的舊合約名稱）'
    : '橙色標籤為別名（合併後的舊地點名稱，WhatsApp 報工時也能匹配）';

  return (
    <RoleGuard pageKey="settings-field-options">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">選項管理</h1>
            <p className="text-gray-500 text-sm mt-1">管理工作記錄和報價單中各下拉欄位的選項</p>
          </div>
        </div>

        <div className="card">
          <div className="flex gap-1 border-b border-gray-200 mb-4 -mx-6 px-6 overflow-x-auto">
            {CATEGORY_KEYS.map(cat => (
              <button key={cat} onClick={() => setActiveTab(cat)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === cat ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}>
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{CATEGORY_LABELS[activeTab]}</h2>
                {!mergeMode && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {isCsvTab
                      ? '按名稱排序顯示；可匯入 CSV 批量新增'
                      : '拖拽行可調整排序；點擊「編輯」可修改名稱'}
                    {isMergeableTab && (
                      <span className="ml-1 text-amber-600">· {aliasHintText}</span>
                    )}
                  </p>
                )}
                {mergeMode && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    勾選 2 個或以上相似{mergeItemLabel}，然後點擊「確認合併」
                    {selectedIds.size > 0 && <span className="ml-1">（已選 {selectedIds.size} 個）</span>}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {isMergeableTab && (
                  <button onClick={toggleMergeMode}
                    className={`text-sm py-1.5 px-3 rounded-lg border transition-colors ${
                      mergeMode ? 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200' : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    }`}>
                    {mergeMode ? '取消合併' : `⊕ 合併${mergeItemLabel}`}
                  </button>
                )}
                {mergeMode && selectedIds.size >= 2 && (
                  <button onClick={openMergeModal}
                    className="text-sm py-1.5 px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                    確認合併 ({selectedIds.size})
                  </button>
                )}
                {!mergeMode && isCsvTab && (
                  <>
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={handleCsvFileChange}
                    />
                    <button
                      onClick={() => csvInputRef.current?.click()}
                      className="text-sm py-1.5 px-3 rounded-lg border bg-green-50 text-green-700 border-green-300 hover:bg-green-100 transition-colors">
                      ↑ 匯入 CSV
                    </button>
                  </>
                )}
                {!mergeMode && (
                  <button onClick={openAdd} className="btn-primary text-sm py-1.5 px-3">+ 新增選項</button>
                )}
              </div>
            </div>

            {/* Search bar */}
            <div className="mb-3">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={isMergeableTab ? `搜尋${CATEGORY_LABELS[activeTab]}名稱或別名…` : `搜尋${CATEGORY_LABELS[activeTab]}…`}
                  className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 bg-gray-50"
                />
                {isSearchActive && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {isSearchActive && (
                <p className="text-xs text-gray-400 mt-1 pl-1">
                  找到 {filteredCount} / {totalCount} 個結果
                </p>
              )}
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
                      <th className="px-3 py-2 text-left whitespace-nowrap">
                        選項名稱
                        {isMergeableTab && !mergeMode && <span className="ml-1 text-xs font-normal text-gray-400">（含別名）</span>}
                        {isCsvTab && <span className="ml-1 text-xs font-normal text-gray-400">（按名稱排序）</span>}
                      </th>
                      <th className="px-3 py-2 text-center w-20 whitespace-nowrap">狀態</th>
                      {!mergeMode && <th className="px-3 py-2 w-28"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {currentOptions.length === 0 ? (
                      <tr>
                        <td colSpan={mergeMode ? 3 : 4} className="px-3 py-8 text-center text-gray-400">
                          {isSearchActive ? `找不到符合「${searchQuery}」的選項` : '暫無選項，點擊「新增選項」添加'}
                        </td>
                      </tr>
                    ) : (
                      currentOptions.map(opt => (
                        <DraggableRow key={opt.id} option={opt} onEdit={openEdit} onDelete={handleDelete}
                          onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
                          mergeMode={mergeMode} checked={selectedIds.has(opt.id)} onCheck={handleCheck}
                          showAliases={isMergeableTab && !mergeMode} />
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
                  <input autoFocus type="text" value={formLabel}
                    onChange={e => setFormLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !isMergeableTab) handleSave(); }}
                    className="input-field"
                    placeholder={`例如：${activeTab === 'machine_type' ? '平斗' : activeTab === 'tonnage' ? '13噸' : '輸入選項名稱'}`} />
                </div>

                {isMergeableTab && editingOption && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      別名（舊{mergeItemLabel}名稱）
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        {isLocationTab ? '— WhatsApp 報工時也能匹配' : '— 合併後的舊名稱'}
                      </span>
                    </label>
                    {formAliases.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {formAliases.map((alias, i) => (
                          <span key={i} className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                            {alias}
                            <button type="button" onClick={() => handleRemoveAlias(alias)}
                              className="text-amber-500 hover:text-red-500 font-bold leading-none">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input type="text" value={newAlias} onChange={e => setNewAlias(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlias(); } }}
                        className="input-field flex-1 text-sm" placeholder="輸入別名後按 Enter 或點擊新增" />
                      <button type="button" onClick={handleAddAlias} disabled={!newAlias.trim()}
                        className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:opacity-40">
                        新增
                      </button>
                    </div>
                  </div>
                )}
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

        {/* CSV Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  匯入 {CATEGORY_LABELS[activeTab]} — CSV 預覽
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  每行一個選項名稱。已存在的選項將自動跳過。
                </p>
              </div>

              {!importResult ? (
                <>
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        共 {importPreview.length} 個選項
                      </span>
                    </div>
                    <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {importPreview.map((label, i) => (
                        <div key={i} className="px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                    <button onClick={closeImportModal} className="btn-secondary" disabled={importing}>取消</button>
                    <button
                      onClick={handleImportConfirm}
                      disabled={importing || importPreview.length === 0}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                      {importing ? '匯入中...' : `確認匯入 ${importPreview.length} 個`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-6 py-5 space-y-4">
                    {/* Summary */}
                    <div className="flex gap-4">
                      <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold text-green-700">{importResult.added}</div>
                        <div className="text-sm text-green-600 mt-1">成功新增</div>
                      </div>
                      <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold text-gray-500">{importResult.skipped}</div>
                        <div className="text-sm text-gray-400 mt-1">已存在跳過</div>
                      </div>
                    </div>

                    {importResult.addedLabels.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-green-700 mb-1.5">已新增：</p>
                        <div className="max-h-36 overflow-y-auto border border-green-100 rounded-lg bg-green-50 divide-y divide-green-100">
                          {importResult.addedLabels.map((l, i) => (
                            <div key={i} className="px-3 py-1 text-sm text-green-800">{l}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {importResult.skippedLabels.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">已跳過（已存在）：</p>
                        <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 divide-y divide-gray-100">
                          {importResult.skippedLabels.map((l, i) => (
                            <div key={i} className="px-3 py-1 text-sm text-gray-500">{l}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                    <button onClick={closeImportModal} className="btn-primary">完成</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Merge Modal */}
        {showMergeModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">合併{mergeItemLabel}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {mergeDescription}
                </p>
              </div>
              <div className="px-6 py-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">選擇主{mergeItemLabel}（保留的{mergeItemLabel}）：</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedOptions.map(opt => (
                    <label key={opt.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        primaryId === opt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                      <input type="radio" name="primaryOption" value={opt.id}
                        checked={primaryId === opt.id} onChange={() => setPrimaryId(opt.id)}
                        className="accent-blue-600" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                        {opt.aliases && opt.aliases.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {opt.aliases.map((a, i) => (
                              <span key={i} className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0 rounded-full">{a}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {primaryId === opt.id && (
                        <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">主{mergeItemLabel}</span>
                      )}
                    </label>
                  ))}
                </div>

                {primaryId && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <p className="font-medium mb-1">合併預覽：</p>
                    <p>
                      將把{' '}
                      <span className="font-semibold">{mergeTargets.map(o => `「${o.label}」`).join('、')}</span>
                      {' '}合併至{' '}
                      <span className="font-semibold text-blue-700">「{primaryOption?.label}」</span>
                    </p>
                    {previewAliases.length > 0 && (
                      <div className="mt-1.5">
                        <span className="text-xs text-amber-700">合併後別名：</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {previewAliases.map((a, i) => (
                            <span key={i} className="text-xs bg-white text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded-full">{a}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="mt-1.5 text-xs text-amber-600">{mergePreviewNote}</p>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button onClick={() => { setShowMergeModal(false); setPrimaryId(null); }}
                  className="btn-secondary" disabled={merging}>取消</button>
                <button onClick={handleMerge} disabled={!primaryId || merging}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
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
