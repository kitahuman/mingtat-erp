'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { quotationsApi, paymentTermTemplatesApi } from '@/lib/api';
import PaymentTermsSelector from '@/components/PaymentTermsSelector';

type QuotationPdfLanguage = 'zh' | 'en' | 'bilingual';


const buildPagedPreviewHtml = (source: string, currentPage: number) => {
  if (!source) return source;
  const pageOffset = Math.max(0, currentPage - 1) * 100;
  const previewStyle = `
<style id="a4-preview-page-style">
  @media screen {
    html, body {
      width: 100% !important;
      min-height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    body {
      transform: translateY(-${pageOffset}vh) !important;
      transform-origin: top left !important;
    }
    .invoice-page {
      width: 100% !important;
      min-height: 100vh !important;
      margin: 0 !important;
      padding: calc(11 / 210 * 100vw) calc(11 / 210 * 100vw) calc(13 / 297 * 100vh) calc(11 / 210 * 100vw) !important;
      box-shadow: none !important;
    }
  }
</style>`;

  return source.includes('</head>')
    ? source.replace('</head>', `${previewStyle}</head>`)
    : `${previewStyle}${source}`;
};

type PdfPreviewOptions = {
  language: QuotationPdfLanguage;
  show_client_signature: boolean;
  show_company_signature: boolean;
  override_payment_terms: string;
};

const DEFAULT_OPTIONS: PdfPreviewOptions = {
  language: 'zh',
  show_client_signature: true,
  show_company_signature: true,
  override_payment_terms: '',
};

export default function QuotationPdfPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const quotationId = Number(id);

  const [quotation, setQuotation] = useState<any>(null);
  const [options, setOptions] = useState<PdfPreviewOptions>(DEFAULT_OPTIONS);
  const [html, setHtml] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const previewHtml = useMemo(
    () => buildPagedPreviewHtml(html, currentPage),
    [html, currentPage],
  );

  const requestParams = useMemo(
    () => ({
      language: options.language,
      show_client_signature: options.show_client_signature,
      show_company_signature: options.show_company_signature,
      override_payment_terms: options.override_payment_terms,
    }),
    [
      options.language,
      options.show_client_signature,
      options.show_company_signature,
      options.override_payment_terms,
    ],
  );

  useEffect(() => {
    if (!Number.isFinite(quotationId)) return;

    quotationsApi
      .get(quotationId)
      .then((res) => {
        setQuotation(res.data);
        setOptions(prev => ({ ...prev, override_payment_terms: res.data.payment_terms || '' }));
      })
      .catch(() => router.push('/quotations'));
  }, [quotationId, router]);

  useEffect(() => {
    if (!Number.isFinite(quotationId)) return;

    let active = true;
    setLoadingPreview(true);
    setError('');

    quotationsApi
      .getPdfHtml(quotationId, requestParams)
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
  }, [quotationId, requestParams]);

  useEffect(() => {
    setCurrentPage(1);
  }, [html]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await quotationsApi.exportPdf(quotationId, requestParams);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${quotation?.quotation_no || `quotation-${quotationId}`}.pdf`;
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
    const pageHeight = Math.max(1, win.innerHeight || iframe.clientHeight || 1);
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
      company_id: sourceType === 'company' ? quotation?.company_id : undefined,
      client_id: sourceType === 'client' ? quotation?.client_id : undefined,
    });
  };

  const handleSaveToDocument = async () => {
    await quotationsApi.update(quotationId, {
      payment_terms: options.override_payment_terms,
    });
  };

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-gray-100 px-4 py-4">
      <section className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            報價單 PDF 預覽
          </div>
          <h1 className="font-mono text-lg font-bold text-gray-900">
            {quotation?.quotation_no || `Quotation #${quotationId}`}
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
            onClick={() => router.push(`/quotations/${quotationId}`)}
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
                updateOption('language', e.target.value as QuotationPdfLanguage)
              }
              className="input-field h-8 min-w-[100px] py-0 text-sm"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="bilingual">雙語</option>
            </select>
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
        </div>

        <div className="mt-3">
          <PaymentTermsSelector
            companyId={quotation?.company_id}
            clientId={quotation?.client_id}
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

      <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-200 shadow-sm">
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
        <div className="flex flex-1 items-start justify-center overflow-hidden bg-gray-300 p-0">
          <div
            className="overflow-hidden bg-white shadow-lg"
            style={{
              aspectRatio: '210 / 297',
              maxHeight: 'calc(100vh - 230px)',
              width: 'min(100%, calc((100vh - 230px) * 210 / 297))',
            }}
          >
            {loadingPreview ? (
              <div className="flex h-full w-full items-center justify-center bg-white text-sm font-medium text-gray-600">
                載入預覽中...
              </div>
            ) : html ? (
              <iframe
                ref={iframeRef}
                title="報價單 PDF HTML 預覽"
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
