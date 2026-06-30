'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { paymentInApi } from '@/lib/api';
import Cookies from 'js-cookie';

type ReceiptPdfLanguage = 'zh' | 'en' | 'bilingual';

type ReceiptPreviewOptions = {
  language: ReceiptPdfLanguage;
  show_client_address: boolean;
  show_client_phone: boolean;
  show_client_contact: boolean;
  show_client_signature: boolean;
  show_company_signature: boolean;
  show_company_stamp: boolean;
  client_name: string;
};

const DEFAULT_OPTIONS: ReceiptPreviewOptions = {
  language: 'zh',
  show_client_address: true,
  show_client_phone: true,
  show_client_contact: true,
  show_client_signature: false,
  show_company_signature: true,
  show_company_stamp: false,
  client_name: '',
};

export default function ReceiptPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const paymentInId = Number(id);

  const [record, setRecord] = useState<any>(null);
  const [options, setOptions] = useState<ReceiptPreviewOptions>(DEFAULT_OPTIONS);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [error, setError] = useState('');

  const latestOptionsRef = useRef<ReceiptPreviewOptions>(DEFAULT_OPTIONS);
  const lastSavedSignatureRef = useRef('');

  useEffect(() => {
    latestOptionsRef.current = options;
  }, [options]);

  // ── Build save payload (maps to receipt_options JSON) ─────────
  const buildSavePayload = useCallback((current: ReceiptPreviewOptions) => ({
    language: current.language,
    showClientAddress: current.show_client_address,
    showClientPhone: current.show_client_phone,
    showClientContact: current.show_client_contact,
    showClientSignature: current.show_client_signature,
    showCompanySignature: current.show_company_signature,
    showCompanyStamp: current.show_company_stamp,
    overrideClientName: current.client_name || null,
  }), []);

  const getOptionsSignature = useCallback(
    (current: ReceiptPreviewOptions) => JSON.stringify(buildSavePayload(current)),
    [buildSavePayload],
  );

  // ── Request params for PDF preview/download ───────────────────
  const requestParams = useMemo(
    () => ({
      language: options.language,
      show_client_address: options.show_client_address,
      show_client_phone: options.show_client_phone,
      show_client_contact: options.show_client_contact,
      show_client_signature: options.show_client_signature,
      show_company_signature: options.show_company_signature,
      show_company_stamp: options.show_company_stamp,
      client_name: options.client_name,
    }),
    [
      options.language,
      options.show_client_address,
      options.show_client_phone,
      options.show_client_contact,
      options.show_client_signature,
      options.show_company_signature,
      options.show_company_stamp,
      options.client_name,
    ],
  );

  // ── Load payment-in record & saved receipt_options ────────────
  useEffect(() => {
    if (!Number.isFinite(paymentInId)) return;

    paymentInApi
      .get(paymentInId)
      .then((res) => {
        const data = res.data;
        setRecord(data);

        // Resolve default client name from payer/project/allocation
        const defaultClientName =
          data.payer_name ||
          data.payer_partner?.name ||
          data.project?.client?.name ||
          (data.allocations?.[0]?.invoice?.client?.name) ||
          '';

        // Hydrate options from saved receipt_options
        const saved = data.receipt_options || {};
        setOptions((prev) => {
          const loaded: ReceiptPreviewOptions = {
            ...prev,
            language: saved.language ?? prev.language,
            show_client_address: saved.showClientAddress ?? prev.show_client_address,
            show_client_phone: saved.showClientPhone ?? prev.show_client_phone,
            show_client_contact: saved.showClientContact ?? prev.show_client_contact,
            show_client_signature: saved.showClientSignature ?? prev.show_client_signature,
            show_company_signature: saved.showCompanySignature ?? prev.show_company_signature,
            show_company_stamp: saved.showCompanyStamp ?? prev.show_company_stamp,
            client_name: saved.overrideClientName || defaultClientName,
          };
          latestOptionsRef.current = loaded;
          lastSavedSignatureRef.current = getOptionsSignature(loaded);
          return loaded;
        });
      })
      .catch(() => router.push('/payment-in'));
  }, [paymentInId, router, getOptionsSignature]);

  // ── Live PDF preview ──────────────────────────────────────────
  useEffect(() => {
    if (!Number.isFinite(paymentInId)) return;

    let active = true;
    let objectUrl = '';

    setLoadingPreview(true);
    setError('');

    paymentInApi
      .exportReceiptPdf(paymentInId, requestParams)
      .then((res) => {
        const blob = new Blob([res.data], { type: 'application/pdf' });
        objectUrl = window.URL.createObjectURL(blob);
        if (!active) {
          window.URL.revokeObjectURL(objectUrl);
          return;
        }
        setPdfUrl((previousUrl) => {
          if (previousUrl) window.URL.revokeObjectURL(previousUrl);
          return objectUrl;
        });
      })
      .catch((err: any) => {
        if (!active) return;
        setPdfUrl((previousUrl) => {
          if (previousUrl) window.URL.revokeObjectURL(previousUrl);
          return '';
        });
        setError(err.response?.data?.message || '載入收據預覽失敗');
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });

    return () => {
      active = false;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [paymentInId, requestParams]);

  // ── Save receipt options ──────────────────────────────────────
  const saveReceiptOptions = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!Number.isFinite(paymentInId)) return false;

      const currentOptions = latestOptionsRef.current;
      const signature = getOptionsSignature(currentOptions);
      if (signature === lastSavedSignatureRef.current) return true;

      setSavingChanges(true);
      try {
        await paymentInApi.saveReceiptOptions(paymentInId, buildSavePayload(currentOptions));
        lastSavedSignatureRef.current = signature;
        // Refresh record to get updated receipt_no
        const res = await paymentInApi.get(paymentInId);
        setRecord(res.data);
        return true;
      } catch (err: any) {
        if (!silent) {
          alert(err.response?.data?.message || '儲存收據設定失敗');
        }
        return false;
      } finally {
        setSavingChanges(false);
      }
    },
    [buildSavePayload, getOptionsSignature, paymentInId],
  );

  // ── Keepalive save on page unload ─────────────────────────────
  const saveReceiptOptionsKeepalive = useCallback(() => {
    if (!Number.isFinite(paymentInId)) return;

    const currentOptions = latestOptionsRef.current;
    const payload = buildSavePayload(currentOptions);
    const signature = JSON.stringify(payload);
    if (signature === lastSavedSignatureRef.current) return;

    const token = Cookies.get('token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || '/api'}/payment-in/${paymentInId}/receipt-options`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
      },
    ).catch(() => undefined);

    lastSavedSignatureRef.current = signature;
  }, [buildSavePayload, paymentInId]);

  useEffect(() => {
    window.addEventListener('beforeunload', saveReceiptOptionsKeepalive);
    window.addEventListener('pagehide', saveReceiptOptionsKeepalive);
    return () => {
      window.removeEventListener('beforeunload', saveReceiptOptionsKeepalive);
      window.removeEventListener('pagehide', saveReceiptOptionsKeepalive);
    };
  }, [saveReceiptOptionsKeepalive]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleBack = async () => {
    const saved = await saveReceiptOptions();
    if (saved) router.push(`/payment-in/${paymentInId}`);
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await paymentInApi.exportReceiptPdf(paymentInId, requestParams);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const receiptNo = record?.receipt_no || `RCP-${paymentInId}`;
      link.download = `${receiptNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.message || '下載收據 PDF 失敗');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const res = await paymentInApi.exportReceiptPdf(paymentInId, requestParams);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const pdfWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (!pdfWindow) {
        window.URL.revokeObjectURL(url);
        alert('瀏覽器已阻擋彈出視窗，請允許彈出視窗後再列印');
        return;
      }
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      alert(err.response?.data?.message || '開啟列印視窗失敗');
    } finally {
      setPrinting(false);
    }
  };

  const handleSaveToDocument = async () => {
    const success = await saveReceiptOptions();
    if (success) {
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 2000);
    }
  };

  const updateOption = <K extends keyof ReceiptPreviewOptions>(
    key: K,
    value: ReceiptPreviewOptions[K],
  ) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen flex-col gap-4 bg-gray-100 px-4 py-4">
      {/* Header & Controls */}
      <section className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            收據預覽
          </div>
          <h1 className="font-mono text-lg font-bold text-gray-900">
            {record?.receipt_no
              ? `收據 ${record.receipt_no}`
              : `收款記錄 #${paymentInId}`}
          </h1>
          {record?.receipt_no && (
            <div className="text-xs text-gray-500">收據編號：{record.receipt_no}</div>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadPdf}
            className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={downloading || loadingPreview}
          >
            {downloading ? '下載中...' : '下載 PDF'}
          </button>
          <button
            onClick={handlePrint}
            className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={printing || loadingPreview || !pdfUrl}
          >
            {printing ? '開啟中...' : '列印'}
          </button>
          <button
            onClick={handleSaveToDocument}
            className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={savingChanges}
          >
            {savingChanges ? '儲存中...' : showSavedToast ? '✅ 已儲存' : '儲存設定'}
          </button>
          <button
            onClick={handleBack}
            className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={savingChanges}
          >
            {savingChanges ? '儲存中...' : '返回'}
          </button>
        </div>

        {/* Client name override */}
        <div className="mt-3 flex flex-col gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-gray-700">
          <label className="font-medium text-gray-700">客戶名稱（顯示於收據）</label>
          <input
            type="text"
            value={options.client_name}
            onChange={(e) => updateOption('client_name', e.target.value)}
            placeholder="客戶名稱"
            className="input-field h-8 w-full max-w-md py-0 text-sm"
          />
          <span className="text-xs text-gray-500">
            修改後會在離開或儲存時自動更新此收款記錄的客戶顯示名稱。
          </span>
        </div>

        {/* Language & signature options */}
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <label className="flex items-center gap-2">
            <span className="font-medium">語言</span>
            <select
              value={options.language}
              onChange={(e) =>
                updateOption('language', e.target.value as ReceiptPdfLanguage)
              }
              className="input-field h-8 min-w-[100px] py-0 text-sm"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="bilingual">雙語</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={options.show_client_signature}
                onChange={(e) =>
                  updateOption('show_client_signature', e.target.checked)
                }
              />
              客戶簽名欄
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={options.show_company_signature}
                onChange={(e) =>
                  updateOption('show_company_signature', e.target.checked)
                }
              />
              公司簽名欄
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={options.show_company_stamp}
                onChange={(e) =>
                  updateOption('show_company_stamp', e.target.checked)
                }
              />
              蓋上公司印
            </label>
          </div>
        </div>

        {/* Client info display options */}
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
          <div className="mb-2 font-medium text-gray-800">客人資料顯示設定</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={options.show_client_address}
                onChange={(e) =>
                  updateOption('show_client_address', e.target.checked)
                }
              />
              地址
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={options.show_client_contact}
                onChange={(e) =>
                  updateOption('show_client_contact', e.target.checked)
                }
              />
              聯絡人
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={options.show_client_phone}
                onChange={(e) =>
                  updateOption('show_client_phone', e.target.checked)
                }
              />
              電話
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            預設值來自付款人/合作單位的客人資料；你可在此即時修改後預覽、列印或下載。
          </p>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* PDF Preview */}
      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-200 shadow-sm"
        style={{ minHeight: '85vh' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          <div className="font-medium">收據預覽</div>
          <div className="text-xs text-gray-500">
            預覽內容由後端 PDF 直接生成，與下載檔案一致。
          </div>
        </div>
        <div
          className="flex-1 bg-gray-300 p-2"
          style={{ minHeight: 'calc(85vh - 50px)' }}
        >
          {loadingPreview ? (
            <div
              className="flex items-center justify-center bg-white text-sm font-medium text-gray-600"
              style={{ height: 'calc(85vh - 50px)' }}
            >
              載入預覽中...
            </div>
          ) : pdfUrl ? (
            <iframe
              title="收據 PDF 預覽"
              src={`${pdfUrl}#page=1&zoom=page-width`}
              className="w-full border-0 bg-white shadow-lg"
              style={{ height: 'calc(85vh - 50px)' }}
            />
          ) : (
            <div
              className="flex items-center justify-center bg-white text-sm text-gray-500"
              style={{ height: 'calc(85vh - 50px)' }}
            >
              尚無預覽內容
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
