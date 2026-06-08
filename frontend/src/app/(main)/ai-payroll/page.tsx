'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { aiPayrollApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Batch = Record<string, any>;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-700' },
  uploading: { label: '上傳中', color: 'bg-blue-100 text-blue-800' },
  pending_extract: { label: '待識別', color: 'bg-yellow-100 text-yellow-800' },
  extracting: { label: '識別中', color: 'bg-blue-100 text-blue-800' },
  pending_review: { label: '待覆核', color: 'bg-amber-100 text-amber-800' },
  reviewing: { label: '覆核中', color: 'bg-indigo-100 text-indigo-800' },
  confirmed: { label: '已確認', color: 'bg-green-100 text-green-800' },
  exported: { label: '已匯出', color: 'bg-emerald-100 text-emerald-800' },
  failed: { label: '處理失敗', color: 'bg-red-100 text-red-800' },
};

function unwrapList(data: any) {
  const rows = Array.isArray(data) ? data : data?.data || data?.batches || data?.items || data?.results || [];
  const pagination = data?.pagination || { page: data?.page || 1, limit: data?.limit || 20, total: data?.total || rows.length, total_pages: data?.total_pages || data?.pages || 1 };
  return { rows, pagination };
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-HK', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getBatchId(batch: Batch) {
  return batch.id ?? batch.batch_id;
}

export default function AiPayrollPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('ai-payroll');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({ month: '', status: '', q: '' });
  const [form, setForm] = useState({ payroll_month: '', period: 'auto', form_type: 'auto', expected_pay_date: '', department: '', site_name: '', notes: '' });

  const fetchBatches = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await aiPayrollApi.listBatches({ page, limit: 20, month: filters.month || undefined, status: filters.status || undefined, q: filters.q || undefined });
      const payload = unwrapList(res.data);
      setBatches(payload.rows);
      setPagination(payload.pagination);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '載入 AI 計糧批次失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchBatches(1); }, [fetchBatches]);

  const createBatch = async () => {
    if (readOnly) return;
    if (!form.payroll_month) {
      alert('請選擇計糧月份');
      return;
    }
    setCreating(true);
    try {
      const res = await aiPayrollApi.createBatch({
        payroll_month: form.payroll_month,
        payroll_period: form.period,
        default_form_type: form.form_type,
        expected_pay_date: form.expected_pay_date || undefined,
        department: form.department || undefined,
        site_name: form.site_name || undefined,
        notes: form.notes || undefined,
      });
      const item = res.data?.data || res.data?.batch || res.data;
      const id = item?.id || item?.batch_id;
      setShowCreate(false);
      router.push(id ? `/ai-payroll/${id}` : '/ai-payroll');
    } catch (err: any) {
      const msg = err?.response?.data?.message || '建立批次失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">AI 計糧</h1>
          <p className="text-sm text-gray-500 mt-1">上傳功課紙、日報表或 PDF，經 AI 識別後進行人工覆核與計糧資料確認。</p>
        </div>
        <button onClick={() => setShowCreate(true)} disabled={readOnly} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50">新增批次</button>
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block"><span className="text-xs font-medium text-gray-500">計糧月份</span><input type="month" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-xs font-medium text-gray-500">狀態</span><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"><option value="">全部狀態</option>{Object.entries(STATUS_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}</select></label>
          <label className="block md:col-span-2"><span className="text-xs font-medium text-gray-500">搜尋</span><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="批次編號、員工、車牌、地盤或備註" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
        </div>
        <div className="flex justify-end"><button onClick={() => fetchBatches(1)} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-900">重新查詢</button></div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="p-12 text-center text-gray-400">載入中...</div> : batches.length === 0 ? <div className="p-12 text-center text-gray-400">尚未建立 AI 計糧批次</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">批次</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">計糧月份</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">薪酬期</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">類型</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">頁面</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">待確認</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">建立時間</th>
              </tr></thead>
              <tbody>
                {batches.map((batch, idx) => {
                  const id = getBatchId(batch);
                  const status = batch.status || batch.batch_status || 'draft';
                  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={String(id || idx)} onClick={() => id && router.push(`/ai-payroll/${id}`)} className="border-t hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3"><div className="font-mono text-xs text-gray-500">{batch.batch_code || id || '—'}</div><div className="font-medium text-gray-800">{batch.title || batch.batch_name || batch.site_name || 'AI 計糧批次'}</div></td>
                      <td className="px-4 py-3 whitespace-nowrap">{batch.payroll_month || batch.month || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{batch.payroll_period || batch.period || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{batch.default_form_type || batch.form_type || '自動判斷'}</td>
                      <td className="px-4 py-3 text-center font-mono">{batch.page_count ?? batch.total_pages ?? 0}</td>
                      <td className="px-4 py-3 text-center font-mono text-amber-700">{batch.pending_review_count ?? batch.unconfirmed_count ?? 0}</td>
                      <td className="px-4 py-3 text-center"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span></td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(batch.created_at || batch.batch_created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between text-sm text-gray-500">
          <span>共 {pagination.total || batches.length} 個批次</span>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchBatches(Math.max(1, pagination.page - 1))} disabled={pagination.page <= 1} className="px-3 py-1 border rounded bg-white disabled:opacity-40">上一頁</button>
            <span>{pagination.page} / {pagination.total_pages || 1}</span>
            <button onClick={() => fetchBatches(Math.min(pagination.total_pages || 1, pagination.page + 1))} disabled={pagination.page >= (pagination.total_pages || 1)} className="px-3 py-1 border rounded bg-white disabled:opacity-40">下一頁</button>
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-5 py-4 border-b"><h2 className="text-lg font-semibold text-gray-800">新增 AI 計糧批次</h2><p className="text-xs text-gray-500 mt-1">先建立批次，然後上傳照片或 PDF 文件。</p></div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block"><span className="text-xs font-medium text-gray-500">計糧月份</span><input type="month" value={form.payroll_month} onChange={(e) => setForm({ ...form, payroll_month: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
                <label className="block"><span className="text-xs font-medium text-gray-500">薪酬期</span><select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"><option value="auto">自動判斷</option><option value="first_half">上期</option><option value="second_half">下期</option><option value="full_month">全月</option></select></label>
                <label className="block"><span className="text-xs font-medium text-gray-500">表格類型</span><select value={form.form_type} onChange={(e) => setForm({ ...form, form_type: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"><option value="auto">自動判斷</option><option value="attendance_sheet">功課紙</option><option value="daily_report">日報表</option><option value="mixed">混合</option></select></label>
                <label className="block"><span className="text-xs font-medium text-gray-500">預計出糧日</span><input type="date" value={form.expected_pay_date} onChange={(e) => setForm({ ...form, expected_pay_date: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
                <label className="block"><span className="text-xs font-medium text-gray-500">部門</span><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
                <label className="block"><span className="text-xs font-medium text-gray-500">地盤</span><input value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
              </div>
              <label className="block"><span className="text-xs font-medium text-gray-500">備註</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></label>
            </div>
            <div className="px-5 py-4 bg-gray-50 border-t flex justify-end gap-2"><button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm bg-white hover:bg-gray-50">取消</button><button onClick={createBatch} disabled={creating} className="px-5 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50">{creating ? '建立中...' : '建立批次'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
