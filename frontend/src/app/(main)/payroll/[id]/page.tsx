'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { payrollApi } from '@/lib/api';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';

function formatDateDisplay(dateStr: string): string {
  return fmtDate(dateStr);
}

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

const TAB_KEYS = ['detail', 'grouped', 'daily', 'print'] as const;
type TabKey = typeof TAB_KEYS[number];
const TAB_LABELS: Record<TabKey, string> = {
  detail: '逐筆明細',
  grouped: '歸組結算',
  daily: '逐日計算',
  print: '列印預覽',
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

// ─── Daily Calculation View ──────────────────────────────────
function DailyCalculationView({
  dailyCalc,
  allowanceOptions,
  payrollId,
  isDraft,
  onAddAllowance,
  onRemoveAllowance,
}: {
  dailyCalc: any[];
  allowanceOptions: any[];
  payrollId: number;
  isDraft: boolean;
  onAddAllowance: (date: string, key: string, name: string, amount: number) => Promise<void>;
  onRemoveAllowance: (daId: number) => Promise<void>;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [selectedAllowance, setSelectedAllowance] = useState('');

  if (!dailyCalc || dailyCalc.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">沒有逐日計算數據</p>;
  }

  const grandTotal = dailyCalc.reduce((sum: number, d: any) => sum + (Number(d.day_total) || 0), 0);
  const totalTopUp = dailyCalc.reduce((sum: number, d: any) => sum + (Number(d.top_up_amount) || 0), 0);
  const totalAllowances = dailyCalc.reduce((sum: number, d: any) => sum + (Number(d.daily_allowance_total) || 0), 0);

  const handleAddAllowance = async (date: string) => {
    if (!selectedAllowance) return;
    const opt = allowanceOptions.find((o: any) => o.key === selectedAllowance);
    if (!opt) return;
    await onAddAllowance(date, opt.key, opt.label, opt.default_amount);
    setAddingDate(null);
    setSelectedAllowance('');
  };

  return (
    <div className="space-y-1">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 mb-4 p-3 bg-gray-50 rounded-lg text-sm">
        <div><span className="text-gray-500">工作天數：</span><span className="font-bold">{dailyCalc.length}天</span></div>
        <div><span className="text-gray-500">需補底薪天數：</span><span className="font-bold text-orange-600">{dailyCalc.filter(d => d.needs_top_up).length}天</span></div>
        <div><span className="text-gray-500">補底薪合計：</span><span className="font-bold text-orange-600">${totalTopUp.toLocaleString()}</span></div>
        <div><span className="text-gray-500">每日津貼合計：</span><span className="font-bold text-blue-600">${totalAllowances.toLocaleString()}</span></div>
        <div><span className="text-gray-500">逐日合計：</span><span className="font-bold text-primary-600">${grandTotal.toLocaleString()}</span></div>
      </div>

      {/* Daily rows */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-8"></th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">工作收入</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">日薪底薪</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">補底薪</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">每日津貼</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">當日合計</th>
              {isDraft && <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">操作</th>}
            </tr>
          </thead>
          <tbody>
            {dailyCalc.map((day: any, idx: number) => {
              const isExpanded = expandedDate === day.date;
              const isAdding = addingDate === day.date;
              const displayDate = formatDateDisplay(day.date);
              const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(day.date).getDay()];
              return (
                <>
                  <tr key={day.date} className={`border-b ${day.needs_top_up ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setExpandedDate(isExpanded ? null : day.date)} className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {displayDate} <span className="text-xs text-gray-400">({weekday})</span>
                      {day.work_logs.length > 1 && <span className="text-xs text-gray-400 ml-1">({day.work_logs.length}筆)</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ${Number(day.work_income).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-500">
                      ${Number(day.base_salary).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {day.needs_top_up ? (
                        <span className="text-orange-600 font-bold">+${Number(day.top_up_amount).toLocaleString()}</span>
                      ) : (
                        <span className="text-green-600">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {day.daily_allowances && day.daily_allowances.length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {day.daily_allowances.map((da: any) => (
                            <span key={da.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                              {da.allowance_name} ${Number(da.amount).toLocaleString()}
                              {isDraft && (
                                <button onClick={() => onRemoveAllowance(da.id)} className="ml-0.5 text-blue-400 hover:text-red-500">&times;</button>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      ${Number(day.day_total).toLocaleString()}
                    </td>
                    {isDraft && (
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => { setAddingDate(isAdding ? null : day.date); setSelectedAllowance(''); }}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          {isAdding ? '取消' : '+津貼'}
                        </button>
                      </td>
                    )}
                  </tr>
                  {isExpanded && (
                    <tr className="bg-blue-50">
                      <td colSpan={isDraft ? 8 : 7} className="px-6 py-2">
                        <div className="text-xs space-y-2">
                          {day.work_logs.map((wl: any, wIdx: number) => {
                            const wlRoute = [wl.start_location, wl.end_location].filter(Boolean).join(' → ');
                            const wlEquipment = [wl.tonnage, wl.machine_type, wl.equipment_number].filter(Boolean).join('');
                            const wlShortName = wl.client_short_name || (wl.client_name ? wl.client_name.substring(0, 4) : '');
                            const wlDesc = [
                              wl.service_type,
                              wlShortName,
                              wl.client_contract_no,
                              wlRoute,
                              wlEquipment ? `(${wlEquipment})` : '',
                              wl.day_night || '日',
                              wl.ot_quantity && Number(wl.ot_quantity) > 0 ? 'OT' : '',
                              wl.is_mid_shift ? '中直' : '',
                            ].filter(Boolean).join(' ');
                            const wlBaseAmt = wl.base_line_amount ?? (wl.matched_rate ? Number(wl.matched_rate) * Number(wl.quantity || 1) : 0);
                            const wlOtAmt = wl.ot_line_amount ?? (wl.matched_ot_rate && wl.ot_quantity ? Number(wl.matched_ot_rate) * Number(wl.ot_quantity) : 0);
                            const wlMidAmt = wl.mid_shift_line_amount ?? (wl.is_mid_shift && wl.matched_mid_shift_rate ? Number(wl.matched_mid_shift_rate) : 0);
                            return (
                              <div key={wIdx} className="py-1 border-b border-gray-200 last:border-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-700 font-medium">{wlDesc || '-'}</span>
                                  <span className="font-mono font-bold text-primary-600">${Number(wl.line_amount).toLocaleString()}</span>
                                </div>
                                {wl.matched_rate && (
                                  <div className="flex gap-4 mt-0.5 text-gray-400">
                                    <span>基本: ${Number(wl.matched_rate).toLocaleString()} × {wl.quantity} = ${wlBaseAmt.toLocaleString()}</span>
                                    {wl.ot_quantity > 0 && <span>OT: ${wl.matched_ot_rate ? Number(wl.matched_ot_rate).toLocaleString() : '未設定'} × {wl.ot_quantity} = ${wlOtAmt.toLocaleString()}</span>}
                                    {wl.is_mid_shift && <span>中直: ${wl.matched_mid_shift_rate ? Number(wl.matched_mid_shift_rate).toLocaleString() : '未設定'} = ${wlMidAmt.toLocaleString()}</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                  {isAdding && (
                    <tr className="bg-blue-50">
                      <td colSpan={isDraft ? 8 : 7} className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedAllowance}
                            onChange={e => setSelectedAllowance(e.target.value)}
                            className="text-xs border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="">選擇津貼類型</option>
                            {allowanceOptions.map((opt: any) => (
                              <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAddAllowance(day.date)}
                            disabled={!selectedAllowance}
                            className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
                          >
                            新增
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-900">
            <tr className="bg-gray-50">
              <td colSpan={isDraft ? 6 : 5} className="px-3 py-2 font-bold text-right">逐日合計</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-primary-600" colSpan={isDraft ? 2 : 2}>
                ${grandTotal.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
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

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('daily');

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
    if (!confirm('確定要確認此糧單？確認後將自動產生薪資支出記錄。')) return;
    try {
      const res = await payrollApi.finalize(payroll.id);
      const count = res.data?.expenses_generated || 0;
      alert(`已確認糧單，自動產生 ${count} 筆支出記錄`);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleUnconfirm = async () => {
    if (!confirm('確定要撤銷確認？相關的自動產生支出記錄將被刪除。')) return;
    try {
      const res = await payrollApi.unconfirm(payroll.id);
      const count = res.data?.expenses_deleted || 0;
      alert(`已撤銷確認，刪除了 ${count} 筆支出記錄`);
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
      setShowAdjForm(false);
      setAdjName('');
      setAdjAmount('');
      setAdjRemarks('');
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

  // ── Daily allowance actions ──
  const handleAddDailyAllowance = async (date: string, key: string, name: string, amount: number) => {
    try {
      await payrollApi.addDailyAllowance(payroll.id, {
        date,
        allowance_key: key,
        allowance_name: name,
        amount,
      });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleRemoveDailyAllowance = async (daId: number) => {
    try {
      await payrollApi.removeDailyAllowance(payroll.id, daId);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>糧單</title>
      <style>body{font-family:'Microsoft JhengHei','PingFang TC',sans-serif;padding:20px}
      @media print{body{padding:0}}</style></head><body>`);
    w.document.write(printRef.current.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
  };

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>;
  if (!payroll) return <div className="p-8 text-center text-red-500">找不到糧單</div>;

  const emp = payroll.employee;
  const cp = payroll.company_profile;
  const items = payroll.items || [];
  const adjustments = payroll.adjustments || [];
  const pwls = payroll.payroll_work_logs || [];
  const grouped = payroll.grouped_settlement || [];
  const dailyCalc = payroll.daily_calculation || [];
  const allowanceOptions = payroll.allowance_options || [];
  const isDraft = payroll.status === 'draft';

  const periodStart = payroll.date_from ? new Date(payroll.date_from).getDate() : 1;
  const lastDay = payroll.date_to ? new Date(payroll.date_to).getDate() : 31;

  return (
    <div className="max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/payroll-records" className="text-gray-400 hover:text-gray-600">← 返回</Link>
          <h1 className="text-2xl font-bold text-gray-900">
            糧單 #{payroll.id}
          </h1>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[payroll.status] || ''}`}>
            {STATUS_LABELS[payroll.status] || payroll.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <button onClick={handleRecalculate} className="btn-secondary text-sm">重新計算</button>
              <button onClick={handleConfirm} className="btn-primary text-sm">確認糧單</button>
              <button onClick={handleDelete} className="text-sm text-red-500 hover:underline ml-2">刪除</button>
            </>
          )}
          {payroll.status === 'confirmed' && (
            <>
              <button onClick={handleUnconfirm} className="btn-secondary text-sm">撤銷確認</button>
              <button onClick={() => setShowPayment(true)} className="btn-primary text-sm">記錄付款</button>
            </>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-xs text-gray-500">員工</p>
          <p className="font-bold">{emp?.name_zh || emp?.name_en || '-'}</p>
          <p className="text-xs text-gray-400">{emp?.emp_code}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">公司</p>
          <p className="font-bold text-sm">{cp?.chinese_name || '-'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">計糧期間</p>
          <p className="font-bold text-sm">{fmtDate(payroll.date_from)} 至 {fmtDate(payroll.date_to)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">淨額</p>
          <p className="font-bold text-xl text-primary-600 font-mono">${Number(payroll.net_amount).toLocaleString()}</p>
        </div>
      </div>

      {/* ── Custom Adjustments ── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">自定義津貼/扣款</h2>
          {isDraft && (
            <button onClick={() => setShowAdjForm(true)} className="text-sm text-primary-600 hover:underline">+ 新增項目</button>
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

      {/* ── Work Logs Tabs ── */}
      <div className="card mb-6">
        <div className="flex items-center border-b mb-4">
          {TAB_KEYS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {TAB_LABELS[tab]}
              {tab === 'daily' && dailyCalc.length > 0 && (
                <span className="ml-1 text-xs bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded-full">{dailyCalc.length}天</span>
              )}
              {tab === 'detail' && pwls.length > 0 && (
                <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{pwls.filter((p: any) => !p.is_excluded).length}筆</span>
              )}
              {tab === 'grouped' && grouped.length > 0 && (
                <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{grouped.length}組</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'detail' && (
          <div>
            {pwls.length > 0 ? (
              <div className="space-y-4">
                {pwls.map((pwl: any) => {
                  const isExcluded = pwl.is_excluded;
                  const hasPrice = pwl.price_match_status === 'matched' && pwl.matched_rate;
                  const route = [pwl.start_location, pwl.end_location].filter(Boolean).join(' → ');
                  const equipment = [pwl.tonnage, pwl.machine_type, pwl.equipment_number].filter(Boolean).join('');
                  // Use client_short_name (from code field) if available, else truncate client_name to 4 chars
                  const clientShortName = pwl.client_short_name || pwl.client?.code || (pwl.client_name ? pwl.client_name.substring(0, 4) : '');
                  
                  // Calculate line amounts for each component
                  const baseLineAmount = hasPrice ? (Number(pwl.matched_rate) * Number(pwl.quantity || 1)) : 0;
                  const otLineAmount = pwl.matched_ot_rate && pwl.ot_quantity ? (Number(pwl.matched_ot_rate) * Number(pwl.ot_quantity)) : 0;
                  const midShiftLineAmount = pwl.is_mid_shift && pwl.matched_mid_shift_rate ? (Number(pwl.matched_mid_shift_rate) * 1) : 0;
                  
                  // Build description: service_type + client_short + contract + route + equipment + day/night [+ OT] [+ 中直]
                  const descParts = [
                    pwl.service_type,
                    clientShortName,
                    pwl.client_contract_no,
                    route,
                    equipment ? `(${equipment})` : '',
                    pwl.day_night || '日',
                    pwl.ot_quantity && Number(pwl.ot_quantity) > 0 ? 'OT' : '',
                    pwl.is_mid_shift ? '中直' : '',
                  ].filter(Boolean).join(' ');
                  
                  return (
                    <div key={pwl.id} className={`border rounded-lg p-3 ${isExcluded ? 'bg-red-50 opacity-50 line-through' : 'bg-gray-50'}`}>
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{descParts}</span>
                        </div>
                        {isDraft && (
                          <div className="flex gap-1">
                            {isExcluded ? (
                              <button onClick={() => handleRestoreWorkLog(pwl.id)} className="text-xs text-blue-500 hover:underline">恢復</button>
                            ) : (
                              <>
                                <button onClick={() => openEditWorkLog(pwl)} className="text-xs text-blue-500 hover:underline">編輯</button>
                                <button onClick={() => handleExcludeWorkLog(pwl.id)} className="text-xs text-red-500 hover:underline">移除</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Detail rows - up to 3 lines */}
                      <div className="text-xs space-y-1">
                        {/* Line 1: Base rate */}
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">基本</span>
                          <span className="font-mono text-gray-500">
                            {hasPrice ? `$${Number(pwl.matched_rate).toLocaleString()} × ${pwl.quantity || 1}` : '未設定'}
                          </span>
                          <span className="font-mono font-bold w-24 text-right">
                            {hasPrice ? `$${baseLineAmount.toLocaleString()}` : '-'}
                          </span>
                        </div>
                        
                        {/* Line 2: OT rate (only if ot_quantity > 0) */}
                        {pwl.ot_quantity && Number(pwl.ot_quantity) > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">OT</span>
                            <span className="font-mono text-gray-500">
                              {pwl.matched_ot_rate ? `$${Number(pwl.matched_ot_rate).toLocaleString()} × ${pwl.ot_quantity}` : '未設定'}
                            </span>
                            <span className="font-mono font-bold w-24 text-right">
                              {pwl.matched_ot_rate ? `$${otLineAmount.toLocaleString()}` : '-'}
                            </span>
                          </div>
                        )}
                        
                        {/* Line 3: Mid-shift rate (only if is_mid_shift is true) */}
                        {pwl.is_mid_shift && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">中直</span>
                            <span className="font-mono text-gray-500">
                              {pwl.matched_mid_shift_rate ? `$${Number(pwl.matched_mid_shift_rate).toLocaleString()} × ${pwl.quantity || 1}` : '未設定'}
                            </span>
                            <span className="font-mono font-bold w-24 text-right">
                              {pwl.matched_mid_shift_rate ? `$${midShiftLineAmount.toLocaleString()}` : '-'}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Total line */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 font-bold">
                        <span className="text-gray-700">小計</span>
                        <span></span>
                        <span className="font-mono w-24 text-right text-primary-600">
                          ${(baseLineAmount + otLineAmount + midShiftLineAmount).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">此糧單暫無工作記錄</p>
            )}
          </div>
        )}

        {activeTab === 'grouped' && (
          <GroupedSettlementView groups={grouped} />
        )}

        {activeTab === 'daily' && (
          <DailyCalculationView
            dailyCalc={dailyCalc}
            allowanceOptions={allowanceOptions}
            payrollId={payroll.id}
            isDraft={isDraft}
            onAddAllowance={handleAddDailyAllowance}
            onRemoveAllowance={handleRemoveDailyAllowance}
          />
        )}

        {activeTab === 'print' && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={handlePrint} className="btn-primary text-sm">列印糧單</button>
            </div>
            <div ref={printRef} className="border rounded-lg p-6 bg-white">
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
                        {Number(payroll.gross_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Summary */}
                <div style={{ margin: '15px 0', fontSize: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <div style={{ marginBottom: '5px' }}><strong>應收總額：</strong> ${Number(payroll.gross_amount).toLocaleString()}</div>
                      <div style={{ marginBottom: '5px' }}><strong>扣款合計：</strong> ${Math.abs(Number(payroll.deduction_total)).toLocaleString()}</div>
                      <div style={{ marginBottom: '5px' }}><strong>調整合計：</strong> ${Number(payroll.adjustment_total).toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', padding: '10px', border: '2px solid #000', textAlign: 'center' }}>
                        淨額：${Number(payroll.net_amount).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signature */}
                <div style={{ marginTop: '30px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', fontSize: '12px' }}>
                  <div>
                    <div style={{ borderTop: '1px solid #000', paddingTop: '5px', textAlign: 'center' }}>員工簽署</div>
                    <div style={{ marginTop: '20px', fontSize: '10px', color: '#666' }}>日期：_________</div>
                  </div>
                  <div>
                    <div style={{ borderTop: '1px solid #000', paddingTop: '5px', textAlign: 'center' }}>公司簽署</div>
                    <div style={{ marginTop: '20px', fontSize: '10px', color: '#666' }}>日期：_________</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-xs text-gray-500">應收總額</p>
          <p className="font-bold text-lg text-primary-600 font-mono">${Number(payroll.gross_amount).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">扣款合計</p>
          <p className="font-bold text-lg text-red-600 font-mono">-${Math.abs(Number(payroll.deduction_total)).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">調整合計</p>
          <p className={`font-bold text-lg font-mono ${Number(payroll.adjustment_total) < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {Number(payroll.adjustment_total) < 0 ? '-' : '+'}${Math.abs(Number(payroll.adjustment_total)).toLocaleString()}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">淨額</p>
          <p className="font-bold text-xl text-primary-600 font-mono">${Number(payroll.net_amount).toLocaleString()}</p>
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
            <p className="font-medium">{payroll.payment_date ? fmtDate(payroll.payment_date) : '未付款'}</p>
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
