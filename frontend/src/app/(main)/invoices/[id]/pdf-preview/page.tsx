'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { invoicesApi } from '@/lib/api';

type InvoicePdfLanguage = 'zh' | 'en' | 'bilingual';

type PdfPreviewOptions = {
  language: InvoicePdfLanguage;
  show_bank: boolean;
  show_client_address: boolean;
  show_client_phone: boolean;
};

const DEFAULT_OPTIONS: PdfPreviewOptions = {
  language: 'zh',
  show_bank: true,
  show_client_address: true,
  show_client_phone: true,
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
    }),
    [
      options.language,
      options.show_bank,
      options.show_client_address,
      options.show_client_phone,
    ],
  );

  useEffect(() => {
    if (!Number.isFinite(invoiceId)) return;

    invoicesApi
      .get(invoiceId)
      .then((res) => setInvoice(res.data))
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

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              發票 PDF 預覽
            </div>
            <h1 className="font-mono text-lg font-bold text-gray-900">
              {invoice?.invoice_no || `Invoice #${invoiceId}`}
            </h1>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span className="font-medium">語言</span>
              <select
                value={options.language}
                onChange={(e) =>
                  updateOption('language', e.target.value as InvoicePdfLanguage)
                }
                className="input-field h-9 min-w-[116px] py-1 text-sm"
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="bilingual">雙語</option>
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <span className="font-medium text-gray-800">顯示選項</span>
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
                  checked={options.show_client_address}
                  onChange={(e) =>
                    updateOption('show_client_address', e.target.checked)
                  }
                />
                客戶地址
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={options.show_client_phone}
                  onChange={(e) =>
                    updateOption('show_client_phone', e.target.checked)
                  }
                />
                客戶電話
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDownloadPdf}
                className="btn-primary disabled:opacity-50"
                disabled={downloading || loadingPreview}
              >
                {downloading ? '下載中...' : '下載 PDF'}
              </button>
              <button
                onClick={handlePrint}
                className="btn-secondary"
                disabled={loadingPreview || !html}
              >
                列印
              </button>
              <button
                onClick={() => router.push(`/invoices/${invoiceId}`)}
                className="btn-secondary"
              >
                返回
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-8 pt-44 lg:pt-28">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="relative h-[calc(100vh-8.5rem)] overflow-hidden rounded-xl border border-gray-200 bg-gray-200 shadow-sm lg:h-[calc(100vh-7.5rem)]">
          {loadingPreview && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
              <div className="rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-600 shadow">
                載入預覽中...
              </div>
            </div>
          )}
          {html ? (
            <iframe
              ref={iframeRef}
              title="發票 PDF HTML 預覽"
              srcDoc={html}
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-white text-sm text-gray-500">
              尚無預覽內容
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
