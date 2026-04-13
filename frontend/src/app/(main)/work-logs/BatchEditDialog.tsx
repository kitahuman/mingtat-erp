'use client';
import { useState, useEffect, useRef } from 'react';
import SearchableSelect from './SearchableSelect';
import Combobox from './Combobox';
import { STATUS_OPTIONS } from './constants';
import { workLogsApi, fieldOptionsApi } from '@/lib/api';
import ClientContractCombobox from '@/components/ClientContractCombobox';
import { fmtDate } from '@/lib/dateUtils';

interface Option { value: string | number; label: string; _raw?: any; }

interface Props {
  open: boolean;
  onClose: () => void;
  selectedRows: any[];
  onSuccess: () => void;
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

export default function BatchEditDialog({
  open, onClose, selectedRows, onSuccess,
  companies, clients, quotations, contracts, employees, fieldOptions, allEquipment,
}: Props) {
  const [selectedField, setSelectedField] = useState<string>('');
  const [fieldValue, setFieldValue] = useState<any>(null);
  const [applying, setApplying] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const fieldDef = BATCH_FIELDS.find(f => f.key === selectedField);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedField('');
      setFieldValue(null);
      setApplying(false);
    }
  }, [open]);

  const handleFieldChange = (key: string) => {
    setSelectedField(key);
    setFieldValue(null);
  };

  const handleApply = async () => {
    if (!selectedField || selectedRows.length === 0) return;
    if (fieldValue === null && fieldDef?.type !== 'boolean') {
      alert('請輸入要設定的值');
      return;
    }

    setApplying(true);
    try {
      let valueToSend = fieldValue;
      const ids = selectedRows.map((r: any) => r.id);
      if (selectedField === 'employee_id' && typeof valueToSend === 'string') {
        if (valueToSend.startsWith('emp_')) {
          valueToSend = Number(valueToSend.replace('emp_', ''));
          await workLogsApi.bulkUpdate(ids, 'employee_id', valueToSend);
          await workLogsApi.bulkUpdate(ids, 'work_log_fleet_driver_id', null);
          onSuccess();
          onClose();
          return;
        } else if (valueToSend.startsWith('fleet_')) {
          const fleetId = Number(valueToSend.replace('fleet_', ''));
          await workLogsApi.bulkUpdate(ids, 'work_log_fleet_driver_id', fleetId);
          await workLogsApi.bulkUpdate(ids, 'employee_id', null);
          onSuccess();
          onClose();
          return;
        } else if (valueToSend.startsWith('part_')) {
          valueToSend = null;
        }
      }
      await workLogsApi.bulkUpdate(ids, selectedField, valueToSend);
      onSuccess();
      onClose();
    } catch (e: any) {
      alert('批量更新失敗：' + (e.response?.data?.message || e.message));
    } finally {
      setApplying(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  if (!open) return null;

  const inputCls = 'px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white';

  const renderValueInput = () => {
    if (!fieldDef) return null;

    switch (fieldDef.type) {
      case 'status':
        return (
          <div className="w-full">
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
            className={`w-full ${inputCls}`}
          />
        );
      case 'time':
        return (
          <input
            type="time"
            value={fieldValue || ''}
            onChange={e => setFieldValue(e.target.value || null)}
            className={`w-full ${inputCls}`}
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
            className={`w-full ${inputCls} text-right`}
          />
        );
      case 'text':
        return (
          <input
            type="text"
            value={fieldValue || ''}
            onChange={e => setFieldValue(e.target.value || null)}
            placeholder={`輸入${fieldDef.label}`}
            className={`w-full ${inputCls}`}
          />
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-4 py-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="batch_bool_val"
                checked={fieldValue === true}
                onChange={() => setFieldValue(true)}
                className="w-4 h-4"
              />
              是
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="batch_bool_val"
                checked={fieldValue === false}
                onChange={() => setFieldValue(false)}
                className="w-4 h-4"
              />
              否
            </label>
          </div>
        );
      case 'company':
        return (
          <div className="w-full">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={companies} placeholder="選擇公司" />
          </div>
        );
      case 'client':
        return (
          <div className="w-full">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={clients} placeholder="選擇客戶" />
          </div>
        );
      case 'quotation':
        return (
          <div className="w-full">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={quotations} placeholder="選擇報價單" />
          </div>
        );
      case 'contract':
        return (
          <div className="w-full">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={contracts} placeholder="選擇合約" />
          </div>
        );
      case 'employee':
        return (
          <div className="w-full">
            <SearchableSelect value={fieldValue} onChange={setFieldValue} options={employees} placeholder="選擇員工" />
          </div>
        );
      case 'equipment':
        return (
          <div className="w-full">
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
          <div className="w-full">
            <Combobox
              value={fieldValue || ''}
              onChange={v => setFieldValue(v ? String(v) : null)}
              options={fieldOptions[fieldDef.category!] || []}
              placeholder={`選擇${fieldDef.label}`}
            />
          </div>
        );
      case 'field_option_create':
        // Use dedicated ClientContractCombobox for client_contract_no
        if (fieldDef.category === 'client_contract_no') {
          return (
            <div className="w-full">
              <ClientContractCombobox
                value={fieldValue || ''}
                onChange={v => setFieldValue(v ? String(v) : null)}
                placeholder={`選擇或輸入${fieldDef.label}`}
              />
            </div>
          );
        }
        return (
          <div className="w-full">
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

  // Helper to get a brief summary for each row
  const getRowSummary = (row: any) => {
    const parts: string[] = [];
    parts.push(`#${row.id}`);
    if (row.scheduled_date) parts.push(fmtDate(row.scheduled_date));
    if (row.work_log_fleet_driver_id && row.fleet_driver) {
      const fd = row.fleet_driver;
      parts.push(fd.name_zh ? `${fd.name_zh}（${fd.subcontractor?.name || '街車'}・街車）` : `${fd.subcontractor?.name || '街車'}（街車）`);
    } else if (row.employee?.name_zh) {
      parts.push(row.employee.name_zh);
    }
    if (row.client?.name) parts.push(row.client.name);
    if (row.service_type) parts.push(row.service_type);
    if (row.start_location || row.end_location) {
      parts.push(`${row.start_location || '?'} → ${row.end_location || '?'}`);
    }
    return parts.join(' | ');
  };

  const canApply = selectedField && (fieldDef?.type === 'boolean' || fieldValue !== null);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">批量編輯</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              將對 <span className="font-semibold text-blue-600">{selectedRows.length}</span> 筆記錄進行修改
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Field selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">選擇要修改的欄位</label>
            <select
              value={selectedField}
              onChange={e => handleFieldChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">-- 請選擇欄位 --</option>
              {BATCH_FIELDS.map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Value input */}
          {selectedField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                設定新值：<span className="text-blue-600">{fieldDef?.label}</span>
              </label>
              {renderValueInput()}
            </div>
          )}

          {/* Selected records list */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              已選記錄（{selectedRows.length} 筆）
            </label>
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-12">ID</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-24">日期</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-20">員工</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">詳情</th>
                    {selectedField && (
                      <th className="px-3 py-2 text-left font-medium text-gray-500 w-28">
                        現有值
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedRows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-400 font-mono">{row.id}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(row.scheduled_date)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {row.work_log_fleet_driver_id && row.fleet_driver
                          ? (row.fleet_driver.name_zh
                              ? `${row.fleet_driver.name_zh}（${row.fleet_driver.subcontractor?.name || '街車'}・街車）`
                              : `${row.fleet_driver.subcontractor?.name || '街車'}（街車）`)
                          : (row.employee?.name_zh || '—')}
                      </td>
                      <td className="px-3 py-1.5 truncate max-w-[200px]">
                        {[
                          row.service_type,
                          row.client?.name,
                          row.start_location && row.end_location ? `${row.start_location} → ${row.end_location}` : null,
                        ].filter(Boolean).join(' | ') || '—'}
                      </td>
                      {selectedField && (
                        <td className="px-3 py-1.5 text-gray-500 truncate max-w-[112px]">
                          {getCurrentFieldValue(row, selectedField, companies, clients, quotations, contracts, employees)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            取消
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply || applying}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {applying ? '更新中…' : `套用到 ${selectedRows.length} 筆記錄`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Helper: get the current display value for a field on a given row */
function getCurrentFieldValue(
  row: any, field: string,
  companies: Option[], clients: Option[], quotations: Option[], contracts: Option[], employees: Option[],
): string {
  switch (field) {
    case 'status': return row.status || '—';
    case 'scheduled_date': return row.scheduled_date ? fmtDate(row.scheduled_date) : '—';
    case 'company_id': return row.company?.name || '—';
    case 'client_id': return row.client?.name || '—';
    case 'quotation_id': return row.quotation?.quotation_no || '—';
    case 'contract_id': return row.contract?.contract_no || '—';
    case 'employee_id': {
      if (row.work_log_fleet_driver_id && row.fleet_driver) {
        const fd = row.fleet_driver;
        return fd.name_zh ? `${fd.name_zh}（${fd.subcontractor?.name || '街車'}・街車）` : `${fd.subcontractor?.name || '街車'}（街車）`;
      }
      return row.employee?.name_zh || '—';
    }
    case 'is_mid_shift': return row.is_mid_shift ? '是' : '否';
    case 'is_confirmed': return row.is_confirmed ? '是' : '否';
    case 'is_paid': return row.is_paid ? '是' : '否';
    default: {
      const val = row[field];
      return val != null && val !== '' ? String(val) : '—';
    }
  }
}
