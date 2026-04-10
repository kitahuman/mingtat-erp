'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { verificationApi } from '@/lib/api';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

interface ModLog {
  id: number;
  mod_type: string;
  mod_description: string;
  mod_prev_value: any;
  mod_new_value: any;
  mod_ai_confidence: number | null;
  mod_created_at: string;
  message: {
    wa_msg_body: string | null;
    wa_msg_sender_name: string | null;
    wa_msg_timestamp: string | null;
  } | null;
}

interface SummaryItem {
  id: number;
  seq: number;
  order_type: string | null;
  contract_no: string | null;
  customer: string | null;
  work_description: string | null;
  location: string | null;
  driver_nickname: string | null;
  vehicle_no: string | null;
  machine_code: string | null;
  contact_person: string | null;
  slip_write_as: string | null;
  is_suspended: boolean;
  remarks: string | null;
  mod_status: string | null;
  mod_prev_data: any | null;
  mod_logs: ModLog[];
  source_order_id: number;
  source_order_version: number;
}

interface VersionInfo {
  version: number;
  status: string;
  sender: string | null;
  item_count: number;
  ai_confidence: number | null;
  created_at: string;
}

interface MessageInfo {
  id: number;
  sender: string | null;
  body: string | null;
  classification: string | null;
  confidence: number | null;
  timestamp: string | null;
}

interface OrderModLog {
  id: number;
  mod_type: string;
  mod_description: string;
  mod_created_at: string;
  message: {
    wa_msg_body: string | null;
    wa_msg_sender_name: string | null;
    wa_msg_timestamp: string | null;
  } | null;
}

interface DailySummary {
  date: string;
  latest_status: string;
  total_items: number;
  active_items: number;
  cancelled_items: number;
  suspended_items: number;
  reassigned_items: number;
  added_items: number;
  versions: VersionInfo[];
  items: SummaryItem[];
  messages: MessageInfo[];
  order_mod_logs: OrderModLog[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface EditingItem {
  order_type: string;
  contract_no: string;
  customer: string;
  work_description: string;
  location: string;
  driver_nickname: string;
  vehicle_no: string;
  machine_code: string;
  contact_person: string;
  slip_write_as: string;
  is_suspended: boolean;
  remarks: string;
}

// ══════════════════════════════════════════════════════════════
// 工具函數
// ══════════════════════════════════════════════════════════════

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} (星期${weekdays[d.getDay()]})`;
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function extractStaffList(remarks: string | null): { staffList: string[]; teamLeader: string | null; cleanRemarks: string | null } {
  if (!remarks) return { staffList: [], teamLeader: null, cleanRemarks: null };
  let staffList: string[] = [];
  let teamLeader: string | null = null;
  const lines = remarks.split('\n');
  const cleanLines: string[] = [];
  for (const line of lines) {
    const staffMatch = line.match(/^\[staff\]員工:\s*(.+)$/);
    const leaderMatch = line.match(/^\[leader\]帶隊:\s*(.+)$/);
    if (staffMatch) {
      staffList = staffMatch[1].split(/[、,]/).map((s) => s.trim()).filter(Boolean);
    } else if (leaderMatch) {
      teamLeader = leaderMatch[1].trim();
    } else {
      cleanLines.push(line);
    }
  }
  return { staffList, teamLeader, cleanRemarks: cleanLines.join('\n').trim() || null };
}

function groupItemsByType(items: SummaryItem[]) {
  const machinery: SummaryItem[] = [];
  const manpower: SummaryItem[] = [];
  const transport: SummaryItem[] = [];
  const other: SummaryItem[] = [];
  for (const item of items) {
    switch (item.order_type) {
      case 'machinery':
      case 'idle':
        machinery.push(item);
        break;
      case 'manpower':
        manpower.push(item);
        break;
      case 'transport':
        transport.push(item);
        break;
      default:
        other.push(item);
        break;
    }
  }
  return { machinery, manpower, transport, other };
}

function itemToEditingItem(item: SummaryItem): EditingItem {
  return {
    order_type: item.order_type || '',
    contract_no: item.contract_no || '',
    customer: item.customer || '',
    work_description: item.work_description || '',
    location: item.location || '',
    driver_nickname: item.driver_nickname || '',
    vehicle_no: item.vehicle_no || '',
    machine_code: item.machine_code || '',
    contact_person: item.contact_person || '',
    slip_write_as: item.slip_write_as || '',
    is_suspended: item.is_suspended,
    remarks: item.remarks || '',
  };
}

function emptyEditingItem(orderType: string): EditingItem {
  return {
    order_type: orderType,
    contract_no: '',
    customer: '',
    work_description: '',
    location: '',
    driver_nickname: '',
    vehicle_no: '',
    machine_code: '',
    contact_person: '',
    slip_write_as: '',
    is_suspended: false,
    remarks: '',
  };
}

// ══════════════════════════════════════════════════════════════
// 狀態標籤元件
// ══════════════════════════════════════════════════════════════

function ModStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const config: Record<string, { label: string; icon: string; colors: string }> = {
    cancelled: { label: '已取消', icon: 'M6 18L18 6M6 6l12 12', colors: 'bg-red-100 text-red-700' },
    reassigned: { label: '已換人', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', colors: 'bg-orange-100 text-orange-700' },
    suspended: { label: '已暫停', icon: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z', colors: 'bg-yellow-100 text-yellow-700' },
    added: { label: '新增', icon: 'M12 4v16m8-8H4', colors: 'bg-green-100 text-green-700' },
  };
  const c = config[status] || { label: '已修改', icon: '', colors: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium ${c.colors}`}>
      {c.icon && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.icon} />
        </svg>
      )}
      {c.label}
    </span>
  );
}

function ModTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    cancel: { label: '取消', color: 'bg-red-500' },
    reassign: { label: '換人', color: 'bg-orange-500' },
    suspend: { label: '暫停', color: 'bg-yellow-500' },
    resume: { label: '恢復', color: 'bg-green-500' },
    add: { label: '新增', color: 'bg-blue-500' },
    manual_edit: { label: '手動修改', color: 'bg-indigo-500' },
    manual_add: { label: '手動新增', color: 'bg-teal-500' },
    manual_delete: { label: '手動刪除', color: 'bg-red-600' },
    other: { label: '其他', color: 'bg-gray-500' },
  };
  const c = config[type] || config.other;
  return (
    <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] rounded text-white font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}

function ClassificationBadge({ classification }: { classification: string | null }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    order: { label: 'Order', bg: 'bg-blue-100', text: 'text-blue-700' },
    modification: { label: '修改', bg: 'bg-orange-100', text: 'text-orange-700' },
    chat: { label: '對話', bg: 'bg-gray-100', text: 'text-gray-600' },
    error: { label: '錯誤', bg: 'bg-red-100', text: 'text-red-600' },
  };
  const c = config[classification || ''] || { label: classification || '—', bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function OrderTypeBadge({ type }: { type: string | null }) {
  const config: Record<string, { label: string; colors: string }> = {
    machinery: { label: '機械', colors: 'bg-purple-100 text-purple-700 border-purple-200' },
    manpower: { label: '人手', colors: 'bg-blue-100 text-blue-700 border-blue-200' },
    transport: { label: '運輸', colors: 'bg-teal-100 text-teal-700 border-teal-200' },
    idle: { label: '閒置', colors: 'bg-gray-100 text-gray-600 border-gray-200' },
    notice: { label: '通知', colors: 'bg-amber-100 text-amber-700 border-amber-200' },
    leave: { label: '請假', colors: 'bg-pink-100 text-pink-700 border-pink-200' },
  };
  const c = config[type || ''] || { label: type || '其他', colors: 'bg-gray-100 text-gray-600 border-gray-200' };
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 text-xs rounded-full font-medium border ${c.colors}`}>
      {c.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// 修改歷史行
// ══════════════════════════════════════════════════════════════

function ModLogRow({ log }: { log: ModLog }) {
  return (
    <div className="flex items-start gap-2 mb-2 text-xs">
      <ModTypeBadge type={log.mod_type} />
      <div className="flex-1 min-w-0">
        <div className="text-gray-700">{log.mod_description}</div>
        {log.message && (
          <div className="mt-0.5 bg-white rounded px-2 py-1 text-gray-500 border">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-medium">{log.message.wa_msg_sender_name || '未知'}</span>
              <span className="text-gray-300">|</span>
              <span>{formatDateTime(log.message.wa_msg_timestamp)}</span>
            </div>
            <div className="mt-0.5 text-gray-600 whitespace-pre-wrap break-words max-h-20 overflow-y-auto">
              &ldquo;{(log.message.wa_msg_body || '').substring(0, 200)}{(log.message.wa_msg_body || '').length > 200 ? '...' : ''}&rdquo;
            </div>
          </div>
        )}
      </div>
      <span className="text-gray-400 whitespace-nowrap flex-shrink-0">
        {formatDateTime(log.mod_created_at)}
      </span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 行樣式和換人對比
// ══════════════════════════════════════════════════════════════

function getRowBg(item: SummaryItem) {
  switch (item.mod_status) {
    case 'cancelled': return 'bg-red-50 hover:bg-red-100/60';
    case 'reassigned': return 'bg-orange-50 hover:bg-orange-100/60';
    case 'suspended': return 'bg-yellow-50 hover:bg-yellow-100/60';
    case 'added': return 'bg-green-50 hover:bg-green-100/60';
    default: return item.is_suspended ? 'bg-yellow-50 hover:bg-yellow-100/60' : 'hover:bg-gray-50/60';
  }
}

function ReassignInfo({ item }: { item: SummaryItem }) {
  if (item.mod_status !== 'reassigned' || !item.mod_prev_data) return null;
  const prev = item.mod_prev_data;
  const changes: JSX.Element[] = [];
  if (prev.wa_item_driver_nickname && prev.wa_item_driver_nickname !== item.driver_nickname) {
    changes.push(
      <span key="driver" className="inline-flex items-center gap-1 text-xs">
        <span className="text-gray-400 line-through">{prev.wa_item_driver_nickname}</span>
        <span className="text-orange-500">→</span>
        <span className="font-medium text-orange-700">{item.driver_nickname}</span>
      </span>
    );
  }
  if (prev.wa_item_vehicle_no && prev.wa_item_vehicle_no !== item.vehicle_no) {
    changes.push(
      <span key="vehicle" className="inline-flex items-center gap-1 text-xs">
        <span className="text-gray-400 line-through">{prev.wa_item_vehicle_no}</span>
        <span className="text-orange-500">→</span>
        <span className="font-medium text-orange-700">{item.vehicle_no}</span>
      </span>
    );
  }
  if (changes.length === 0) return null;
  return <div className="flex flex-col gap-0.5 mt-0.5">{changes}</div>;
}

function StatusCell({ item }: { item: SummaryItem }) {
  return (
    <div>
      {item.mod_status ? (
        <ModStatusBadge status={item.mod_status} />
      ) : item.is_suspended ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 font-medium">暫停</span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-400 font-medium">正常</span>
      )}
      <ReassignInfo item={item} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 編輯用 Input 元件
// ══════════════════════════════════════════════════════════════

function EditInput({ value, onChange, placeholder, className = '' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`border border-blue-300 rounded px-1.5 py-1 text-xs w-full bg-blue-50/30 focus:outline-none focus:ring-1 focus:ring-blue-400 ${className}`}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function EditCheckbox({ checked, onChange, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span>{label}</span>
    </label>
  );
}

// ══════════════════════════════════════════════════════════════
// 操作按鈕
// ══════════════════════════════════════════════════════════════

function ActionButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onEdit}
        className="p-1 rounded hover:bg-blue-100 text-blue-500 transition"
        title="編輯"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        onClick={onDelete}
        className="p-1 rounded hover:bg-red-100 text-red-400 transition"
        title="刪除"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

function SaveCancelButtons({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onSave}
        disabled={saving}
        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {saving ? '...' : '儲存'}
      </button>
      <button
        onClick={onCancel}
        disabled={saving}
        className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 disabled:opacity-50 transition"
      >
        取消
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 刪除確認 Modal
// ══════════════════════════════════════════════════════════════

function DeleteConfirmModal({ item, onConfirm, onCancel, deleting }: {
  item: SummaryItem;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">確認刪除</h3>
        <p className="text-sm text-gray-600 mb-4">
          確定要刪除以下項目嗎？此操作無法復原。
        </p>
        <div className="bg-gray-50 rounded p-3 mb-4 text-xs space-y-1">
          <div><span className="text-gray-400">類型：</span><OrderTypeBadge type={item.order_type} /></div>
          {item.contract_no && <div><span className="text-gray-400">合約：</span>{item.contract_no}</div>}
          {item.machine_code && <div><span className="text-gray-400">DC 編號：</span>{item.machine_code}</div>}
          {item.driver_nickname && <div><span className="text-gray-400">司機/操作員：</span>{item.driver_nickname}</div>}
          {item.vehicle_no && <div><span className="text-gray-400">車牌：</span>{item.vehicle_no}</div>}
          {item.work_description && <div><span className="text-gray-400">工作：</span>{item.work_description}</div>}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition"
          >
            {deleting ? '刪除中...' : '確認刪除'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 新增 Item Modal
// ══════════════════════════════════════════════════════════════

function AddItemModal({ orderType, orderId, onSave, onCancel, saving }: {
  orderType: string;
  orderId: number;
  onSave: (data: EditingItem) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<EditingItem>(emptyEditingItem(orderType));
  const update = (field: keyof EditingItem, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  const fields = (() => {
    switch (orderType) {
      case 'machinery':
        return [
          { key: 'contract_no', label: '合約' },
          { key: 'location', label: '地點' },
          { key: 'machine_code', label: 'DC 編號' },
          { key: 'driver_nickname', label: '操作員' },
          { key: 'work_description', label: '工作描述' },
          { key: 'customer', label: '客戶' },
          { key: 'remarks', label: '備註' },
        ];
      case 'manpower':
        return [
          { key: 'contract_no', label: '合約' },
          { key: 'work_description', label: '工作描述' },
          { key: 'location', label: '地點' },
          { key: 'driver_nickname', label: '帶隊人' },
          { key: 'remarks', label: '員工列表（頓號分隔）' },
          { key: 'customer', label: '客戶' },
        ];
      case 'transport':
        return [
          { key: 'customer', label: '客戶' },
          { key: 'contract_no', label: '合約' },
          { key: 'work_description', label: '路線/工作描述' },
          { key: 'location', label: '地點' },
          { key: 'driver_nickname', label: '司機' },
          { key: 'vehicle_no', label: '車牌' },
          { key: 'contact_person', label: '聯絡人' },
          { key: 'remarks', label: '備註' },
        ];
      default:
        return [
          { key: 'work_description', label: '描述' },
          { key: 'driver_nickname', label: '人員' },
          { key: 'remarks', label: '備註' },
        ];
    }
  })();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg mx-4 w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">新增項目</h3>
        <p className="text-xs text-gray-500 mb-4">
          <OrderTypeBadge type={orderType} /> Order #{orderId}
        </p>
        <div className="space-y-3">
          {fields.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                type="text"
                value={(form as any)[key] || ''}
                onChange={(e) => update(key as keyof EditingItem, e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          ))}
          <EditCheckbox
            checked={form.is_suspended}
            onChange={(v) => update('is_suspended', v)}
            label="暫停"
          />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
          >
            取消
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? '新增中...' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 機械調配表格（含 CRUD）
// ══════════════════════════════════════════════════════════════

function MachineryTable({ items, expandedItemLogs, toggleItemLog, editingId, editForm, onStartEdit, onCancelEdit, onSaveEdit, onDelete, saving }: {
  items: SummaryItem[];
  expandedItemLogs: Set<number>;
  toggleItemLog: (id: number) => void;
  editingId: number | null;
  editForm: EditingItem | null;
  onStartEdit: (item: SummaryItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (item: SummaryItem) => void;
  saving: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border-b">
        <OrderTypeBadge type="machinery" />
        <span className="text-sm font-medium text-purple-800">機械調配</span>
        <span className="text-xs text-purple-500">({items.length} 項)</span>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs border-b">
              <th className="px-3 py-2 text-left font-medium w-8">#</th>
              <th className="px-3 py-2 text-left font-medium w-24">狀態</th>
              <th className="px-3 py-2 text-left font-medium min-w-[100px]">合約</th>
              <th className="px-3 py-2 text-left font-medium min-w-[120px]">地點</th>
              <th className="px-3 py-2 text-left font-medium w-20">DC 編號</th>
              <th className="px-3 py-2 text-left font-medium w-20">操作員</th>
              <th className="px-3 py-2 text-left font-medium min-w-[120px]">工作描述</th>
              <th className="px-3 py-2 text-left font-medium min-w-[80px]">備註</th>
              <th className="px-3 py-2 text-center font-medium w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing = editingId === item.id;
              const isItemExpanded = expandedItemLogs.has(item.id);
              const hasLogs = item.mod_logs.length > 0;
              const isCancelled = item.mod_status === 'cancelled';
              const textClass = isCancelled ? 'line-through text-gray-400' : '';

              if (isEditing && editForm) {
                return (
                  <tr key={item.id} className="border-b bg-blue-50/50">
                    <td className="px-3 py-2 text-gray-400 text-xs">{item.seq}</td>
                    <td className="px-3 py-2">
                      <EditCheckbox checked={editForm.is_suspended} onChange={(v) => { editForm.is_suspended = v; onStartEdit({ ...item }); }} label="暫停" />
                    </td>
                    <td className="px-3 py-2"><EditInput value={editForm.contract_no} onChange={(v) => { editForm.contract_no = v; }} placeholder="合約" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.location} onChange={(v) => { editForm.location = v; }} placeholder="地點" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.machine_code} onChange={(v) => { editForm.machine_code = v; }} placeholder="DC編號" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.driver_nickname} onChange={(v) => { editForm.driver_nickname = v; }} placeholder="操作員" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.work_description} onChange={(v) => { editForm.work_description = v; }} placeholder="工作描述" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.remarks} onChange={(v) => { editForm.remarks = v; }} placeholder="備註" /></td>
                    <td className="px-3 py-2 text-center"><SaveCancelButtons onSave={onSaveEdit} onCancel={onCancelEdit} saving={saving} /></td>
                  </tr>
                );
              }

              return (
                <Fragment key={item.id}>
                  <tr
                    className={`border-b transition-colors ${getRowBg(item)} ${hasLogs ? 'cursor-pointer' : ''}`}
                    onClick={() => hasLogs && toggleItemLog(item.id)}
                  >
                    <td className={`px-3 py-2 text-gray-400 text-xs ${isCancelled ? 'line-through' : ''}`}>{item.seq}</td>
                    <td className="px-3 py-2"><StatusCell item={item} /></td>
                    <td className={`px-3 py-2 text-xs ${textClass}`}>
                      {item.contract_no && <div className="font-mono font-medium">{item.contract_no}</div>}
                      {item.customer && <div className="text-gray-500">{item.customer}</div>}
                      {!item.contract_no && !item.customer && <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-xs max-w-[160px] ${textClass}`}>
                      <div className="truncate" title={item.location || ''}>{item.location || '—'}</div>
                    </td>
                    <td className={`px-3 py-2 text-xs font-mono font-bold ${isCancelled ? 'line-through text-gray-400' : 'text-purple-700'}`}>
                      {item.machine_code || '—'}
                    </td>
                    <td className={`px-3 py-2 text-xs font-medium ${textClass}`}>{item.driver_nickname || '—'}</td>
                    <td className={`px-3 py-2 text-xs max-w-[150px] ${textClass}`}>
                      <div className="truncate" title={item.work_description || ''}>{item.work_description || '—'}</div>
                    </td>
                    <td className={`px-3 py-2 text-xs text-gray-500 max-w-[120px] ${textClass}`}>
                      <div className="truncate" title={item.remarks || ''}>{item.remarks || '—'}</div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <ActionButtons onEdit={() => onStartEdit(item)} onDelete={() => onDelete(item)} />
                    </td>
                  </tr>
                  {isItemExpanded && hasLogs && (
                    <tr className="bg-orange-50/40">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="border-l-2 border-orange-300 pl-3">
                          <div className="text-xs font-medium text-gray-500 mb-2">修改歷史 ({item.mod_logs.length})</div>
                          {item.mod_logs.map((log) => <ModLogRow key={log.id} log={log} />)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* 手機版卡片 */}
      <div className="md:hidden divide-y">
        {items.map((item) => (
          <MobileItemCard key={item.id} item={item} expandedItemLogs={expandedItemLogs} toggleItemLog={toggleItemLog} onEdit={() => onStartEdit(item)} onDelete={() => onDelete(item)} />
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 工程部員工表格（含 CRUD）
// ══════════════════════════════════════════════════════════════

function ManpowerTable({ items, expandedItemLogs, toggleItemLog, editingId, editForm, onStartEdit, onCancelEdit, onSaveEdit, onDelete, saving }: {
  items: SummaryItem[];
  expandedItemLogs: Set<number>;
  toggleItemLog: (id: number) => void;
  editingId: number | null;
  editForm: EditingItem | null;
  onStartEdit: (item: SummaryItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (item: SummaryItem) => void;
  saving: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b">
        <OrderTypeBadge type="manpower" />
        <span className="text-sm font-medium text-blue-800">工程部員工</span>
        <span className="text-xs text-blue-500">({items.length} 項)</span>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs border-b">
              <th className="px-3 py-2 text-left font-medium w-8">#</th>
              <th className="px-3 py-2 text-left font-medium w-24">狀態</th>
              <th className="px-3 py-2 text-left font-medium min-w-[100px]">合約</th>
              <th className="px-3 py-2 text-left font-medium min-w-[140px]">工作描述</th>
              <th className="px-3 py-2 text-left font-medium min-w-[100px]">地點</th>
              <th className="px-3 py-2 text-left font-medium w-20">帶隊人</th>
              <th className="px-3 py-2 text-left font-medium min-w-[200px]">員工列表</th>
              <th className="px-3 py-2 text-left font-medium w-14">人數</th>
              <th className="px-3 py-2 text-center font-medium w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing = editingId === item.id;
              const isItemExpanded = expandedItemLogs.has(item.id);
              const hasLogs = item.mod_logs.length > 0;
              const isCancelled = item.mod_status === 'cancelled';
              const textClass = isCancelled ? 'line-through text-gray-400' : '';
              const { staffList, teamLeader, cleanRemarks } = extractStaffList(item.remarks);
              const leader = teamLeader || item.driver_nickname;
              const staffCount = staffList.length + (leader ? 1 : 0);

              if (isEditing && editForm) {
                return (
                  <tr key={item.id} className="border-b bg-blue-50/50">
                    <td className="px-3 py-2 text-gray-400 text-xs">{item.seq}</td>
                    <td className="px-3 py-2">
                      <EditCheckbox checked={editForm.is_suspended} onChange={(v) => { editForm.is_suspended = v; onStartEdit({ ...item }); }} label="暫停" />
                    </td>
                    <td className="px-3 py-2"><EditInput value={editForm.contract_no} onChange={(v) => { editForm.contract_no = v; }} placeholder="合約" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.work_description} onChange={(v) => { editForm.work_description = v; }} placeholder="工作描述" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.location} onChange={(v) => { editForm.location = v; }} placeholder="地點" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.driver_nickname} onChange={(v) => { editForm.driver_nickname = v; }} placeholder="帶隊人" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.remarks} onChange={(v) => { editForm.remarks = v; }} placeholder="員工（頓號分隔）" /></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-center"><SaveCancelButtons onSave={onSaveEdit} onCancel={onCancelEdit} saving={saving} /></td>
                  </tr>
                );
              }

              return (
                <Fragment key={item.id}>
                  <tr
                    className={`border-b transition-colors ${getRowBg(item)} ${hasLogs ? 'cursor-pointer' : ''}`}
                    onClick={() => hasLogs && toggleItemLog(item.id)}
                  >
                    <td className={`px-3 py-2 text-gray-400 text-xs ${isCancelled ? 'line-through' : ''}`}>{item.seq}</td>
                    <td className="px-3 py-2"><StatusCell item={item} /></td>
                    <td className={`px-3 py-2 text-xs ${textClass}`}>
                      {item.contract_no ? <span className="font-mono font-medium">{item.contract_no}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-xs max-w-[180px] ${textClass}`}>
                      <div className="truncate" title={item.work_description || ''}>{item.work_description || '—'}</div>
                    </td>
                    <td className={`px-3 py-2 text-xs max-w-[140px] ${textClass}`}>
                      <div className="truncate" title={item.location || ''}>{item.location || '—'}</div>
                    </td>
                    <td className={`px-3 py-2 text-xs font-medium ${isCancelled ? 'line-through text-gray-400' : 'text-blue-700'}`}>
                      {leader || '—'}
                    </td>
                    <td className={`px-3 py-2 text-xs ${textClass}`}>
                      {staffList.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {staffList.map((s, i) => (
                            <span key={i} className="inline-block bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 text-blue-700 text-[11px]">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-xs text-center ${textClass}`}>
                      {staffCount > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                          {staffCount}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <ActionButtons onEdit={() => onStartEdit(item)} onDelete={() => onDelete(item)} />
                    </td>
                  </tr>
                  {isItemExpanded && hasLogs && (
                    <tr className="bg-orange-50/40">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="border-l-2 border-orange-300 pl-3">
                          <div className="text-xs font-medium text-gray-500 mb-2">修改歷史 ({item.mod_logs.length})</div>
                          {item.mod_logs.map((log) => <ModLogRow key={log.id} log={log} />)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y">
        {items.map((item) => (
          <MobileItemCard key={item.id} item={item} expandedItemLogs={expandedItemLogs} toggleItemLog={toggleItemLog} onEdit={() => onStartEdit(item)} onDelete={() => onDelete(item)} />
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 泥車/運輸表格（含 CRUD）
// ══════════════════════════════════════════════════════════════

function TransportTable({ items, expandedItemLogs, toggleItemLog, editingId, editForm, onStartEdit, onCancelEdit, onSaveEdit, onDelete, saving }: {
  items: SummaryItem[];
  expandedItemLogs: Set<number>;
  toggleItemLog: (id: number) => void;
  editingId: number | null;
  editForm: EditingItem | null;
  onStartEdit: (item: SummaryItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (item: SummaryItem) => void;
  saving: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-4 py-2 bg-teal-50 border-b">
        <OrderTypeBadge type="transport" />
        <span className="text-sm font-medium text-teal-800">泥車/運輸</span>
        <span className="text-xs text-teal-500">({items.length} 項)</span>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs border-b">
              <th className="px-3 py-2 text-left font-medium w-8">#</th>
              <th className="px-3 py-2 text-left font-medium w-24">狀態</th>
              <th className="px-3 py-2 text-left font-medium min-w-[80px]">客戶</th>
              <th className="px-3 py-2 text-left font-medium min-w-[80px]">合約</th>
              <th className="px-3 py-2 text-left font-medium min-w-[160px]">路線/工作描述</th>
              <th className="px-3 py-2 text-left font-medium w-20">司機</th>
              <th className="px-3 py-2 text-left font-medium w-20">車牌</th>
              <th className="px-3 py-2 text-left font-medium min-w-[100px]">聯絡人</th>
              <th className="px-3 py-2 text-left font-medium min-w-[80px]">備註</th>
              <th className="px-3 py-2 text-center font-medium w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing = editingId === item.id;
              const isItemExpanded = expandedItemLogs.has(item.id);
              const hasLogs = item.mod_logs.length > 0;
              const isCancelled = item.mod_status === 'cancelled';
              const textClass = isCancelled ? 'line-through text-gray-400' : '';

              if (isEditing && editForm) {
                return (
                  <tr key={item.id} className="border-b bg-blue-50/50">
                    <td className="px-3 py-2 text-gray-400 text-xs">{item.seq}</td>
                    <td className="px-3 py-2">
                      <EditCheckbox checked={editForm.is_suspended} onChange={(v) => { editForm.is_suspended = v; onStartEdit({ ...item }); }} label="暫停" />
                    </td>
                    <td className="px-3 py-2"><EditInput value={editForm.customer} onChange={(v) => { editForm.customer = v; }} placeholder="客戶" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.contract_no} onChange={(v) => { editForm.contract_no = v; }} placeholder="合約" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.work_description} onChange={(v) => { editForm.work_description = v; }} placeholder="路線/工作描述" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.driver_nickname} onChange={(v) => { editForm.driver_nickname = v; }} placeholder="司機" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.vehicle_no} onChange={(v) => { editForm.vehicle_no = v; }} placeholder="車牌" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.contact_person} onChange={(v) => { editForm.contact_person = v; }} placeholder="聯絡人" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.remarks} onChange={(v) => { editForm.remarks = v; }} placeholder="備註" /></td>
                    <td className="px-3 py-2 text-center"><SaveCancelButtons onSave={onSaveEdit} onCancel={onCancelEdit} saving={saving} /></td>
                  </tr>
                );
              }

              return (
                <Fragment key={item.id}>
                  <tr
                    className={`border-b transition-colors ${getRowBg(item)} ${hasLogs ? 'cursor-pointer' : ''}`}
                    onClick={() => hasLogs && toggleItemLog(item.id)}
                  >
                    <td className={`px-3 py-2 text-gray-400 text-xs ${isCancelled ? 'line-through' : ''}`}>{item.seq}</td>
                    <td className="px-3 py-2"><StatusCell item={item} /></td>
                    <td className={`px-3 py-2 text-xs font-medium ${textClass}`}>{item.customer || '—'}</td>
                    <td className={`px-3 py-2 text-xs ${textClass}`}>
                      {item.contract_no ? <span className="font-mono">{item.contract_no}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-xs max-w-[200px] ${textClass}`}>
                      <div className="truncate" title={`${item.work_description || ''} ${item.location || ''}`}>
                        {item.location || item.work_description || '—'}
                      </div>
                      {item.location && item.work_description && item.location !== item.work_description && (
                        <div className="text-gray-400 truncate text-[10px]">{item.work_description}</div>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-xs font-medium ${isCancelled ? 'line-through text-gray-400' : 'text-teal-700'}`}>
                      {item.driver_nickname || '—'}
                    </td>
                    <td className={`px-3 py-2 text-xs font-mono font-bold ${isCancelled ? 'line-through text-gray-400' : 'text-teal-700'}`}>
                      {item.vehicle_no || '—'}
                    </td>
                    <td className={`px-3 py-2 text-xs ${textClass}`}>{item.contact_person || '—'}</td>
                    <td className={`px-3 py-2 text-xs text-gray-500 max-w-[100px] ${textClass}`}>
                      <div className="truncate" title={item.remarks || ''}>{item.remarks || '—'}</div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <ActionButtons onEdit={() => onStartEdit(item)} onDelete={() => onDelete(item)} />
                    </td>
                  </tr>
                  {isItemExpanded && hasLogs && (
                    <tr className="bg-orange-50/40">
                      <td colSpan={10} className="px-4 py-3">
                        <div className="border-l-2 border-orange-300 pl-3">
                          <div className="text-xs font-medium text-gray-500 mb-2">修改歷史 ({item.mod_logs.length})</div>
                          {item.mod_logs.map((log) => <ModLogRow key={log.id} log={log} />)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y">
        {items.map((item) => (
          <MobileItemCard key={item.id} item={item} expandedItemLogs={expandedItemLogs} toggleItemLog={toggleItemLog} onEdit={() => onStartEdit(item)} onDelete={() => onDelete(item)} />
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 其他/雜項表格（含 CRUD）
// ══════════════════════════════════════════════════════════════

function OtherTable({ items, expandedItemLogs, toggleItemLog, editingId, editForm, onStartEdit, onCancelEdit, onSaveEdit, onDelete, saving }: {
  items: SummaryItem[];
  expandedItemLogs: Set<number>;
  toggleItemLog: (id: number) => void;
  editingId: number | null;
  editForm: EditingItem | null;
  onStartEdit: (item: SummaryItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (item: SummaryItem) => void;
  saving: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b">
        <OrderTypeBadge type="notice" />
        <span className="text-sm font-medium text-amber-800">其他/雜項</span>
        <span className="text-xs text-amber-500">({items.length} 項)</span>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs border-b">
              <th className="px-3 py-2 text-left font-medium w-8">#</th>
              <th className="px-3 py-2 text-left font-medium w-24">類型</th>
              <th className="px-3 py-2 text-left font-medium w-24">狀態</th>
              <th className="px-3 py-2 text-left font-medium min-w-[140px]">描述</th>
              <th className="px-3 py-2 text-left font-medium min-w-[100px]">人員</th>
              <th className="px-3 py-2 text-left font-medium min-w-[120px]">備註</th>
              <th className="px-3 py-2 text-center font-medium w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing = editingId === item.id;
              const isItemExpanded = expandedItemLogs.has(item.id);
              const hasLogs = item.mod_logs.length > 0;
              const isCancelled = item.mod_status === 'cancelled';
              const textClass = isCancelled ? 'line-through text-gray-400' : '';

              if (isEditing && editForm) {
                return (
                  <tr key={item.id} className="border-b bg-blue-50/50">
                    <td className="px-3 py-2 text-gray-400 text-xs">{item.seq}</td>
                    <td className="px-3 py-2"><OrderTypeBadge type={item.order_type} /></td>
                    <td className="px-3 py-2">
                      <EditCheckbox checked={editForm.is_suspended} onChange={(v) => { editForm.is_suspended = v; onStartEdit({ ...item }); }} label="暫停" />
                    </td>
                    <td className="px-3 py-2"><EditInput value={editForm.work_description} onChange={(v) => { editForm.work_description = v; }} placeholder="描述" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.driver_nickname} onChange={(v) => { editForm.driver_nickname = v; }} placeholder="人員" /></td>
                    <td className="px-3 py-2"><EditInput value={editForm.remarks} onChange={(v) => { editForm.remarks = v; }} placeholder="備註" /></td>
                    <td className="px-3 py-2 text-center"><SaveCancelButtons onSave={onSaveEdit} onCancel={onCancelEdit} saving={saving} /></td>
                  </tr>
                );
              }

              return (
                <Fragment key={item.id}>
                  <tr
                    className={`border-b transition-colors ${getRowBg(item)} ${hasLogs ? 'cursor-pointer' : ''}`}
                    onClick={() => hasLogs && toggleItemLog(item.id)}
                  >
                    <td className={`px-3 py-2 text-gray-400 text-xs ${isCancelled ? 'line-through' : ''}`}>{item.seq}</td>
                    <td className="px-3 py-2"><OrderTypeBadge type={item.order_type} /></td>
                    <td className="px-3 py-2"><StatusCell item={item} /></td>
                    <td className={`px-3 py-2 text-xs ${textClass}`}>{item.work_description || item.location || '—'}</td>
                    <td className={`px-3 py-2 text-xs font-medium ${textClass}`}>{item.driver_nickname || '—'}</td>
                    <td className={`px-3 py-2 text-xs text-gray-500 ${textClass}`}>{item.remarks || '—'}</td>
                    <td className="px-2 py-2 text-center">
                      <ActionButtons onEdit={() => onStartEdit(item)} onDelete={() => onDelete(item)} />
                    </td>
                  </tr>
                  {isItemExpanded && hasLogs && (
                    <tr className="bg-orange-50/40">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="border-l-2 border-orange-300 pl-3">
                          <div className="text-xs font-medium text-gray-500 mb-2">修改歷史 ({item.mod_logs.length})</div>
                          {item.mod_logs.map((log) => <ModLogRow key={log.id} log={log} />)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y">
        {items.map((item) => (
          <MobileItemCard key={item.id} item={item} expandedItemLogs={expandedItemLogs} toggleItemLog={toggleItemLog} onEdit={() => onStartEdit(item)} onDelete={() => onDelete(item)} />
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 手機版卡片（含編輯/刪除按鈕）
// ══════════════════════════════════════════════════════════════

function MobileItemCard({ item, expandedItemLogs, toggleItemLog, onEdit, onDelete }: {
  item: SummaryItem;
  expandedItemLogs: Set<number>;
  toggleItemLog: (id: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isItemExpanded = expandedItemLogs.has(item.id);
  const hasLogs = item.mod_logs.length > 0;
  const isCancelled = item.mod_status === 'cancelled';
  const cardBg = (() => {
    switch (item.mod_status) {
      case 'cancelled': return 'bg-red-50';
      case 'reassigned': return 'bg-orange-50';
      case 'suspended': return 'bg-yellow-50';
      case 'added': return 'bg-green-50';
      default: return item.is_suspended ? 'bg-yellow-50' : 'bg-white';
    }
  })();
  const { staffList, teamLeader, cleanRemarks } = extractStaffList(item.remarks);

  return (
    <div className={`${cardBg} px-4 py-3`}>
      <div className="flex items-center justify-between mb-2">
        <div
          className={`flex items-center gap-2 flex-wrap flex-1 ${hasLogs ? 'cursor-pointer' : ''}`}
          onClick={() => hasLogs && toggleItemLog(item.id)}
        >
          <span className="text-xs text-gray-400 font-mono">#{item.seq}</span>
          <OrderTypeBadge type={item.order_type} />
          <StatusCell item={item} />
          {hasLogs && (
            <span className={`text-xs text-gray-400 transition-transform inline-block ${isItemExpanded ? 'rotate-90' : ''}`}>▶</span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-blue-100 text-blue-500 transition" title="編輯">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-100 text-red-400 transition" title="刪除">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mt-2 ${isCancelled ? 'line-through text-gray-400' : ''}`}>
        {(item.customer || item.contract_no) && (
          <div>
            <div className="text-gray-400 text-[10px]">客戶/合約</div>
            <div className="font-medium">{item.customer || '—'}</div>
            {item.contract_no && <div className="text-gray-400 font-mono text-[10px]">{item.contract_no}</div>}
          </div>
        )}
        {item.work_description && (
          <div>
            <div className="text-gray-400 text-[10px]">工作描述</div>
            <div>{item.work_description}</div>
          </div>
        )}
        {item.location && (
          <div>
            <div className="text-gray-400 text-[10px]">地點/路線</div>
            <div>{item.location}</div>
          </div>
        )}
        {item.driver_nickname && (
          <div>
            <div className="text-gray-400 text-[10px]">{item.order_type === 'manpower' ? '帶隊人' : item.order_type === 'machinery' ? '操作員' : '司機'}</div>
            <div className="font-medium">{item.driver_nickname}</div>
          </div>
        )}
        {item.vehicle_no && (
          <div>
            <div className="text-gray-400 text-[10px]">車牌</div>
            <div className="font-mono">{item.vehicle_no}</div>
          </div>
        )}
        {item.machine_code && (
          <div>
            <div className="text-gray-400 text-[10px]">DC 編號</div>
            <div className="font-mono font-bold">{item.machine_code}</div>
          </div>
        )}
        {staffList.length > 0 && (
          <div className="col-span-2">
            <div className="text-gray-400 text-[10px]">員工列表 ({staffList.length}人)</div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {staffList.map((s, i) => (
                <span key={i} className="inline-block bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 text-blue-700 text-[11px]">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {item.contact_person && (
          <div>
            <div className="text-gray-400 text-[10px]">聯絡人</div>
            <div>{item.contact_person}</div>
          </div>
        )}
        {(cleanRemarks || (!staffList.length && item.remarks)) && (
          <div className="col-span-2">
            <div className="text-gray-400 text-[10px]">備註</div>
            <div className="text-gray-500">{cleanRemarks || item.remarks}</div>
          </div>
        )}
      </div>

      {isItemExpanded && hasLogs && (
        <div className="mt-3 border-l-2 border-orange-300 pl-3">
          <div className="text-xs font-medium text-gray-500 mb-1.5">修改歷史 ({item.mod_logs.length})</div>
          {item.mod_logs.map((log) => <ModLogRow key={log.id} log={log} />)}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 主頁面組件
// ══════════════════════════════════════════════════════════════

export default function WhatsAppDailySummaryPage() {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [expandedItemLogs, setExpandedItemLogs] = useState<Set<number>>(new Set());

  // CRUD 狀態
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditingItem | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ item: SummaryItem; orderId: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addingType, setAddingType] = useState<{ orderType: string; orderId: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await verificationApi.getWhatsappDailySummaries({
        page,
        limit: 20,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        search: search || undefined,
      });
      setSummaries(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Failed to fetch daily summaries:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleMessages = (date: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleItemLog = (itemId: number) => {
    setExpandedItemLogs((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // ── CRUD 操作 ──────────────────────────────────────────────

  const handleStartEdit = (item: SummaryItem) => {
    setEditingId(item.id);
    setEditForm(itemToEditingItem(item));
    setEditingOrderId(item.source_order_id);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setEditingOrderId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm || !editingOrderId) return;
    setSaving(true);
    try {
      const res = await verificationApi.updateWhatsappOrderItem(editingOrderId, editingId, editForm);
      if (res.data.success) {
        showToast('已儲存修改', 'success');
        handleCancelEdit();
        fetchData(pagination.page);
      } else {
        showToast(res.data.reason === 'no_changes' ? '沒有變更' : '儲存失敗', 'error');
      }
    } catch (err) {
      console.error('Failed to update item:', err);
      showToast('儲存失敗', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: SummaryItem) => {
    setDeleteTarget({ item, orderId: item.source_order_id });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await verificationApi.deleteWhatsappOrderItem(deleteTarget.orderId, deleteTarget.item.id);
      if (res.data.success) {
        showToast('已刪除項目', 'success');
        setDeleteTarget(null);
        fetchData(pagination.page);
      } else {
        showToast('刪除失敗', 'error');
      }
    } catch (err) {
      console.error('Failed to delete item:', err);
      showToast('刪除失敗', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddItem = async (data: EditingItem) => {
    if (!addingType) return;
    setSaving(true);
    try {
      const res = await verificationApi.addWhatsappOrderItem(addingType.orderId, data);
      if (res.data.success) {
        showToast('已新增項目', 'success');
        setAddingType(null);
        fetchData(pagination.page);
      } else {
        showToast('新增失敗', 'error');
      }
    } catch (err) {
      console.error('Failed to add item:', err);
      showToast('新增失敗', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReparseMessage = async (messageId: number) => {
    if (!confirm('確定要重新解析此訊息嗎？')) return;
    try {
      await verificationApi.reparseMessage(messageId);
      showToast('已重新解析，請稍候...', 'success');
      setTimeout(() => fetchData(pagination.page), 1500);
    } catch (err) {
      console.error('Failed to reparse message:', err);
      showToast('重新解析失敗', 'error');
    }
  };

  // ── 共用 table props ──────────────────────────────────────

  const tableProps = {
    expandedItemLogs,
    toggleItemLog,
    editingId,
    editForm,
    onStartEdit: handleStartEdit,
    onCancelEdit: handleCancelEdit,
    onSaveEdit: handleSaveEdit,
    onDelete: handleDelete,
    saving,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Toast 通知 ──────────────────────────────────────── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* ── 刪除確認 Modal ──────────────────────────────────── */}
      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget.item}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      {/* ── 新增 Item Modal ─────────────────────────────────── */}
      {addingType && (
        <AddItemModal
          orderType={addingType.orderType}
          orderId={addingType.orderId}
          onSave={handleAddItem}
          onCancel={() => setAddingType(null)}
          saving={saving}
        />
      )}

      {/* ── 標題 ────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">每日 Order 總結</h1>
        <p className="text-sm text-gray-500 mt-1">
          合併同一天所有 WhatsApp order 和修改指令，按機械調配、工程部員工、泥車/運輸三種類型分區顯示。點擊編輯按鈕可修改項目。
        </p>
      </div>

      {/* ── 搜尋列 ──────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">開始日期</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">結束日期</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-40"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">搜尋</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="車牌、司機、DC編號、合約號、員工..."
              className="border rounded px-3 py-1.5 text-sm w-full"
            />
          </div>
          <button
            onClick={() => fetchData(1)}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition"
          >
            搜尋
          </button>
        </div>
      </div>

      {/* ── 載入中 ──────────────────────────────────────────── */}
      {loading && (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2" />
          <p>載入中...</p>
        </div>
      )}

      {/* ── 無資料 ──────────────────────────────────────────── */}
      {!loading && summaries.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-1">尚無 WhatsApp Order 記錄</p>
          <p className="text-sm">當 WhatsApp bot 收到工作分配訊息後，會自動在此顯示每日總結。</p>
        </div>
      )}

      {/* ── 每日總結卡片列表 ────────────────────────────────── */}
      {!loading && summaries.map((summary) => {
        const isExpanded = expandedDates.has(summary.date);
        const showMessages = expandedMessages.has(summary.date);
        const latestVersion = summary.versions[summary.versions.length - 1];
        const grouped = groupItemsByType(summary.items);
        const latestOrderId = summary.items[0]?.source_order_id;

        const typeCounts = [
          grouped.machinery.length > 0 ? `機械 ${grouped.machinery.length}` : '',
          grouped.manpower.length > 0 ? `人手 ${grouped.manpower.length}` : '',
          grouped.transport.length > 0 ? `運輸 ${grouped.transport.length}` : '',
          grouped.other.length > 0 ? `其他 ${grouped.other.length}` : '',
        ].filter(Boolean);

        return (
          <div key={summary.date} className="bg-white rounded-lg shadow-sm border mb-4 overflow-hidden">
            {/* ── 日期標題列 ──────────────────────────────── */}
            <div
              className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50 transition"
              onClick={() => toggleDate(summary.date)}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-lg font-semibold text-gray-900">
                  {formatDate(summary.date)}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  summary.latest_status === 'confirmed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {summary.latest_status === 'confirmed' ? '已確定' : '暫定'}
                </span>
                <span className="text-sm text-gray-500">
                  v{latestVersion?.version || 1}
                  {summary.versions.length > 1 && ` (共 ${summary.versions.length} 個版本)`}
                </span>
              </div>

              <div className="flex items-center gap-3 text-sm flex-wrap">
                <div className="flex gap-2 text-xs">
                  {typeCounts.map((tc) => (
                    <span key={tc} className="text-gray-500">{tc}</span>
                  ))}
                </div>
                <div className="flex gap-2 text-xs">
                  {summary.cancelled_items > 0 && <span className="text-red-500">{summary.cancelled_items} 取消</span>}
                  {summary.suspended_items > 0 && <span className="text-yellow-600">{summary.suspended_items} 暫停</span>}
                  {summary.reassigned_items > 0 && <span className="text-orange-500">{summary.reassigned_items} 換人</span>}
                  {summary.added_items > 0 && <span className="text-green-600">{summary.added_items} 新增</span>}
                </div>
                <span className={`transition-transform text-gray-400 ${isExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>
            </div>

            {/* ── 展開的總結內容 ──────────────────────────── */}
            {isExpanded && (
              <div className="border-t">
                {/* 三種類型分區顯示（含 CRUD） */}
                <MachineryTable items={grouped.machinery} {...tableProps} />
                <ManpowerTable items={grouped.manpower} {...tableProps} />
                <TransportTable items={grouped.transport} {...tableProps} />
                <OtherTable items={grouped.other} {...tableProps} />

                {/* ── 新增項目按鈕 ────────────────────────── */}
                {latestOrderId && (
                  <div className="border-t px-5 py-3 flex flex-wrap gap-2">
                    <span className="text-xs text-gray-500 self-center mr-2">新增項目：</span>
                    <button
                      onClick={() => setAddingType({ orderType: 'machinery', orderId: latestOrderId })}
                      className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100 transition"
                    >
                      + 機械
                    </button>
                    <button
                      onClick={() => setAddingType({ orderType: 'manpower', orderId: latestOrderId })}
                      className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition"
                    >
                      + 人手
                    </button>
                    <button
                      onClick={() => setAddingType({ orderType: 'transport', orderId: latestOrderId })}
                      className="px-3 py-1.5 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 transition"
                    >
                      + 運輸
                    </button>
                    <button
                      onClick={() => setAddingType({ orderType: 'notice', orderId: latestOrderId })}
                      className="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 transition"
                    >
                      + 其他
                    </button>
                  </div>
                )}

                {/* ── Order 級別修改日誌 ──────────────────── */}
                {summary.order_mod_logs.length > 0 && (
                  <div className="border-t px-5 py-3 bg-amber-50/50">
                    <div className="text-xs font-medium text-amber-800 mb-2 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      未匹配到具體項目的修改記錄 ({summary.order_mod_logs.length})
                    </div>
                    {summary.order_mod_logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 mb-2 text-xs">
                        <ModTypeBadge type={log.mod_type} />
                        <div className="flex-1">
                          <div className="text-gray-700">{log.mod_description}</div>
                          {log.message && (
                            <div className="mt-0.5 text-gray-400">
                              {log.message.wa_msg_sender_name} — {formatDateTime(log.message.wa_msg_timestamp)}
                              {log.message.wa_msg_body && (
                                <span className="ml-1">
                                  &ldquo;{log.message.wa_msg_body.substring(0, 80)}{log.message.wa_msg_body.length > 80 ? '...' : ''}&rdquo;
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 版本歷史 ────────────────────────────── */}
                {summary.versions.length > 1 && (
                  <div className="border-t px-5 py-3">
                    <div className="text-xs font-medium text-gray-500 mb-2">版本歷史</div>
                    <div className="flex flex-wrap gap-2">
                      {summary.versions.map((v) => (
                        <div key={v.version} className="text-xs bg-gray-50 border rounded px-2.5 py-1.5 flex items-center gap-2">
                          <span className="font-semibold">v{v.version}</span>
                          <span className={`px-1.5 py-0.5 rounded ${v.status === 'confirmed' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                            {v.status === 'confirmed' ? '已確定' : '暫定'}
                          </span>
                          <span className="text-gray-500">{v.item_count} 項</span>
                          <span className="text-gray-400">{v.sender || '—'}</span>
                          <span className="text-gray-400">{formatDateTime(v.created_at)}</span>
                          {v.ai_confidence != null && (
                            <span className="text-gray-300">AI {(v.ai_confidence * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 原始訊息記錄 ────────────────────────── */}
                <div className="border-t">
                  <div
                    className="flex items-center justify-between px-5 py-2.5 cursor-pointer hover:bg-gray-50 transition text-sm"
                    onClick={() => toggleMessages(summary.date)}
                  >
                    <span className="text-gray-600 font-medium flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      原始訊息記錄 ({summary.messages.length} 條)
                    </span>
                    <span className={`text-gray-400 transition-transform ${showMessages ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </div>

                  {showMessages && (
                    <div className="px-5 pb-3 space-y-2">
                      {summary.messages.map((msg) => (
                        <div key={msg.id} className="bg-gray-50 rounded border px-3 py-2 text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-700">{msg.sender || '未知'}</span>
                            <ClassificationBadge classification={msg.classification} />
                            {msg.confidence != null && (
                              <span className="text-gray-400">
                                信心度 {(msg.confidence * 100).toFixed(0)}%
                              </span>
                            )}
                            <span className="text-gray-400 ml-auto">{formatDateTime(msg.timestamp)}</span>
                          </div>
                          <div className="text-gray-600 whitespace-pre-wrap break-words max-h-40 overflow-y-auto leading-relaxed">
                            {msg.body || '—'}
                          </div>
                        </div>
                      ))}
                      {summary.messages.length === 0 && (
                        <div className="text-gray-400 text-xs py-2">無相關訊息記錄</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── 分頁 ────────────────────────────────────────────── */}
      {!loading && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <span className="text-sm text-gray-500">
            共 {pagination.total} 天，第 {pagination.page} / {pagination.total_pages} 頁
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => fetchData(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50 transition"
            >
              上一頁
            </button>
            <button
              onClick={() => fetchData(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50 transition"
            >
              下一頁
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
