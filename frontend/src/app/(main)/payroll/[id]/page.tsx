'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { payrollApi } from '@/lib/api';
import Link from 'next/link';
import Modal from '@/components/Modal';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
};

// ─── Grouped Settlement View ──────────────────────────────────
function GroupedSettlementView({ groups }: { groups: any[] }) {
  if (!groups || groups.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">沒有歸組結算數據</p>;
  }
  const totalAmount = groups.reduce((sum: number, g: any) => sum + (Number(g.total_amount) || 0), 0);
  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600">客戶</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">合約</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">日/夜</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">路線</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">單價</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">數量</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">小計</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g: any, idx: number) => {
            const route = [g.start_location, g.end_location].filter(Boolean).join(' → ');
            const hasPrice = g.price_match_status === 'matched' && g.matched_rate;
            return (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 font-medium">{g.client_name || '-'}</td>
                <td className="px-3 py-2 text-gray-600">{g.contract_no || '-'}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    g.day_night === '夜' ? 'bg-indigo-100 text-indigo-700' :
                    g.day_night === '中直' ? 'bg-purple-100 text-purple-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{g.day_night || '日'}</span>
                </td>
                <td className="px-3 py-2 text-gray-600 text-xs">{route || '-'}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {hasPrice ? `$${Number(g.matched_rate).toLocaleString()}` : <span className="text-orange-500">未設定</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono">{g.count}車</td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {hasPrice ? `$${Number(g.total_amount).toLocaleString()}` : <span className="text-orange-500">未設定</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-gray-900">
          <tr className="bg-gray-50">
            <td colSpan={6} className="px-3 py-2 font-bold text-right">歸組結算合計</td>
            <td className="px-3 py-2 text-right font-mono font-bold text-primary-600">
              ${totalAmount.toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Printable Grouped Settlement ─────────────────────────────
function PrintGroupedSettlement({ groups }: { groups: any[] }) {
  if (!groups || groups.length === 0) return null;
  const totalAmount = groups.reduce((sum: number, g: any) => sum + (Number(g.total_amount) || 0), 0);
  const cellStyle = { padding: '4px 8px', border: '1px solid #000', fontSize: '11px' };
  const headerStyle = { ...cellStyle, fontWeight: 'bold' as const, textAlign: 'center' as const, borderBottom: '2px solid #000' };
  return (
    <div style={{ margin: '15px 0' }}>
      <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>歸組結算明細</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
        <thead>
          <tr>
            <th style={headerStyle}>客戶</th>
            <th style={headerStyle}>合約</th>
            <th style={headerStyle}>日/夜</th>
            <th style={headerStyle}>路線</th>
            <th style={{ ...headerStyle, textAlign: 'right' }}>單價</th>
            <th style={{ ...headerStyle, textAlign: 'right' }}>數量</th>
            <th style={{ ...headerStyle, textAlign: 'right' }}>小計</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g: any, idx: number) => {
            const route = [g.start_location, g.end_location].filter(Boolean).join(' → ');
            const hasPrice = g.price_match_status === 'matched' && g.matched_rate;
            return (
              <tr key={idx}>
                <td style={cellStyle}>{g.client_name || '-'}</td>
                <td style={cellStyle}>{g.contract_no || '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{g.day_night || '日'}</td>
                <td style={cellStyle}>{route || '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                  {hasPrice ? `$${Number(g.matched_rate).toLocaleString()}` : '未設定'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{g.count}車</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {hasPrice ? `$${Number(g.total_amount).toLocaleString()}` : '未設定'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #000' }}>
            <td colSpan={6} style={{ ...cellStyle, fontWeight: 'bold', textAlign: 'right', fontSize: '12px' }}>歸組結算合計</td>
            <td style={{ ...cellStyle, fontWeight: 'bold', textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>
              ${totalAmount.toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function PayrollDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [payroll, setPayroll] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  // Work log view mode
  const [wlViewMode, setWlViewMode] = useState<'detail' | 'grouped'>('grouped');

  // Adjustment form
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjName, setAdjName] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjRemarks, setAdjRemarks] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);

  // Edit work log modal
  const [editingPwl, setEditingPwl] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);

  const loadData = async () => {
    try {
      const res = await payrollApi.get(Number(params.id));
      setPayroll(res.data);
      setPaymentDate(res.data.payment_date || '');
      setChequeNumber(res.data.cheque_number || '');
    } catch {
      router.push('/payroll');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [params.id]);

  const handleConfirm = async () => {
    try {
      await payrollApi.update(payroll.id, { status: 'confirmed' });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleSavePayment = async () => {
    try {
      await payrollApi.update(payroll.id, {
        payment_date: paymentDate || null,
        cheque_number: chequeNumber || null,
        status: 'paid',
      });
      setShowPayment(false);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleRecalculate = async () => {
    if (!confirm('確定要重新計算此糧單？')) return;
    try {
      const res = await payrollApi.recalculate(payroll.id);
      setPayroll(res.data);
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此糧單？')) return;
    try {
      await payrollApi.remove(payroll.id);
      router.push('/payroll');
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  // ── Work log actions ──
  const handleExcludeWorkLog = async (pwlId: number) => {
    if (!confirm('確定要從糧單移除此工作記錄？')) return;
    try {
      await payrollApi.excludeWorkLog(payroll.id, pwlId);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleRestoreWorkLog = async (pwlId: number) => {
    try {
      await payrollApi.restoreWorkLog(payroll.id, pwlId);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const openEditWorkLog = (pwl: any) => {
    setEditingPwl(pwl);
    setEditForm({
      service_type: pwl.service_type || '',
      scheduled_date: pwl.scheduled_date || '',
      day_night: pwl.day_night || '日',
      start_location: pwl.start_location || '',
      end_location: pwl.end_location || '',
      quantity: pwl.quantity ?? '',
      ot_quantity: pwl.ot_quantity ?? '',
      remarks: pwl.remarks || '',
    });
  };

  const handleSaveEditWorkLog = async () => {
    if (!editingPwl) return;
    setEditSaving(true);
    try {
      await payrollApi.updateWorkLog(payroll.id, editingPwl.id, editForm);
      setEditingPwl(null);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
    setEditSaving(false);
  };

  // ── Adjustment actions ──
  const handleAddAdjustment = async () => {
    if (!adjName || !adjAmount) return;
    setAdjSaving(true);
    try {
      await payrollApi.addAdjustment(payroll.id, {
        item_name: adjName,
        amount: Number(adjAmount),
        remarks: adjRemarks || undefined,
      });
      setAdjName('');
      setAdjAmount('');
      setAdjRemarks('');
      setShowAdjForm(false);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
    setAdjSaving(false);
  };

  const handleRemoveAdjustment = async (adjId: number) => {
    if (!confirm('確定要刪除此調整項？')) return;
    try {
      await payrollApi.removeAdjustment(payroll.id, adjId);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>糧單 - ${payroll.employee?.name_zh}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; margin: 0; padding: 20px; color: #000; }
          .payslip { max-width: 800px; margin: 0 auto; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (!payroll) return null;

  const emp = payroll.employee;
  const cp = payroll.company_profile;
  const items = payroll.items || [];
  const adjustments = payroll.adjustments || [];
  const pwls = payroll.payroll_work_logs || [];
  const activePwls = pwls.filter((p: any) => !p.is_excluded);
  const excludedPwls = pwls.filter((p: any) => p.is_excluded);
  const grouped = payroll.grouped_settlement || [];
  const isDraft = payroll.status === 'draft';

  const [yearStr, monthStr] = payroll.period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  const periodStart = `${year}年${month}月1日`;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/payroll" className="hover:text-primary-600">計糧管理</Link>
        <span>/</span>
        <span className="text-gray-900">糧單詳情</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{emp?.name_zh} - {payroll.period} 糧單</h1>
          <p className="text-sm text-gray-500">
            {emp?.name_en} | {emp?.emp_code} |
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[payroll.status] || ''}`}>
              {STATUS_LABELS[payroll.status] || payroll.status}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {isDraft && (
            <>
              <button onClick={handleRecalculate} className="btn-secondary">重新計算</button>
              <button onClick={handleConfirm} className="btn-primary">確認糧單</button>
              <button onClick={handleDelete} className="btn-secondary text-red-600 hover:text-red-700">刪除</button>
            </>
          )}
          {payroll.status === 'confirmed' && (
            <button onClick={() => setShowPayment(true)} className="btn-primary">記錄付款</button>
          )}
          <button onClick={handlePrint} className="btn-secondary">列印 / PDF</button>
        </div>
      </div>

      {/* ── Work Logs Section ── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">工作記錄 ({activePwls.length} 筆)</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setWlViewMode('detail')}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  wlViewMode === 'detail' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >逐筆明細</button>
              <button
                onClick={() => setWlViewMode('grouped')}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  wlViewMode === 'grouped' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >歸組結算</button>
            </div>
          </div>

          {/* Detail view */}
          {wlViewMode === 'detail' && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">日期</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">服務類型</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">日/夜</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">地點</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">數量</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">OT</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">單價</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">金額</th>
                    {isDraft && <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {activePwls.map((pwl: any, idx: number) => {
                    const hasPrice = pwl.price_match_status === 'matched' && pwl.matched_rate;
                    return (
                      <tr key={pwl.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${pwl.is_modified ? 'border-l-2 border-l-orange-400' : ''}`}>
                        <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">{pwl.scheduled_date}</td>
                        <td className="px-2 py-1.5 text-xs whitespace-nowrap">{pwl.service_type || '-'}</td>
                        <td className="px-2 py-1.5">
                          <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                            pwl.day_night === '夜' ? 'bg-indigo-100 text-indigo-700' :
                            pwl.day_night === '中直' ? 'bg-purple-100 text-purple-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>{pwl.day_night || '日'}</span>
                        </td>
                        <td className="px-2 py-1.5 text-gray-600 text-xs max-w-40 truncate">
                          {[pwl.start_location, pwl.end_location].filter(Boolean).join(' → ') || '-'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">{pwl.quantity || '-'}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">
                          {pwl.ot_quantity ? <span className="text-orange-600">{pwl.ot_quantity}h</span> : '-'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">
                          {hasPrice ? `$${Number(pwl.matched_rate).toLocaleString()}` : <span className="text-orange-500">未設定</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs font-bold">
                          {hasPrice ? `$${Number(pwl.line_amount).toLocaleString()}` : <span className="text-orange-500">未設定</span>}
                        </td>
                        {isDraft && (
                          <td className="px-2 py-1.5 text-center whitespace-nowrap">
                            <button onClick={() => openEditWorkLog(pwl)} className="text-xs text-primary-600 hover:underline mr-2">編輯</button>
                            <button onClick={() => handleExcludeWorkLog(pwl.id)} className="text-xs text-red-500 hover:underline">移除</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Grouped view */}
          {wlViewMode === 'grouped' && (
            <GroupedSettlementView groups={grouped} />
          )}

          {/* Empty state when no work logs */}
          {pwls.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">此糧單暫無工作記錄</p>
          )}

          {/* Excluded work logs */}
          {excludedPwls.length > 0 && isDraft && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">已移除的工作記錄 ({excludedPwls.length} 筆)</h3>
              <div className="overflow-x-auto border border-dashed border-gray-300 rounded-lg">
                <table className="w-full text-sm">
                  <tbody>
                    {excludedPwls.map((pwl: any) => (
                      <tr key={pwl.id} className="bg-gray-50 text-gray-400">
                        <td className="px-2 py-1.5 font-mono text-xs">{pwl.scheduled_date}</td>
                        <td className="px-2 py-1.5 text-xs">{pwl.service_type || '-'}</td>
                        <td className="px-2 py-1.5 text-xs">{pwl.day_night || '日'}</td>
                        <td className="px-2 py-1.5 text-xs">{[pwl.start_location, pwl.end_location].filter(Boolean).join(' → ') || '-'}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">{pwl.quantity || '-'}</td>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => handleRestoreWorkLog(pwl.id)} className="text-xs text-primary-600 hover:underline">恢復</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      {/* ── Adjustments Section ── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">自定義津貼/扣款</h2>
          {isDraft && (
            <button onClick={() => setShowAdjForm(true)} className="btn-secondary text-sm">
              + 新增項目
            </button>
          )}
        </div>

        {adjustments.length > 0 ? (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">項目名稱</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">金額</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">備註</th>
                  {isDraft && <th className="px-4 py-2 text-center font-medium text-gray-600">操作</th>}
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adj: any) => {
                  const isNeg = Number(adj.amount) < 0;
                  return (
                    <tr key={adj.id} className="border-b">
                      <td className="px-4 py-2 font-medium">{adj.item_name}</td>
                      <td className={`px-4 py-2 text-right font-mono font-bold ${isNeg ? 'text-red-600' : 'text-green-600'}`}>
                        {isNeg ? '-' : '+'}${Math.abs(Number(adj.amount)).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{adj.remarks || '-'}</td>
                      {isDraft && (
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => handleRemoveAdjustment(adj.id)} className="text-xs text-red-500 hover:underline">刪除</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t">
                <tr className="bg-gray-50">
                  <td className="px-4 py-2 font-bold text-right">調整合計</td>
                  <td className={`px-4 py-2 text-right font-mono font-bold ${Number(payroll.adjustment_total) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {Number(payroll.adjustment_total) < 0 ? '-' : '+'}${Math.abs(Number(payroll.adjustment_total)).toLocaleString()}
                  </td>
                  <td colSpan={isDraft ? 2 : 1}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">沒有自定義調整項目</p>
        )}
      </div>

      {/* ── Printable Payslip ── */}
      <div className="card mb-6">
        <div ref={printRef}>
          <div className="payslip">
            {/* Company Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '3px solid #000', paddingBottom: '10px' }}>
              <h1 style={{ fontSize: '24px', margin: '0 0 5px', fontWeight: 'bold' }}>
                {cp?.chinese_name || '明達建築有限公司'}
              </h1>
              <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 5px', letterSpacing: '1px' }}>
                {cp?.english_name || 'DICKY CONSTRUCTION COMPANY LIMITED'}
              </h2>
              <p style={{ fontSize: '11px', fontWeight: 'bold', margin: 0, letterSpacing: '0.5px' }}>
                {cp?.registered_address || cp?.office_address || 'P. O. BOX 120, TUNG CHUNG POST OFFICE, TUNG CHUNG, LANTAU ISLAND, NT'}
              </p>
            </div>

            {/* Employee Info */}
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '15px 0', border: '2px solid #000' }}>
              <tbody>
                {[
                  ['員工姓名(中)：', emp?.name_zh],
                  ['員工姓名(英)：', emp?.name_en],
                  ['身份證號碼：', emp?.id_number],
                  ['地址：', emp?.address],
                  ['緊急聯絡人：', emp?.emergency_contact],
                  ['出糧戶口：', emp?.bank_account],
                  ['受僱日期：', emp?.join_date ? `${new Date(emp.join_date).getFullYear()}年${new Date(emp.join_date).getMonth() + 1}月${new Date(emp.join_date).getDate()}日` : '-'],
                ].map(([label, value], i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 12px', border: '1px solid #000', width: '120px', textAlign: 'right', fontSize: '13px' }}>{label}</td>
                    <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>{value || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Period */}
            <div style={{ margin: '15px 0', fontSize: '14px' }}>
              <strong>本月工作日期：</strong>
              <span style={{ fontWeight: 'bold', textDecoration: 'underline' }}>{periodStart}-{lastDay}日</span>
            </div>

            {/* Grouped Settlement in print */}
            <PrintGroupedSettlement groups={grouped} />

            {/* Calculation Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '15px 0', border: '2px solid #000' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 12px', border: '1px solid #000', borderBottom: '2px solid #000', textAlign: 'left', width: '200px', fontSize: '13px' }}></th>
                  <th style={{ padding: '6px 12px', border: '1px solid #000', borderBottom: '2px solid #000', textAlign: 'center', fontSize: '13px' }}>單價($)</th>
                  <th style={{ padding: '6px 12px', border: '1px solid #000', borderBottom: '2px solid #000', textAlign: 'center', fontSize: '13px' }}>天數/數量</th>
                  <th style={{ padding: '6px 12px', border: '1px solid #000', borderBottom: '2px solid #000', textAlign: 'right', fontSize: '13px' }} colSpan={2}>金額($)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => {
                  const isDeduction = Number(item.amount) < 0;
                  const displayAmount = Math.abs(Number(item.amount));
                  return (
                    <tr key={item.id || idx}>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>
                        ({idx + 1}) {item.item_name}
                      </td>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'center', fontFamily: 'monospace', fontSize: '13px' }}>
                        {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry'
                          ? `${(Number(item.quantity) * 100).toFixed(0)}%`
                          : Number(item.unit_price).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'center', fontFamily: 'monospace', fontSize: '13px' }}>
                        {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry' ? '' : Number(item.quantity)}
                      </td>
                      <td style={{ padding: '6px 4px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', width: '30px' }}>
                        {isDeduction ? '-$' : '$'}
                      </td>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>
                        {displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
                {/* Adjustment items in print */}
                {adjustments.map((adj: any, idx: number) => {
                  const isNeg = Number(adj.amount) < 0;
                  const displayAmount = Math.abs(Number(adj.amount));
                  return (
                    <tr key={`adj-${adj.id}`}>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>
                        ({items.length + idx + 1}) {adj.item_name}
                      </td>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'center', fontFamily: 'monospace', fontSize: '13px' }}>
                        -
                      </td>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'center', fontFamily: 'monospace', fontSize: '13px' }}>
                        -
                      </td>
                      <td style={{ padding: '6px 4px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', width: '30px' }}>
                        {isNeg ? '-$' : '$'}
                      </td>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>
                        {displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
                {/* Total row */}
                <tr style={{ borderTop: '2px solid #000' }}>
                  <td colSpan={3} style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '14px', fontWeight: 'bold' }}></td>
                  <td style={{ padding: '6px 4px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold' }}>$</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold' }}>
                    {Number(payroll.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Payment Info */}
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '15px 0' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 12px', textAlign: 'right', width: '200px', fontSize: '13px' }}></td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: '13px' }}>付款日期:</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px', width: '200px' }}>
                    {payroll.payment_date || ''}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 12px' }}></td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: '13px' }}>支票號碼:</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>
                    {payroll.cheque_number || ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Calculation Breakdown ── */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">計算明細</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">薪資類型</p>
            <p className="font-bold">{payroll.salary_type === 'daily' ? '日薪' : '月薪'}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">底薪單價</p>
            <p className="font-bold font-mono">${Number(payroll.base_rate).toLocaleString()}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">工作天數</p>
            <p className="font-bold">{Number(payroll.work_days)}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">強積金計劃</p>
            <p className="font-bold">{payroll.mpf_plan === 'industry' ? '行業計劃' : payroll.mpf_plan === 'manulife' ? 'Manulife' : payroll.mpf_plan === 'aia' ? 'AIA' : payroll.mpf_plan || '-'}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left">項目</th>
                <th className="px-3 py-2 text-right">單價</th>
                <th className="px-3 py-2 text-right">數量</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2 text-left">備註</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b">
                  <td className="px-3 py-2 font-medium">{item.item_name}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry'
                      ? `${(Number(item.quantity) * 100).toFixed(0)}%`
                      : `$${Number(item.unit_price).toLocaleString()}`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry' ? '' : Number(item.quantity)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${Number(item.amount) < 0 ? 'text-red-600' : ''}`}>
                    {Number(item.amount) < 0 ? '-' : ''}${Math.abs(Number(item.amount)).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{item.remarks || '-'}</td>
                </tr>
              ))}
              {/* Adjustment items in breakdown */}
              {adjustments.map((adj: any) => (
                <tr key={`adj-${adj.id}`} className="border-b bg-blue-50">
                  <td className="px-3 py-2 font-medium">{adj.item_name} <span className="text-xs text-blue-500">(自定義)</span></td>
                  <td className="px-3 py-2 text-right font-mono">-</td>
                  <td className="px-3 py-2 text-right font-mono">-</td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${Number(adj.amount) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {Number(adj.amount) < 0 ? '-' : '+'}${Math.abs(Number(adj.amount)).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{adj.remarks || '-'}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-900 bg-gray-50">
                <td colSpan={3} className="px-3 py-2 font-bold text-right">淨額</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-lg text-primary-600">
                  ${Number(payroll.net_amount).toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Payment Info ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">付款記錄</h2>
          {payroll.status !== 'paid' && (
            <button onClick={() => setShowPayment(true)} className="text-sm text-primary-600 hover:underline">記錄付款</button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">付款日期</p>
            <p className="font-medium">{payroll.payment_date || '未付款'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">支票號碼</p>
            <p className="font-medium font-mono">{payroll.cheque_number || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">出糧日</p>
            <p className="text-sm text-gray-400">翌月7日前</p>
          </div>
        </div>
      </div>

      {/* ── Payment Modal ── */}
      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="記錄付款">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">付款日期</label>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">支票號碼</label>
            <input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} className="input-field" placeholder="例：SCB237081" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowPayment(false)} className="btn-secondary">取消</button>
            <button onClick={handleSavePayment} className="btn-primary">確認付款</button>
          </div>
        </div>
      </Modal>

      {/* ── Add Adjustment Modal ── */}
      <Modal isOpen={showAdjForm} onClose={() => setShowAdjForm(false)} title="新增自定義項目">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">項目名稱 *</label>
            <input
              value={adjName}
              onChange={e => setAdjName(e.target.value)}
              className="input-field"
              placeholder="例：交通津貼、遲到扣款、獎金"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金額 * <span className="text-xs text-gray-400">(正數=加項，負數=減項)</span></label>
            <input
              type="number"
              step="0.01"
              value={adjAmount}
              onChange={e => setAdjAmount(e.target.value)}
              className="input-field"
              placeholder="例：500 或 -200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input
              value={adjRemarks}
              onChange={e => setAdjRemarks(e.target.value)}
              className="input-field"
              placeholder="可選"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowAdjForm(false)} className="btn-secondary">取消</button>
            <button onClick={handleAddAdjustment} disabled={!adjName || !adjAmount || adjSaving} className="btn-primary">
              {adjSaving ? '儲存中...' : '確認新增'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Work Log Modal ── */}
      <Modal isOpen={!!editingPwl} onClose={() => setEditingPwl(null)} title="編輯工作記錄（只改糧單記錄）">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
              <input
                type="date"
                value={editForm.scheduled_date}
                onChange={e => setEditForm({ ...editForm, scheduled_date: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日/夜</label>
              <select
                value={editForm.day_night}
                onChange={e => setEditForm({ ...editForm, day_night: e.target.value })}
                className="input-field"
              >
                <option value="日">日</option>
                <option value="夜">夜</option>
                <option value="中直">中直</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">服務類型</label>
            <input
              value={editForm.service_type}
              onChange={e => setEditForm({ ...editForm, service_type: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">起點</label>
              <input
                value={editForm.start_location}
                onChange={e => setEditForm({ ...editForm, start_location: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">終點</label>
              <input
                value={editForm.end_location}
                onChange={e => setEditForm({ ...editForm, end_location: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">數量</label>
              <input
                type="number"
                step="0.01"
                value={editForm.quantity}
                onChange={e => setEditForm({ ...editForm, quantity: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">OT 時數</label>
              <input
                type="number"
                step="0.5"
                value={editForm.ot_quantity}
                onChange={e => setEditForm({ ...editForm, ot_quantity: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input
              value={editForm.remarks}
              onChange={e => setEditForm({ ...editForm, remarks: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setEditingPwl(null)} className="btn-secondary">取消</button>
            <button onClick={handleSaveEditWorkLog} disabled={editSaving} className="btn-primary">
              {editSaving ? '儲存中...' : '確認修改'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
