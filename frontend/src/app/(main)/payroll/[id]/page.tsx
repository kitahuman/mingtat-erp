'use client';
import { Fragment, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { payrollApi, fieldOptionsApi, pettyCashApi, bankAccountsApi, companiesApi, attachmentsApi } from '@/lib/api';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';
import DateInput from '@/components/DateInput';
import PayrollTabs from "@/components/payroll/PayrollTabs";


function formatAdjustmentDateLabel(value: string | Date | null | undefined): string {
  if (!value) return '';
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const parts = text.split('-');
  if (parts.length !== 3) return '';
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return '';
  return `${month}月${day}日`;
}

const STATUS_LABELS: Record<string, string> = {
  preparing: '準備中（編輯工作記錄）',
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
  partially_paid: '部分付款',
};
const STATUS_COLORS: Record<string, string> = {
  preparing: 'bg-amber-100 text-amber-800',
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  partially_paid: 'bg-orange-100 text-orange-800',
};

const TAB_KEYS = ['detail', 'daily', 'grouped', 'print', 'unmatched'] as const;
type TabKey = typeof TAB_KEYS[number];
const TAB_LABELS: Record<TabKey, string> = {
  detail: '逐筆明細',
  daily: '逐日計算',
  grouped: '歸組統計',
  print: '列印',
  unmatched: '未匹配',
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
        p.unit || p.matched_unit || '天',
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
          unit: p.unit || p.matched_unit || '天',
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
  payrollId,
  isEditable,
  onSaved,
  className = 'mt-6',
}: {
  items: any[];
  payroll: any;
  payrollId: number;
  isEditable: boolean;
  onSaved: () => Promise<void> | void;
  className?: string;
}) {
  const { isReadOnly } = useAuth();
  const [savingItemId, setSavingItemId] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  const readOnlyMode = isReadOnly('payroll');
  const canEditExcluded = isEditable && !readOnlyMode;
  const handleToggleExcluded = async (item: any, checked: boolean) => {
    setSavingItemId(item.id);
    try {
      await payrollApi.updateItem(payrollId, item.id, { payroll_item_excluded: checked });
      await onSaved();
    } catch (err: any) {
      alert(err.response?.data?.message || '更新糧單項目失敗');
    } finally {
      setSavingItemId(null);
    }
  };

  // Group items by name + unit_price
  const groupedItems = items.reduce((acc: any[], item: any) => {
    const key = `${item.item_name}|${item.unit_price}`;
    const existing = acc.find((g: any) => g.groupKey === key);
    if (existing) {
      existing.items.push(item);
      existing.totalQuantity += Number(item.quantity) || 0;
      existing.totalAmount += Number(item.amount) || 0;
    } else {
      acc.push({
        groupKey: key,
        items: [item],
        totalQuantity: Number(item.quantity) || 0,
        totalAmount: Number(item.amount) || 0,
      });
    }
    return acc;
  }, []);

  return (
    <div className={className}>
      <h3 className="font-bold text-gray-900 mb-2">糧單項目明細（底薪 / 津貼 / OT / 強積金）</h3>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-center font-medium text-gray-600">排除</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">項目</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">單價</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">天數/數量</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">金額</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">備註</th>
            </tr>
          </thead>
          <tbody>
            {groupedItems.map((group: any) => {
              const item = group.items[0];
              const isDeduction = Number(group.totalAmount) < 0;
              const typeLabel = item.item_type === 'base_salary' ? '底薪' :
                item.item_type === 'allowance' ? '津貼' :
                item.item_type === 'ot' ? 'OT' :
                item.item_type === 'mpf_deduction' ? '強積金扣款' : item.item_type;
              const badgeColor = item.item_type === 'base_salary' ? 'bg-blue-100 text-blue-700' :
                item.item_type === 'allowance' ? 'bg-green-100 text-green-700' :
                item.item_type === 'ot' ? 'bg-purple-100 text-purple-700' :
                item.item_type === 'mpf_deduction' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700';
              const isExcluded = group.items.some((i: any) => Boolean(i.payroll_item_excluded));
              const rowClass = isExcluded
                ? 'bg-gray-50 text-gray-400'
                : item.item_type === 'base_salary'
                  ? 'bg-blue-50'
                  : item.item_type === 'allowance' && item.item_name?.includes('法定')
                    ? 'bg-yellow-50'
                    : item.item_type === 'mpf_deduction'
                      ? 'bg-red-50'
                      : '';
              const excludedClass = isExcluded ? 'line-through opacity-60' : '';
              return (
                <tr key={group.groupKey} className={`border-b ${rowClass}`}>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={isExcluded}
                      disabled={!canEditExcluded || group.items.some((i: any) => savingItemId === i.id)}
                      onChange={(e) => {
                        group.items.forEach((i: any) => handleToggleExcluded(i, e.target.checked));
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                      title={canEditExcluded ? '勾選後此糧單項目不計入糧單金額' : readOnlyMode ? '目前帳號沒有此頁面的編輯權限' : '只有草稿或準備中糧單可編輯'}
                    />
                  </td>
                  <td className={`px-4 py-2 ${excludedClass}`}>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${badgeColor}`}>{typeLabel}</span>
                    <span className="font-medium">{item.item_name}</span>
                    {group.items.length > 1 && <span className="ml-2 text-xs text-gray-500">（{group.items.length} 筆合併）</span>}
                    {isExcluded && <span className="ml-2 text-[11px] text-gray-500 no-underline">已排除</span>}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${excludedClass}`}>
                    {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry'
                      ? `${(Number(item.quantity) * 100).toFixed(0)}%`
                      : `$${Number(item.unit_price).toLocaleString()}`}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${excludedClass}`}>{item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry' ? '' : group.totalQuantity}</td>
                  <td className={`px-4 py-2 text-right font-mono font-bold ${excludedClass} ${isExcluded ? 'text-gray-400' : isDeduction ? 'text-red-600' : 'text-primary-600'}`}>
                    {isDeduction ? '-' : ''}${Math.abs(Number(group.totalAmount)).toLocaleString()}
                  </td>
                  <td className={`px-4 py-2 text-gray-500 text-xs ${excludedClass}`}>{group.items[0].remarks || '-'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-900">
            <tr className="bg-gray-50">
              <td colSpan={4} className="px-4 py-2 text-right font-bold">應收總額</td>
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
        以下工作記錄未能自動匹配價目。請先補充價目或在「歸組統計」中設定單價，再按「重新計算」更新糧單。
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
                  <td className="px-3 py-2 text-right font-mono">{Number(g.total_quantity)}{g.unit || g.matched_unit || '天'}</td>
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
                  <DateInput value={modalForm.effective_date || ''}
                    onChange={val => setModalForm({ ...modalForm, effective_date: val || '' })}
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
                <td style={cellStyle}>{g.client_contract_no || g.contract_no || '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{g.day_night || '日'}</td>
                <td style={cellStyle}>{route || '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                  {hasPrice ? `$${Number(g.matched_rate).toLocaleString()}` : '未設定'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{Number(g.total_quantity)}{g.unit || g.matched_unit || '天'}</td>
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
  const [selectedPwlIds, setSelectedPwlIds] = useState<Set<number>>(new Set());

  // Reimbursement (員工報銷)
  const [showReimbursement, setShowReimbursement] = useState(false);
  const [unsettledExpenses, setUnsettledExpenses] = useState<any[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<number[]>([]);
  const [reimbursementLoading, setReimbursementLoading] = useState(false);
  const [pettyCashRecords, setPettyCashRecords] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const res = await payrollApi.get(Number(params.id));
      setPayroll(res.data);
      setSelectedPwlIds(new Set());
      setPaymentDate(res.data.payment_date || '');
      setChequeNumber(res.data.cheque_number || '');
      try {
        const pcRes = await pettyCashApi.getPayrollSettlement(Number(res.data.id));
        setPettyCashRecords(pcRes.data?.records || []);
      } catch {
        setPettyCashRecords([]);
      }
    } catch {
      router.push('/payroll');
    }
    setLoading(false);
  };

  const recalculateAndLoad = async () => {
    try {
      await payrollApi.recalculate(payroll.id);
    } catch { /* ignore recalculate errors */ }
    await loadData();
  };

  const loadFieldOptions = async () => {
    try {
      const res = await fieldOptionsApi.getAll();
      // res.data is Record<category, FieldOption[]> (grouped object, same as work-logs page)
      const grouped: Record<string, { value: string; label: string }[]> = {};
      for (const [cat, opts] of Object.entries(res.data || {})) {
        grouped[cat] = (opts as any[])
          .filter((o: any) => o.is_active !== false)
          .map((o: any) => ({ value: o.label, label: o.label }));
      }
      setFieldOptions(grouped);
    } catch { /* ignore */ }
  };

  const loadBankAccounts = async () => {
    try {
      const res = await bankAccountsApi.simple();
      setBankAccounts(res.data || []);
    } catch { /* ignore */ }
  };

  const loadCompanies = async () => {
    try {
      const res = await companiesApi.simple();
      setCompanies(res.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadData(); loadFieldOptions(); loadBankAccounts(); loadCompanies(); }, [params.id]);

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

  const handleResetRefetch = async () => {
    if (!confirm('確定要重新抓取資料嗎？這會覆蓋現有的工作記錄快照，需要重新計算。')) return;
    try {
      const res = await payrollApi.resetRefetch(payroll.id);
      setPayroll(res.data);
      alert('已重新抓取工作記錄，請檢查資料後重新計算。');
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
      await payrollApi.recalculate(payroll.id);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleRestoreWorkLog = async (pwlId: number) => {
    try {
      await payrollApi.restoreWorkLog(payroll.id, pwlId);
      await payrollApi.recalculate(payroll.id);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleBatchDeleteWorkLogs = async () => {
    if (!payroll || selectedPwlIds.size === 0) return;
    if (!window.confirm(`確定刪除已選取的 ${selectedPwlIds.size} 筆記錄？`)) return;
    try {
      await payrollApi.batchDeleteWorkLogs(payroll.id, Array.from(selectedPwlIds));
      await payrollApi.recalculate(payroll.id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '批量刪除失敗');
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
  const [showGroupedInPrint, setShowGroupedInPrint] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPaymentDate, setNewPaymentDate] = useState('');
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentRef, setNewPaymentRef] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [newPaymentBank, setNewPaymentBank] = useState('');
  const [newPaymentRemarks, setNewPaymentRemarks] = useState('');
  const [newPaymentCompanyId, setNewPaymentCompanyId] = useState<number | null>(payroll?.company_id || null);
  const [paymentFiles, setPaymentFiles] = useState<File[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentFileUploading, setPaymentFileUploading] = useState(false);

  const handleAddPayrollPayment = async () => {
    if (!newPaymentDate || !newPaymentAmount) return;
    setPaymentSaving(true);
    try {
      const res = await payrollApi.addPayrollPayment(payroll.id, {
        payroll_payment_date: newPaymentDate,
        payroll_payment_amount: Number(newPaymentAmount),
        payroll_payment_reference_no: newPaymentRef || undefined,
        payroll_payment_method: newPaymentMethod || undefined,
        payroll_payment_bank_account: newPaymentBank || undefined,
        payroll_payment_remarks: newPaymentRemarks || undefined,
        company_id: payroll?.company_id || undefined,
      });

      // Handle file uploads if any files are selected
      if (paymentFiles.length > 0 && res.data?.id) {
        setPaymentFileUploading(true);
        try {
          for (const file of paymentFiles) {
            const formData = new FormData();
            formData.append('file', file);
            await attachmentsApi.upload('payment_out', res.data.id, formData);
          }
        } catch (uploadErr: any) {
          console.error('File upload error:', uploadErr);
          alert('部分文件上傳失敗，但付款記錄已建立');
        } finally {
          setPaymentFileUploading(false);
        }
      }

      setShowAddPayment(false);
      setNewPaymentDate('');
      setNewPaymentAmount('');
      setNewPaymentRef('');
      setNewPaymentMethod('');
      setNewPaymentBank('');
      setNewPaymentRemarks('');
      setNewPaymentCompanyId(payroll?.company_id || null);
      setPaymentFiles([]);
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
      await payrollApi.recalculate(payroll.id);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleRemoveDailyAllowance = async (daId: number) => {
    try {
      await payrollApi.removeDailyAllowance(payroll.id, daId);
      await payrollApi.recalculate(payroll.id);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '移除失敗');
    }
  };

  const handleExcludeBadge = async (date: string, badgeKey: string) => {
    if (!confirm('確定要移除此津貼？')) return;
    try {
      await payrollApi.excludeBadge(payroll.id, { date, badge_key: badgeKey });
      await payrollApi.recalculate(payroll.id);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '移除失敗');
    }
  };

  const handleSaveTopUpOverride = async (date: string, amount: number) => {
    try {
      await payrollApi.addDailyAllowance(payroll.id, {
        date,
        allowance_key: 'base_top_up_override',
        allowance_name: '補底薪手動覆蓋',
        amount,
        remarks: '手動覆蓋補底薪差額',
      });
      await payrollApi.recalculate(payroll.id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存補底薪失敗');
      throw err;
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
  const isDraft = payroll.status === 'draft';
  const selectablePwls = pwls.filter((pwl: any) => isDraft && !pwl.is_excluded);
  const allSelectableSelected = selectablePwls.length > 0 && selectablePwls.every((pwl: any) => selectedPwlIds.has(Number(pwl.id)));
  const pettyCashDeducted = pettyCashRecords
    .filter((r: any) => r.type === 'DEDUCT')
    .reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);
  const pettyCashShortfall = Math.max(0, Number(payroll.reimbursement_total || 0) - pettyCashDeducted);
  const mpfPlan = payroll.mpf_plan || emp?.mpf_plan || 'industry';
  const adjustedMpfBase = Number(payroll.gross_amount || 0) + Number(payroll.adjustment_total || 0);
  const mpfWorkDayCount = new Set(pwls.map((pwl: any) => String(pwl.scheduled_date).slice(0, 10))).size;
  const defaultMpfRelevantIncome =
    mpfPlan === 'industry'
      ? (mpfWorkDayCount > 0 ? adjustedMpfBase / mpfWorkDayCount : 0)
      : adjustedMpfBase;
  const displayMpfRelevantIncome =
    payroll.mpf_relevant_income !== null && payroll.mpf_relevant_income !== undefined
      ? Number(payroll.mpf_relevant_income)
      : defaultMpfRelevantIncome;
  const mpfCardTitle =
    mpfPlan === 'industry'
      ? 'MPF 計算 — 行業計劃'
      : mpfPlan === 'exempt_age65'
        ? 'MPF 計算 — 過65歲, 不用供'
        : mpfPlan === 'manulife'
          ? 'MPF 計算 — 宏利：一般計劃 (5%)'
          : mpfPlan === 'aia'
            ? 'MPF 計算 — AIA：一般計劃 (5%)'
            : 'MPF 計算 — 一般計劃 (5%)';
  const MPF_INDUSTRY_TIERS = [
    { min: 0, max: 280, employee: 0 },
    { min: 280, max: 350, employee: 15 },
    { min: 350, max: 450, employee: 20 },
    { min: 450, max: 550, employee: 25 },
    { min: 550, max: 650, employee: 30 },
    { min: 650, max: 750, employee: 35 },
    { min: 750, max: 850, employee: 40 },
    { min: 850, max: 950, employee: 45 },
    { min: 950, max: Infinity, employee: 50 },
  ];
  const industryMpfTier = MPF_INDUSTRY_TIERS.find(
    (t) => displayMpfRelevantIncome > t.min && displayMpfRelevantIncome <= t.max,
  ) || MPF_INDUSTRY_TIERS[MPF_INDUSTRY_TIERS.length - 1];
  const industryEmployeeMpf = industryMpfTier.employee * mpfWorkDayCount;
  const generalEmployeeMpf = Math.min(displayMpfRelevantIncome * 0.05, 1500);
  const employeeMpfAmount =
    mpfPlan === 'industry'
      ? industryEmployeeMpf
      : mpfPlan === 'exempt_age65'
        ? 0
        : generalEmployeeMpf;
  const employerMpfAmount =
    payroll.mpf_employer !== null && payroll.mpf_employer !== undefined
      ? Number(payroll.mpf_employer)
      : employeeMpfAmount;

  const periodStart = payroll.date_from ? new Date(payroll.date_from).getDate() : 1;
  const lastDay = payroll.date_to ? new Date(payroll.date_to).getDate() : 31;

  return (
    <div className="mx-auto w-full max-w-screen-2xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/payroll-records" className="text-gray-400 hover:text-gray-600">← 返回</Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              糧單 #{payroll.id}
              {payroll.employee && (
                <span className="text-gray-600 font-normal ml-2">
                  - {payroll.employee.name_zh || payroll.employee.name_en || '未知'} ({payroll.employee.emp_code || '-'})
                </span>
              )}
            </h1>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[payroll.status] || ''}`}>
            {STATUS_LABELS[payroll.status] || payroll.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <button onClick={handleConfirm} className="btn-primary text-sm">確認糧單</button>
              <button onClick={handleDelete} className="text-sm text-red-500 hover:underline ml-2">刪除</button>
            </>
          )}
	          {payroll.status === 'confirmed' && (
	            <>
	              <button onClick={handleUnconfirm} className="btn-secondary text-sm">撤銷確認</button>
	            </>
	          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <div className="card">
          <p className="text-xs text-gray-500">應收總額</p>
          <p className="font-bold text-lg text-primary-600 font-mono">${Number(payroll.gross_amount).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">自定義津貼/扣款合計 <span className="text-gray-400">(+)</span></p>
          <p className={`font-bold text-lg font-mono ${Number(payroll.adjustment_total) < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {Number(payroll.adjustment_total) < 0 ? '-' : '+'}${Math.abs(Number(payroll.adjustment_total)).toLocaleString()}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">強積金（僱員）5%合計 <span className="text-gray-400">(-)</span></p>
          <p className="font-bold text-lg text-red-600 font-mono">-${Math.abs(Number(payroll.deduction_total)).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">淨薪金</p>
          <p className="font-bold text-lg text-primary-600 font-mono">${Number(payroll.net_amount).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">員工報銷 <span className="text-gray-400">(+)</span></p>
          <p className="font-bold text-lg text-blue-600 font-mono">${Number(payroll.reimbursement_total || 0).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">零用金抵扣 <span className="text-gray-400">(-)</span></p>
          <p className="font-bold text-lg text-green-700 font-mono">-${pettyCashDeducted.toLocaleString()}</p>
        </div>
        <div className="card border-primary-200 bg-primary-50">
          <p className="text-xs text-primary-600 font-semibold">應付總額</p>
          <p className="font-bold text-xl text-primary-700 font-mono">
            ${(Number(payroll.net_amount) + Number(payroll.reimbursement_total || 0) - pettyCashDeducted).toLocaleString()}
          </p>
        </div>
      </div>

      {/* ── Single-page Payroll Generation Tabs ── */}
      <div className="card mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">糧單明細</h2>
            <p className="text-sm text-gray-500">
              逐筆明細為預設分頁，可在同一頁直接編輯、排序、篩選及批量修改工作記錄。
            </p>
          </div>
          {isDraft && (
            <div className="flex gap-2">
              <button
                onClick={handleRecalculate}
                className="btn-secondary text-sm border-gray-300 text-gray-600 hover:bg-gray-50"
                title="重新計算糧單項目，保留手動修改的金額"
              >
                重新計算
              </button>
              <button
                onClick={handleResetRefetch}
                className="btn-secondary text-sm border-gray-300 text-gray-600 hover:bg-gray-50"
                title="從工作記錄重新抓取資料並重新計算"
              >
                重新抓取資料
              </button>
            </div>
          )}
        </div>
        <PayrollTabs
          payrollId={payroll.id}
          workLogs={pwls}
          groupedSettlement={grouped}
          dailyCalculation={dailyCalc}
          unmatchedRecords={pwls.filter((p: any) => !p.is_excluded && p.price_match_status !== 'matched')}
          calculationDetails={{
            payroll_summary: {
              gross_amount: payroll.gross_amount,
              adjustment_total: payroll.adjustment_total,
              deduction_total: payroll.deduction_total,
              mpf_employer: payroll.mpf_employer,
              net_amount: payroll.net_amount,
              reimbursement_total: payroll.reimbursement_total,
            },
            items,
            adjustments,
            allowance_options: allowanceOptions,
            mpf_plan: payroll.mpf_plan,
          }}
          payrollSnapshot={payroll}
          readOnly={!isDraft || isReadOnly('payroll')}
        />
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
                  const adjustmentDateLabel = formatAdjustmentDateLabel(adj.adjustment_date);
                  return (
                    <tr key={adj.id} className="border-b">
                      <td className="px-4 py-2 font-medium">{adj.item_name}{adjustmentDateLabel ? ` (${adjustmentDateLabel})` : ''}</td>
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

      {/* ── Employee Reimbursement (員工報銷) ── */}
      <div className="card mb-6">
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

      {/* ── Petty Cash Settlement ── */}
      {pettyCashRecords.length > 0 && <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">零用金結算</h2>
          <Link href={`/employees/${emp?.id}`} className="text-sm text-primary-600 hover:underline">查看員工零用金紀錄</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="rounded-lg bg-green-50 border border-green-100 p-4">
            <p className="text-xs text-gray-500">已用零用金抵扣報銷</p>
            <p className="font-bold text-lg text-green-700 font-mono">-${pettyCashDeducted.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
            <p className="text-xs text-gray-500">報銷超出零用金並加回糧單</p>
            <p className="font-bold text-lg text-blue-700 font-mono">+${pettyCashShortfall.toLocaleString()}</p>
          </div>
        </div>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left">日期</th><th className="px-4 py-2 text-left">類型</th><th className="px-4 py-2 text-right">金額</th><th className="px-4 py-2 text-right">結算後餘額</th><th className="px-4 py-2 text-left">說明</th></tr></thead>
            <tbody>
              {pettyCashRecords.map((r: any) => (
                <tr key={r.id} className="border-b">
                  <td className="px-4 py-2 font-medium">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2">{r.type === 'DEDUCT' ? '扣除報銷' : r.type === 'CARRY_FORWARD' ? 'C/D 結餘' : '調整'}</td>
                  <td className={`px-4 py-2 text-right font-mono ${Number(r.amount) < 0 ? 'text-red-600' : 'text-green-700'}`}>{Number(r.amount) >= 0 ? '+' : '-'}${Math.abs(Number(r.amount)).toLocaleString()}</td>
                  <td className={`px-4 py-2 text-right font-mono ${Number(r.balance) < 0 ? 'text-red-600' : ''}`}>${Number(r.balance).toLocaleString()}</td>
                  <td className="px-4 py-2 text-gray-500">{r.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* ── Summary Cards (bottom) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <div className="card">
          <p className="text-xs text-gray-500">應收總額</p>
          <p className="font-bold text-lg text-primary-600 font-mono">${Number(payroll.gross_amount).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">自定義津貼/扣款合計 <span className="text-gray-400">(+)</span></p>
          <p className={`font-bold text-lg font-mono ${Number(payroll.adjustment_total) < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {Number(payroll.adjustment_total) < 0 ? '-' : '+'}${Math.abs(Number(payroll.adjustment_total)).toLocaleString()}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">強積金（僱員）5%合計 <span className="text-gray-400">(-)</span></p>
          <p className="font-bold text-lg text-red-600 font-mono">-${Math.abs(Number(payroll.deduction_total)).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">淨薪金</p>
          <p className="font-bold text-lg text-primary-600 font-mono">${Number(payroll.net_amount).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">員工報銷 <span className="text-gray-400">(+)</span></p>
          <p className="font-bold text-lg text-blue-600 font-mono">${Number(payroll.reimbursement_total || 0).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">零用金抵扣 <span className="text-gray-400">(-)</span></p>
          <p className="font-bold text-lg text-green-700 font-mono">-${pettyCashDeducted.toLocaleString()}</p>
        </div>
        <div className="card border-primary-200 bg-primary-50">
          <p className="text-xs text-primary-600 font-semibold">應付總額</p>
          <p className="font-bold text-xl text-primary-700 font-mono">
            ${(Number(payroll.net_amount) + Number(payroll.reimbursement_total || 0) - pettyCashDeducted).toLocaleString()}
          </p>
        </div>
      </div>

      {/* ── MPF 計算薪金 ── 放在最底部 */}
      {mpfPlan && mpfPlan !== 'none' && (
        <div className="card mb-6">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-3">{mpfCardTitle}</h2>
              <p className="text-xs text-gray-500 mb-1">
                {mpfPlan === 'industry' ? 'MPF 日薪基數' : 'MPF 計算薪金基數'}
                <span className="text-blue-500 ml-1">
                  {mpfPlan === 'industry'
                    ? '((應收總額 + 自定義津貼/扣款) ÷ 工作天數，可手動覆蓋)'
                    : '(應收總額 + 自定義津貼/扣款，可手動覆蓋)'}
                </span>
              </p>
              {isDraft ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field w-48 font-mono"
                    defaultValue={displayMpfRelevantIncome || ''}
                    onBlur={async (e) => {
                      const val = e.target.value;
                      try {
                        await payrollApi.update(payroll.id, { mpf_relevant_income: val || null });
                        await payrollApi.recalculate(payroll.id, {});
                        await loadData();
                      } catch (err: any) {
                        alert(err.response?.data?.message || '更新失敗');
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await payrollApi.update(payroll.id, { mpf_relevant_income: null });
                        await payrollApi.recalculate(payroll.id, {});
                        await loadData();
                      } catch (err: any) {
                        alert(err.response?.data?.message || '重設失敗');
                      }
                    }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    title={`重設為自動計算值 $${defaultMpfRelevantIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  >
                    重設
                  </button>
                </div>
              ) : (
                <p className="font-bold font-mono">${displayMpfRelevantIncome ? displayMpfRelevantIncome.toLocaleString() : '-'}</p>
              )}
            </div>
            {displayMpfRelevantIncome > 0 && mpfPlan === 'industry' && (
              <div className="flex flex-wrap items-center gap-3 bg-blue-50 rounded-lg px-4 py-2">
                <span className="text-sm text-blue-700 font-medium">行業計劃</span>
                <span className="text-sm text-blue-500">按日薪級別，{mpfWorkDayCount}天，員工供款</span>
                <span className="text-lg font-bold font-mono text-blue-700">
                  ${employeeMpfAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-blue-400 ml-1">
                  (日薪基數 ${displayMpfRelevantIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}，每工作日 $${industryMpfTier.employee})
                </span>
              </div>
            )}
            {displayMpfRelevantIncome > 0 && mpfPlan !== 'industry' && (
              <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-4 py-2">
                <span className="text-sm text-blue-700 font-medium">強積金 5%</span>
                <span className="text-sm text-blue-500">=</span>
                <span className="text-lg font-bold font-mono text-blue-700">
                  ${employeeMpfAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-blue-400 ml-1">
                  {mpfPlan === 'exempt_age65'
                    ? '(過65歲, 不用供)'
                    : `(${displayMpfRelevantIncome.toLocaleString()} × 5%，上限 $1,500)`}
                </span>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-1">強積金（僱主）</p>
              {isDraft ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field w-48 font-mono"
                    defaultValue={employerMpfAmount || ''}
                    onBlur={async (e) => {
                      const val = e.target.value;
                      try {
                        await payrollApi.update(payroll.id, { mpf_employer: val || 0 });
                        await loadData();
                      } catch (err: any) {
                        alert(err.response?.data?.message || '更新失敗');
                      }
                    }}
                  />
                </div>
              ) : (
                <p className="font-bold font-mono">${employerMpfAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Info ── */}
      <div className="card">
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
                  <th className="px-4 py-2 text-left font-medium text-gray-600">付款方法</th>
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
                    <td className="px-4 py-2 text-gray-600">{p.payroll_payment_method || '-'}</td>
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
      </div>

      {/* ── Mark as Paid Modal ── */}
      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="確認已付款">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">確認將此糧單標記為「已付款」？標記後糧單將被鎖定，不可再編輯。</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">付款日期</label>
 <DateInput value={paymentDate} onChange={val => setPaymentDate(val || '')} className="input-field" />
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
              <DateInput value={newPaymentDate} onChange={val => setNewPaymentDate(val || '')} className="input-field" />
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
              <label className="block text-sm font-medium text-gray-700 mb-1">付款方法</label>
              <select value={newPaymentMethod} onChange={e => setNewPaymentMethod(e.target.value)} className="input-field">
                <option value="">請選擇</option>
                {(fieldOptions.payment_method || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">銀行賬戶</label>
            <select value={newPaymentBank} onChange={e => setNewPaymentBank(e.target.value)} className="input-field">
              <option value="">請選擇銀行賬戶</option>
              {bankAccounts.map((ba) => (
                <option key={ba.id} value={ba.id}>
                  {ba.bank_name} - {ba.account_name} ({ba.account_no})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input value={newPaymentRemarks} onChange={e => setNewPaymentRemarks(e.target.value)} className="input-field" placeholder="可選" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">上傳文件（可選）</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition">
              <input
                type="file"
                multiple
                onChange={(e) => setPaymentFiles(Array.from(e.target.files || []))}
                className="hidden"
                id="payment-file-input"
              />
              <label htmlFor="payment-file-input" className="cursor-pointer block">
                <div className="text-gray-600 text-sm">
                  {paymentFiles.length > 0 ? (
                    <div>
                      <div className="font-medium text-gray-700 mb-2">已選擇 {paymentFiles.length} 個文件</div>
                      <ul className="text-xs text-gray-500 space-y-1">
                        {paymentFiles.map((f, i) => (
                          <li key={i}>{f.name}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div>點擊或拖放文件到此處上傳</div>
                  )}
                </div>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowAddPayment(false)} className="btn-secondary">取消</button>
            <button onClick={handleAddPayrollPayment} disabled={!newPaymentDate || !newPaymentAmount || paymentSaving || paymentFileUploading} className="btn-primary">
              {paymentSaving || paymentFileUploading ? '儲存中...' : '確認新增'}
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
              <DateInput value={editForm.scheduled_date}
                onChange={val => setEditForm({ ...editForm, scheduled_date: val || '' })}
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
