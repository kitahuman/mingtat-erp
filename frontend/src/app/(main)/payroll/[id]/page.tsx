'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { payrollApi, fieldOptionsApi } from '@/lib/api';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';

function formatDateDisplay(dateStr: string): string {
  return fmtDate(dateStr);
}

const STATUS_LABELS: Record<string, string> = {
  preparing: '準備中（編輯工作記錄）',
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
};
const STATUS_COLORS: Record<string, string> = {
  preparing: 'bg-amber-100 text-amber-800',
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
};

const TAB_KEYS = ['detail', 'daily', 'grouped', 'print', 'unmatched'] as const;
type TabKey = typeof TAB_KEYS[number];
const TAB_LABELS: Record<TabKey, string> = {
  detail: '逐筆明細',
  daily: '逐日計算',
  grouped: '歸組統計',
  print: '明細',
  unmatched: '未匹配',
};

type AllowanceBadge = {
  key: string;
  label: string;
  amount: number;
  className: string;
  removable?: boolean;
  id?: number;
};

type UnmatchedGroup = {
  key: string;
  clientName: string;
  contractNo: string;
  dayNight: string;
  route: string;
  unit: string;
  quantity: number;
  count: number;
  reason: string;
};

function buildUnmatchedGroups(pwls: any[]): UnmatchedGroup[] {
  const groups = new Map<string, UnmatchedGroup>();
  (pwls || [])
    .filter((p: any) => !p.is_excluded && p.price_match_status !== 'matched')
    .forEach((p: any) => {
      const route = [p.start_location, p.end_location].filter(Boolean).join(' → ') || '-';
      const key = [
        p.client_name || p.company_name || '-',
        p.client_contract_no || p.contract_no || '-',
        p.day_night || '日',
        route,
        p.unit || p.matched_unit || '車',
      ].join('|');
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += Number(p.quantity) || 1;
        existing.count += 1;
        if (!existing.reason && p.price_match_note) existing.reason = p.price_match_note;
      } else {
        groups.set(key, {
          key,
          clientName: p.client_name || p.company_name || '-',
          contractNo: p.client_contract_no || p.contract_no || '-',
          dayNight: p.day_night || '日',
          route,
          unit: p.unit || p.matched_unit || '車',
          quantity: Number(p.quantity) || 1,
          count: 1,
          reason: p.price_match_note || '未匹配價目',
        });
      }
    });
  return Array.from(groups.values());
}

function PayrollItemsSummary({
  items,
  payroll,
  className = 'mt-6',
}: {
  items: any[];
  payroll: any;
  className?: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className={className}>
      <h3 className="font-bold text-gray-900 mb-2">薪酬項目明細（底薪 / 津貼 / OT / 強積金）</h3>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">項目</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">單價</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">天數/數量</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">金額</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">備註</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => {
              const isDeduction = Number(item.amount) < 0;
              const typeLabel = item.item_type === 'base_salary' ? '底薪' :
                item.item_type === 'allowance' ? '津貼' :
                item.item_type === 'ot' ? 'OT' :
                item.item_type === 'mpf_deduction' ? '強積金扣款' : item.item_type;
              const badgeColor = item.item_type === 'base_salary' ? 'bg-blue-100 text-blue-700' :
                item.item_type === 'allowance' ? 'bg-green-100 text-green-700' :
                item.item_type === 'ot' ? 'bg-purple-100 text-purple-700' :
                item.item_type === 'mpf_deduction' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700';
              return (
                <tr key={item.id} className={`border-b ${item.item_type === 'base_salary' ? 'bg-blue-50' : item.item_type === 'allowance' && item.item_name?.includes('法定') ? 'bg-yellow-50' : item.item_type === 'mpf_deduction' ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${badgeColor}`}>{typeLabel}</span>
                    <span className="font-medium">{item.item_name}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry'
                      ? `${(Number(item.quantity) * 100).toFixed(0)}%`
                      : `$${Number(item.unit_price).toLocaleString()}`}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry' ? '' : Number(item.quantity)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-bold ${isDeduction ? 'text-red-600' : 'text-primary-600'}`}>
                    {isDeduction ? '-' : ''}${Math.abs(Number(item.amount)).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{item.remarks || '-'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-900">
            <tr className="bg-gray-50">
              <td colSpan={3} className="px-4 py-2 text-right font-bold">應收總額</td>
              <td className="px-4 py-2 text-right font-mono font-bold text-primary-600">${Number(payroll.gross_amount).toLocaleString()}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function UnmatchedSummaryView({ groups }: { groups: UnmatchedGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="text-center py-10 text-green-600 bg-green-50 border border-green-100 rounded-lg">
        所有工作記錄已成功匹配價目。
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        以下工作記錄未能自動匹配價目。請先補充價目或在「歸組統計」中設定單價，再按「重新抓取資料」更新糧單。
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">客戶</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">合約</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">日/夜</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">路線</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">數量</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">筆數</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">原因</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-b hover:bg-amber-50/50">
                <td className="px-3 py-2 font-medium">{g.clientName}</td>
                <td className="px-3 py-2 text-gray-600">{g.contractNo}</td>
                <td className="px-3 py-2 text-center">{g.dayNight}</td>
                <td className="px-3 py-2 text-gray-600">{g.route}</td>
                <td className="px-3 py-2 text-right font-mono">{g.quantity.toLocaleString()} {g.unit}</td>
                <td className="px-3 py-2 text-right font-mono">{g.count}</td>
                <td className="px-3 py-2 text-xs text-amber-700">{g.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Inline Edit Cell Component ────────────────────────────────────────────
function InlineEditCell({
  value,
  field,
  payrollId,
  pwlId,
  editable,
  type = 'text',
  options,
  align = 'left',
  onSaved,
  display,
}: {
  value: any;
  field: string;
  payrollId: number;
  pwlId: number;
  editable: boolean;
  type?: 'text' | 'number' | 'select' | 'checkbox';
  options?: { value: string; label: string }[];
  align?: 'left' | 'right' | 'center';
  onSaved: () => Promise<void> | void;
  display?: string;
}) {
  const { isReadOnly } = useAuth();
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => { setLocalVal(value ?? ''); }, [value]);

  const save = async (newVal: any) => {
    if (newVal === (value ?? '')) { setEditing(false); return; }
    setSaving(true);
    try {
      const sendVal = type === 'number' ? (newVal === '' ? null : Number(newVal)) : (type === 'checkbox' ? Boolean(newVal) : (newVal || null));
      await payrollApi.updateWorkLog(payrollId, pwlId, { [field]: sendVal });
      await onSaved();
    } catch (err: any) {
      alert(err.response?.data?.message || '更新失敗');
    }
    setSaving(false);
    setEditing(false);
  };

  if (type === 'checkbox') {
    return (
      <td className="px-2 py-1.5 text-center">
        {editable ? (
          <input
            type="checkbox"
            checked={!!localVal}
            onChange={async (e) => {
              const newVal = e.target.checked;
              setLocalVal(newVal);
              await save(newVal);
            }}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
          />
        ) : (
          value ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>
        )}
      </td>
    );
  }

  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (!editable || !editing) {
    const displayText = display || (value != null && value !== '' ? String(value) : '—');
    return (
      <td
        className={`px-2 py-1.5 whitespace-nowrap ${alignClass} ${type === 'number' ? 'font-mono' : ''} ${editable ? 'cursor-pointer hover:bg-blue-50 group' : ''}`}
        onClick={() => editable && setEditing(true)}
        title={editable ? '點擊編輯' : undefined}
      >
        <span className={saving ? 'opacity-50' : ''}>{displayText}</span>
        {editable && <span className="ml-1 text-blue-400 opacity-0 group-hover:opacity-100 text-[10px]">✏</span>}
      </td>
    );
  }

  // Editing mode
  if (type === 'select' && options) {
    return (
      <td className={`px-1 py-0.5 ${alignClass}`}>
        <select
          ref={inputRef as any}
          value={localVal}
          onChange={(e) => { setLocalVal(e.target.value); save(e.target.value); }}
          onBlur={() => setEditing(false)}
          autoFocus
          className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-blue-50"
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
    );
  }

  return (
    <td className={`px-1 py-0.5 ${alignClass}`}>
      <input
        ref={inputRef as any}
        type={type === 'number' ? 'number' : 'text'}
        step={type === 'number' ? '0.01' : undefined}
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={() => save(localVal)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(localVal); if (e.key === 'Escape') { setLocalVal(value ?? ''); setEditing(false); } }}
        autoFocus
        className={`w-full text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-blue-50 ${type === 'number' ? 'font-mono text-right' : ''}`}
        style={{ minWidth: type === 'number' ? '60px' : '80px' }}
      />
    </td>
  );
}

// ─── Grouped Settlement View (with inline rate editing) ────────────────────────────────
function GroupedSettlementView({
  groups,
  payrollId,
  isDraft,
  onRateSaved,
}: {
  groups: any[];
  payrollId: number;
  isDraft: boolean;
  onRateSaved: () => Promise<void> | void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editRate, setEditRate] = useState('');
  const [saving, setSaving] = useState(false);
  // prompt: which group triggered add-to-rate-card
  const [promptGroup, setPromptGroup] = useState<any | null>(null);
  const [promptRate, setPromptRate] = useState<number>(0);
  // modal form state
  const [showModal, setShowModal] = useState(false);
  const [modalForm, setModalForm] = useState<any>({});
  const [modalSaving, setModalSaving] = useState(false);
  // status notification after modal closes
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIdx !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingIdx]);

  // Auto-dismiss status notification after 4 seconds
  useEffect(() => {
    if (statusMsg) {
      const t = setTimeout(() => setStatusMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [statusMsg]);

  if (!groups || groups.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">沒有歸組結算數據</p>;
  }

  const totalAmount = groups.reduce((sum: number, g: any) => sum + (Number(g.total_amount) || 0), 0);

  const handleSaveGroupRate = async (g: any) => {
    const rate = Number(editRate);
    if (isNaN(rate) || rate < 0) {
      alert('請輸入有效的單價');
      return;
    }
    setSaving(true);
    try {
      await payrollApi.setGroupRate(payrollId, g.group_key, rate);
      await onRateSaved();
      setEditingIdx(null);
      setPromptGroup(g);
      setPromptRate(rate);
    } catch (err: any) {
      alert(err.response?.data?.message || '設定單價失敗');
    }
    setSaving(false);
  };

  const openModal = () => {
    if (!promptGroup) return;
    const today = new Date().toISOString().slice(0, 10);
    setModalForm({
      client_id: promptGroup.client_id || undefined,
      company_id: promptGroup.company_id || undefined,
      client_contract_no: promptGroup.client_contract_no || '',
      service_type: promptGroup.service_type || '',
      day_night: promptGroup.day_night || '',
      tonnage: promptGroup.tonnage || '',
      machine_type: promptGroup.machine_type || '',
      origin: promptGroup.start_location || '',
      destination: promptGroup.end_location || '',
      rate: promptRate,
      unit: promptGroup.matched_unit || '',
      effective_date: today,
      remarks: `由糧單 #${payrollId} 手動設定後加入`,
    });
    setShowModal(true);
  };

  const handleModalConfirm = async () => {
    setModalSaving(true);
    try {
      await payrollApi.addToRateCard(payrollId, {
        ...modalForm,
        rate: Number(modalForm.rate),
        client_id: modalForm.client_id ? Number(modalForm.client_id) : undefined,
        company_id: modalForm.company_id ? Number(modalForm.company_id) : undefined,
        ot_rate: modalForm.ot_rate ? Number(modalForm.ot_rate) : undefined,
        mid_shift_rate: modalForm.mid_shift_rate ? Number(modalForm.mid_shift_rate) : undefined,
      });
      setShowModal(false);
      setPromptGroup(null);
      setStatusMsg({ type: 'success', text: '已成功加入價目表' });
    } catch (err: any) {
      const msg = err.response?.data?.message || '加入價目表失敗';
      setShowModal(false);
      setPromptGroup(null);
      if (msg.includes('已存在')) {
        setStatusMsg({ type: 'warning', text: msg });
      } else {
        setStatusMsg({ type: 'error', text: msg });
      }
    }
    setModalSaving(false);
  };

  const comboLabel = promptGroup ? [
    promptGroup.service_type,
    promptGroup.client_name,
    promptGroup.client_contract_no,
    promptGroup.day_night,
    [promptGroup.tonnage, promptGroup.machine_type].filter(Boolean).join('/'),
    [promptGroup.start_location, promptGroup.end_location].filter(Boolean).join(' → '),
    `$${promptRate.toLocaleString()}`,
  ].filter(Boolean).join(' / ') : '';

  return (
    <>
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
              const isEditing = editingIdx === idx;
              const subtotal = hasPrice ? Number(g.total_amount) : 0;
              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 font-medium">{g.client_name || '-'}</td>
                  <td className="px-3 py-2 text-gray-600">{g.client_contract_no || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      g.day_night === '夜' ? 'bg-indigo-100 text-indigo-700' :
                      g.day_night === '中直' ? 'bg-purple-100 text-purple-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{g.day_night || '日'}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{route || '-'}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-gray-400">$</span>
                        <input
                          ref={inputRef}
                          type="number"
                          step="0.01"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveGroupRate(g);
                            if (e.key === 'Escape') setEditingIdx(null);
                          }}
                          onBlur={() => {
                            if (editRate && Number(editRate) > 0) handleSaveGroupRate(g);
                            else setEditingIdx(null);
                          }}
                          className="w-24 text-xs text-right border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-blue-50 font-mono"
                          disabled={saving}
                        />
                      </div>
                    ) : (
                      <span
                        className={isDraft ? 'cursor-pointer hover:bg-blue-50 px-2 py-1 rounded' : ''}
                        onClick={() => {
                          if (!isDraft) return;
                          setEditingIdx(idx);
                          setEditRate(hasPrice ? String(Number(g.matched_rate)) : '');
                        }}
                        title={isDraft ? '點擊編輯單價' : undefined}
                      >
                        {hasPrice ? (
                          <span className="inline-flex items-center gap-1">
                            ${Number(g.matched_rate).toLocaleString()}
                            {g.is_manual_rate && <span className="text-[10px] text-blue-500" title="手動設定">✏</span>}
                          </span>
                        ) : (
                          <span className="text-orange-500 inline-flex items-center gap-1">
                            未設定
                            {isDraft && <span className="text-blue-400 text-[10px]">✏</span>}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{Number(g.total_quantity)}車</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">
                    {hasPrice ? `$${subtotal.toLocaleString()}` : <span className="text-orange-500">未設定</span>}
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

      {/* Add-to-rate-card prompt bar */}
      {promptGroup && !showModal && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between gap-3">
          <div className="text-sm text-blue-800 leading-relaxed">
            <span className="font-medium">已設定單價</span>，是否將以下組合加入價目表？
            <div className="mt-1 text-xs text-blue-700 font-mono">{comboLabel}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openModal}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              加入價目表
            </button>
            <button
              onClick={() => setPromptGroup(null)}
              className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              不用了
            </button>
          </div>
        </div>
      )}

      {/* Status notification */}
      {statusMsg && (
        <div className={`mt-3 p-3 rounded-lg flex items-center justify-between text-sm ${
          statusMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
          statusMsg.type === 'warning' ? 'bg-orange-50 border border-orange-200 text-orange-800' :
          'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <span>
            {statusMsg.type === 'success' ? '✓ ' : statusMsg.type === 'warning' ? '⚠ ' : '✗ '}
            {statusMsg.text}
          </span>
          <button onClick={() => setStatusMsg(null)} className="ml-3 opacity-60 hover:opacity-100 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Add-to-rate-card Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setPromptGroup(null); } }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">加入價目表</h3>
              <button onClick={() => { setShowModal(false); setPromptGroup(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">服務類型</label>
                  <input
                    type="text"
                    value={modalForm.service_type || ''}
                    onChange={(e) => setModalForm({ ...modalForm, service_type: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="如：運輸"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">日/夜班</label>
                  <select
                    value={modalForm.day_night || ''}
                    onChange={(e) => setModalForm({ ...modalForm, day_night: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">請選擇</option>
                    <option value="日">日</option>
                    <option value="夜">夜</option>
                    <option value="中直">中直</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">客戶名稱</label>
                  <input
                    type="text"
                    value={promptGroup?.client_name || ''}
                    disabled
                    className="w-full border rounded px-2 py-1.5 text-sm bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">合約編號</label>
                  <input
                    type="text"
                    value={modalForm.client_contract_no || ''}
                    onChange={(e) => setModalForm({ ...modalForm, client_contract_no: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">噸數</label>
                  <input
                    type="text"
                    value={modalForm.tonnage || ''}
                    onChange={(e) => setModalForm({ ...modalForm, tonnage: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="如：30噸"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">車種</label>
                  <input
                    type="text"
                    value={modalForm.machine_type || ''}
                    onChange={(e) => setModalForm({ ...modalForm, machine_type: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="如：泥頭車"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">起點</label>
                  <input
                    type="text"
                    value={modalForm.origin || ''}
                    onChange={(e) => setModalForm({ ...modalForm, origin: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">終點</label>
                  <input
                    type="text"
                    value={modalForm.destination || ''}
                    onChange={(e) => setModalForm({ ...modalForm, destination: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">單價 <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    value={modalForm.rate || ''}
                    onChange={(e) => setModalForm({ ...modalForm, rate: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">單位</label>
                  <input
                    type="text"
                    value={modalForm.unit || ''}
                    onChange={(e) => setModalForm({ ...modalForm, unit: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="如：車/日/次"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">OT 費率</label>
                  <input
                    type="number"
                    step="0.01"
                    value={modalForm.ot_rate || ''}
                    onChange={(e) => setModalForm({ ...modalForm, ot_rate: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">中直費率</label>
                  <input
                    type="number"
                    step="0.01"
                    value={modalForm.mid_shift_rate || ''}
                    onChange={(e) => setModalForm({ ...modalForm, mid_shift_rate: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">生效日期</label>
                  <input
                    type="date"
                    value={modalForm.effective_date || ''}
                    onChange={(e) => setModalForm({ ...modalForm, effective_date: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">備註</label>
                <input
                  type="text"
                  value={modalForm.remarks || ''}
                  onChange={(e) => setModalForm({ ...modalForm, remarks: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => { setShowModal(false); setPromptGroup(null); }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleModalConfirm}
                disabled={modalSaving || !modalForm.rate}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {modalSaving ? '處理中...' : '確認加入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Daily Calculation View ──────────────────────────────────
function DailyCalculationView({
  dailyCalc,
  allowanceOptions,
  payrollId,
  isDraft,
  salaryType,
  salarySetting,
  onAddAllowance,
  onRemoveAllowance,
}: {
  dailyCalc: any[];
  allowanceOptions: any[];
  payrollId: number;
  isDraft: boolean;
  salaryType?: string;
  salarySetting?: any;
  onAddAllowance: (date: string, key: string, name: string, amount: number) => Promise<void>;
  onRemoveAllowance: (daId: number) => Promise<void>;
}) {
  const isDaily = salaryType === 'daily' || !salaryType;
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [selectedAllowance, setSelectedAllowance] = useState('');

  if (!dailyCalc || dailyCalc.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">沒有逐日計算數據</p>;
  }

  const getTopUpAmount = (day: any) => {
    if (!isDaily) return 0;
    const workIncome = Number(day.work_income) || 0;
    const baseSalary = Number(day.base_salary) || 0;
    const isStatutoryHolidayNoAttendance = (day.work_logs || []).length === 0 &&
      (day.daily_allowances || []).some((a: any) => a.allowance_key === 'statutory_holiday');
    if (isStatutoryHolidayNoAttendance || baseSalary <= 0 || workIncome >= baseSalary) return 0;
    return Math.max(0, Number(day.top_up_amount) || (baseSalary - workIncome));
  };

  const buildAllowanceBadges = (day: any): AllowanceBadge[] => {
    const badges: AllowanceBadge[] = [];

    (day.fixed_allowances_per_day || []).forEach((item: any, idx: number) => {
      const amount = Number(item.amount) || 0;
      if (amount > 0) {
        badges.push({
          key: `fixed-${item.key || item.name || idx}`,
          label: item.name || item.item_name || item.key || '固定津貼',
          amount,
          className: 'bg-green-100 text-green-700 border-green-200',
        });
      }
    });

    (day.daily_allowances || []).forEach((item: any) => {
      const amount = Number(item.amount) || 0;
      if (amount > 0) {
        badges.push({
          key: `daily-${item.id || item.allowance_key}`,
          id: item.id,
          label: item.allowance_name || item.allowance_key || '每日津貼',
          amount,
          className: item.allowance_key === 'statutory_holiday'
            ? 'bg-amber-100 text-amber-700 border-amber-200'
            : 'bg-blue-100 text-blue-700 border-blue-200',
          removable: isDraft,
        });
      }
    });

    const workLogs = day.work_logs || [];
    const otSlots = [
      { field: 'ot_1800_1900', label: 'OT 18:00-19:00' },
      { field: 'ot_1900_2000', label: 'OT 19:00-20:00' },
      { field: 'ot_0600_0700', label: 'OT 06:00-07:00' },
      { field: 'ot_0700_0800', label: 'OT 07:00-08:00' },
      { field: 'ot_mid_shift', label: '中直OT津貼', condition: (wl: any) => wl.is_mid_shift === true },
    ];
    let salaryOtBadgeCount = 0;
    otSlots.forEach((slot) => {
      const rate = Number(salarySetting?.[slot.field]) || 0;
      if (rate <= 0) return;
      const hasEligibleOt = workLogs.some((wl: any) => (Number(wl.ot_quantity) || 0) > 0 && (!slot.condition || slot.condition(wl)));
      if (!hasEligibleOt) return;
      salaryOtBadgeCount += 1;
      badges.push({
        key: `salary-ot-${slot.field}`,
        label: slot.label,
        amount: rate,
        className: 'bg-purple-100 text-purple-700 border-purple-200',
      });
    });

    if (salaryOtBadgeCount === 0) {
      const otAmount = workLogs.reduce((sum: number, wl: any) => sum + (Number(wl.ot_line_amount) || 0), 0);
      if (otAmount > 0) {
        badges.push({
          key: 'matched-ot',
          label: 'OT',
          amount: otAmount,
          className: 'bg-purple-100 text-purple-700 border-purple-200',
        });
      }
    }

    const midShiftAmount = workLogs.reduce((sum: number, wl: any) => sum + (Number(wl.mid_shift_line_amount) || 0), 0);
    const hasSalaryMidShiftBadge = badges.some((b) => b.key === 'salary-ot-ot_mid_shift');
    if (midShiftAmount > 0 && !hasSalaryMidShiftBadge) {
      badges.push({
        key: 'matched-mid-shift',
        label: '中直OT津貼',
        amount: midShiftAmount,
        className: 'bg-purple-100 text-purple-700 border-purple-200',
      });
    }

    return badges;
  };

  const dailyTableColumnCount = 5 + (isDaily ? 1 : 0) + (isDraft ? 1 : 0);
  const grandTotal = dailyCalc.reduce((sum: number, d: any) => sum + (Number(d.day_total) || 0), 0);
  const totalTopUp = dailyCalc.reduce((sum: number, d: any) => sum + getTopUpAmount(d), 0);
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
        {isDaily && <div><span className="text-gray-500">需補底薪天數：</span><span className="font-bold text-orange-600">{dailyCalc.filter(d => getTopUpAmount(d) > 0).length}天</span></div>}
        {isDaily && <div><span className="text-gray-500">補底薪合計：</span><span className="font-bold text-orange-600">${totalTopUp.toLocaleString()}</span></div>}
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
              {isDaily && <th className="px-3 py-2 text-right font-medium text-gray-600">補底薪差額</th>}
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
              const topUpAmount = getTopUpAmount(day);
              const allowanceBadges = buildAllowanceBadges(day);
              return (
                <>
                  <tr key={day.date} className={`border-b ${topUpAmount > 0 ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setExpandedDate(isExpanded ? null : day.date)} className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {displayDate} <span className="text-xs text-gray-400">({weekday})</span>
                      {(day.work_logs || []).length > 1 && <span className="text-xs text-gray-400 ml-1">({(day.work_logs || []).length}筆)</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ${Number(day.work_income).toLocaleString()}
                    </td>
                    {isDaily && <td className="px-3 py-2 text-right font-mono">
                      {topUpAmount > 0 ? (
                        <span className="text-orange-600 font-bold">+${topUpAmount.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>}
                    <td className="px-3 py-2 text-center">
                      {allowanceBadges.length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {allowanceBadges.map((badge) => (
                            <span key={badge.key} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-xs ${badge.className}`}>
                              {badge.label} ${badge.amount.toLocaleString()}
                              {badge.removable && badge.id && (
                                <button onClick={() => onRemoveAllowance(badge.id!)} className="ml-0.5 text-blue-400 hover:text-red-500">&times;</button>
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
                      <td colSpan={dailyTableColumnCount} className="px-6 py-2">
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
                      <td colSpan={dailyTableColumnCount} className="px-6 py-3">
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
              <td colSpan={dailyTableColumnCount - (isDraft ? 2 : 1)} className="px-3 py-2 font-bold text-right">逐日合計</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-primary-600" colSpan={isDraft ? 2 : 1}>
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
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{Number(g.total_quantity)}車</td>
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
  const { isReadOnly } = useAuth();
  const [payroll, setPayroll] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('detail');

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

  // Field options for inline editing dropdowns
  const [fieldOptions, setFieldOptions] = useState<Record<string, { value: string; label: string }[]>>({});

  // Reimbursement (員工報銷)
  const [showReimbursement, setShowReimbursement] = useState(false);
  const [unsettledExpenses, setUnsettledExpenses] = useState<any[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<number[]>([]);
  const [reimbursementLoading, setReimbursementLoading] = useState(false);

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

  const loadFieldOptions = async () => {
    try {
      const res = await fieldOptionsApi.getAll();
      // res.data is Record<category, FieldOption[]> (grouped object, same as work-logs page)
      const grouped: Record<string, { value: string; label: string }[]> = {};
      for (const [cat, opts] of Object.entries(res.data || {})) {
        grouped[cat] = (opts as any[]).map((o: any) => ({ value: o.label, label: o.label }));
      }
      setFieldOptions(grouped);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadData(); loadFieldOptions(); }, [params.id]);

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
      const data = res.data;
      // Check if there are manual rate conflicts
      if (data.has_manual_rate_conflicts) {
        const overrideConfirmed = confirm(
          `系統已配對到新單價，但有 ${data.conflicts.length} 筆記錄已有手動設定的單價。\n是否要用系統配對的價格覆蓋您手動設定的單價？\n\n選擇「確定」覆蓋手動單價，選擇「取消」保留手動單價`
        );
        // Re-call with override flag
        const res2 = await payrollApi.recalculate(payroll.id, { override_manual_rates: overrideConfirmed });
        setPayroll(res2.data);
      } else {
        setPayroll(data);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleFinalizePreparation = async () => {
    if (!confirm('確定工作記錄已編輯完成？系統將根據糧單工作記錄計算糧單。')) return;
    try {
      const res = await payrollApi.finalizePreparation(payroll.id);
      setPayroll(res.data);
      alert('糧單已成功計算！');
    } catch (err: any) {
      alert(err.response?.data?.message || '計算失敗');
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

  // ── Cancel Payment ──
  const handleCancelPayment = async () => {
    if (!confirm('確定要取消付款？糧單將恢復為已確認狀態。')) return;
    try {
      await payrollApi.cancelPayment(payroll.id);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  // ── Payroll Payment actions ──
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPaymentDate, setNewPaymentDate] = useState('');
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentRef, setNewPaymentRef] = useState('');
  const [newPaymentBank, setNewPaymentBank] = useState('');
  const [newPaymentRemarks, setNewPaymentRemarks] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const handleAddPayrollPayment = async () => {
    if (!newPaymentDate || !newPaymentAmount) return;
    setPaymentSaving(true);
    try {
      await payrollApi.addPayrollPayment(payroll.id, {
        payroll_payment_date: newPaymentDate,
        payroll_payment_amount: Number(newPaymentAmount),
        payroll_payment_reference_no: newPaymentRef || undefined,
        payroll_payment_bank_account: newPaymentBank || undefined,
        payroll_payment_remarks: newPaymentRemarks || undefined,
      });
      setShowAddPayment(false);
      setNewPaymentDate('');
      setNewPaymentAmount('');
      setNewPaymentRef('');
      setNewPaymentBank('');
      setNewPaymentRemarks('');
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '新增付款記錄失敗');
    }
    setPaymentSaving(false);
  };

  const handleRemovePayrollPayment = async (paymentId: number) => {
    if (!confirm('確定要刪除此付款記錄？')) return;
    try {
      await payrollApi.removePayrollPayment(payroll.id, paymentId);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
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

  // ── 員工報銷 handlers ──
  const handleOpenReimbursement = async () => {
    setReimbursementLoading(true);
    setSelectedExpenseIds([]);
    try {
      const res = await payrollApi.getUnsettledExpenses(payroll.id);
      setUnsettledExpenses(res.data);
    } catch (err: any) {
      alert(err.response?.data?.message || '載入報銷項目失敗');
    }
    setReimbursementLoading(false);
    setShowReimbursement(true);
  };

  const handleAttachExpenses = async () => {
    if (selectedExpenseIds.length === 0) return;
    try {
      await payrollApi.attachExpenses(payroll.id, { expense_ids: selectedExpenseIds });
      setShowReimbursement(false);
      setSelectedExpenseIds([]);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '新增報銷失敗');
    }
  };

  const handleDetachExpense = async (expenseId: number) => {
    if (!confirm('確定要從糧單移除此報銷項目？')) return;
    try {
      await payrollApi.detachExpense(payroll.id, expenseId);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '移除報銷失敗');
    }
  };

  const toggleExpenseSelection = (id: number) => {
    setSelectedExpenseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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
  const unmatchedGroups = buildUnmatchedGroups(pwls);
  const isPreparing = payroll.status === 'preparing';
  const isDraft = payroll.status === 'draft' || isPreparing;

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
          {isPreparing && (
            <>
              <button onClick={handleFinalizePreparation} className="btn-primary text-sm">確定並計算糧單</button>
              <button onClick={handleDelete} className="text-sm text-red-500 hover:underline ml-2">刪除</button>
            </>
          )}
          {payroll.status === 'draft' && (
            <>
              <button onClick={handleRecalculate} className="btn-secondary text-sm">重新抓取資料</button>
              <button onClick={handleConfirm} className="btn-primary text-sm">確認糧單</button>
              <button onClick={handleDelete} className="text-sm text-red-500 hover:underline ml-2">刪除</button>
            </>
          )}
          {payroll.status === 'confirmed' && (
            <>
              <button onClick={handleUnconfirm} className="btn-secondary text-sm">撤銷確認</button>
              <button onClick={() => setShowPayment(true)} className="btn-primary text-sm">已付款</button>
            </>
          )}
          {payroll.status === 'paid' && (
            <>
              <button onClick={handleCancelPayment} className="btn-secondary text-sm">取消付款</button>
            </>
          )}
        </div>
      </div>

      {/* ── Preparing Banner ── */}
      {isPreparing && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#x270F;&#xFE0F;</span>
            <div>
              <p className="font-bold text-amber-800">糧單工作記錄編輯中</p>
              <p className="text-sm text-amber-700">請在下方「逐筆明細」中編輯工作記錄（例如修改計算單位、數量等），修改不會影響原始工作記錄。編輯完成後請按「確定並計算糧單」。</p>
            </div>
          </div>
        </div>
      )}

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
        {!isPreparing && (
          <div className="card">
            <p className="text-xs text-gray-500">淨額</p>
            <p className="font-bold text-xl text-primary-600 font-mono">${Number(payroll.net_amount).toLocaleString()}</p>
          </div>
        )}
        {isPreparing && (
          <div className="card">
            <p className="text-xs text-gray-500">工作記錄</p>
            <p className="font-bold text-xl text-amber-600">{pwls.filter((p: any) => !p.is_excluded).length} 筆</p>
          </div>
        )}
      </div>

      {/* ── Work Logs Tabs ── 順序：工作紀錄 → 津貼 → 總金額 → MPF */}
      <div className="card mb-6">
        <div className="flex items-center border-b mb-4">
          {TAB_KEYS.filter(tab => !isPreparing || tab === 'detail').map(tab => (
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
              {tab === 'unmatched' && unmatchedGroups.length > 0 && (
                <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{unmatchedGroups.length}組</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'detail' && (
          <div>
            <div className="overflow-x-auto border rounded-lg">
            {pwls.length > 0 ? (
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">約定日期</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">服務類型</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">公司</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">客戶公司</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">報價單</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">客戶合約</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">噸數</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">機種</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">機號</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">日夜班</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">起點</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">終點</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">數量</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">單位</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">OT數量</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">OT單位</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-500 uppercase tracking-wider">中直</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">商品名稱</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">商品單位</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">單價</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">小計</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pwls.map((pwl: any) => {
                    const isExcluded = pwl.is_excluded;
                    const canEdit = isDraft && !isExcluded;
                    const hasPrice = pwl.price_match_status === 'matched' && pwl.matched_rate;
                    const baseLineAmount = hasPrice ? (Number(pwl.matched_rate) * Number(pwl.quantity || 1)) : 0;
                    const otLineAmount = pwl.matched_ot_rate && pwl.ot_quantity ? (Number(pwl.matched_ot_rate) * Number(pwl.ot_quantity)) : 0;
                    const midShiftLineAmount = pwl.is_mid_shift && pwl.matched_mid_shift_rate ? (Number(pwl.matched_mid_shift_rate) * 1) : 0;
                    const totalLineAmount = baseLineAmount + otLineAmount + midShiftLineAmount;
                    return (
                      <tr key={pwl.id} className={`${isExcluded ? 'bg-red-50 opacity-50 line-through' : 'hover:bg-gray-50'}`}>
                        <td className="px-2 py-1.5 whitespace-nowrap text-gray-400 font-mono">{pwl.work_log_id || '—'}</td>
                        <InlineEditCell value={pwl.scheduled_date} field="scheduled_date" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="text" onSaved={loadData} display={fmtDate(pwl.scheduled_date)} />
                        <InlineEditCell value={pwl.service_type} field="service_type" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="select" options={fieldOptions['service_type'] || []} onSaved={loadData} />
                        <td className="px-2 py-1.5 whitespace-nowrap">{pwl.company_name || '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap truncate max-w-[120px]" title={pwl.client_name}>{pwl.client_name || '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{pwl.quotation_no || '—'}</td>
                        <InlineEditCell value={pwl.client_contract_no} field="client_contract_no" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="text" onSaved={loadData} />
                        <InlineEditCell value={pwl.tonnage} field="tonnage" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="select" options={fieldOptions['tonnage'] || []} onSaved={loadData} />
                        <InlineEditCell value={pwl.machine_type} field="machine_type" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="select" options={fieldOptions['machine_type'] || []} onSaved={loadData} />
                        <InlineEditCell value={pwl.equipment_number} field="equipment_number" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="text" onSaved={loadData} />
                        <InlineEditCell value={pwl.day_night} field="day_night" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="select" options={fieldOptions['day_night'] || []} onSaved={loadData} />
                        <InlineEditCell value={pwl.start_location} field="start_location" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="select" options={fieldOptions['location'] || []} onSaved={loadData} />
                        <InlineEditCell value={pwl.end_location} field="end_location" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="select" options={fieldOptions['location'] || []} onSaved={loadData} />
                        <InlineEditCell value={pwl.quantity} field="quantity" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="number" align="right" onSaved={loadData} />
                        <InlineEditCell value={pwl.unit} field="unit" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="select" options={fieldOptions['wage_unit'] || fieldOptions['unit'] || []} onSaved={loadData} />
                        <InlineEditCell value={pwl.ot_quantity} field="ot_quantity" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="number" align="right" onSaved={loadData} />
                        <InlineEditCell value={pwl.ot_unit} field="ot_unit" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="select" options={fieldOptions['wage_unit'] || fieldOptions['unit'] || []} onSaved={loadData} />
                        <InlineEditCell value={pwl.is_mid_shift} field="is_mid_shift" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="checkbox" onSaved={loadData} />
                        <InlineEditCell value={pwl.payroll_work_log_product_name} field="payroll_work_log_product_name" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="text" onSaved={loadData} />
                        <InlineEditCell value={pwl.payroll_work_log_product_unit} field="payroll_work_log_product_unit" payrollId={payroll.id} pwlId={pwl.id} editable={canEdit} type="select" options={fieldOptions['product_unit'] || []} onSaved={loadData} />
                        <InlineEditCell
                          value={pwl.matched_rate}
                          field="matched_rate"
                          payrollId={payroll.id}
                          pwlId={pwl.id}
                          editable={canEdit}
                          type="number"
                          align="right"
                          onSaved={loadData}
                          display={hasPrice ? `$${Number(pwl.matched_rate).toLocaleString()}` : undefined}
                        />
                        <td className="px-2 py-1.5 whitespace-nowrap text-right font-mono font-bold text-primary-600">
                          ${totalLineAmount.toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-center">
                          {isDraft && (
                            <div className="flex justify-center gap-1">
                              {isExcluded ? (
                                <button onClick={() => handleRestoreWorkLog(pwl.id)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="恢復">
                                  🔄
                                </button>
                              ) : (
                                <button onClick={() => handleExcludeWorkLog(pwl.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="移除">
                                  🗑️
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">此粮單暫無工作記錄</p>
            )}
            </div>
          </div>
        )}
        {/* end detail tab */}

        {activeTab === 'grouped' && (
          <GroupedSettlementView groups={grouped} payrollId={payroll.id} isDraft={isDraft} onRateSaved={loadData} />
        )}

        {activeTab === 'daily' && (
          <DailyCalculationView
            dailyCalc={dailyCalc}
            allowanceOptions={allowanceOptions}
            payrollId={payroll.id}
            isDraft={isDraft}
            salaryType={payroll.salary_type}
            salarySetting={payroll.salary_setting}
            onAddAllowance={handleAddDailyAllowance}
            onRemoveAllowance={handleRemoveDailyAllowance}
          />
        )}

        {activeTab === 'unmatched' && (
          <UnmatchedSummaryView groups={unmatchedGroups} />
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

        {!isPreparing && items.length > 0 && (
          <PayrollItemsSummary items={items} payroll={payroll} />
        )}
      </div>

      {/* ── Custom Adjustments ── */}
      {!isPreparing && <div className="card mb-6">
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

      }

      {/* ── Employee Reimbursement (員工報銷) ── */}
      {!isPreparing && <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">員工報銷</h2>
          {isDraft && (
            <button onClick={handleOpenReimbursement} className="text-sm text-primary-600 hover:underline">+ 增加</button>
          )}
        </div>
        {(payroll.payroll_expenses || []).length > 0 ? (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">日期</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">類別</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">說明</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">金額</th>
                  {isDraft && <th className="px-4 py-2 text-center font-medium text-gray-600">操作</th>}
                </tr>
              </thead>
              <tbody>
                {(payroll.payroll_expenses || []).map((pe: any) => {
                  const exp = pe.expense;
                  const catName = exp.category
                    ? (exp.category.parent ? `${exp.category.parent.name} / ${exp.category.name}` : exp.category.name)
                    : '-';
                  return (
                    <tr key={pe.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap">{fmtDate(exp.date)}</td>
                      <td className="px-4 py-2">{catName}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{exp.description || exp.item || '-'}</td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-blue-600">
                        ${Number(exp.total_amount).toLocaleString()}
                      </td>
                      {isDraft && (
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => handleDetachExpense(exp.id)} className="text-xs text-red-500 hover:underline">移除</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t">
                <tr className="bg-blue-50">
                  <td colSpan={isDraft ? 3 : 3} className="px-4 py-2 font-bold text-right">報銷總額</td>
                  <td className="px-4 py-2 text-right font-mono font-bold text-blue-600">
                    ${Number(payroll.reimbursement_total || 0).toLocaleString()}
                  </td>
                  {isDraft && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">沒有員工報銷項目</p>
        )}
        <p className="text-xs text-gray-400 mt-2">ℹ 員工報銷獨立於薪金計算，不影響淨薪金</p>
      </div>
      }

      {/* ── Summary Cards (bottom) ── */}
      {!isPreparing && <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
          <p className="text-xs text-gray-500">淨薪金</p>
          <p className="font-bold text-xl text-primary-600 font-mono">${Number(payroll.net_amount).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">員工報銷</p>
          <p className="font-bold text-lg text-blue-600 font-mono">${Number(payroll.reimbursement_total || 0).toLocaleString()}</p>
        </div>
      </div>

      }

      {/* ── MPF 計算薪金（非行業計劃）── 放在最底部 */}
      {!isPreparing && payroll.mpf_plan && payroll.mpf_plan !== 'industry' && (
        <div className="card mb-6">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">MPF 計算薪金基數 <span className="text-blue-500 ml-1">(完 5% 的強積金數)</span></p>
              {isDraft ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field w-48 font-mono"
                    defaultValue={payroll.mpf_relevant_income ?? ''}
                    onBlur={async (e) => {
                      const val = e.target.value;
                      try {
                        await payrollApi.update(payroll.id, { mpf_relevant_income: val || null });
                        alert('已更新 MPF 計算薪金，請按「重新計算」以更新糧單');
                      } catch (err: any) {
                        alert(err.response?.data?.message || '更新失敗');
                      }
                    }}
                  />
                  <span className="text-xs text-gray-400">修改後請按「重新計算」</span>
                </div>
              ) : (
                <p className="font-bold font-mono">${payroll.mpf_relevant_income ? Number(payroll.mpf_relevant_income).toLocaleString() : '-'}</p>
              )}
            </div>
            {/* 強積金自動計算：薪金基數 × 5% */}
            {payroll.mpf_relevant_income && Number(payroll.mpf_relevant_income) > 0 && (
              <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-4 py-2">
                <span className="text-sm text-blue-700 font-medium">強積金 5%</span>
                <span className="text-sm text-blue-500">=</span>
                <span className="text-lg font-bold font-mono text-blue-700">
                  ${(Number(payroll.mpf_relevant_income) * 0.05).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-blue-400 ml-1">
                  (${Number(payroll.mpf_relevant_income).toLocaleString()} × 5%)
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Payment Info ── */}
      {!isPreparing && <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">付款記錄</h2>
          <button onClick={() => setShowAddPayment(true)} className="text-sm text-primary-600 hover:underline">+ 新增付款記錄</button>
        </div>

        {/* Payment summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">總金額（淨額）</p>
            <p className="font-bold text-lg font-mono text-primary-600">${Number(payroll.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-xs text-gray-500">已付金額</p>
            <p className="font-bold text-lg font-mono text-green-600">${Number(payroll.paid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg">
            <p className="text-xs text-gray-500">未付金額</p>
            <p className={`font-bold text-lg font-mono ${Number(payroll.outstanding_amount || 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              ${Number(payroll.outstanding_amount ?? payroll.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Payment records table */}
        {(payroll.payroll_payments || []).length > 0 ? (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">付款日期</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">金額</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">參考號碼</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">銀行賬戶</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">備註</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">付款記錄頁</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {(payroll.payroll_payments || []).map((p: any) => (
                  <tr key={p.id} className="border-b">
                    <td className="px-4 py-2">{fmtDate(p.payroll_payment_date)}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-green-600">
                      ${Number(p.payroll_payment_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-600">{p.payroll_payment_reference_no || '-'}</td>
                    <td className="px-4 py-2 text-gray-600">{p.payroll_payment_bank_account || '-'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{p.payroll_payment_remarks || '-'}</td>
                    <td className="px-4 py-2">
                      {p.payment_out ? (
                        <Link href={`/payment-out/${p.payment_out.id}`} className="text-primary-600 hover:underline text-xs">
                          查看付款記錄 #{p.payment_out.id}
                        </Link>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => handleRemovePayrollPayment(p.id)} className="text-xs text-red-500 hover:underline">刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">尚無付款記錄</p>
        )}
      </div>}

      {/* ── Mark as Paid Modal ── */}
      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="確認已付款">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">確認將此糧單標記為「已付款」？標記後糧單將被鎖定，不可再編輯。</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">付款日期</label>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">支票號碼（可選）</label>
            <input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} className="input-field" placeholder="例：SCB237081" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowPayment(false)} className="btn-secondary">取消</button>
            <button onClick={handleSavePayment} className="btn-primary">確認已付款</button>
          </div>
        </div>
      </Modal>

      {/* ── Add Payroll Payment Modal ── */}
      <Modal isOpen={showAddPayment} onClose={() => setShowAddPayment(false)} title="新增付款記錄">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">付款日期 *</label>
              <input type="date" value={newPaymentDate} onChange={e => setNewPaymentDate(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">付款金額 *</label>
              <input type="number" step="0.01" value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} className="input-field font-mono" placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">參考號碼（支票/交易號）</label>
              <input value={newPaymentRef} onChange={e => setNewPaymentRef(e.target.value)} className="input-field" placeholder="例：SCB237081" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">銀行賬戶</label>
              <input value={newPaymentBank} onChange={e => setNewPaymentBank(e.target.value)} className="input-field" placeholder="例：滙豐" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input value={newPaymentRemarks} onChange={e => setNewPaymentRemarks(e.target.value)} className="input-field" placeholder="可選" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowAddPayment(false)} className="btn-secondary">取消</button>
            <button onClick={handleAddPayrollPayment} disabled={!newPaymentDate || !newPaymentAmount || paymentSaving} className="btn-primary">
              {paymentSaving ? '儲存中...' : '確認新增'}
            </button>
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

      {/* ── Reimbursement Selection Modal ── */}
      <Modal isOpen={showReimbursement} onClose={() => setShowReimbursement(false)} title="選擇員工報銷項目" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">以下是該員工所有未結算的「本人代付」報銷項目，請勾選要加入此糧單的項目。</p>
          {reimbursementLoading ? (
            <p className="text-center text-gray-400 py-8">載入中...</p>
          ) : unsettledExpenses.length === 0 ? (
            <p className="text-center text-gray-400 py-8">沒有未結算的報銷項目</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-center w-10">
                      <input
                        type="checkbox"
                        checked={selectedExpenseIds.length === unsettledExpenses.length && unsettledExpenses.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedExpenseIds(unsettledExpenses.map((ex: any) => ex.id));
                          } else {
                            setSelectedExpenseIds([]);
                          }
                        }}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">類別</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">說明</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {unsettledExpenses.map((exp: any) => {
                    const catName = exp.category
                      ? (exp.category.parent ? `${exp.category.parent.name} / ${exp.category.name}` : exp.category.name)
                      : '-';
                    const isSelected = selectedExpenseIds.includes(exp.id);
                    return (
                      <tr
                        key={exp.id}
                        className={`border-b cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        onClick={() => toggleExpenseSelection(exp.id)}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleExpenseSelection(exp.id)}
                            className="rounded"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(exp.date)}</td>
                        <td className="px-3 py-2">{catName}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{exp.description || exp.item || '-'}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">
                          ${Number(exp.total_amount).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {selectedExpenseIds.length > 0 && (
            <div className="bg-blue-50 rounded-lg px-4 py-2 flex items-center justify-between">
              <span className="text-sm text-blue-700">
                已選擇 {selectedExpenseIds.length} 筆，合計：
                <span className="font-bold font-mono ml-1">
                  ${unsettledExpenses
                    .filter((e: any) => selectedExpenseIds.includes(e.id))
                    .reduce((sum: number, e: any) => sum + Number(e.total_amount || 0), 0)
                    .toLocaleString()}
                </span>
              </span>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowReimbursement(false)} className="btn-secondary">取消</button>
            <button
              onClick={handleAttachExpenses}
              disabled={selectedExpenseIds.length === 0}
              className="btn-primary"
            >
              確認加入 ({selectedExpenseIds.length})
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
