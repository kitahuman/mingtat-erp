'use client';

import { useState, useRef } from 'react';
import { bankReconciliationApi } from '@/lib/api';
import Modal from '@/components/Modal';

type ImportMode = 'csv' | 'pdf';
type Step = 'upload' | 'preview' | 'importing' | 'done';

interface ParsedRow {
  date: string;
  description: string;
  reference_no?: string | null;
  amount: number;
  balance?: number | null;
  withdrawals?: number;
  deposits?: number;
  _selected: boolean;
}

export default function ImportModal({ isOpen, onClose, bankAccountId, onSuccess, companies, bankAccounts }: any) {
  const [mode, setMode] = useState<ImportMode>('csv');
  const [step, setStep] = useState<Step>('upload');
  const [csvText, setCsvText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [bankName, setBankName] = useState('');
  const [statementPeriod, setStatementPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // AI-identified company/account
  const [identifiedCompanyName, setIdentifiedCompanyName] = useState<string>('');
  const [identifiedCompanyId, setIdentifiedCompanyId] = useState<number | null>(null);
  const [identifiedBankAccountId, setIdentifiedBankAccountId] = useState<number | null>(null);
  const [identifiedBankAccountLabel, setIdentifiedBankAccountLabel] = useState<string>('');

  const reset = () => {
    setStep('upload');
    setCsvText('');
    setPdfFile(null);
    setParsedRows([]);
    setBankName('');
    setStatementPeriod('');
    setError('');
    setImportResult(null);
    setIdentifiedCompanyName('');
    setIdentifiedCompanyId(null);
    setIdentifiedBankAccountId(null);
    setIdentifiedBankAccountLabel('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ── Helpers ──────────────────────────────────────────────────
  function splitCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === ',' && !inQuotes) { result.push(current); current = ''; }
      else { current += line[i]; }
    }
    result.push(current);
    return result.map(s => s.trim().replace(/^"|"$/g, ''));
  }

  function parseDate(raw: string): string {
    if (!raw) return '';
    const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const ymd = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    const dmonY = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (dmonY) {
      const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      };
      const m = months[dmonY[2].toLowerCase()];
      if (m) return `${dmonY[3]}-${m}-${dmonY[1].padStart(2, '0')}`;
    }
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    return '';
  }

  function parseAmount(raw: string): number {
    if (!raw) return 0;
    const cleaned = raw.replace(/[^0-9.\-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function fmtMoney(val: number | undefined | null): string {
    if (val == null) return '—';
    return Number(val).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── CSV Parsing ──────────────────────────────────────────────
  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV 格式不正確，至少需要標題行和一行資料');

    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
    const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('日期'));
    const descIdx = headers.findIndex(h =>
      h.includes('desc') || h.includes('transaction') || h.includes('narration') ||
      h.includes('details') || h.includes('particulars') || h.includes('description')
    );
    const refIdx = headers.findIndex(h => h.includes('ref') || h.includes('cheque') || h.includes('chq'));
    const withdrawalIdx = headers.findIndex(h => h.includes('withdrawal') || h.includes('debit') || h === 'dr');
    const depositIdx = headers.findIndex(h => h.includes('deposit') || h.includes('credit') || h === 'cr');
    const amountIdx = headers.findIndex(h => h === 'amount' || h.includes('金額'));
    const balanceIdx = headers.findIndex(h => h.includes('balance') || h.includes('結餘'));

    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i]);
      if (cols.length < 2) continue;

      const rawDate = cols[dateIdx >= 0 ? dateIdx : 0] || '';
      const date = parseDate(rawDate);
      if (!date) continue;

      const description = cols[descIdx >= 0 ? descIdx : 1] || '';
      const reference_no = refIdx >= 0 ? (cols[refIdx] || null) : null;

      let amount = 0;
      let withdrawals: number | undefined;
      let deposits: number | undefined;

      if (withdrawalIdx >= 0 || depositIdx >= 0) {
        const wd = withdrawalIdx >= 0 ? parseAmount(cols[withdrawalIdx] || '') : 0;
        const dp = depositIdx >= 0 ? parseAmount(cols[depositIdx] || '') : 0;
        if (wd > 0) withdrawals = wd;
        if (dp > 0) deposits = dp;
        amount = dp > 0 ? dp : -wd;
      } else if (amountIdx >= 0) {
        amount = parseAmount(cols[amountIdx] || '');
      }

      if (amount === 0 && !withdrawals && !deposits) continue;

      const balance = balanceIdx >= 0 ? parseAmount(cols[balanceIdx] || '') : null;

      rows.push({ date, description, reference_no, amount, balance, withdrawals, deposits, _selected: true });
    }
    return rows;
  };

  // ── PDF Parsing (AI) ─────────────────────────────────────────
  const parsePDF = async () => {
    if (!pdfFile) return;
    setLoading(true);
    setError('');
    try {
      const res = await bankReconciliationApi.parsePdf(pdfFile, companies, bankAccounts);
      const data = res.data;
      if (!data.transactions || data.transactions.length === 0) {
        setError('AI 未能從 PDF 中提取任何交易記錄，請確認 PDF 格式正確');
        return;
      }
      setBankName(data.bank_name || '');
      setStatementPeriod(data.statement_period || '');

      // Set AI-identified company and account
      if (data.identified_company_name) setIdentifiedCompanyName(data.identified_company_name);
      if (data.identified_company_id) setIdentifiedCompanyId(data.identified_company_id);
      if (data.identified_bank_account_id) setIdentifiedBankAccountId(data.identified_bank_account_id);
      if (data.identified_bank_account_label) setIdentifiedBankAccountLabel(data.identified_bank_account_label);

      const rows: ParsedRow[] = data.transactions.map((t: any) => ({
        date: t.date,
        description: t.description || '',
        reference_no: t.reference_no || null,
        amount: t.amount,
        balance: t.balance ?? null,
        withdrawals: t.withdrawals,
        deposits: t.deposits,
        _selected: true,
      }));
      setParsedRows(rows);
      setStep('preview');
    } catch (err: any) {
      setError(err.response?.data?.message || 'AI 解析失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  // ── Import ───────────────────────────────────────────────────
  const handleImport = async () => {
    const selected = parsedRows.filter(r => r._selected);
    if (selected.length === 0) { setError('請至少選擇一筆交易記錄'); return; }
    setStep('importing');
    setLoading(true);
    setError('');
    try {
      const rows = selected.map(r => ({
        date: r.date,
        description: r.description,
        reference_no: r.reference_no || null,
        amount: r.amount,
        balance: r.balance ?? null,
      }));
      const source = mode === 'pdf' ? 'pdf' : 'csv';
      const res = await bankReconciliationApi.importTransactions(bankAccountId, rows, source);
      setImportResult(res.data);
      setStep('done');
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || '匯入失敗，請稍後再試');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (idx: number) => {
    setParsedRows(prev => prev.map((r, i) => i === idx ? { ...r, _selected: !r._selected } : r));
  };

  const toggleAll = () => {
    const allSelected = parsedRows.every(r => r._selected);
    setParsedRows(prev => prev.map(r => ({ ...r, _selected: !allSelected })));
  };

  const selectedCount = parsedRows.filter(r => r._selected).length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="匯入銀行月結單" size="xl">
      <div className="space-y-4">

        {/* ── Done ── */}
        {step === 'done' && importResult && (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">匯入完成</h3>
            <p className="text-gray-600">
              成功匯入 <strong>{importResult.imported}</strong> 筆，跳過重複 <strong>{importResult.skipped}</strong> 筆
            </p>
            <button onClick={handleClose} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              關閉
            </button>
          </div>
        )}

        {/* ── Importing ── */}
        {step === 'importing' && (
          <div className="text-center py-12">
            <svg className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-600">正在匯入並自動配對...</p>
          </div>
        )}

        {/* ── Upload ── */}
        {step === 'upload' && (
          <>
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => { setMode('csv'); setError(''); }}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${mode === 'csv' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                CSV 檔案
              </button>
              <button
                onClick={() => { setMode('pdf'); setError(''); }}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors flex items-center gap-1.5 ${mode === 'pdf' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                PDF 月結單
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">AI</span>
              </button>
            </div>

            {/* ── CSV Upload ── */}
            {mode === 'csv' && (
              <div className="space-y-3">
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                  <strong>CSV 格式：</strong>第一行為標題，欄位包含 Date, Description, Withdrawals, Deposits, Balance 等
                </div>
                <div
                  className="border border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors"
                  onClick={() => csvFileInputRef.current?.click()}
                >
                  <p className="text-sm text-gray-600">點擊上傳 CSV 檔案，或直接在下方貼上內容</p>
                </div>
                <input ref={csvFileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = ev => setCsvText(ev.target?.result as string || '');
                  reader.readAsText(f);
                }} />
                <textarea
                  className="w-full h-40 border border-gray-300 rounded-lg p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={"Date,Description,Ref No,Withdrawals,Deposits,Balance\n01/03/2026,Payment to supplier,CHQ001,5000.00,,100000.00\n05/03/2026,Customer receipt,,,20000.00,120000.00"}
                  value={csvText}
                  onChange={e => setCsvText(e.target.value)}
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">取消</button>
                  <button
                    onClick={() => {
                      setError('');
                      try {
                        const rows = parseCSV(csvText);
                        if (rows.length === 0) { setError('無法解析任何交易記錄，請檢查 CSV 格式'); return; }
                        setParsedRows(rows);
                        setStep('preview');
                      } catch (err: any) {
                        setError(err.message || '解析失敗');
                      }
                    }}
                    disabled={!csvText.trim()}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    解析預覽
                  </button>
                </div>
              </div>
            )}

            {/* ── PDF Upload ── */}
            {mode === 'pdf' && (
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <strong>支援銀行：</strong>HSBC、上海商業銀行、中國銀行（BOC）、OCBC。AI 將自動辨識公司和銀行帳戶。
                </div>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f?.type === 'application/pdf') setPdfFile(f);
                  }}
                >
                  {pdfFile ? (
                    <div>
                      <div className="text-4xl mb-2">📄</div>
                      <p className="font-medium text-gray-800">{pdfFile.name}</p>
                      <p className="text-sm text-gray-500 mt-1">{(pdfFile.size / 1024).toFixed(1)} KB</p>
                      <button
                        className="mt-2 text-xs text-red-500 hover:underline"
                        onClick={e => { e.stopPropagation(); setPdfFile(null); }}
                      >移除</button>
                    </div>
                  ) : (
                    <div>
                      <div className="text-4xl mb-2">📤</div>
                      <p className="font-medium text-gray-700">點擊或拖放 PDF 月結單</p>
                      <p className="text-sm text-gray-400 mt-1">僅支援 PDF 格式</p>
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) setPdfFile(f);
                }} />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">取消</button>
                  <button
                    onClick={parsePDF}
                    disabled={!pdfFile || loading}
                    className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        AI 辨識中...
                      </>
                    ) : '🤖 AI 辨識'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Preview ── */}
        {step === 'preview' && (
          <>
            {/* Bank info banner (PDF only) */}
            {(bankName || statementPeriod) && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-center gap-4 text-sm">
                {bankName && <span><strong>銀行：</strong>{bankName}</span>}
                {statementPeriod && <span><strong>對帳期間：</strong>{statementPeriod}</span>}
                <span className="ml-auto text-blue-600 text-xs">AI 辨識結果，請核對後確認匯入</span>
              </div>
            )}

            {/* AI-identified company and account info */}
            {(identifiedCompanyName || identifiedBankAccountLabel) && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm space-y-1">
                <div className="flex items-center gap-1 text-green-800 font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  AI 自動辨識結果
                </div>
                {identifiedCompanyName && (
                  <div className="text-green-700">
                    <strong>公司：</strong>{identifiedCompanyName}
                    {identifiedCompanyId && <span className="text-xs text-green-500 ml-1">(已匹配 ID: {identifiedCompanyId})</span>}
                  </div>
                )}
                {identifiedBankAccountLabel && (
                  <div className="text-green-700">
                    <strong>銀行帳戶：</strong>{identifiedBankAccountLabel}
                    {identifiedBankAccountId && <span className="text-xs text-green-500 ml-1">(已匹配 ID: {identifiedBankAccountId})</span>}
                  </div>
                )}
                <p className="text-xs text-green-600">以上為 AI 辨識結果，匯入時仍使用您選擇的帳戶。如需更改，請關閉此視窗後切換帳戶再匯入。</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                共解析 <strong>{parsedRows.length}</strong> 筆，已選 <strong>{selectedCount}</strong> 筆
              </p>
              <button onClick={toggleAll} className="text-sm text-blue-600 hover:underline">
                {parsedRows.every(r => r._selected) ? '取消全選' : '全選'}
              </button>
            </div>

            <div className="overflow-x-auto border rounded-lg max-h-80">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 w-8">
                      <input type="checkbox" checked={parsedRows.every(r => r._selected)} onChange={toggleAll} />
                    </th>
                    <th className="px-2 py-2 text-left text-gray-600 font-medium whitespace-nowrap">日期</th>
                    <th className="px-2 py-2 text-left text-gray-600 font-medium">交易描述</th>
                    <th className="px-2 py-2 text-left text-gray-600 font-medium whitespace-nowrap">參考號</th>
                    <th className="px-2 py-2 text-right text-gray-600 font-medium whitespace-nowrap">提取</th>
                    <th className="px-2 py-2 text-right text-gray-600 font-medium whitespace-nowrap">存入</th>
                    <th className="px-2 py-2 text-right text-gray-600 font-medium whitespace-nowrap">結餘</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-t cursor-pointer transition-colors ${row._selected ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 opacity-40'}`}
                      onClick={() => toggleRow(idx)}
                    >
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={row._selected} onChange={() => toggleRow(idx)} onClick={e => e.stopPropagation()} />
                      </td>
                      <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{row.date}</td>
                      <td className="px-2 py-1.5 text-gray-700 max-w-[200px] truncate" title={row.description}>{row.description}</td>
                      <td className="px-2 py-1.5 text-gray-500">{row.reference_no || '—'}</td>
                      <td className="px-2 py-1.5 text-right text-red-600">
                        {row.withdrawals !== undefined ? fmtMoney(row.withdrawals) : (row.amount < 0 ? fmtMoney(Math.abs(row.amount)) : '—')}
                      </td>
                      <td className="px-2 py-1.5 text-right text-green-600">
                        {row.deposits !== undefined ? fmtMoney(row.deposits) : (row.amount >= 0 ? fmtMoney(row.amount) : '—')}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-600">{fmtMoney(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between gap-2 pt-2 border-t">
              <button
                onClick={() => { setStep('upload'); setParsedRows([]); setError(''); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                重新上傳
              </button>
              <button
                onClick={handleImport}
                disabled={selectedCount === 0}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                確認匯入 {selectedCount} 筆
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
