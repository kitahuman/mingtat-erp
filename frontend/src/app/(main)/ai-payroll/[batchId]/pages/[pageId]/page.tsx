'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { aiPayrollApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type PageItem = Record<string, any>;
type EntryItem = Record<string, any>;

const FIELD_LABELS: Record<string, string> = {
  employee_name: '員工 / 司機',
  phone: '電話',
  vehicle_no: '車牌',
  month: '月份',
  period: '薪酬期',
  date: '日期',
  company: '公司 / 寶號',
  contract: '合約',
  site_name: '地盤',
  location_from: '起點',
  location_to: '終點',
  start_time: '開工時間',
  end_time: '收工時間',
  overtime_hours: '加班時數',
  work_content: '工作內容',
  remarks: '備註',
  shift_type: '日 / 夜',
  chit_no: '入帳票號碼',
  ticket_no: '簽單號碼',
  quantity: '數量',
  unit: '單位',
  work_items: '工作項目',
  daily_records: '每日記錄',
};

function unwrap(data: any, key: string) {
  return data?.data || data?.[key] || data;
}

function unwrapList(data: any) {
  return Array.isArray(data) ? data : data?.data || data?.entries || data?.items || data?.results || [];
}

function pageImage(page: PageItem) {
  return page.image_base64 || page.page_image_base64 || page.original_image_base64 || page.image_url || page.page_image_url || page.original_image_url || '';
}

function entryData(entry: EntryItem) {
  const data = entry.confirmed_data || entry.extracted_data || entry.payload || entry.entry_payload || entry;
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return { value: data }; }
  }
  const omit = new Set(['id', 'entry_id', 'page_id', 'created_at', 'updated_at', 'status', 'entry_status', 'field_confidence', 'confidence_overall', 'overall_confidence', 'confirmed_data', 'extracted_data', 'payload', 'entry_payload']);
  if (data === entry) return Object.fromEntries(Object.entries(entry).filter(([key]) => !omit.has(key)));
  return data || {};
}

function confidenceOf(entry: EntryItem, key: string) {
  const conf = entry.field_confidence || entry.ocr_field_confidence || entry.confidence_by_field || {};
  const value = Number(conf[key] ?? conf[`$.${key}`] ?? entry[`${key}_confidence`] ?? 0);
  return value <= 1 && value > 0 ? Math.round(value * 100) : Math.round(value);
}

function confidenceColor(confidence: number) {
  if (confidence >= 90) return 'text-green-700 bg-green-50 border-green-200';
  if (confidence >= 60) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-red-700 bg-red-50 border-red-300';
}

function overallConfidence(entry: EntryItem) {
  const raw = Number(entry.confidence_overall ?? entry.overall_confidence ?? entry.ai_confidence ?? 0);
  return raw <= 1 && raw > 0 ? Math.round(raw * 100) : Math.round(raw);
}

function getEntryId(entry: EntryItem) {
  return entry.id ?? entry.entry_id;
}

export default function AiPayrollPageReview({ params }: { params: { batchId: string; pageId: string } }) {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const readOnly = isReadOnly('ai-payroll');
  const [page, setPage] = useState<PageItem | null>(null);
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [editedEntries, setEditedEntries] = useState<Record<string, any>>({});
  const [batchPages, setBatchPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pageRes, entriesRes, pagesRes] = await Promise.all([
        aiPayrollApi.getPage(params.pageId),
        aiPayrollApi.getPageEntries(params.pageId),
        aiPayrollApi.getPages(params.batchId),
      ]);
      const pageItem = unwrap(pageRes.data, 'page');
      const rowItems = unwrapList(entriesRes.data);
      setPage(pageItem);
      setEntries(rowItems);
      setBatchPages(unwrapList(pagesRes.data));
      const edited: Record<string, any> = {};
      rowItems.forEach((entry: EntryItem, idx: number) => {
        edited[String(getEntryId(entry) ?? idx)] = entryData(entry);
      });
      setEditedEntries(edited);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '載入頁面識別結果失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  }, [params.batchId, params.pageId]);

  useEffect(() => { loadData(); }, [loadData]);

  const currentIndex = useMemo(() => batchPages.findIndex((p) => String(p.id ?? p.page_id) === String(params.pageId)), [batchPages, params.pageId]);
  const prevPage = currentIndex > 0 ? batchPages[currentIndex - 1] : null;
  const nextPage = currentIndex >= 0 && currentIndex < batchPages.length - 1 ? batchPages[currentIndex + 1] : null;

  const updateField = (entryKey: string, field: string, value: any) => {
    setEditedEntries((prev) => ({ ...prev, [entryKey]: { ...(prev[entryKey] || {}), [field]: value } }));
  };

  const updateArrayField = (entryKey: string, arrayKey: string, index: number, field: string, value: any) => {
    setEditedEntries((prev) => {
      const current = prev[entryKey] || {};
      const arr = [...(current[arrayKey] || [])];
      arr[index] = { ...arr[index], [field]: value };
      return { ...prev, [entryKey]: { ...current, [arrayKey]: arr } };
    });
  };

  const confirmEntry = async (entry: EntryItem, idx: number) => {
    if (readOnly) return;
    const id = getEntryId(entry);
    if (!id) return;
    const key = String(id ?? idx);
    const original = entryData(entry);
    const edited = editedEntries[key] || {};
    const corrections: Record<string, any> = {};
    Object.keys(edited).forEach((field) => {
      if (JSON.stringify(edited[field]) !== JSON.stringify(original[field])) corrections[field] = edited[field];
    });
    await aiPayrollApi.confirmEntry(id, { confirmed_data: edited, corrections, mark_confirmed: true });
  };

  const confirmAll = async () => {
    if (readOnly) return;
    if (!confirm('確定要確認本頁所有已編輯資料嗎？')) return;
    setSaving(true);
    try {
      for (let i = 0; i < entries.length; i += 1) {
        await confirmEntry(entries[i], i);
      }
      await aiPayrollApi.confirmPage(params.pageId, { confirmed: true });
      await loadData();
      const nextId = nextPage ? (nextPage.id ?? nextPage.page_id) : null;
      if (nextId) router.push(`/ai-payroll/${params.batchId}/pages/${nextId}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '確認失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  const extractThisPage = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await aiPayrollApi.extractPage(params.pageId);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || '重新識別失敗';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-gray-400">載入中...</div>;
  const imgSrc = page ? pageImage(page) : '';

  return (
    <div className="space-y-4 max-w-none">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white rounded-xl border px-5 py-4">
        <div className="flex items-center gap-4">
          <Link href={`/ai-payroll/${params.batchId}`} className="text-gray-400 hover:text-gray-600">&larr; 返回批次</Link>
          <div className="h-6 border-l border-gray-200 hidden md:block" />
          <div>
            <h1 className="text-lg font-semibold text-gray-800">第 {page?.page_number || currentIndex + 1 || '—'} 頁識別確認</h1>
            <p className="text-xs text-gray-500 mt-0.5">{page?.file_name || page?.document_name || '文件頁面'} · 低信心或影響計糧欄位請先修正再確認。</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={extractThisPage} disabled={saving || readOnly} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">重新識別</button>
          <button onClick={() => setRotation((r) => r - 90)} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">左旋</button>
          <button onClick={() => setRotation((r) => r + 90)} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">右旋</button>
          <button onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(1))))} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">縮小</button>
          <button onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(1))))} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">放大</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
        <div className="bg-white rounded-xl border overflow-hidden min-h-[calc(100vh-210px)]">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between"><h2 className="text-sm font-medium text-gray-700">原始文件圖片</h2><span className="text-xs text-gray-400">縮放 {Math.round(zoom * 100)}%</span></div>
          <div className="p-4 overflow-auto flex items-start justify-center" style={{ height: 'calc(100vh - 260px)' }}>
            {imgSrc ? (
              <img
                src={imgSrc}
                alt="AI 計糧文件"
                className="rounded-lg border shadow-sm origin-top"
                style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, maxWidth: '100%', objectFit: 'contain' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : <div className="p-12 text-center text-gray-400">無圖片可顯示</div>}
          </div>
        </div>

        <div className="bg-white rounded-xl border overflow-hidden min-h-[calc(100vh-210px)] flex flex-col">
          <div className="px-4 py-3 bg-gray-50 border-b"><h2 className="text-sm font-medium text-gray-700">AI 抽取結果</h2><p className="text-xs text-gray-400 mt-0.5">信心度：90 或以上綠色，60–89 黃色，低於 60 紅色；修正後確認會自動標記為已確認。</p></div>
          <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 330px)' }}>
            {entries.length === 0 ? <div className="py-12 text-center text-gray-400">尚未有識別結果，請先執行 AI 識別。</div> : entries.map((entry, idx) => {
              const id = getEntryId(entry) ?? idx;
              const key = String(id);
              const data = editedEntries[key] || {};
              const status = entry.status || entry.entry_status;
              const isConfirmed = status === 'confirmed' || entry.is_confirmed || entry.user_confirmed;
              return (
                <div key={key} className="border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <div><div className="font-medium text-gray-800">記錄 #{idx + 1}</div><div className="text-xs text-gray-400">{entry.employee_name || data.employee_name || entry.form_type || 'AI 抽取記錄'}</div></div>
                    <div className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded border text-xs font-mono ${confidenceColor(overallConfidence(entry))}`}>{overallConfidence(entry) || 0}%</span>{isConfirmed && <span className="text-xs text-green-700 font-medium">已確認</span>}</div>
                  </div>
                  <div className="p-4 space-y-3">
                    {Object.entries(data).map(([field, value]) => {
                      const isObjectArray = Array.isArray(value) && value.length > 0 && typeof value[0] === 'object';
                      if (isObjectArray) {
                        return <ArrayFieldEditor key={field} entryKey={key} arrayKey={field} items={value as any[]} entry={entry} disabled={readOnly || isConfirmed} onChange={updateArrayField} />;
                      }
                      const confidence = confidenceOf(entry, field);
                      return (
                        <div key={field} className={`border rounded-lg p-3 ${confidenceColor(confidence)}`}>
                          <div className="flex items-center justify-between mb-1"><label className="text-xs font-medium text-gray-600">{FIELD_LABELS[field] || field}</label><span className="text-xs font-mono">{confidence || 0}%</span></div>
                          <input value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(e) => updateField(key, field, Array.isArray(value) ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : e.target.value)} disabled={readOnly || isConfirmed} className="w-full text-sm border rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              {prevPage ? <Link href={`/ai-payroll/${params.batchId}/pages/${prevPage.id ?? prevPage.page_id}`} className="px-3 py-1.5 border rounded bg-white text-sm hover:bg-gray-50">上一頁</Link> : <button disabled className="px-3 py-1.5 border rounded bg-white text-sm opacity-40">上一頁</button>}
              {nextPage ? <Link href={`/ai-payroll/${params.batchId}/pages/${nextPage.id ?? nextPage.page_id}`} className="px-3 py-1.5 border rounded bg-white text-sm hover:bg-gray-50">下一頁</Link> : <button disabled className="px-3 py-1.5 border rounded bg-white text-sm opacity-40">下一頁</button>}
            </div>
            <button onClick={confirmAll} disabled={saving || readOnly || entries.length === 0} className="px-6 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50">{saving ? '確認中...' : '整頁確認'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArrayFieldEditor({ entryKey, arrayKey, items, entry, disabled, onChange }: { entryKey: string; arrayKey: string; items: any[]; entry: EntryItem; disabled: boolean; onChange: (entryKey: string, arrayKey: string, index: number, field: string, value: any) => void }) {
  const confidence = confidenceOf(entry, arrayKey);
  return (
    <div className={`border rounded-lg overflow-hidden ${confidenceColor(confidence)}`}>
      <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between"><span className="text-xs font-medium text-gray-700">{FIELD_LABELS[arrayKey] || arrayKey}（{items.length} 筆）</span><span className="text-xs font-mono">{confidence || 0}%</span></div>
      <div className="divide-y bg-white">
        {items.map((item, idx) => (
          <div key={idx} className="p-3">
            <div className="text-xs text-gray-400 mb-2 font-medium">#{idx + 1}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(item || {}).map(([field, value]) => (
                <label key={field} className="block"><span className="text-[10px] text-gray-500">{FIELD_LABELS[field] || field}</span><input value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(e) => onChange(entryKey, arrayKey, idx, field, Array.isArray(value) ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : e.target.value)} disabled={disabled} className="mt-0.5 w-full text-xs border rounded px-1.5 py-1 disabled:bg-gray-50 disabled:text-gray-500" /></label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
