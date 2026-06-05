'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { invoicesApi, paymentTermTemplatesApi } from '@/lib/api';
import PaymentTermsSelector from '@/components/PaymentTermsSelector';

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
  const invoiceId = Number(id);

  const [invoice, setInvoice] = useState<any>(null);
  const [options, setOptions] = useState<PdfPreviewOptions>(DEFAULT_OPTIONS);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
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
        setOptions((prev) => ({
          ...prev,
          override_payment_terms:
            res.data.invoice_custom_payment_terms ||
            res.data.payment_terms ||
            '',
          client_address: prev.client_address || res.data.client?.address || '',
          client_contact:
            prev.client_contact || res.data.client?.contact_person || '',
          client_phone: prev.client_phone || res.data.client?.phone || '',
        }));
      })
      .catch(() => router.push('/invoices'));
  }, [invoiceId, router]);

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

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await invoicesApi.exportPdf(invoiceId, requestParams);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const clientCode = invoice?.client?.code || invoice?.client?.name || '';
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
            disabled={printing || loadingPreview || !pdfUrl}
          >
            {printing ? '開啟中...' : '列印'}
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
        <div className="flex min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-gray-300 p-2">
          <div className="h-full w-full overflow-hidden bg-white shadow-lg" style={{ minHeight: 'calc(85vh - 50px)' }}>
            {loadingPreview ? (
              <div className="flex h-full w-full items-center justify-center bg-white text-sm font-medium text-gray-600">
                載入預覽中...
              </div>
            ) : pdfUrl ? (
              <iframe
                title="發票 PDF 預覽"
                src={pdfUrl}
                className="h-full w-full border-0 bg-white"
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
