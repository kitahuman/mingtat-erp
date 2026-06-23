'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { invoicesApi, paymentTermTemplatesApi, systemSettingsApi } from '@/lib/api';
import PaymentTermsSelector from '@/components/PaymentTermsSelector';
import Cookies from 'js-cookie';

type InvoicePdfLanguage = 'zh' | 'en' | 'bilingual';

type PdfPreviewOptions = {
  language: InvoicePdfLanguage;
  show_bank: boolean;
  show_client_address: boolean;
  show_client_phone: boolean;
  show_client_contact: boolean;
  show_client_signature: boolean;
  show_company_signature: boolean;
  show_company_stamp: boolean;
  override_payment_terms: string;
  client_address: string;
  client_contact: string;
  client_phone: string;
  display_client_name: string;
  font_size_title: number;
  font_size_item_name: number;
  font_size_item_desc: number;
  font_size_payment_terms: number;
};

const DEFAULT_OPTIONS: PdfPreviewOptions = {
  language: 'zh',
  show_bank: true,
  show_client_address: true,
  show_client_phone: true,
  show_client_contact: true,
  show_client_signature: true,
  show_company_signature: true,
  show_company_stamp: false,
  override_payment_terms: '',
  client_address: '',
  client_contact: '',
  client_phone: '',
  display_client_name: '',
  font_size_title: 25,
  font_size_item_name: 13,
  font_size_item_desc: 9,
  font_size_payment_terms: 11,
};

let SYSTEM_DEFAULTS: PdfPreviewOptions = { ...DEFAULT_OPTIONS };

export default function InvoicePdfPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = Number(id);

  const [invoice, setInvoice] = useState<any>(null);
  const [options, setOptions] = useState<PdfPreviewOptions>(SYSTEM_DEFAULTS);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [error, setError] = useState('');
  const latestOptionsRef = useRef<PdfPreviewOptions>(DEFAULT_OPTIONS);
  const lastSavedSignatureRef = useRef('');

  useEffect(() => {
    latestOptionsRef.current = options;
  }, [options]);

  const buildSavePayload = useCallback((current: PdfPreviewOptions) => ({
    invoice_custom_payment_terms: current.override_payment_terms || null,
    display_client_name: current.display_client_name || null,
    invoice_language: current.language,
    invoice_show_bank: current.show_bank,
    invoice_show_client_address: current.show_client_address,
    invoice_show_client_phone: current.show_client_phone,
    pdf_font_sizes: {
      title: current.font_size_title,
      itemName: current.font_size_item_name,
      itemDesc: current.font_size_item_desc,
      paymentTerms: current.font_size_payment_terms,
    },
  }), []);

  const getOptionsSignature = useCallback(
    (current: PdfPreviewOptions) => JSON.stringify(buildSavePayload(current)),
    [buildSavePayload],
  );

  const requestParams = useMemo(
    () => ({
      language: options.language,
      show_bank: options.show_bank,
      show_client_address: options.show_client_address,
      show_client_phone: options.show_client_phone,
      show_client_contact: options.show_client_contact,
      show_client_info: true,
      show_client_signature: options.show_client_signature,
      show_company_signature: options.show_company_signature,
      show_company_stamp: options.show_company_stamp,
      override_payment_terms: options.override_payment_terms,
      client_address: options.client_address,
      client_contact: options.client_contact,
      client_phone: options.client_phone,
      client_name: options.display_client_name,
      font_size_title: options.font_size_title,
      font_size_item_name: options.font_size_item_name,
      font_size_item_desc: options.font_size_item_desc,
      font_size_payment_terms: options.font_size_payment_terms,
    }),
    [
      options.language,
      options.show_bank,
      options.show_client_address,
      options.show_client_phone,
      options.show_client_contact,
      options.show_client_signature,
      options.show_company_signature,
      options.show_company_stamp,
      options.override_payment_terms,
      options.client_address,
      options.client_contact,
      options.client_phone,
      options.display_client_name,
      options.font_size_title,
      options.font_size_item_name,
      options.font_size_item_desc,
      options.font_size_payment_terms,
    ],
  );

  useEffect(() => {
    // Load system defaults on mount
    systemSettingsApi.getAll().then(res => {
      const settings = res.data || {};
      SYSTEM_DEFAULTS = {
        ...DEFAULT_OPTIONS,
        language: (settings.print_invoice_language || 'zh') as InvoicePdfLanguage,
        show_bank: settings.print_invoice_show_bank !== 'false',
        show_client_address: settings.print_invoice_show_client_address !== 'false',
        show_client_phone: settings.print_invoice_show_client_phone !== 'false',
        show_client_contact: settings.print_invoice_show_client_contact !== 'false',
        show_client_signature: settings.print_invoice_show_client_signature !== 'false',
        show_company_signature: settings.print_invoice_show_company_signature !== 'false',
        show_company_stamp: settings.print_invoice_show_company_stamp === 'true',
      };
      setOptions(prev => ({ ...SYSTEM_DEFAULTS, ...prev }));
    }).catch(() => {
      // Use default if system settings fail to load
    });
  }, []);

  useEffect(() => {
    if (!Number.isFinite(invoiceId)) return;

    invoicesApi
      .get(invoiceId)
      .then((res) => {
        setInvoice(res.data);
        setOptions((prev) => {
          const docFontSizes = res.data.pdf_font_sizes || {};
          const loadedOptions = {
            ...prev,
            language: res.data.invoice_language || prev.language,
            show_bank: res.data.invoice_show_bank ?? prev.show_bank,
            show_client_address:
              res.data.invoice_show_client_address ?? prev.show_client_address,
            show_client_phone:
              res.data.invoice_show_client_phone ?? prev.show_client_phone,
            override_payment_terms:
              res.data.invoice_custom_payment_terms ||
              res.data.payment_terms ||
              '',
            display_client_name:
              res.data.display_client_name ||
              res.data.client?.name ||
              '',
            client_address: prev.client_address || res.data.client?.address || '',
            client_contact:
              prev.client_contact || res.data.client?.contact_person || '',
            client_phone: prev.client_phone || res.data.client?.phone || '',
            font_size_title: docFontSizes.title || prev.font_size_title,
            font_size_item_name: docFontSizes.itemName || prev.font_size_item_name,
            font_size_item_desc: docFontSizes.itemDesc || prev.font_size_item_desc,
            font_size_payment_terms: docFontSizes.paymentTerms || prev.font_size_payment_terms,
          };

          latestOptionsRef.current = loadedOptions;
          lastSavedSignatureRef.current = getOptionsSignature(loadedOptions);
          return loadedOptions;
        });
      })
      .catch(() => router.push('/invoices'));
  }, [invoiceId, router, getOptionsSignature]);

  useEffect(() => {
    if (!Number.isFinite(invoiceId)) return;

    let active = true;
    let objectUrl = '';

    setLoadingPreview(true);
    setError('');

    invoicesApi
      .exportPdf(invoiceId, requestParams)
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
        setError(err.response?.data?.message || '載入 PDF 預覽失敗');
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });

    return () => {
      active = false;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [invoiceId, requestParams]);

  const savePdfPreviewOptions = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!Number.isFinite(invoiceId)) return false;

      const currentOptions = latestOptionsRef.current;
      const signature = getOptionsSignature(currentOptions);
      if (signature === lastSavedSignatureRef.current) return true;

      setSavingChanges(true);
      try {
        await invoicesApi.update(invoiceId, buildSavePayload(currentOptions));
        lastSavedSignatureRef.current = signature;
        return true;
      } catch (err: any) {
        if (!silent) {
          alert(err.response?.data?.message || '自動儲存 PDF 設定失敗');
        }
        return false;
      } finally {
        setSavingChanges(false);
      }
    },
    [buildSavePayload, getOptionsSignature, invoiceId],
  );

  const savePdfPreviewOptionsKeepalive = useCallback(() => {
    if (!Number.isFinite(invoiceId)) return;

    const currentOptions = latestOptionsRef.current;
    const payload = buildSavePayload(currentOptions);
    const signature = JSON.stringify(payload);
    if (signature === lastSavedSignatureRef.current) return;

    const token = Cookies.get('token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/invoices/${invoiceId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);

    lastSavedSignatureRef.current = signature;
  }, [buildSavePayload, invoiceId]);

  useEffect(() => {
    window.addEventListener('beforeunload', savePdfPreviewOptionsKeepalive);
    window.addEventListener('pagehide', savePdfPreviewOptionsKeepalive);

    return () => {
      window.removeEventListener('beforeunload', savePdfPreviewOptionsKeepalive);
      window.removeEventListener('pagehide', savePdfPreviewOptionsKeepalive);
    };
  }, [savePdfPreviewOptionsKeepalive]);

  const handleBack = async () => {
    const saved = await savePdfPreviewOptions();
    if (saved) router.push(`/invoices/${invoiceId}`);
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await invoicesApi.exportPdf(invoiceId, requestParams);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const clientCode = invoice?.client?.code || options.display_client_name || invoice?.client?.name || '';
      const invoiceTitle = invoice?.invoice_title || '';
      link.download = `${invoice?.invoice_no || `invoice-${invoiceId}`}_${clientCode}_${invoiceTitle}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.message || '下載 PDF 失敗');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const res = await invoicesApi.exportPdf(invoiceId, requestParams);
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
      alert(err.response?.data?.message || '開啟 PDF 列印視窗失敗');
    } finally {
      setPrinting(false);
    }
  };

  const updateOption = <K extends keyof PdfPreviewOptions>(
    key: K,
    value: PdfPreviewOptions[K],
  ) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  const handleSaveAsTemplate = async (name: string, sourceType: string) => {
    await paymentTermTemplatesApi.create({
      name,
      content: options.override_payment_terms,
      source_type: sourceType,
      company_id: sourceType === 'company' ? invoice?.company_id : undefined,
      client_id: sourceType === 'client' ? invoice?.client_id : undefined,
    });
  };

  const handleSaveToDocument = async () => {
    await savePdfPreviewOptions();
  };

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-gray-100 px-4 py-4">
      <section className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            發票 PDF 預覽
          </div>
          <h1 className="font-mono text-lg font-bold text-gray-900">
            {invoice?.invoice_no || `Invoice #${invoiceId}`}
          </h1>
        </div>

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
            className="btn-secondary px-3 py-1.5 text-sm"
            disabled={printing || loadingPreview || !pdfUrl}
          >
            {printing ? '開啟中...' : '列印'}
          </button>
          <button
            onClick={handleBack}
            className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={savingChanges}
          >
            {savingChanges ? '儲存中...' : '返回'}
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-gray-700">
          <label className="font-medium text-gray-700">客戶名稱（顯示於 PDF）</label>
          <input
            type="text"
            value={options.display_client_name}
            onChange={(e) => updateOption('display_client_name', e.target.value)}
            placeholder="客戶名稱"
            className="input-field h-8 w-full max-w-md py-0 text-sm"
          />
          <span className="text-xs text-gray-500">修改後會在離開或儲存時自動更新此發票的客戶顯示名稱。</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <label className="flex items-center gap-2">
            <span className="font-medium">語言</span>
            <select
              value={options.language}
              onChange={(e) =>
                updateOption('language', e.target.value as InvoicePdfLanguage)
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
                checked={options.show_bank}
                onChange={(e) => updateOption('show_bank', e.target.checked)}
              />
              銀行資料
            </label>
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

        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
          <div className="mb-2 font-medium text-gray-800">字體大小設定 (px)</div>
          <div className="mb-4 grid gap-3 grid-cols-2 md:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">標題</span>
              <input
                type="number"
                value={options.font_size_title}
                onChange={(e) => updateOption('font_size_title', Number(e.target.value))}
                className="input-field h-8 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">項目名稱</span>
              <input
                type="number"
                value={options.font_size_item_name}
                onChange={(e) => updateOption('font_size_item_name', Number(e.target.value))}
                className="input-field h-8 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">項目描述</span>
              <input
                type="number"
                value={options.font_size_item_desc}
                onChange={(e) => updateOption('font_size_item_desc', Number(e.target.value))}
                className="input-field h-8 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">付款條款</span>
              <input
                type="number"
                value={options.font_size_payment_terms}
                onChange={(e) => updateOption('font_size_payment_terms', Number(e.target.value))}
                className="input-field h-8 text-sm"
              />
            </label>
          </div>

          <div className="mb-2 font-medium text-gray-800">客人資料顯示設定</div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 font-medium">
                <input
                  type="checkbox"
                  checked={options.show_client_address}
                  onChange={(e) =>
                    updateOption('show_client_address', e.target.checked)
                  }
                />
                地址
              </span>
              <input
                className="input-field h-9 text-sm"
                value={options.client_address}
                onChange={(e) => updateOption('client_address', e.target.value)}
                placeholder="客人地址"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 font-medium">
                <input
                  type="checkbox"
                  checked={options.show_client_contact}
                  onChange={(e) =>
                    updateOption('show_client_contact', e.target.checked)
                  }
                />
                聯絡人
              </span>
              <input
                className="input-field h-9 text-sm"
                value={options.client_contact}
                onChange={(e) => updateOption('client_contact', e.target.value)}
                placeholder="聯絡人"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 font-medium">
                <input
                  type="checkbox"
                  checked={options.show_client_phone}
                  onChange={(e) =>
                    updateOption('show_client_phone', e.target.checked)
                  }
                />
                電話
              </span>
              <input
                className="input-field h-9 text-sm"
                value={options.client_phone}
                onChange={(e) => updateOption('client_phone', e.target.value)}
                placeholder="客人電話"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            預設值來自合作單位的客人資料；你也可以在此頁即時填改後預覽、列印或下載。
          </p>
        </div>

        <div className="mt-3">
          <PaymentTermsSelector
            companyId={invoice?.company_id}
            clientId={invoice?.client_id}
            value={options.override_payment_terms}
            onChange={(val) => updateOption('override_payment_terms', val)}
            onSaveAsTemplate={handleSaveAsTemplate}
            onSaveToDocument={handleSaveToDocument}
            documentLabel="發票"
          />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-200 shadow-sm" style={{ minHeight: '85vh' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          <div className="font-medium">PDF 預覽</div>
          <div className="text-xs text-gray-500">
            預覽內容由後端 PDF 直接生成，與下載檔案一致。
          </div>
        </div>
        <div className="flex-1 bg-gray-300 p-2" style={{ minHeight: 'calc(85vh - 50px)' }}>
          {loadingPreview ? (
            <div className="flex items-center justify-center bg-white text-sm font-medium text-gray-600" style={{ height: 'calc(85vh - 50px)' }}>
              載入預覽中...
            </div>
          ) : pdfUrl ? (
            <iframe
              title="發票 PDF 預覽"
              src={`${pdfUrl}#page=1&zoom=page-width`}
              className="w-full border-0 bg-white shadow-lg"
              style={{ height: 'calc(85vh - 50px)' }}
            />
          ) : (
            <div className="flex items-center justify-center bg-white text-sm text-gray-500" style={{ height: 'calc(85vh - 50px)' }}>
              尚無預覽內容
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
