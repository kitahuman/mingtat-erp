'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { TranslationKey } from '@/lib/i18n/translations';
import { employeePortalApi, portalSharedApi, WorkLogHistoryItem } from '@/lib/employee-portal-api';
import { VEHICLE_MACHINE_TYPES, MACHINERY_MACHINE_TYPES } from '@/app/(main)/work-logs/constants';

// Field options categories
const FIELD_OPTION_CATEGORIES = ['tonnage', 'machine_type', 'service_type', 'wage_unit', 'location', 'client_contract_no'];

const DRAFT_KEY = 'work_report_draft';

interface FormData {
  work_type: 'engineering' | 'transport';
  service_type: string;
  scheduled_date: string;
  // Client combobox: either a numeric id (string) or free-text new client name
  client_id: string;
  client_input: string;          // raw text in the combobox input
  is_new_client: boolean;        // true if client_id is a free-text name
  client_contract_no: string;
  tonnage: string;
  // Engineering
  machine_type: string;
  equipment_number: string;
  start_location: string;
  work_content: string;
  eng_quantity: string;          // engineering quantity in days
  // Transport
  plate_no: string;
  goods: string;                 // 貨物名稱 -> maps to work_log_product_name
  origin: string;
  destination: string;
  quantity: string;
  unit: string;
  work_order_no: string;         // transport: delivery note no
  receipt_no: string;            // transport: invoice no
  // Common
  start_time: string;
  end_time: string;
  shift: 'D' | 'N';
  mid_shift: boolean;
  ot_hours: string;              // OT hours (number input)
  remarks: string;
  photo_urls: string[];
  signature_url: string;
}

const defaultForm: FormData = {
  work_type: 'engineering',
  service_type: '',
  scheduled_date: new Date().toISOString().split('T')[0],
  client_id: '',
  client_input: '',
  is_new_client: false,
  client_contract_no: '',
  tonnage: '',
  machine_type: '',
  equipment_number: '',
  start_location: '',
  work_content: '',
  eng_quantity: '',
  plate_no: '',
  goods: '',
  origin: '',
  destination: '',
  quantity: '',
  unit: '',
  work_order_no: '',
  receipt_no: '',
  start_time: '',
  end_time: '',
  shift: 'D',
  mid_shift: false,
  ot_hours: '',
  remarks: '',
  photo_urls: [],
  signature_url: '',
};

// ── Generic Combobox ──────────────────────────────────────────────────────────
function Combobox({
  options,
  value,
  onChange,
  placeholder,
  className,
}: {
  options: { value: string; label: string }[];
  value?: string | null;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value ?? ''); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const safeQuery = query ?? '';
  const filtered = safeQuery.trim()
    ? options.filter((o) => o.label?.toLowerCase().includes(safeQuery.toLowerCase()))
    : options.slice(0, 30);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    onChange(val);
  };

  const handleSelect = (opt: { value: string; label: string }) => {
    setQuery(opt.label ?? '');
    setOpen(false);
    onChange(opt.value ?? '');
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={safeQuery}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">無結果</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={i}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                onMouseDown={() => handleSelect(o)}
              >
                {t(o.label as TranslationKey)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Contract Combobox (with add-new-option) ─────────────────────────────────
function ContractCombobox({
  options,
  value,
  onChange,
  onAddOption,
  placeholder,
  className,
}: {
  options: { value: string; label: string }[];
  value?: string | null;
  onChange: (val: string) => void;
  onAddOption?: (val: string) => Promise<void>;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value ?? ''); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const trimmed = (query ?? '').trim();
  const filtered = trimmed
    ? options.filter((o) => o.label?.toLowerCase().includes(trimmed.toLowerCase()))
    : options.slice(0, 30);
  const exactMatch = options.some((o) => o.label?.toLowerCase() === trimmed.toLowerCase());
  const showCreate = onAddOption && trimmed && !exactMatch;

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    onChange(val);
  };

  const handleSelect = (opt: { value: string; label: string }) => {
    setQuery(opt.label ?? '');
    setOpen(false);
    onChange(opt.value ?? '');
  };

  const handleCreate = async () => {
    if (!trimmed || !onAddOption) return;
    onChange(trimmed);
    setOpen(false);
    await onAddOption(trimmed);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query ?? ''}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {showCreate && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium border-b border-gray-100"
              onMouseDown={handleCreate}
            >
              + 新增「{trimmed}」到選項
            </button>
          )}
          {filtered.length === 0 && !showCreate ? (
            <div className="px-3 py-2 text-sm text-gray-400">無結果</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={i}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                onMouseDown={() => handleSelect(o)}
              >
                {t(o.label as TranslationKey)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Client Combobox ──────────────────────────────────────────────────────────
interface ClientItem {
  id: number;
  name: string;
  name_en?: string;
}

function ClientCombobox({
  clients,
  value,
  inputValue,
  isNew,
  onChange,
}: {
  clients: ClientItem[];
  value: string;
  inputValue: string;
  isNew: boolean;
  onChange: (clientId: string, inputVal: string, isNew: boolean) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(inputValue ?? '');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync query when inputValue changes externally
  useEffect(() => { setQuery(inputValue ?? ''); }, [inputValue]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const safeClientQuery = query ?? '';
  const filtered = safeClientQuery.trim()
    ? clients.filter((c) =>
        c.name?.toLowerCase().includes(safeClientQuery.toLowerCase()) ||
        c.name_en?.toLowerCase().includes(safeClientQuery.toLowerCase())
      )
    : clients.slice(0, 30);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    // Mark as new client (free text) until user picks from list
    onChange('', val, val.trim().length > 0);
  };

  const handleSelect = (client: ClientItem) => {
    setQuery(client.name);
    setOpen(false);
    onChange(String(client.id), client.name, false);
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white';

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query ?? ''}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        className={inputClass + (isNew && query ? ' border-amber-400' : '')}
        placeholder={t('searchOrTypeClient')}
        autoComplete="off"
      />
      {isNew && query && (
        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
          ⚠️ {t('newClientWarning')}
        </p>
      )}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">{t('noResults')}</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                onMouseDown={() => handleSelect(c)}
              >
                {c.name}
                {c.name_en && <span className="text-gray-400 ml-1 text-xs">({c.name_en})</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Signature Pad Component ──────────────────────────────────────────────────
function SignaturePad({
  onSave,
  onClear,
  hasSignature,
}: {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
  hasSignature: boolean;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    lastPos.current = pos;
  };

  const endDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      onSave(canvas.toDataURL('image/png'));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onClear();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700">{t('signatureLabel')}</label>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
        >
          {t('clearSignature')}
        </button>
      </div>
      <div className="relative border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-gray-50">
        <p className="absolute top-2 left-0 right-0 text-center text-xs text-gray-400 pointer-events-none select-none">
          {t('signatureHint')}
        </p>
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="w-full touch-none cursor-crosshair"
          style={{ height: '160px' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      {hasSignature && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          ✅ {t('signature')} {t('success')}
        </p>
      )}
    </div>
  );
}

// ── History Copy Modal ────────────────────────────────────────────────────────
function HistoryCopyModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (log: WorkLogHistoryItem) => void;
}) {
  const [logs, setLogs] = useState<WorkLogHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    employeePortalApi
      .getMyWorkLogs({ limit: 30 })
      .then((res) => {
        setLogs(res.data?.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatDateFull = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('zh-HK', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getClientName = (log: WorkLogHistoryItem) =>
    log.client?.name ?? log.unverified_client_name ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">從歷史紀錄複製</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {loading && (
            <div className="text-center py-8 text-gray-400 text-sm">載入中…</div>
          )}
          {!loading && logs.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">暫無歷史紀錄</div>
          )}
          {!loading && logs.map((log) => {
            const clientName = getClientName(log);
            const isTransport = log.service_type === '運輸';
            const locationParts = [log.start_location, log.end_location].filter(Boolean);
            const otLabel = log.ot_quantity != null && Number(log.ot_quantity) > 0
              ? `OT ${log.ot_quantity}${log.ot_unit ?? '時'}`
              : null;
            const shiftLabel = log.day_night === 'D' ? '日更' : log.day_night === 'N' ? '夜更' : null;
            return (
              <button
                key={log.id}
                type="button"
                onClick={() => onSelect(log)}
                className="w-full text-left bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-xl p-3 transition-colors"
              >
                {/* Row 1: service type badges + date */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      {log.service_type ?? '工程'}
                    </span>
                    {shiftLabel && (
                      <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full">{shiftLabel}</span>
                    )}
                    {log.is_mid_shift && (
                      <span className="text-xs text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full">中直</span>
                    )}
                    {otLabel && (
                      <span className="text-xs text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">{otLabel}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatDateFull(log.scheduled_date)}</span>
                </div>
                {/* Row 2: client + contract */}
                {(clientName || log.client_contract_no) && (
                  <div className="flex items-center gap-1 mb-1 flex-wrap">
                    {clientName && <span className="text-sm font-medium text-gray-800">{clientName}</span>}
                    {log.client_contract_no && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{log.client_contract_no}</span>
                    )}
                  </div>
                )}
                {/* Row 3: machine type + equipment + tonnage */}
                {(log.machine_type || log.equipment_number || log.tonnage) && (
                  <p className="text-xs text-gray-500 mb-0.5">
                    🔧 {[log.machine_type, log.equipment_number, log.tonnage ? `${log.tonnage}噸` : null].filter(Boolean).join(' · ')}
                  </p>
                )}
                {/* Row 4: location */}
                {locationParts.length > 0 && (
                  <p className="text-xs text-gray-500">
                    📍 {isTransport ? locationParts.join(' → ') : locationParts[0]}
                  </p>
                )}
                {/* Row 5: quantity */}
                {log.quantity && (
                  <p className="text-xs text-gray-400">數量：{log.quantity}{log.unit ? ` ${log.unit}` : ''}</p>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function WorkReportPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit') ? Number(searchParams.get('edit')) : null;
  const isEditMode = editId != null;
  const [form, setForm] = useState<FormData>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [optionsMap, setOptionsMap] = useState<Record<string, { value: string; label: string }[]>>({});
  const [allEquipment, setAllEquipment] = useState<{ value: string; label: string; category: 'vehicle' | 'machinery' | 'subcon_fleet'; type: string | null }[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  // Track whether form has been initialized from draft/default (to avoid saving on first render)
  const initializedRef = useRef(false);

  // Machine type classification: maps machine_type to the equipment category to show
  const getEquipmentSource = (mt: string | null | undefined): 'vehicle' | 'machinery' | null => {
    if (!mt) return null;
    if (VEHICLE_MACHINE_TYPES.has(mt)) return 'vehicle';
    if (MACHINERY_MACHINE_TYPES.has(mt)) return 'machinery';
    return null;
  };

  // ── 功能 1：草稿恢復 / 編輯模式載入 ─────────────────────────────────────
  useEffect(() => {
    if (isEditMode && editId) {
      // 編輯模式：從 API 載入已有紀錄
      initializedRef.current = true;
      employeePortalApi.getMyWorkLog(editId).then((res) => {
        const log = res.data;
        const isTransport = log.service_type === '運輸';
        setForm({
          work_type: isTransport ? 'transport' : 'engineering',
          service_type: log.service_type ?? '',
          scheduled_date: log.scheduled_date ? log.scheduled_date.slice(0, 10) : new Date().toISOString().split('T')[0],
          client_id: log.client_id ? String(log.client_id) : '',
          client_input: log.client?.name ?? log.unverified_client_name ?? '',
          is_new_client: !log.client_id && !!log.unverified_client_name,
          client_contract_no: log.client_contract_no ?? '',
          tonnage: log.tonnage ?? '',
          machine_type: log.machine_type ?? '',
          equipment_number: isTransport ? '' : (log.equipment_number ?? ''),
          start_location: isTransport ? '' : (log.start_location ?? ''),
          // 工程模式：quantity 儲存天數，work_content 從 remarks 解析
          work_content: (() => {
            if (!log.remarks) return '';
            const match = log.remarks.match(/工作內容：([^\n]*)/);
            return match ? match[1].trim() : '';
          })(),
          eng_quantity: !isTransport ? (log.quantity ?? '') : '',
          plate_no: isTransport ? (log.equipment_number ?? '') : '',
          goods: isTransport ? (log.work_log_product_name ?? '') : '',
          origin: isTransport ? (log.start_location ?? '') : '',
          destination: isTransport ? (log.end_location ?? '') : '',
          quantity: isTransport ? (log.quantity ?? '') : '',
          unit: isTransport ? (log.unit ?? '') : '',
          work_order_no: log.work_order_no ?? '',
          receipt_no: log.receipt_no ?? '',
          start_time: log.start_time ?? '',
          end_time: log.end_time ?? '',
          shift: (log.day_night === 'N' ? 'N' : 'D') as 'D' | 'N',
          mid_shift: log.is_mid_shift ?? false,
          ot_hours: log.ot_quantity ? String(log.ot_quantity) : '',
          remarks: (() => {
            if (!log.remarks) return '';
            // 移除工作內容、更次、中直、超時行，保留其餘為備註
            return log.remarks
              .split('\n')
              .filter(line => !/^工作內容：|^更次：|^中直：|^超時：/.test(line))
              .join('\n')
              .trim();
          })(),
          photo_urls: Array.isArray(log.work_log_photo_urls) ? log.work_log_photo_urls : [],
          signature_url: log.work_log_signature_url ?? '',
        });
      }).catch(() => {});
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as FormData;
        // 恢復草稿，但日期保持今天
        setForm({
          ...draft,
          scheduled_date: new Date().toISOString().split('T')[0],
        });
        setDraftRestored(true);
      }
    } catch {
      // 忽略 JSON 解析錯誤
    }
    initializedRef.current = true;
  }, []);

  // ── 功能 1：草稿自動儲存 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!initializedRef.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // 忽略 localStorage 寫入錯誤
    }
  }, [form]);

  useEffect(() => {
    portalSharedApi
      .getPartners({ type: 'client', limit: 200 })
      .then((res) => {
        const raw = res.data?.data;
        if (Array.isArray(raw)) {
          setClients(raw as ClientItem[]);
        }
      })
      .catch(() => {});

    // Fetch field options
    // Note: FieldOption schema has { id, label, sort_order } — no value field.
    // Use label as value since work-log fields store the label text directly.
    Promise.all(FIELD_OPTION_CATEGORIES.map(cat =>
      portalSharedApi.getFieldOptions(cat).then(res => ({ cat, data: res.data }))
    )).then(results => {
      const newMap: Record<string, { value: string; label: string }[]> = {};
      results.forEach(r => {
        newMap[r.cat] = (r.data as { id: number; label: string; sort_order: number; is_active?: boolean }[])
          .filter((o) => o.is_active !== false)
          .map((o) => ({ value: o.label, label: t(o.label as TranslationKey) }));
      });
      setOptionsMap(newMap);
    }).catch(() => {});

    // Fetch all equipment (vehicles + machinery + subcon fleet) from unified endpoint
    portalSharedApi
      .getAllEquipmentSimple()
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : [];
        // Filter out entries with null/undefined value or label to prevent .trim()/.toLowerCase() errors
        setAllEquipment(items.filter((e) => e && e.value != null && e.label != null));
      })
      .catch(() => {});
  }, []);

  const tonnageOptions = optionsMap['tonnage'] || [];
  const machineTypeOptions = optionsMap['machine_type'] || [];
  const serviceTypeOptions = optionsMap['service_type'] || [];
  const unitOptions = optionsMap['wage_unit'] || [];
  const locationOptions = optionsMap['location'] || [];
  const clientContractNoOptions = optionsMap['client_contract_no'] || [];

  const set = (field: keyof FormData, value: FormData[keyof FormData]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleClientChange = (clientId: string, inputVal: string, isNew: boolean) => {
    setForm((prev) => ({
      ...prev,
      client_id: clientId,
      client_input: inputVal,
      is_new_client: isNew,
    }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const res = await employeePortalApi.uploadPhoto(file);
      if (res.data.url) {
        set('photo_urls', [...form.photo_urls, res.data.url]);
      }
    } catch {}
    setUploadingPhoto(false);
    e.target.value = '';
  };

  const handleSignatureSave = useCallback(async (dataUrl: string) => {
    setUploadingSignature(true);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `signature_${Date.now()}.png`, { type: 'image/png' });
      const uploadRes = await employeePortalApi.uploadPhoto(file);
      if (uploadRes.data.url) {
        set('signature_url', uploadRes.data.url);
      }
    } catch {
      set('signature_url', dataUrl);
    }
    setUploadingSignature(false);
  }, []);

  const handleSignatureClear = useCallback(() => {
    set('signature_url', '');
  }, []);

  // ── 功能 2：從歷史紀錄複製 ────────────────────────────────────────────────
  const handleHistoryCopy = (log: WorkLogHistoryItem) => {
    const today = new Date().toISOString().split('T')[0];
    const isTransport = log.service_type === '運輸';

    // 解析客戶資訊
    const clientId = log.client_id ? String(log.client_id) : '';
    const clientInput = log.client?.name ?? log.unverified_client_name ?? '';
    const isNewClient = !log.client_id && !!log.unverified_client_name;

    setForm((prev) => ({
      ...prev,
      // 日期保持今天
      scheduled_date: today,
      // 工作類型
      work_type: isTransport ? 'transport' : 'engineering',
      // 服務類型
      service_type: log.service_type ?? '',
      // 客戶
      client_id: clientId,
      client_input: clientInput,
      is_new_client: isNewClient,
      // 合約 / 噸數
      client_contract_no: log.client_contract_no ?? '',
      tonnage: log.tonnage ?? '',
      // 機械類型 / 機號
      machine_type: log.machine_type ?? '',
      equipment_number: isTransport ? '' : (log.equipment_number ?? ''),
      plate_no: isTransport ? (log.equipment_number ?? '') : '',
      // 地點
      start_location: isTransport ? '' : (log.start_location ?? ''),
      origin: isTransport ? (log.start_location ?? '') : '',
      destination: isTransport ? (log.end_location ?? '') : '',
      // 時間
      start_time: log.start_time ?? '',
      end_time: log.end_time ?? '',
      // 清空不複製的欄位
      work_content: '',
      eng_quantity: '',
      goods: '',
      quantity: '',
      unit: log.unit ?? '',
      work_order_no: '',
      receipt_no: '',
      shift: 'D',
      mid_shift: false,
      ot_hours: '',
      remarks: '',
      photo_urls: [],
      signature_url: '',
    }));

    setShowHistoryModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const midShiftLabel = form.mid_shift ? '有' : '無';
      const shiftLabel = form.shift === 'D' ? '日更' : '夜更';

      const payload: Record<string, unknown> = {
        service_type: form.work_type === 'engineering' ? (form.service_type || '工程') : '運輸',
        scheduled_date: form.scheduled_date,
        tonnage: form.tonnage || undefined,
        client_contract_no: form.client_contract_no || undefined,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        day_night: form.shift,
        is_mid_shift: form.mid_shift,
        work_content: form.work_content || undefined,
        // OT hours
        ot_hours: form.ot_hours ? Number(form.ot_hours) : undefined,
        // Attachments
        photo_urls: form.photo_urls && form.photo_urls.length > 0 ? form.photo_urls : undefined,
        signature_url: form.signature_url || undefined,
        remarks: [
          
          `更次：${shiftLabel}`,
          `中直：${midShiftLabel}`,
          form.ot_hours ? `超時：${form.ot_hours}小時` : '',
          form.remarks,
        ].filter(Boolean).join('\n') || undefined,
      };

      // Client: either existing id or unverified new name
      if (form.is_new_client && form.client_input.trim()) {
        payload.unverified_client_name = form.client_input.trim();
      } else if (form.client_id) {
        payload.client_id = form.client_id;
      }

      if (form.work_type === 'engineering') {
        payload.machine_type = form.machine_type || undefined;
        payload.equipment_number = form.equipment_number || undefined;
        payload.start_location = form.start_location || undefined;
        // Engineering quantity stored as quantity field (days)
        payload.quantity = form.eng_quantity || undefined;
        payload.unit = form.eng_quantity ? '日' : undefined;
      } else {
        payload.machine_type = form.machine_type || undefined;
        payload.equipment_number = form.plate_no || undefined;
        payload.start_location = form.origin || undefined;
        payload.end_location = form.destination || undefined;
        payload.quantity = form.quantity || undefined;
        payload.unit = form.unit || undefined;
        // 貨物名稱儲存到 work_log_product_name
        payload.work_log_product_name = form.goods || undefined;
        payload.goods_quantity = form.goods ? 1 : undefined;
        payload.work_order_no = form.work_order_no || undefined;
        payload.receipt_no = form.receipt_no || undefined;
      }

      if (isEditMode && editId) {
        await employeePortalApi.updateMyWorkLog(editId, payload as Parameters<typeof employeePortalApi.submitWorkLog>[0]);
        setSuccess('已更新工作紀錄');
        setTimeout(() => router.push('/employee-portal/records'), 1200);
      } else {
        await employeePortalApi.submitWorkLog(payload as Parameters<typeof employeePortalApi.submitWorkLog>[0]);
        // 提交成功後清除草稿
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        setDraftRestored(false);
        setSuccess(t('workReportSuccess'));
        setForm({ ...defaultForm, scheduled_date: form.scheduled_date });
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';
  const selectClass = inputClass + ' appearance-none';

  return (
    <div className="p-4 pb-6">
      {/* Title row with history copy button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isEditMode && (
            <button
              type="button"
              onClick={() => router.push('/employee-portal/records')}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ‹
            </button>
          )}
          <h1 className="text-xl font-bold text-gray-900">
            {isEditMode ? '編輯工作紀錄' : t('workReportTitle')}
          </h1>
        </div>
        {!isEditMode && (
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-colors"
          >
            📋 {t("copyFromHistory")}
          </button>
        )}
      </div>

      {/* 草稿恢復提示 */}
      {draftRestored && (
        <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-medium flex items-center justify-between">
          <span>📝 {t("restoreDraft")}</span>
          <button
            type="button"
            onClick={() => {
              try { localStorage.removeItem(DRAFT_KEY); } catch {}
              setForm({ ...defaultForm });
              setDraftRestored(false);
            }}
            className="ml-2 text-amber-500 hover:text-amber-700 underline"
          >
            {t("clear")}
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium text-center">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium text-center">
          ❌ {error}
        </div>
      )}

      {/* Work Type Toggle */}
      <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 flex mb-4">
        <button
          type="button"
          onClick={() => set('work_type', 'engineering')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            form.work_type === 'engineering'
              ? 'bg-blue-700 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏗️ {t('engineering')}
        </button>
        <button
          type="button"
          onClick={() => set('work_type', 'transport')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            form.work_type === 'transport'
              ? 'bg-blue-700 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🚛 {t('transport')}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Common Fields */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm border-b pb-2">{t('basicInfo')}</h3>

          <div>
            <label className={labelClass}>{t('scheduledDate')}</label>
            <input
              type="date"
              value={form.scheduled_date}
              onChange={(e) => set('scheduled_date', e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>{t('serviceType')}</label>
            <Combobox
              value={form.service_type}
              onChange={(val) => set('service_type', val)}
              options={serviceTypeOptions}
              placeholder="選擇或輸入服務類型"
              className={inputClass}
            />
          </div>

          {/* Client Combobox */}
          <div>
            <label className={labelClass}>{t('client')}</label>
            <ClientCombobox
              clients={clients}
              value={form.client_id}
              inputValue={form.client_input}
              isNew={form.is_new_client}
              onChange={handleClientChange}
            />
          </div>

          <div>
            <label className={labelClass}>{t("clientContract")}</label>
            <ContractCombobox
              value={form.client_contract_no}
              onChange={(val) => set('client_contract_no', val)}
              options={clientContractNoOptions}
              onAddOption={async (val) => {
                try {
                  await portalSharedApi.createFieldOption({ category: 'client_contract_no', label: val });
                  setOptionsMap(prev => ({
                    ...prev,
                    client_contract_no: [...(prev['client_contract_no'] || []), { value: val, label: val }],
                  }));
                } catch {}
              }}
              placeholder="合約號碼"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t('tonnage')}</label>
            <Combobox
              value={form.tonnage}
              onChange={(val) => set('tonnage', val)}
              options={tonnageOptions}
              placeholder={t('selectTonnage')}
              className={inputClass}
            />
          </div>
        </div>

        {/* Engineering-specific fields */}
        {form.work_type === 'engineering' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <h3 className="font-semibold text-gray-800 text-sm border-b pb-2">🏗️ {t('engineering')}</h3>

            <div>
              <label className={labelClass}>{t('machinery')}</label>
              <Combobox
                value={form.machine_type}
                onChange={(val) => set('machine_type', val)}
                options={machineTypeOptions}
                placeholder={t('selectMachinery')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('machineNo')}</label>
              <Combobox
                value={form.equipment_number}
                onChange={(val) => set('equipment_number', val)}
                options={(() => {
                  const src = getEquipmentSource(form.machine_type);
                  if (src === 'vehicle') return allEquipment.filter(e => e.category === 'vehicle' || e.category === 'subcon_fleet');
                  if (src === 'machinery') return allEquipment.filter(e => e.category === 'machinery');
                  return allEquipment;
                })()}
                placeholder="選擇或輸入機號"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('location')}</label>
              <Combobox
                value={form.start_location}
                onChange={(val) => set('start_location', val)}
                options={locationOptions}
                placeholder="工作地點"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('workContent')}</label>
              <textarea
                value={form.work_content}
                onChange={(e) => set('work_content', e.target.value)}
                className={inputClass + ' resize-none'}
                rows={3}
                placeholder="工作內容描述"
              />
            </div>

            {/* Engineering quantity in days */}
            <div>
              <label className={labelClass}>{t('engQuantity')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={form.eng_quantity}
                  onChange={(e) => set('eng_quantity', e.target.value)}
                  className={inputClass}
                  placeholder="0"
                  min="0"
                  step="0.5"
                />
                <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">{t('days')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Transport-specific fields */}
        {form.work_type === 'transport' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <h3 className="font-semibold text-gray-800 text-sm border-b pb-2">🚛 {t('transport')}</h3>

            <div>
              <label className={labelClass}>{t('vehicleType')}</label>
              <Combobox
                value={form.machine_type}
                onChange={(val) => set('machine_type', val)}
                options={machineTypeOptions}
                placeholder={t('selectVehicleType')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('plateNo')}</label>
              <Combobox
                value={form.plate_no}
                onChange={(val) => set('plate_no', val)}
                options={allEquipment.filter(e => e.category === 'vehicle' || e.category === 'subcon_fleet')}
                placeholder="選擇或輸入車牌"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('goods')}</label>
              <input
                type="text"
                value={form.goods}
                onChange={(e) => set('goods', e.target.value)}
                className={inputClass}
                placeholder="貨物名稱"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>{t('quantity')}</label>
                <input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                  className={inputClass}
                  placeholder="0"
                  min="0"
                  step="0.5"
                />
              </div>
              <div>
                <label className={labelClass}>{t('unit')}</label>
                <select value={form.unit} onChange={(e) => set('unit', e.target.value)} className={selectClass}>
                  <option value="">單位</option>
                  {unitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>{t('origin')}</label>
                <Combobox
                  value={form.origin}
                  onChange={(val) => set('origin', val)}
                  options={locationOptions}
                  placeholder="起點地址"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('destination')}</label>
                <Combobox
                  value={form.destination}
                  onChange={(val) => set('destination', val)}
                  options={locationOptions}
                  placeholder="終點地址"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* Time & Shift */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm border-b pb-2">{t('time')}</h3>

          {/* Day / Night Shift Selector */}
          <div>
            <label className={labelClass}>{t('shift')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('shift', 'D')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${
                  form.shift === 'D'
                    ? 'bg-amber-400 border-amber-400 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-amber-300'
                }`}
              >
                ☀️ {t('dayShift')}
              </button>
              <button
                type="button"
                onClick={() => set('shift', 'N')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${
                  form.shift === 'N'
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300'
                }`}
              >
                🌙 {t('nightShift')}
              </button>
            </div>
          </div>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>{t('timeFrom')}</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => set('start_time', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('timeTo')}</label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => set('end_time', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Mid Shift — Yes / No buttons */}
          <div>
            <label className={labelClass}>{t('midShift')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('mid_shift', true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${
                  form.mid_shift
                    ? 'bg-green-600 border-green-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-green-300'
                }`}
              >
                ✓ {t('midShiftYes')}
              </button>
              <button
                type="button"
                onClick={() => set('mid_shift', false)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${
                  !form.mid_shift
                    ? 'bg-gray-600 border-gray-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
                }`}
              >
                ✕ {t('midShiftNo')}
              </button>
            </div>
          </div>

          {/* OT Hours — number input */}
          <div>
            <label className={labelClass}>{t('otHours')}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={form.ot_hours}
                onChange={(e) => set('ot_hours', e.target.value)}
                className={inputClass}
                placeholder="0"
                min="0"
                step="0.5"
              />
              <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">{t('hours')}</span>
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('remarks')}</label>
            <textarea
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              className={inputClass + ' resize-none'}
              rows={2}
              placeholder={t('optional')}
            />
          </div>
        </div>

        {/* Photo Upload */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">{t('uploadPhotos')}</h3>
          <div className="flex gap-2 flex-wrap">
            {form.photo_urls.map((url, i) => (
              <div key={i} className="relative">
                <img src={url} alt={`photo ${i + 1}`} className="w-20 h-20 object-cover rounded-xl" />
                <button
                  type="button"
                  onClick={() => set('photo_urls', form.photo_urls.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
            <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
              <span className="text-2xl text-gray-400">+</span>
              <span className="text-xs text-gray-400">{uploadingPhoto ? '...' : t('upload')}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
          </div>
        </div>

        {/* Signature Pad */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">
            ✍️ {t('signature')}
            {uploadingSignature && (
              <span className="ml-2 text-xs text-gray-400 font-normal">{t('loading')}</span>
            )}
          </h3>
          <SignaturePad
            onSave={handleSignatureSave}
            onClear={handleSignatureClear}
            hasSignature={!!form.signature_url}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-blue-700 text-white font-bold rounded-2xl text-base hover:bg-blue-800 active:bg-blue-900 transition-colors disabled:opacity-50 shadow-md"
        >
          {loading ? t('loading') : (isEditMode ? t('updateRecord') : t('submitWorkReport'))}
        </button>
      </form>

      {/* History Copy Modal */}
      {showHistoryModal && (
        <HistoryCopyModal
          onClose={() => setShowHistoryModal(false)}
          onSelect={handleHistoryCopy}
        />
      )}
    </div>
  );
}
