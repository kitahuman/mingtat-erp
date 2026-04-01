'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';

const TONNAGE_OPTIONS = ['3噸','5.5噸','8噸','10噸','11噸','13噸','14噸','20噸','24噸','30噸','33噸','35噸','38噸','44噸','49噸'];
const VEHICLE_TYPES = ['平斗','勾斗','夾斗','拖頭','車斗','貨車','輕型貨車','私家車','燈車'];
const MACHINERY_TYPES = ['挖掘機','火轆'];
const UNIT_OPTIONS = ['小時','車','天','周','月','噸','M','M2','M3','JOB','工','次','轉','trip','晚'];
const CATEGORY_OPTIONS = ['工程','運輸','代工','機械','管工工作','維修保養','雜務','上堂','緊急情況'];

interface FormData {
  work_type: 'engineering' | 'transport';
  service_type: string;
  scheduled_date: string;
  client_id: string;
  contract_no: string;
  tonnage: string;
  // Engineering
  machine_type: string;
  equipment_number: string;
  start_location: string;
  work_content: string;
  // Transport
  vehicle_type: string;
  plate_no: string;
  goods: string;
  origin: string;
  destination: string;
  // Common
  start_time: string;
  end_time: string;
  shift: 'D' | 'N';
  mid_shift: boolean;
  quantity: string;
  unit: string;
  overtime: boolean;
  remarks: string;
  photo_urls: string[];
  signature_url: string;
}

const defaultForm: FormData = {
  work_type: 'engineering',
  service_type: '',
  scheduled_date: new Date().toISOString().split('T')[0],
  client_id: '',
  contract_no: '',
  tonnage: '',
  machine_type: '',
  equipment_number: '',
  start_location: '',
  work_content: '',
  vehicle_type: '',
  plate_no: '',
  goods: '',
  origin: '',
  destination: '',
  start_time: '',
  end_time: '',
  shift: 'D',
  mid_shift: false,
  quantity: '',
  unit: '',
  overtime: false,
  remarks: '',
  photo_urls: [],
  signature_url: '',
};

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
    // Save signature
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

  useEffect(() => {
    portalSharedApi
      .getPartners({ type: 'client', limit: 200 })
      .then((res) => setClients(res.data?.data || []))
      .catch(() => {});
  }, []);

  const set = (field: keyof FormData, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

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
    // Convert dataUrl to File and upload
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
      // If upload fails, store dataUrl locally as fallback
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
        client_id: form.client_id || undefined,
        tonnage: form.tonnage || undefined,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        day_night: form.shift,
        quantity: form.quantity || undefined,
        unit: form.unit || undefined,
        remarks: [
          form.work_content ? `工作內容：${form.work_content}` : '',
          `更次：${shiftLabel}`,
          `中直：${midShiftLabel}`,
          form.overtime ? '超時工作' : '',
          form.signature_url ? `簽名：${form.signature_url}` : '',
          form.remarks,
        ].filter(Boolean).join('\n') || undefined,
      };

      if (form.work_type === 'engineering') {
        payload.machine_type = form.machine_type || undefined;
        payload.equipment_number = form.equipment_number || undefined;
        payload.start_location = form.start_location || undefined;
      } else {
        payload.machine_type = form.vehicle_type || undefined;
        payload.equipment_number = form.plate_no || undefined;
        payload.start_location = form.origin || undefined;
        payload.end_location = form.destination || undefined;
        payload.goods_quantity = form.goods ? 1 : undefined;
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
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
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
          <h3 className="font-semibold text-gray-800 text-sm border-b pb-2">{t('scheduledDate')}</h3>

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
            <label className={labelClass}>{t('category')}</label>
            <select value={form.service_type} onChange={(e) => set('service_type', e.target.value)} className={selectClass}>
              <option value="">{t('selectCategory')}</option>
              {CATEGORY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>{t('client')}</label>
            <select value={form.client_id} onChange={(e) => set('client_id', e.target.value)} className={selectClass}>
              <option value="">{t('selectClient')}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>{t('contract')}</label>
            <input
              type="text"
              value={form.contract_no}
              onChange={(e) => set('contract_no', e.target.value)}
              className={inputClass}
              placeholder="合約號碼"
            />
          </div>

          <div>
            <label className={labelClass}>{t('tonnage')}</label>
            <select value={form.tonnage} onChange={(e) => set('tonnage', e.target.value)} className={selectClass}>
              <option value="">{t('selectTonnage')}</option>
              {TONNAGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* Engineering-specific fields */}
        {form.work_type === 'engineering' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <h3 className="font-semibold text-gray-800 text-sm border-b pb-2">🏗️ {t('engineering')}</h3>

            <div>
              <label className={labelClass}>{t('machinery')}</label>
              <select value={form.machine_type} onChange={(e) => set('machine_type', e.target.value)} className={selectClass}>
                <option value="">{t('selectMachinery')}</option>
                {MACHINERY_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>{t('machineNo')}</label>
              <input
                type="text"
                value={form.equipment_number}
                onChange={(e) => set('equipment_number', e.target.value)}
                className={inputClass}
                placeholder="機械編號"
              />
            </div>

            <div>
              <label className={labelClass}>{t('location')}</label>
              <input
                type="text"
                value={form.start_location}
                onChange={(e) => set('start_location', e.target.value)}
                className={inputClass}
                placeholder="工作地點"
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
          </div>
        )}

        {/* Transport-specific fields */}
        {form.work_type === 'transport' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <h3 className="font-semibold text-gray-800 text-sm border-b pb-2">🚛 {t('transport')}</h3>

            <div>
              <label className={labelClass}>{t('vehicleType')}</label>
              <select value={form.vehicle_type} onChange={(e) => set('vehicle_type', e.target.value)} className={selectClass}>
                <option value="">{t('selectVehicleType')}</option>
                {VEHICLE_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>{t('plateNo')}</label>
              <input
                type="text"
                value={form.plate_no}
                onChange={(e) => set('plate_no', e.target.value)}
                className={inputClass}
                placeholder="車牌號碼"
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
                  {UNIT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Time & Shift */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm border-b pb-2">{t('time')}</h3>

          {/* Day / Night Shift Selector — above time inputs */}
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

          {/* Overtime */}
          <div className="flex items-center justify-between py-1">
            <label className="text-sm font-semibold text-gray-700">{t('overtime')}</label>
            <button
              type="button"
              onClick={() => set('overtime', !form.overtime)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.overtime ? 'bg-blue-700' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.overtime ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
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
