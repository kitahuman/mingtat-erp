'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { invoiceStatementsApi } from '@/lib/api';

export default function InvoiceStatementPdfPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const statementId = Number(id);

  const [statement, setStatement] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Number.isFinite(statementId)) return;

    invoiceStatementsApi
      .get(statementId)
      .then((res) => setStatement(res.data))
      .catch(() => router.push('/invoice-statements'));
  }, [statementId, router]);

  useEffect(() => {
    if (!Number.isFinite(statementId)) return;

    let active = true;
    let objectUrl = '';

    setLoadingPreview(true);
    setError('');

    invoiceStatementsApi
      .exportPdf(statementId)
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
  }, [statementId]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await invoiceStatementsApi.exportPdf(statementId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const clientCode = statement?.client?.code || statement?.client?.name || '';
      const statementTitle = statement?.statement_title || '';
      link.download = `${statement?.statement_no || `statement-${statementId}`}_${clientCode}_${statementTitle}.pdf`;
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
      const res = await invoiceStatementsApi.exportPdf(statementId);
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

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-gray-100 px-4 py-4">
      <section className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            客戶發票清單 PDF 預覽
          </div>
          <h1 className="font-mono text-lg font-bold text-gray-900">
            {statement?.statement_no || `Statement #${statementId}`}
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
            onClick={() => router.push(`/invoice-statements/${statementId}`)}
            className="btn-secondary px-3 py-1.5 text-sm"
          >
            返回
          </button>
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
              title="客戶發票清單 PDF 預覽"
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
