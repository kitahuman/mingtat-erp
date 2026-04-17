'use client';

import { useState, useEffect } from 'react';
import { statutoryHolidaysApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';

const HK_STATUTORY_HOLIDAYS = [
  { name: '元旦', month: 1, day: 1 },
  { name: '農曆年初一', month: 0, day: 0 },
  { name: '農曆年初二', month: 0, day: 0 },
  { name: '農曆年初三', month: 0, day: 0 },
  { name: '清明節', month: 0, day: 0 },
  { name: '勞動節', month: 5, day: 1 },
  { name: '佛誕', month: 0, day: 0 },
  { name: '端午節', month: 0, day: 0 },
  { name: '香港特別行政區成立紀念日', month: 7, day: 1 },
  { name: '中秋節翌日', month: 0, day: 0 },
  { name: '重陽節', month: 0, day: 0 },
  { name: '國慶日', month: 10, day: 1 },
  { name: '冬至', month: 0, day: 0 },
  { name: '聖誕節', month: 12, day: 25 },
];

function fmtDate(d: string) {
  if (!d) return '-';
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function StatutoryHolidaysPage() {
  const { isReadOnly } = useAuth();
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ date: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ date: '', name: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await statutoryHolidaysApi.list({ year });
      setHolidays(res.data?.data || []);
    } catch {
      setHolidays([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [year]);

  const handleCreate = async () => {
    if (!form.date || !form.name) return alert('日期和名稱為必填');
    setSaving(true);
    try {
      await statutoryHolidaysApi.create(form);
      setShowCreate(false);
      setForm({ date: '', name: '' });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '新增失敗');
    }
    setSaving(false);
  };

  const handleUpdate = async (id: number) => {
    if (!editForm.date || !editForm.name) return alert('日期和名稱為必填');
    try {
      await statutoryHolidaysApi.update(id, editForm);
      setEditingId(null);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '更新失敗');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`確定要刪除「${name}」？`)) return;
    try {
      await statutoryHolidaysApi.delete(id);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">法定假期管理</h1>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input-field w-32"
          >
            {[year - 1, year, year + 1, year + 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            + 新增假期
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-center py-8 text-gray-400">載入中...</div>
        ) : holidays.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {year} 年尚未設定法定假期
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-gray-500">
                <th className="pb-2 font-medium">日期</th>
                <th className="pb-2 font-medium">假期名稱</th>
                <th className="pb-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map(h => (
                <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50">
                  {editingId === h.id ? (
                    <>
                      <td className="py-2 pr-2">
                        <input
                          type="date"
                          value={editForm.date}
                          onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                          className="input-field text-sm"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="input-field text-sm"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button onClick={() => handleUpdate(h.id)} className="text-sm text-primary-600 hover:underline mr-2">儲存</button>
                        <button onClick={() => setEditingId(null)} className="text-sm text-gray-400 hover:underline">取消</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 font-mono text-sm">{fmtDate(h.date)}</td>
                      <td className="py-2">{h.name}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => { setEditingId(h.id); setEditForm({ date: fmtDate(h.date), name: h.name }); }}
                          className="text-sm text-primary-600 hover:underline mr-2"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleDelete(h.id, h.name)}
                          className="text-sm text-red-500 hover:underline"
                        >
                          刪除
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-400">
        提示：法定假期用於日薪制員工糧單自動生成假期日薪。生成糧單時，系統會自動在計糧期間內的法定假期日加上日薪津貼。
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增法定假期">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">假期名稱 *</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder="例：元旦、農曆年初一"
              required
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {HK_STATUTORY_HOLIDAYS.map(h => (
                <button
                  key={h.name}
                  type="button"
                  onClick={() => setForm({ ...form, name: h.name })}
                  className="text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-primary-100 text-gray-600 hover:text-primary-600"
                >
                  {h.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">取消</button>
            <button onClick={handleCreate} disabled={saving || !form.date || !form.name} className="btn-primary">
              {saving ? '儲存中...' : '確認新增'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
