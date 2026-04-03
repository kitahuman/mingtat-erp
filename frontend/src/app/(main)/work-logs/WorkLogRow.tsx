'use client';
import { useState, useEffect, useCallback } from 'react';
import SearchableSelect from './SearchableSelect';
import Combobox from './Combobox';
import LocationAutocomplete from './LocationAutocomplete';
import {
  STATUS_OPTIONS, SERVICE_TYPE_OPTIONS, TONNAGE_OPTIONS,
  MACHINE_TYPE_OPTIONS, DAY_NIGHT_OPTIONS, UNIT_OPTIONS,
  STATUS_COLORS, getStatusLabel, getEquipmentSource,
} from './constants';
import { workLogsApi } from '@/lib/api';
import { fmtDate as globalFmtDate } from '@/lib/dateUtils';

// Format date as DD/MM/YYYY
const fmtDate = (d: any) => {
  if (!d) return '—';
  return globalFmtDate(d);
};

interface Option { value: string | number; label: string; }

interface Props {
  row: any;
  isEditing: boolean;
  isNew: boolean;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  // reference data
  companyProfiles: Option[];
  clients: Option[];
  quotations: Option[];
  contracts: Option[];
  employees: Option[];
  users: Option[];
  fieldOptions?: Record<string, Option[]>;
}

export default function WorkLogRow({
  row, isEditing, isNew, isSelected, onSelect, onEdit, onSave, onCancel, onDuplicate, onDelete,
  companyProfiles, clients, quotations, contracts, employees, users, fieldOptions = {},
}: Props) {
  const [form, setForm] = useState<any>({});
  const [equipmentOptions, setEquipmentOptions] = useState<Option[]>([]);
  const [filteredQuotations, setFilteredQuotations] = useState<Option[]>(quotations);
  const [filteredContracts, setFilteredContracts] = useState<Option[]>(contracts);
  const [saving, setSaving] = useState(false);

  // Initialize form when entering edit mode
  useEffect(() => {
    if (isEditing) {
      const initialForm = { ...row };
      // Handle employee_id prefix for UI
      if (initialForm.employee_id) {
        initialForm.employee_id = `emp_${initialForm.employee_id}`;
      }
      setForm(initialForm);
    }
  }, [isEditing, row]);

  // Filter quotations by client
  useEffect(() => {
    if (!isEditing) return;
    const clientId = form.client_id;
    if (!clientId) {
      setFilteredQuotations(quotations);
    } else {
      setFilteredQuotations(quotations.filter((q: any) => {
        const qData = (q as any)._raw;
        return !qData || qData.client_id === clientId || qData.client_id === Number(clientId);
      }));
    }
  }, [form.client_id, quotations, isEditing]);

  // Filter contracts by client
  useEffect(() => {
    if (!isEditing) return;
    const clientId = form.client_id;
    if (!clientId) {
      setFilteredContracts(contracts);
    } else {
      setFilteredContracts(contracts.filter((c: any) => {
        const cData = (c as any)._raw;
        return !cData || cData.client_id === clientId || cData.client_id === Number(clientId);
      }));
    }
  }, [form.client_id, contracts, isEditing]);

  // Fetch equipment options when machine_type or tonnage changes
  const fetchEquipment = useCallback(async (machineType: string, tonnage?: string) => {
    if (!machineType) { setEquipmentOptions([]); return; }
    try {
      const res = await workLogsApi.equipmentOptions(machineType, tonnage);
      setEquipmentOptions((res.data || []).map((e: any) => ({ value: e.value, label: e.label })));
    } catch { setEquipmentOptions([]); }
  }, []);

  useEffect(() => {
    if (isEditing && form.machine_type) {
      fetchEquipment(form.machine_type, form.tonnage);
    } else {
      setEquipmentOptions([]);
    }
  }, [form.machine_type, form.tonnage, isEditing, fetchEquipment]);

  const set = (field: string, value: any) => {
    setForm((prev: any) => {
      const next = { ...prev, [field]: value };
      
      // Auto-set client_id if a subcon driver (part_ prefix) is selected
      if (field === 'employee_id' && typeof value === 'string' && value.startsWith('part_')) {
        next.client_id = Number(value.replace('part_', ''));
      }

      // When machine_type changes, clear equipment_number if source changes
      if (field === 'machine_type') {
        const prevSource = getEquipmentSource(prev.machine_type);
        const nextSource = getEquipmentSource(value);
        if (prevSource !== nextSource) {
          next.equipment_number = null;
        }
      }

      // When client changes, clear quotation and contract
      if (field === 'client_id') {
        next.quotation_id = null;
        next.contract_id = null;
      }

      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form };
    // Strip prefix before saving
    if (typeof payload.employee_id === 'string') {
      if (payload.employee_id.startsWith('emp_')) {
        payload.employee_id = Number(payload.employee_id.replace('emp_', ''));
      } else if (payload.employee_id.startsWith('part_')) {
        payload.employee_id = null;
      }
    }
    try { await onSave(payload); } finally { setSaving(false); }
  };

  const equipSource = getEquipmentSource(form.machine_type);
  const equipPlaceholder = !form.machine_type
    ? '請先選擇機種'
    : equipSource === 'vehicle' ? '選擇車牌' : '選擇機號';

  // ── Display mode ───────────────────────────────────────────────────────────────────────────────────────
  if (!isEditing) {
    const statusColor = STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-600';
    const hasUnverifiedClient = !!row.unverified_client_name;
    return (
      <tr
        className={`cursor-pointer border-b border-gray-100 text-xs ${
          hasUnverifiedClient ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-blue-50'
        }`}
        onClick={onEdit}
      >
        {/* Checkbox - sticky */}
        <td className="sticky left-0 z-10 bg-white px-2 py-1.5 border-r border-gray-200 w-8" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isSelected} onChange={e => onSelect(e.target.checked)} className="cursor-pointer" />
        </td>
        {/* ID - sticky */}
        <td className="sticky left-8 z-10 bg-white px-2 py-1.5 border-r border-gray-200 w-14 text-gray-400 font-mono">
          {row.id || '—'}
        </td>
        {/* 發佈人 - sticky */}
        <td className="sticky left-[88px] z-10 bg-white px-2 py-1.5 border-r border-gray-200 w-24 whitespace-nowrap">
          {row.publisher?.displayName || row.publisher?.username || '—'}
        </td>
        {/* 狀態 - sticky */}
        <td className="sticky left-[184px] z-10 bg-white px-2 py-1.5 border-r border-gray-200 w-20">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColor}`}>
            {getStatusLabel(row.status)}
          </span>
        </td>
        {/* 約定日期 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-28">{fmtDate(row.scheduled_date)}</td>
        {/* 服務類型 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-28">{row.service_type || '—'}</td>
        {/* 公司 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24">{row.company_profile?.code || '—'}</td>
        {/* 客戶公司 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-36 max-w-[144px] truncate">
          {row.unverified_client_name ? (
            <span className="inline-flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-800 whitespace-nowrap">
                {row.unverified_client_name}
              </span>
            </span>
          ) : (
            row.client?.name || '—'
          )}
        </td>
        {/* 報價單 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-32">{row.quotation?.quotation_no || '—'}</td>
        {/* 合約 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-32">{row.contract?.contract_no || '—'}</td>
        {/* 員工 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24">{row.employee?.name_zh || '—'}</td>
        {/* 機種 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24">{row.machine_type || '—'}</td>
        {/* 機號 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-28">{row.equipment_number || '—'}</td>
        {/* 噸數 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24">{row.tonnage || '—'}</td>
        {/* 日夜班 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-20">{row.day_night || '—'}</td>
        {/* 起點 */}
        <td className="px-2 py-1.5 w-32 max-w-[128px] truncate">{row.start_location || '—'}</td>
        {/* 起點時間 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24">{row.start_time || '—'}</td>
        {/* 終點 */}
        <td className="px-2 py-1.5 w-32 max-w-[128px] truncate">{row.end_location || '—'}</td>
        {/* 終點時間 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24">{row.end_time || '—'}</td>
        {/* 數量 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24 text-right">{row.quantity ?? '—'}</td>
        {/* 工資單位 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24">{row.unit || '—'}</td>
        {/* OT 數量 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24 text-right">{row.ot_quantity ?? '—'}</td>
        {/* OT 單位 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24">{row.ot_unit || '—'}</td>
        {/* 商品數量 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-24 text-right">{row.goods_quantity ?? '—'}</td>
        {/* 入帳票編號 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-28">{row.receipt_no || '—'}</td>
        {/* 單號 */}
        <td className="px-2 py-1.5 whitespace-nowrap w-28">{row.work_order_no || '—'}</td>
        {/* 已確認 */}
        <td className="px-2 py-1.5 w-20 text-center">
          {row.is_confirmed ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
        </td>
        {/* 已付款 */}
        <td className="px-2 py-1.5 w-20 text-center">
          {row.is_paid ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
        </td>
        {/* 備註 */}
        <td className="px-2 py-1.5 w-36 max-w-[144px] truncate text-gray-500">{row.remarks || '—'}</td>
        {/* 操作 - sticky right */}
        <td className="sticky right-0 z-10 bg-white px-2 py-1.5 border-l border-gray-200 w-28" onClick={e => e.stopPropagation()}>
          <div className="flex gap-1">
            <button onClick={e => { e.stopPropagation(); onEdit(); }} className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="編輯">✏️</button>
            <button onClick={e => { e.stopPropagation(); onDuplicate(); }} className="px-1.5 py-0.5 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100" title="複製">📋</button>
            <button onClick={e => { e.stopPropagation(); onDelete(); }} className="px-1.5 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100" title="刪除">🗑️</button>
          </div>
        </td>
      </tr>
    );
  }

  // ── Edit mode ─────────────────────────────────────────────
  const cellCls = 'px-1 py-1 align-top';
  const inputCls = 'w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500';

  return (
    <tr className="bg-blue-50 border-b-2 border-blue-300 text-xs">
      {/* Checkbox */}
      <td className="sticky left-0 z-10 bg-blue-50 px-2 py-1.5 border-r border-blue-200 w-8">
        <input type="checkbox" checked={isSelected} onChange={e => onSelect(e.target.checked)} />
      </td>
      {/* ID */}
      <td className="sticky left-8 z-10 bg-blue-50 px-2 py-1.5 border-r border-blue-200 w-14 text-gray-400 font-mono">
        {isNew ? 'NEW' : row.id}
      </td>
      {/* 發佈人 */}
      <td className={`sticky left-[88px] z-10 bg-blue-50 border-r border-blue-200 w-24 ${cellCls}`}>
        <SearchableSelect
          value={form.publisher_id}
          onChange={v => set('publisher_id', v)}
          options={users}
          placeholder="發佈人"
        />
      </td>
      {/* 狀態 */}
      <td className={`sticky left-[184px] z-10 bg-blue-50 border-r border-blue-200 w-20 ${cellCls}`}>
        <SearchableSelect
          value={form.status}
          onChange={v => set('status', v)}
          options={STATUS_OPTIONS}
          placeholder="狀態"
          clearable={false}
        />
      </td>
      {/* 約定日期 */}
      <td className={`${cellCls} w-28`}>
        <input type="date" value={form.scheduled_date || ''} onChange={e => set('scheduled_date', e.target.value)} className={inputCls} />
      </td>
      {/* 服務類型 */}
      <td className={`${cellCls} w-28`}>
        <Combobox
          value={form.service_type}
          onChange={v => set('service_type', v ? String(v) : null)}
          options={fieldOptions['service_type']?.length ? fieldOptions['service_type'] : SERVICE_TYPE_OPTIONS.map(s => ({ value: s, label: s }))}
          placeholder="服務類型"
        />
      </td>
      {/* 公司 */}
      <td className={`${cellCls} w-24`}>
        <SearchableSelect
          value={form.company_profile_id}
          onChange={v => set('company_profile_id', v)}
          options={companyProfiles}
          placeholder="公司"
        />
      </td>
      {/* 客戶公司 */}
      <td className={`${cellCls} w-36`}>
        <SearchableSelect
          value={form.client_id}
          onChange={v => set('client_id', v)}
          options={clients}
          placeholder="客戶公司"
        />
      </td>
      {/* 報價單 */}
      <td className={`${cellCls} w-32`}>
        <SearchableSelect
          value={form.quotation_id}
          onChange={v => set('quotation_id', v)}
          options={filteredQuotations}
          placeholder="選擇報價單"
        />
      </td>
      {/* 合約 */}
      <td className={`${cellCls} w-32`}>
        <SearchableSelect
          value={form.contract_id}
          onChange={v => set('contract_id', v)}
          options={filteredContracts}
          placeholder="選擇合約"
        />
      </td>
      {/* 員工 */}
      <td className={`${cellCls} w-24`}>
        <SearchableSelect
          value={form.employee_id}
          onChange={v => set('employee_id', v)}
          options={employees}
          placeholder="員工"
        />
      </td>
      {/* 機種 */}
      <td className={`${cellCls} w-24`}>
        <Combobox
          value={form.machine_type}
          onChange={v => set('machine_type', v ? String(v) : null)}
          options={fieldOptions['machine_type']?.length ? fieldOptions['machine_type'] : MACHINE_TYPE_OPTIONS.map(m => ({ value: m, label: m }))}
          placeholder="機種"
        />
      </td>
      {/* 機號 */}
      <td className={`${cellCls} w-28`}>
        <SearchableSelect
          value={form.equipment_number}
          onChange={v => set('equipment_number', v)}
          options={equipmentOptions}
          placeholder={equipPlaceholder}
          disabled={!form.machine_type}
        />
      </td>
      {/* 噸數 */}
      <td className={`${cellCls} w-24`}>
        <Combobox
          value={form.tonnage}
          onChange={v => set('tonnage', v ? String(v) : null)}
          options={fieldOptions['tonnage']?.length ? fieldOptions['tonnage'] : TONNAGE_OPTIONS.map(t => ({ value: t, label: t }))}
          placeholder="噸數"
        />
      </td>
      {/* 日夜班 */}
      <td className={`${cellCls} w-20`}>
        <Combobox
          value={form.day_night}
          onChange={v => set('day_night', v ? String(v) : null)}
          options={fieldOptions['day_night']?.length ? fieldOptions['day_night'] : DAY_NIGHT_OPTIONS.map(d => ({ value: d, label: d }))}
          placeholder="班別"
        />
      </td>
      {/* 起點 */}
      <td className={`${cellCls} w-32`}>
        <LocationAutocomplete value={form.start_location || ''} onChange={v => set('start_location', v)} type="start" placeholder="起點" />
      </td>
      {/* 起點時間 */}
      <td className={`${cellCls} w-24`}>
        <input type="time" value={form.start_time || ''} onChange={e => set('start_time', e.target.value)} className={inputCls} />
      </td>
      {/* 終點 */}
      <td className={`${cellCls} w-32`}>
        <LocationAutocomplete value={form.end_location || ''} onChange={v => set('end_location', v)} type="end" placeholder="終點" />
      </td>
      {/* 終點時間 */}
      <td className={`${cellCls} w-24`}>
        <input type="time" value={form.end_time || ''} onChange={e => set('end_time', e.target.value)} className={inputCls} />
      </td>
      {/* 數量 */}
      <td className={`${cellCls} w-24`}>
        <input type="number" step="0.01" value={form.quantity ?? ''} onChange={e => set('quantity', e.target.value)} className={`${inputCls} text-right`} placeholder="0" />
      </td>
      {/* 工資單位 */}
      <td className={`${cellCls} w-24`}>
        <Combobox value={form.unit} onChange={v => set('unit', v ? String(v) : null)} options={fieldOptions['wage_unit']?.length ? fieldOptions['wage_unit'] : UNIT_OPTIONS.map(u => ({ value: u, label: u }))} placeholder="單位" />
      </td>
      {/* OT 數量 */}
      <td className={`${cellCls} w-24`}>
        <input type="number" step="0.01" value={form.ot_quantity ?? ''} onChange={e => set('ot_quantity', e.target.value)} className={`${inputCls} text-right`} placeholder="0" />
      </td>
      {/* OT 單位 */}
      <td className={`${cellCls} w-24`}>
        <Combobox value={form.ot_unit} onChange={v => set('ot_unit', v ? String(v) : null)} options={fieldOptions['wage_unit']?.length ? fieldOptions['wage_unit'] : UNIT_OPTIONS.map(u => ({ value: u, label: u }))} placeholder="OT單位" />
      </td>
      {/* 商品數量 */}
      <td className={`${cellCls} w-24`}>
        <input type="number" step="0.01" value={form.goods_quantity ?? ''} onChange={e => set('goods_quantity', e.target.value)} className={`${inputCls} text-right`} placeholder="0" />
      </td>
      {/* 入帳票編號 */}
      <td className={`${cellCls} w-28`}>
        <input type="text" value={form.receipt_no || ''} onChange={e => set('receipt_no', e.target.value)} className={inputCls} placeholder="入帳票編號" />
      </td>
      {/* 單號 */}
      <td className={`${cellCls} w-28`}>
        <input type="text" value={form.work_order_no || ''} onChange={e => set('work_order_no', e.target.value)} className={inputCls} placeholder="單號" />
      </td>
      {/* 已確認 */}
      <td className={`${cellCls} w-20 text-center`}>
        <input type="checkbox" checked={!!form.is_confirmed} onChange={e => set('is_confirmed', e.target.checked)} className="w-4 h-4 cursor-pointer" />
      </td>
      {/* 已付款 */}
      <td className={`${cellCls} w-20 text-center`}>
        <input type="checkbox" checked={!!form.is_paid} onChange={e => set('is_paid', e.target.checked)} className="w-4 h-4 cursor-pointer" />
      </td>
      {/* 備註 */}
      <td className={`${cellCls} w-36`}>
        <input type="text" value={form.remarks || ''} onChange={e => set('remarks', e.target.value)} className={inputCls} placeholder="備註" />
      </td>
      {/* 操作 */}
      <td className="sticky right-0 z-10 bg-blue-50 px-2 py-1.5 border-l border-blue-200 w-28">
        <div className="flex flex-col gap-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '儲存中…' : '💾 儲存'}
          </button>
          <button
            onClick={onCancel}
            className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            ✕ 取消
          </button>
        </div>
      </td>
    </tr>
  );
}
