'use client';
import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { bqItemsApi } from '@/lib/api';

const fmt$ = (v: any) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type ParsedItem = {
  item_no: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  section: string;
};

type Step = 'upload' | 'parsing' | 'preview' | 'importing';

type BqFileImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contractId: number;
  onImported: () => void;
};

export default function BqFileImportModal({ isOpen, onClose, contractId, onImported }: BqFileImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setItems([]);
    setSelected(new Set());
    setWarnings([]);
    setFilename('');
    setError('');
    setDragOver(false);
  };

  const handleClose = () => {
    if (step === 'parsing' || step === 'importing') return;
    reset();
    onClose();
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.pdf', '.xlsx', '.xls'].includes(ext)) {
      setError('只支援 PDF (.pdf) 或 Excel (.xlsx, .xls) 文件');
      return;
    }
    setError('');
    setFilename(file.name);
    setStep('parsing');
    try {
      const res = await bqItemsApi.importParse(contractId, file);
      const parsed: ParsedItem[] = res.data?.items || [];
      if (parsed.length === 0) {
        setError('AI 未能從文件中識別任何 BQ 項目，請確認文件內容');
        setStep('upload');
        return;
      }
      setItems(parsed);
      setSelected(new Set(parsed.map((_, i) => i)));
      setWarnings(res.data?.warnings || []);
      setStep('preview');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || '解析失敗，請重試');
      setStep('upload');
    }
  };

  const updateItem = (index: number, field: keyof ParsedItem, value: string) => {
    setItems(prev => {
      const next = [...prev];
      const item = { ...next[index] };
      if (field === 'quantity' || field === 'rate' || field === 'amount') {
        (item as any)[field] = value === '' ? 0 : Number(value);
        if (field === 'quantity' || field === 'rate') {
          item.amount = parseFloat(((Number(item.quantity) || 0) * (Number(item.rate) || 0)).toFixed(2));
        }
      } else {
        (item as any)[field] = value;
      }
      next[index] = item;
      return next;
    });
  };

  const toggleOne = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((_, i) => i)));
  };

  const selectedTotal = useMemo(
    () => items.reduce((sum, item, i) => (selected.has(i) ? sum + (Number(item.amount) || 0) : sum), 0),
    [items, selected],
  );

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setStep('importing');
    setError('');
    try {
      const payload = items
        .filter((_, i) => selected.has(i))
        .map(item => ({
          item_no: String(item.item_no || '').trim(),
          description: String(item.description || ''),
          quantity: Number(item.quantity) || 0,
          unit: String(item.unit || ''),
          rate: Number(item.rate) || 0,
          amount: Number(item.amount) || 0,
          section: String(item.section || ''),
        }));
      const res = await bqItemsApi.importConfirm(contractId, payload);
      const created = res.data?.created ?? 0;
      const skipped = res.data?.skipped ?? 0;
      let msg = `成功匯入 ${created} 個 BQ 項目`;
      if (skipped > 0) msg += `，${skipped} 個項目因編號重複被略過`;
      alert(msg);
      reset();
      onClose();
      onImported();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || '匯入失敗，請重試');
      setStep('preview');
    }
  };

  const numCell = 'w-full px-1 py-0.5 text-sm border rounded text-right font-mono';
  const txtCell = 'w-full px-1 py-0.5 text-sm border rounded';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="從 BQ 文件匯入" size="xl">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400'}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
          >
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-700 font-medium">點擊或拖放文件到此處上傳</p>
            <p className="text-sm text-gray-400 mt-1">支援 PDF (.pdf) 及 Excel (.xlsx, .xls) 格式的 BQ / 報價單文件</p>
            <p className="text-xs text-gray-400 mt-1">上傳後系統會用 AI 自動解析項目編號、描述、數量、單價等欄位</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls"
              className="hidden"
              onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>
        )}

        {/* Step 2: Parsing */}
        {step === 'parsing' && (
          <div className="py-16 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-700 font-medium">AI 解析中...</p>
            <p className="text-sm text-gray-400 mt-1">{filename}</p>
            <p className="text-xs text-gray-400 mt-2">文件較大時可能需要 1-2 分鐘，請勿關閉視窗</p>
          </div>
        )}

        {/* Step 3: Preview & edit */}
        {(step === 'preview' || step === 'importing') && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{filename}</span>
                <span className="ml-2 text-gray-400">解析出 {items.length} 個項目</span>
              </div>
              <div className="flex gap-2">
                <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">{allSelected ? '取消全選' : '全選'}</button>
                <button onClick={() => { reset(); }} className="text-xs text-gray-600 hover:underline">重新上傳</button>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-lg px-3 py-2 max-h-24 overflow-y-auto">
                {warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            )}

            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b">
                    <th className="px-2 py-2 w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    </th>
                    <th className="px-2 py-2 text-left w-28">項目編號</th>
                    <th className="px-2 py-2 text-left min-w-[240px]">描述</th>
                    <th className="px-2 py-2 text-right w-24">數量</th>
                    <th className="px-2 py-2 text-center w-20">單位</th>
                    <th className="px-2 py-2 text-right w-28">單價</th>
                    <th className="px-2 py-2 text-right w-28">金額</th>
                    <th className="px-2 py-2 text-left w-36">分部</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className={`border-b ${selected.has(i) ? 'hover:bg-gray-50' : 'bg-gray-50/60 text-gray-400'}`}>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={selected.has(i)} onChange={() => toggleOne(i)} />
                      </td>
                      <td className="px-2 py-1">
                        <input value={item.item_no} onChange={e => updateItem(i, 'item_no', e.target.value)} className={`${txtCell} font-mono`} />
                      </td>
                      <td className="px-2 py-1">
                        <textarea
                          value={item.description}
                          onChange={e => updateItem(i, 'description', e.target.value)}
                          className={`${txtCell} resize-none leading-snug`}
                          rows={item.description.length > 60 ? 2 : 1}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" step="0.0001" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className={numCell} />
                      </td>
                      <td className="px-2 py-1">
                        <input value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)} className={`${txtCell} text-center`} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" step="0.01" value={item.rate} onChange={e => updateItem(i, 'rate', e.target.value)} className={numCell} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" step="0.01" value={item.amount} onChange={e => updateItem(i, 'amount', e.target.value)} className={numCell} />
                      </td>
                      <td className="px-2 py-1">
                        <input value={item.section} onChange={e => updateItem(i, 'section', e.target.value)} className={txtCell} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-sm text-gray-700">
                已選 <span className="font-bold">{selected.size}</span> 項，總金額 <span className="font-bold font-mono">{fmt$(selectedTotal)}</span>
              </p>
              <div className="flex gap-2">
                <button onClick={handleClose} disabled={step === 'importing'} className="btn-secondary disabled:opacity-50">取消</button>
                <button onClick={handleConfirm} disabled={selected.size === 0 || step === 'importing'} className="btn-primary disabled:opacity-50">
                  {step === 'importing' ? '匯入中...' : `確認匯入 ${selected.size} 項`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
