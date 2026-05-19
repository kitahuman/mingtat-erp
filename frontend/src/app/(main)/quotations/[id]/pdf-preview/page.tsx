'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { quotationsApi, paymentTermTemplatesApi } from '@/lib/api';
import PaymentTermsSelector from '@/components/PaymentTermsSelector';

type QuotationPdfLanguage = 'zh' | 'en' | 'bilingual';

type PdfPreviewOptions = {
  language: QuotationPdfLanguage;
  show_signature: boolean;
  override_payment_terms: string;
};

const DEFAULT_OPTIONS: PdfPreviewOptions = {
  language: 'zh',
  show_signature: true,
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

  const requestParams = useMemo(
    () => ({
      language: options.language,
      show_signature: options.show_signature,
      override_payment_terms: options.override_payment_terms,
    }),
    [
      options.language,
      options.show_signature,
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
              checked={options.show_signature}
              onChange={(e) => updateOption('show_signature', e.target.checked)}
            />
            顯示簽名欄
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

      <section className="min-h-[480px] flex-1 overflow-hidden rounded-xl border border-gray-200 bg-gray-200 shadow-sm">
        {loadingPreview ? (
          <div className="flex h-full min-h-[480px] items-center justify-center bg-white text-sm font-medium text-gray-600">
            載入預覽中...
          </div>
        ) : html ? (
          <iframe
            ref={iframeRef}
            title="報價單 PDF HTML 預覽"
            srcDoc={html}
            className="h-full min-h-[480px] w-full border-0 bg-white"
          />
        ) : (
          <div className="flex h-full min-h-[480px] items-center justify-center bg-white text-sm text-gray-500">
            尚無預覽內容
          </div>
        )}
      </section>
    </main>
  );
}
