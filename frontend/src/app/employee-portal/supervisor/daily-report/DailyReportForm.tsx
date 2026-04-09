'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';

interface DailyReportItem {
  category: string;
  content: string;
  quantity: string;
  ot_hours: string;
  name_or_plate: string;
}

const categoryLabels: Record<string, string> = {
  worker: '工人',
  vehicle: '車輛',
  machinery: '機械',
  tool: '工具',
};

const defaultItem: DailyReportItem = {
  category: 'worker',
  content: '',
  quantity: '',
  ot_hours: '',
  name_or_plate: '',
};

interface Props {
  reportId?: number;
}

export default function DailyReportForm({ reportId }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const isEdit = !!reportId;

  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState({
    project_id: '',
    report_date: new Date().toISOString().split('T')[0],
    shift_type: 'day',
    work_summary: '',
    memo: '',
  });
  const [items, setItems] = useState<DailyReportItem[]>([{ ...defaultItem }]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    portalSharedApi.getProjectsSimple().then(res => setProjects(res.data || [])).catch(() => {});

    if (isEdit) {
      employeePortalApi.getDailyReport(reportId).then(res => {
        const r = res.data;
        setForm({
          project_id: String(r.daily_report_project_id),
          report_date: r.daily_report_date?.split('T')[0] || '',
          shift_type: r.daily_report_shift_type,
          work_summary: r.daily_report_work_summary,
          memo: r.daily_report_memo || '',
        });
        if (r.items?.length) {
          setItems(r.items.map((item: any) => ({
            category: item.daily_report_item_category,
            content: item.daily_report_item_content,
            quantity: item.daily_report_item_quantity?.toString() || '',
            ot_hours: item.daily_report_item_ot_hours?.toString() || '',
            name_or_plate: item.daily_report_item_name_or_plate || '',
          })));
        }
        setIsSubmitted(r.daily_report_status === 'submitted');
        setLoading(false);
      }).catch(() => {
        router.push('/employee-portal/supervisor/daily-report');
      });
    }
  }, [reportId]);

  const updateItem = (idx: number, field: keyof DailyReportItem, value: string) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { ...defaultItem }]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (status: 'draft' | 'submitted') => {
    if (!form.project_id || !form.report_date || !form.work_summary.trim()) {
      alert('請填寫必填欄位（工程、日期、工作摘要）');
      return;
    }
    if (status === 'submitted') {
      if (!confirm('提交後不可修改，確定要提交嗎？')) return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        status,
        items: items.filter(i => i.content.trim()),
      };
      if (isEdit) {
        await employeePortalApi.updateDailyReport(reportId, payload);
      } else {
        await employeePortalApi.createDailyReport(payload);
      }
      router.push('/employee-portal/supervisor/daily-report');
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此日報嗎？')) return;
    try {
      await employeePortalApi.deleteDailyReport(reportId!);
      router.push('/employee-portal/supervisor/daily-report');
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  if (loading) {
    return <div className="p-4 text-center py-10 text-gray-400">{t('loading')}</div>;
  }

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto pb-32">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/employee-portal/supervisor/daily-report" className="text-blue-600 flex items-center gap-1">
          <span>‹</span> {t('back')}
        </Link>
        <h1 className="text-xl font-bold text-gray-800 ml-2">
          {isEdit ? (isSubmitted ? '查看日報' : '編輯日報') : '新增日報'}
        </h1>
      </div>

      {isSubmitted && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-green-700 text-sm font-medium">
          此日報已提交，不可修改。
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-700 text-sm">表頭資料</h2>

        {/* Project */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">工程 *</label>
          <select
            value={form.project_id}
            onChange={e => setForm({ ...form, project_id: e.target.value })}
            disabled={isSubmitted}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60"
          >
            <option value="">請選擇工程</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">日期 *</label>
          <input
            type="date"
            value={form.report_date}
            onChange={e => setForm({ ...form, report_date: e.target.value })}
            disabled={isSubmitted}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 disabled:opacity-60"
          />
        </div>

        {/* Shift Type */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">更次 *</label>
          <div className="flex gap-2">
            {['day', 'night'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => !isSubmitted && setForm({ ...form, shift_type: s })}
                disabled={isSubmitted}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  form.shift_type === s
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-500'
                } disabled:opacity-60`}
              >
                {s === 'day' ? '☀️ 日更' : '🌙 夜更'}
              </button>
            ))}
          </div>
        </div>

        {/* Work Summary */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">工作摘要 *</label>
          <textarea
            value={form.work_summary}
            onChange={e => setForm({ ...form, work_summary: e.target.value })}
            disabled={isSubmitted}
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none disabled:opacity-60"
            placeholder="請描述今日工作內容..."
          />
        </div>
      </div>

      {/* Labour & Plant Items */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-700 text-sm">Labour and Plant</h2>
          {!isSubmitted && (
            <button
              type="button"
              onClick={addItem}
              className="text-blue-600 text-sm font-bold"
            >
              + 新增行
            </button>
          )}
        </div>

        {items.map((item, idx) => (
          <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2 relative">
            {!isSubmitted && items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="absolute top-2 right-2 text-red-400 hover:text-red-600 text-lg"
              >
                ×
              </button>
            )}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-0.5 block">類別</label>
                <select
                  value={item.category}
                  onChange={e => updateItem(idx, 'category', e.target.value)}
                  disabled={isSubmitted}
                  className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60"
                >
                  {Object.entries(categoryLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-0.5 block">數量</label>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={e => updateItem(idx, 'quantity', e.target.value)}
                  disabled={isSubmitted}
                  className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60"
                  placeholder="0"
                  step="0.5"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-0.5 block">內容描述</label>
              <input
                type="text"
                value={item.content}
                onChange={e => updateItem(idx, 'content', e.target.value)}
                disabled={isSubmitted}
                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60"
                placeholder="例：紮鐵工人、挖掘機..."
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-0.5 block">OT 小時</label>
                <input
                  type="number"
                  value={item.ot_hours}
                  onChange={e => updateItem(idx, 'ot_hours', e.target.value)}
                  disabled={isSubmitted}
                  className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60"
                  placeholder="0"
                  step="0.5"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-0.5 block">名稱/車牌</label>
                <input
                  type="text"
                  value={item.name_or_plate}
                  onChange={e => updateItem(idx, 'name_or_plate', e.target.value)}
                  disabled={isSubmitted}
                  className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white disabled:opacity-60"
                  placeholder="選填"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Memo */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
        <h2 className="font-bold text-gray-700 text-sm">備忘錄</h2>
        <textarea
          value={form.memo}
          onChange={e => setForm({ ...form, memo: e.target.value })}
          disabled={isSubmitted}
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none disabled:opacity-60"
          placeholder="其他備註事項..."
        />
      </div>

      {/* Actions */}
      {!isSubmitted && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 shadow-lg z-10">
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSubmit('draft')}
                disabled={submitting}
                className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-2xl font-bold text-sm active:scale-95 disabled:opacity-50"
              >
                {submitting ? '儲存中...' : '儲存草稿'}
              </button>
              <button
                type="button"
                onClick={() => handleSubmit('submitted')}
                disabled={submitting}
                className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-md active:scale-95 disabled:opacity-50"
              >
                {submitting ? '提交中...' : '正式提交'}
              </button>
            </div>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                className="w-full py-2 text-red-500 text-sm font-medium"
              >
                刪除此日報
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
