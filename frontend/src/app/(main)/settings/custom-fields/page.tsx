'use client';
import { useState, useEffect, useCallback } from 'react';
import { customFieldsApi } from '@/lib/api';
import RoleGuard from '@/components/RoleGuard';

const MODULES = [
  { value: 'company', label: '公司資料' },
  { value: 'partner', label: '合作單位' },
  { value: 'vehicle', label: '車輛' },
  { value: 'machinery', label: '機械' },
  { value: 'employee', label: '員工' },
];

const FIELD_TYPES = [
  { value: 'text', label: '文字' },
  { value: 'number', label: '數字' },
  { value: 'date', label: '日期' },
  { value: 'boolean', label: '是/否' },
  { value: 'select', label: '下拉選擇' },
  { value: 'textarea', label: '長文字' },
];

const emptyForm = {
  module: 'company',
  field_name: '',
  field_type: 'text',
  options: '',
  is_required: false,
  has_expiry_alert: false,
  sort_order: 0,
  is_active: true,
};

function CustomFieldsPageContent() {
  const [fields, setFields] = useState<any[]>([]);
  const [selectedModule, setSelectedModule] = useState('company');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<any>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customFieldsApi.list({ module: selectedModule });
      setFields(res.data);
    } catch {}
    setLoading(false);
  }, [selectedModule]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingField(null);
    setForm({ ...emptyForm, module: selectedModule });
    setShowModal(true);
  };

  const openEdit = (field: any) => {
    setEditingField(field);
    setForm({
      module: field.module,
      field_name: field.field_name,
      field_type: field.field_type,
      options: field.options || '',
      is_required: field.is_required,
      has_expiry_alert: field.has_expiry_alert,
      sort_order: field.sort_order,
      is_active: field.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const payload = { ...form, sort_order: Number(form.sort_order) || 0 };
      if (editingField) {
        await customFieldsApi.update(editingField.id, payload);
      } else {
        await customFieldsApi.create(payload);
      }
      setShowModal(false);
      load();
    } catch (err: any) { alert(err.response?.data?.message || '操作失敗'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除此自定義欄位？所有相關的欄位值也會被刪除。')) return;
    try {
      await customFieldsApi.delete(id);
      load();
    } catch (err: any) { alert(err.response?.data?.message || '刪除失敗'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">自定義欄位管理</h1>
          <p className="text-gray-500 mt-1">為各模組新增自定義欄位，無需修改代碼</p>
        </div>
        <button onClick={openCreate} className="btn-primary">新增欄位</button>
      </div>

      {/* Module Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {MODULES.map(m => (
          <button key={m.value} onClick={() => { setSelectedModule(m.value); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedModule === m.value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Fields List */}
      <div className="card">
        {loading ? (
          <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
        ) : fields.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <p className="text-lg mb-2">此模組暫無自定義欄位</p>
            <p className="text-sm">點擊「新增欄位」開始建立</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: '560px' }}>
              <thead>
                <tr className="border-b text-left">
                  <th className="py-3 px-4 text-sm font-medium text-gray-500 whitespace-nowrap">排序</th>
                  <th className="py-3 px-4 text-sm font-medium text-gray-500 whitespace-nowrap">欄位名稱</th>
                  <th className="py-3 px-4 text-sm font-medium text-gray-500 whitespace-nowrap">類型</th>
                  <th className="py-3 px-4 text-sm font-medium text-gray-500 whitespace-nowrap">必填</th>
                  <th className="py-3 px-4 text-sm font-medium text-gray-500 whitespace-nowrap">到期提醒</th>
                  <th className="py-3 px-4 text-sm font-medium text-gray-500 whitespace-nowrap">狀態</th>
                  <th className="py-3 px-4 text-sm font-medium text-gray-500 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field: any) => (
                  <tr key={field.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-500">{field.sort_order}</td>
                    <td className="py-3 px-4 font-medium">{field.field_name}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                        {FIELD_TYPES.find(t => t.value === field.field_type)?.label || field.field_type}
                      </span>
                    </td>
                    <td className="py-3 px-4">{field.is_required ? <span className="text-red-600 text-sm">必填</span> : <span className="text-gray-400 text-sm">-</span>}</td>
                    <td className="py-3 px-4">{field.has_expiry_alert ? <span className="text-orange-600 text-sm">啟用</span> : <span className="text-gray-400 text-sm">-</span>}</td>
                    <td className="py-3 px-4">{field.is_active ? <span className="badge-green">啟用</span> : <span className="badge-red">停用</span>}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(field)} className="text-sm text-primary-600 hover:underline">編輯</button>
                        <button onClick={() => handleDelete(field.id)} className="text-sm text-red-600 hover:underline">刪除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">{editingField ? '編輯自定義欄位' : '新增自定義欄位'}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模組</label>
                <select value={form.module} onChange={e => setForm({...form, module: e.target.value})} className="input-field" disabled={!!editingField}>
                  {MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">欄位名稱 *</label>
                <input value={form.field_name} onChange={e => setForm({...form, field_name: e.target.value})} className="input-field" placeholder="例如：保險到期日" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">欄位類型</label>
                <select value={form.field_type} onChange={e => setForm({...form, field_type: e.target.value, has_expiry_alert: e.target.value !== 'date' ? false : form.has_expiry_alert})} className="input-field">
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {form.field_type === 'select' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">選項（每行一個）</label>
                  <textarea value={form.options} onChange={e => setForm({...form, options: e.target.value})} className="input-field" rows={4} placeholder="選項一&#10;選項二&#10;選項三" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">排序順序</label>
                <input type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: e.target.value})} className="input-field" />
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_required} onChange={e => setForm({...form, is_required: e.target.checked})} className="rounded border-gray-300" />
                  <span className="text-sm">必填</span>
                </label>
                {form.field_type === 'date' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.has_expiry_alert} onChange={e => setForm({...form, has_expiry_alert: e.target.checked})} className="rounded border-gray-300" />
                    <span className="text-sm">到期提醒（在儀表板顯示）</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="rounded border-gray-300" />
                  <span className="text-sm">啟用</span>
                </label>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
              <button onClick={handleSave} className="btn-primary" disabled={!form.field_name.trim()}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomFieldsPage() {
  return (
    <RoleGuard roles={['admin']}>
      <CustomFieldsPageContent />
    </RoleGuard>
  );
}
