'use client';
import { useState } from 'react';
import SearchableSelect from './SearchableSelect';
import Combobox from './Combobox';
import { STATUS_OPTIONS, DAY_NIGHT_OPTIONS } from './constants';
import { workLogsApi, fieldOptionsApi } from '@/lib/api';

interface Option { value: string | number; label: string; _raw?: any; }

interface Props {
  selectedIds: number[];
  onSuccess: () => void;
  onClear: () => void;
  // reference data
  companies: Option[];
  clients: Option[];
  quotations: Option[];
  contracts: Option[];
  employees: Option[];
  fieldOptions: Record<string, Option[]>;
  allEquipment: Option[];
}

// Field definitions for batch edit
const BATCH_FIELDS = [
  { key: 'status',            label: '狀態',       type: 'status' },
  { key: 'scheduled_date',    label: '約定日期',   type: 'date' },
  { key: 'service_type',      label: '服務類型',   type: 'field_option', category: 'service_type' },
  { key: 'company_id',        label: '公司',       type: 'company' },
  { key: 'client_id',         label: '客戶公司',   type: 'client' },
  { key: 'quotation_id',      label: '報價單',     type: 'quotation' },
  { key: 'contract_id',       label: '合約',       type: 'contract' },
  { key: 'client_contract_no',label: '客戶合約',   type: 'field_option_create', category: 'client_contract_no' },
  { key: 'employee_id',       label: '員工',       type: 'employee' },
  { key: 'machine_type',      label: '機種',       type: 'field_option', category: 'machine_type' },
  { key: 'equipment_number',  label: '機號',       type: 'equipment' },
  { key: 'tonnage',           label: '噸數',       type: 'field_option', category: 'tonnage' },
  { key: 'day_night',         label: '日夜班',     type: 'field_option', category: 'day_night' },
  { key: 'start_location',    label: '起點',       type: 'field_option_create', category: 'location' },
  { key: 'start_time',        label: '起點時間',   type: 'time' },
  { key: 'end_location',      label: '終點',       type: 'field_option_create', category: 'location' },
  { key: 'end_time',          label: '終點時間',   type: 'time' },
  { key: 'quantity',          label: '數量',       type: 'number' },
  { key: 'unit',              label: '工資單位',   type: 'field_option', category: 'wage_unit' },
  { key: 'ot_quantity',       label: 'OT數量',     type: 'number' },
  { key: 'ot_unit',           label: 'OT單位',     type: 'field_option', category: 'wage_unit' },
  { key: 'is_mid_shift',      label: '中直',       type: 'boolean' },
  { key: 'goods_quantity',    label: '商品數量',   type: 'number' },
  { key: 'receipt_no',        label: '入帳票編號', type: 'text' },
  { key: 'work_order_no',     label: '單號',       type: 'text' },
  { key: 'is_confirmed',      label: '已確認',     type: 'boolean' },
  { key: 'is_paid',           label: '已付款',     type: 'boolean' },
  { key: 'remarks',           label: '備註',       type: 'text' },
];

export default function BatchEditToolbar({
  selectedIds, onSuccess, onClear,
  companies, clients, quotations, contracts, employees, fieldOptions, allEquipment,
}: Props) {
  const [selectedField, setSelectedField] = useState<string>('');
  const [fieldValue, setFieldValue] = useState<any>(null);
  const [applying, setApplying] = useState(false);

  const fieldDef = BATCH_FIELDS.find(f => f.key === selectedField);

  const handleFieldChange = (key: string) => {
    setSelectedField(key);
    setFieldValue(null);
  };

  const handleApply = async () => {
    if (!selectedField || selectedIds.length === 0) return;
    if (fieldValue === null && fieldDef?.type !== 'boolean') {
      alert('請輸入要設定的值');
      return;
    }
    if (!confirm(`確定要將 ${selectedIds.length} 筆記錄的「${fieldDef?.label}」批量修改？`)) return;

    setApplying(true);
    try {
      // Handle employee_id prefix stripping
      let valueToSend = fieldValue;
      if (selectedField === 'employee_id' && typeof valueToSend === 'string') {
        if (valueToSend.startsWith('emp_')) {
          valueToSend = Number(valueToSend.replace('emp_', ''));
        } else if (valueToSend.startsWith('part_')) {
          valueToSend = null;
        }
      }
      await workLogsApi.bulkUpdate(selectedIds, selectedField, valueToSend);
      setSelectedField('');
      setFieldValue(null);
      onSuccess();
    } catch (e: any) {
      alert('批量更新失敗：' + (e.response?.data?.message || e.message));
    } finally {
      setApplying(false);
    }
  };

  const inputCls = 'px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white';

  const renderValueInput = () => {
    if (!fieldDef) return null;

    switch (fieldDef.type) {
      case 'status':
        return (
          <div className="w-32">
            <SearchableSelect
              value={fieldValue}
              onChange={setFieldValue}
              options={STATUS_OPTIONS}
              placeholder="選擇狀態"
              clearable={false}
            />
          </div>
        );
      case 'date':
        return (
          <input
            type="date"
            value={fieldValue || ''}
            onChange={e => setFieldValue(e.target.value || null)}
            className={`w-36 ${inputCls}`}
          />
        );
      case 'time':
        return (
          <input
            type="time"
            value={fieldValue || ''}
            onChange={e => setFieldValue(e.target.value || null)}
            className={`w-28 ${inputCls}`}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            step="0.01"
            value={fieldValue ?? ''}
            onChange={e => setFieldValue(e.target.value !== '' ? e.target.value : null)}
            placeholder="輸入數值"
            className={`w-24 ${inputCls} text-right`}
          />
        );
      case 'text':
        return (
          <input
            type="text"
            value={fieldValue || ''}
            onChange={e => setFieldValue(e.target.value || null)}
            placeholder={`輸入${fieldDef.label}`}
            className={`w-40 ${inputCls}`}
          />
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer text-xs">
              <input
                type="radio"
                name="bool_val"
                checked={fieldValue === true}
                onChange={() => setFieldValue(true)}
              />
              是
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-xs">
              <input
                type="radio"
                name="bool_val"
                checked={fieldValue === false}
                onChange={() => setFieldValue(false)}
              />
              否
            </label>
          </div>
        );
      case 'company':
        return (
          <div className="w-36">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={companies} placeholder="選擇公司" />
          </div>
        );
      case 'client':
        return (
          <div className="w-40">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={clients} placeholder="選擇客戶" />
          </div>
        );
      case 'quotation':
        return (
          <div className="w-40">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={quotations} placeholder="選擇報價單" />
          </div>
        );
      case 'contract':
        return (
          <div className="w-40">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={contracts} placeholder="選擇合約" />
          </div>
        );
      case 'employee':
        return (
          <div className="w-36">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={employees} placeholder="選擇員工" />
          </div>
        );
      case 'equipment':
        return (
          <div className="w-36">
            <Combobox
              value={fieldValue || ''}
              onChange={v => setFieldValue(v ? String(v) : null)}
              options={allEquipment}
              placeholder="選擇或輸入機號"
            />
          </div>
        );
      case 'field_option':
        return (
          <div className="w-32">
            <Combobox
              value={fieldValue || ''}
              onChange={v => setFieldValue(v ? String(v) : null)}
              options={fieldOptions[fieldDef.category!] || []}
              placeholder={`選擇${fieldDef.label}`}
            />
          </div>
        );
      case 'field_option_create':
        return (
          <div className="w-36">
            <Combobox
              value={fieldValue || ''}
              onChange={v => setFieldValue(v ? String(v) : null)}
              options={fieldOptions[fieldDef.category!] || []}
              placeholder={`選擇或輸入${fieldDef.label}`}
              onCreateOption={async (val) => {
                try { await fieldOptionsApi.create({ category: fieldDef.category!, label: val }); } catch {}
              }}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
      {/* Selection info */}
      <span className="text-sm font-medium text-blue-800 shrink-0">
        已選 <span className="font-bold">{selectedIds.length}</span> 筆
      </span>

      <div className="w-px h-5 bg-blue-300 shrink-0" />

      {/* Field selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-blue-700 shrink-0">批量修改欄位：</span>
        <div className="w-36">
          <select
            value={selectedField}
            onChange={e => handleFieldChange(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="">-- 選擇欄位 --</option>
            {BATCH_FIELDS.map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Value input */}
        {selectedField && (
          <>
            <span className="text-xs text-blue-700 shrink-0">設為：</span>
            {renderValueInput()}
            <button
              onClick={handleApply}
              disabled={applying || (fieldDef?.type !== 'boolean' && fieldValue === null)}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 shrink-0 font-medium"
            >
              {applying ? '更新中…' : '套用'}
            </button>
          </>
        )}
      </div>

      <div className="w-px h-5 bg-blue-300 shrink-0" />

      {/* Existing bulk actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={onClear}
          className="px-2.5 py-1 text-xs text-blue-600 border border-blue-300 rounded hover:bg-blue-100"
        >
          取消選取
        </button>
      </div>
    </div>
  );
}
