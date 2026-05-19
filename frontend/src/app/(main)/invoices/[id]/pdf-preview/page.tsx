'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { invoicesApi, paymentTermTemplatesApi } from '@/lib/api';
import PaymentTermsSelector from '@/components/PaymentTermsSelector';

type InvoicePdfLanguage = 'zh' | 'en' | 'bilingual';

type PdfPreviewOptions = {
  language: InvoicePdfLanguage;
  show_bank: boolean;
  show_client_address: boolean;
  show_client_phone: boolean;
  show_client_info: boolean;
  show_signature: boolean;
  override_payment_terms: string;
};

const DEFAULT_OPTIONS: PdfPreviewOptions = {
  language: 'zh',
  show_bank: true,
  show_client_address: true,
  show_client_phone: true,
  show_client_info: true,
  show_signature: true,
  override_payment_terms: '',
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

  const requestParams = useMemo(
    () => ({
      language: options.language,
      show_bank: options.show_bank,
      show_client_address: options.show_client_address,
      show_client_phone: options.show_client_phone,
      show_client_info: options.show_client_info,
      show_signature: options.show_signature,
      override_payment_terms: options.override_payment_terms,
    }),
    [
      options.language,
      options.show_bank,
      options.show_client_address,
      options.show_client_phone,
      options.show_client_info,
      options.show_signature,
      options.override_payment_terms,
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
          override_payment_terms: res.data.invoice_custom_payment_terms || res.data.payment_terms || '' 
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
                checked={options.show_client_info}
                onChange={(e) => updateOption('show_client_info', e.target.checked)}
              />
              顯示客人資訊
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={options.show_signature}
                onChange={(e) => updateOption('show_signature', e.target.checked)}
              />
              簽名欄
            </label>
          </div>
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

      <section className="min-h-[480px] flex-1 overflow-hidden rounded-xl border border-gray-200 bg-gray-200 shadow-sm">
        {loadingPreview ? (
          <div className="flex h-full min-h-[480px] items-center justify-center bg-white text-sm font-medium text-gray-600">
            載入預覽中...
          </div>
        ) : html ? (
          <iframe
            ref={iframeRef}
            title="發票 PDF HTML 預覽"
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
