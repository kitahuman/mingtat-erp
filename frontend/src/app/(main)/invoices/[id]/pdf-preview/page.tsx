'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { invoicesApi, paymentTermTemplatesApi } from '@/lib/api';
import PaymentTermsSelector from '@/components/PaymentTermsSelector';

type InvoicePdfLanguage = 'zh' | 'en' | 'bilingual';


const buildPagedPreviewHtml = (source: string, currentPage: number) => {
  if (!source) return source;
  const pageOffset = Math.max(0, currentPage - 1);
  const previewStyle = `
<style id="a4-preview-page-style">
  @media screen {
    html, body {
      width: 100vw !important;
      min-height: 141.4286vw !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    body {
      transform: translateY(-${(pageOffset * 141.4286).toFixed(4)}vw) !important;
      transform-origin: top left !important;
    }
    .invoice-page {
      width: 100vw !important;
      min-height: 141.4286vw !important;
      margin: 0 !important;
      padding: 4.2857vw 4.7619vw !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }
  }
</style>`;

  return source.includes('</head>')
    ? source.replace('</head>', `${previewStyle}</head>`)
    : `${previewStyle}${source}`;
};

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
};

export default function InvoicePdfPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const invoiceId = Number(id);

  const [invoice, setInvoice] = useState<any>(null);
  const [options, setOptions] = useState<PdfPreviewOptions>(DEFAULT_OPTIONS);
  const [html, setHtml] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [previewSize, setPreviewSize] = useState({ width: 595, height: 842 });

  const previewHtml = useMemo(
    () => buildPagedPreviewHtml(html, currentPage),
    [html, currentPage],
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
    ],
  );

  useEffect(() => {
    if (!Number.isFinite(invoiceId)) return;

    invoicesApi
      .get(invoiceId)
      .then((res) => {
        setInvoice(res.data);
        setOptions(prev => ({ 
          ...prev, 
          override_payment_terms: res.data.invoice_custom_payment_terms || res.data.payment_terms || '',
          client_address: prev.client_address || res.data.client?.address || '',
          client_contact: prev.client_contact || res.data.client?.contact_person || '',
          client_phone: prev.client_phone || res.data.client?.phone || '',
        }));
      })
      .catch(() => router.push('/invoices'));
  }, [invoiceId, router]);

  useEffect(() => {
    if (!Number.isFinite(invoiceId)) return;

    let active = true;
    setLoadingPreview(true);
    setError('');

    invoicesApi
      .getPdfHtml(invoiceId, requestParams)
      .then((res) => {
        if (!active) return;
        setHtml(
          typeof res.data === 'string' ? res.data : String(res.data || ''),
        );
      })
      .catch((err: any) => {
        if (!active) return;
        setHtml('');
        setError(err.response?.data?.message || '載入 PDF 預覽失敗');
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });

    return () => {
      active = false;
    };
  }, [invoiceId, requestParams]);

  useEffect(() => {
    setCurrentPage(1);
  }, [html]);

  useEffect(() => {
    const updatePreviewSize = () => {
      const availableWidth = Math.max(320, window.innerWidth - 32);
      const availableHeight = Math.max(420, window.innerHeight - 170);
      const widthFromHeight = availableHeight * 210 / 297;
      const nextWidth = Math.floor(Math.min(availableWidth, widthFromHeight, 794));
      setPreviewSize({
        width: nextWidth,
        height: Math.floor(nextWidth * 297 / 210),
      });
    };

    updatePreviewSize();
    window.addEventListener('resize', updatePreviewSize);
    return () => window.removeEventListener('resize', updatePreviewSize);
  }, []);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await invoicesApi.exportPdf(invoiceId, requestParams);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice?.invoice_no || `invoice-${invoiceId}`}.pdf`;
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

  const handlePrint = () => {
    const iframeWindow = iframeRef.current?.contentWindow;
    if (!iframeWindow || !html) {
      alert('預覽尚未載入完成');
      return;
    }

    iframeWindow.focus();
    iframeWindow.print();
  };

  const updateOption = <K extends keyof PdfPreviewOptions>(
    key: K,
    value: PdfPreviewOptions[K],
  ) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  const measurePreviewPages = () => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!iframe || !doc || !win) return;

    const pageElement = doc.querySelector('.invoice-page') as HTMLElement | null;
    const pageWidth = Math.max(1, win.innerWidth || iframe.clientWidth || 1);
    const pageHeight = Math.max(1, pageWidth * 297 / 210);
    const contentHeight = Math.max(
      pageElement?.scrollHeight || 0,
      doc.body?.scrollHeight || 0,
      doc.documentElement?.scrollHeight || 0,
    );
    const nextTotalPages = Math.max(1, Math.ceil(contentHeight / pageHeight));
    setTotalPages(nextTotalPages);
    setCurrentPage((page) => Math.min(page, nextTotalPages));
  };

  const handlePreviewLoad = () => {
    window.setTimeout(measurePreviewPages, 50);
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
    await invoicesApi.update(invoiceId, {
      invoice_custom_payment_terms: options.override_payment_terms,
    });
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
            disabled={loadingPreview || !html}
          >
            列印
          </button>
          <button
            onClick={() => router.push(`/invoices/${invoiceId}`)}
            className="btn-secondary px-3 py-1.5 text-sm"
          >
            返回
          </button>
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
                onChange={(e) => updateOption('show_client_signature', e.target.checked)}
              />
              客戶簽名欄
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={options.show_company_signature}
                onChange={(e) => updateOption('show_company_signature', e.target.checked)}
              />
              公司簽名欄
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={options.show_company_stamp}
                onChange={(e) => updateOption('show_company_stamp', e.target.checked)}
              />
              蓋上公司印
            </label>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
          <div className="mb-2 font-medium text-gray-800">客人資料顯示設定</div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 font-medium">
                <input
                  type="checkbox"
                  checked={options.show_client_address}
                  onChange={(e) => updateOption('show_client_address', e.target.checked)}
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
                  onChange={(e) => updateOption('show_client_contact', e.target.checked)}
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
                  onChange={(e) => updateOption('show_client_phone', e.target.checked)}
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
          <p className="mt-2 text-xs text-gray-500">預設值來自合作單位的客人資料；你也可以在此頁即時填改後預覽、列印或下載。</p>
        </div>

        <div className="mt-3">
          <PaymentTermsSelector
            companyId={invoice?.company_id}
            clientId={invoice?.client_id}
            value={options.override_payment_terms}
            onChange={(val) => updateOption('override_payment_terms', val)}
            onSaveAsTemplate={handleSaveAsTemplate}
            onSaveToDocument={handleSaveToDocument}
          />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          <div className="font-medium">A4 預覽</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="btn-secondary px-3 py-1 text-xs disabled:opacity-50"
              disabled={loadingPreview || currentPage <= 1}
            >
              上一頁
            </button>
            <span className="min-w-[72px] text-center text-xs text-gray-600">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              className="btn-secondary px-3 py-1 text-xs disabled:opacity-50"
              disabled={loadingPreview || currentPage >= totalPages}
            >
              下一頁
            </button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0 items-start justify-center overflow-auto bg-gray-300 p-2">
          <div
            className="overflow-hidden bg-white shadow-lg"
            style={{
              width: `${previewSize.width}px`,
              height: `${previewSize.height}px`,
              maxWidth: 'calc(100vw - 2rem)',
              maxHeight: 'calc(100vh - 170px)',
            }}
          >
            {loadingPreview ? (
              <div className="flex h-full w-full items-center justify-center bg-white text-sm font-medium text-gray-600">
                載入預覽中...
              </div>
            ) : html ? (
              <iframe
                ref={iframeRef}
                title="發票 PDF HTML 預覽"
                srcDoc={previewHtml}
                onLoad={handlePreviewLoad}
                className="h-full w-full border-0 bg-white"
                scrolling="no"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white text-sm text-gray-500">
                尚無預覽內容
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
