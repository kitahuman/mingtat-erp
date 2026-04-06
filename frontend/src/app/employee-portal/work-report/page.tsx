'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';

// Field options categories
const FIELD_OPTION_CATEGORIES = ['tonnage', 'machine_type', 'service_type', 'wage_unit', 'location', 'client_contract_no'];

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
  goods: string;
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
                {o.label}
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
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Client Combobox ──────────────────────────────────────────────────────────
function ClientCombobox({
  clients,
  value,
  inputValue,
  isNew,
  onChange,
}: {
  clients: any[];
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

  const handleSelect = (client: any) => {
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

// ── Main Page ────────────────────────────────────────────────────────────────
export default function WorkReportPage() {
  const { t } = useI18n();
  const [form, setForm] = useState<FormData>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [optionsMap, setOptionsMap] = useState<Record<string, {value: string, label: string}[]>>({});
  const [allEquipment, setAllEquipment] = useState<{value: string; label: string; category?: string}[]>([]);

  // Machine type classification (mirrors admin work-logs constants)
  const VEHICLE_MACHINE_TYPES = new Set(['平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車']);
  const MACHINERY_MACHINE_TYPES = new Set(['挖掘機', '火轆']);
  const getEquipmentSource = (mt: string | null | undefined): 'vehicle' | 'machinery' | null => {
    if (!mt) return null;
    if (VEHICLE_MACHINE_TYPES.has(mt)) return 'vehicle';
    if (MACHINERY_MACHINE_TYPES.has(mt)) return 'machinery';
    return null;
  };

  useEffect(() => {
    portalSharedApi
      .getPartners({ type: 'client', limit: 200 })
      .then((res) => setClients(res.data?.data || []))
      .catch(() => {});

    // Fetch field options
    Promise.all(FIELD_OPTION_CATEGORIES.map(cat => 
      portalSharedApi.getFieldOptions(cat).then(res => ({ cat, data: res.data }))
    )).then(results => {
      const newMap: any = {};
      results.forEach(r => {
        newMap[r.cat] = r.data.map((o: any) => ({ value: o.value, label: o.label }));
      });
      setOptionsMap(newMap);
    }).catch(() => {});

    // Fetch equipment lists (vehicles + machinery + street fleet)
    Promise.all([
      portalSharedApi.getVehiclesSimple().catch(() => ({ data: [] })),
      portalSharedApi.getMachinerySimple().catch(() => ({ data: [] })),
      portalSharedApi.getSubconFleetSimple().catch(() => ({ data: [] })),
    ]).then(([veh, mach, subcon]) => {
      const combined = [
        ...(veh.data || []),
        ...(mach.data || []),
        ...(subcon.data || []),
      ];
      // Filter out entries with null/undefined value or label to prevent .trim()/.toLowerCase() errors
      setAllEquipment(combined.filter(e => e && e.value != null && e.label != null));
    }).catch(() => {});
  }, []);

  const tonnageOptions = optionsMap['tonnage'] || [];
  const machineTypeOptions = optionsMap['machine_type'] || [];
  const serviceTypeOptions = optionsMap['service_type'] || [];
  const unitOptions = optionsMap['wage_unit'] || [];
  const locationOptions = optionsMap['location'] || [];
  const clientContractNoOptions = optionsMap['client_contract_no'] || [];

  const set = (field: keyof FormData, value: any) =>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const midShiftLabel = form.mid_shift ? '有' : '無';
      const shiftLabel = form.shift === 'D' ? '日更' : '夜更';

      const payload: any = {
        service_type: form.work_type === 'engineering' ? (form.service_type || '工程') : '運輸',
        scheduled_date: form.scheduled_date,
        tonnage: form.tonnage || undefined,
        client_contract_no: form.client_contract_no || undefined,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        day_night: form.shift,
        // OT hours
        ot_hours: form.ot_hours ? Number(form.ot_hours) : undefined,
        remarks: [
          form.work_content ? `工作內容：${form.work_content}` : '',
          `更次：${shiftLabel}`,
          `中直：${midShiftLabel}`,
          form.ot_hours ? `超時：${form.ot_hours}小時` : '',
          form.signature_url ? `簽名：${form.signature_url}` : '',
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
        // Engineering quantity in days
        payload.eng_quantity = form.eng_quantity || undefined;
      } else {
        payload.machine_type = form.machine_type || undefined;
        payload.equipment_number = form.plate_no || undefined;
        payload.start_location = form.origin || undefined;
        payload.end_location = form.destination || undefined;
        payload.quantity = form.quantity || undefined;
        payload.unit = form.unit || undefined;
        payload.goods_quantity = form.goods ? 1 : undefined;
        payload.work_order_no = form.work_order_no || undefined;
        payload.receipt_no = form.receipt_no || undefined;
      }

      await employeePortalApi.submitWorkLog(payload);
      setSuccess(t('workReportSuccess'));
      setForm({ ...defaultForm, scheduled_date: form.scheduled_date });
    } catch (err: any) {
      setError(err.response?.data?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';
  const selectClass = inputClass + ' appearance-none';

  return (
    <div className="p-4 pb-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('workReportTitle')}</h1>

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
            <label className={labelClass}>客戶合約</label>
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

            <div>
              <label className={labelClass}>{t('origin')}</label>
              <input
                type="text"
                value={form.origin}
                onChange={(e) => set('origin', e.target.value)}
                className={inputClass}
                placeholder="起點地址"
              />
            </div>

            <div>
              <label className={labelClass}>{t('destination')}</label>
              <input
                type="text"
                value={form.destination}
                onChange={(e) => set('destination', e.target.value)}
                className={inputClass}
                placeholder="終點地址"
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

            {/* Work Order No & Receipt No — transport only */}
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
          {loading ? t('loading') : t('submitWorkReport')}
        </button>
      </form>
    </div>
  );
}
