'use client';

import { useState, useEffect, useRef } from 'react';
import { employeePortalApi } from '@/lib/employee-portal-api';
import { useI18n } from '@/lib/i18n/i18n-context';

interface Certificate {
  key: string;
  name_zh: string;
  name_en: string;
  cert_no: string | null;
  expiry_date: string | null;
  extra: string | null;
  photo_url: string | null;
}

function getDaysLeft(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ expiryDate }: { expiryDate: string | null }) {
  if (!expiryDate) return null;
  const days = getDaysLeft(expiryDate);
  if (days === null) return null;

  const dateStr = new Date(expiryDate).toLocaleDateString('zh-HK', { year: 'numeric', month: '2-digit', day: '2-digit' });

  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        ⚠️ 已過期 {dateStr}
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        🔴 {days} 天後到期 ({dateStr})
      </span>
    );
  }
  if (days <= 90) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        🟡 {days} 天後到期 ({dateStr})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      ✓ {dateStr}
    </span>
  );
}

export default function CertificatesPage() {
  const { t, lang } = useI18n();
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeKeyRef = useRef<string>('');

  // Edit state per cert card
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editCertNo, setEditCertNo] = useState('');
  const [editExpiry, setEditExpiry] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    loadCertificates();
  }, []);

  async function loadCertificates() {
    try {
      setLoading(true);
      const res = await employeePortalApi.getCertificates();
      setCerts(res.data.certificates || []);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(certKey: string, file: File) {
    try {
      setUploadingKey(certKey);
      const uploadRes = await employeePortalApi.uploadPhoto(file);
      const photoUrl = uploadRes.data.url;
      await employeePortalApi.updateCertPhoto(certKey, photoUrl);
      await loadCertificates();
    } catch {
      setError(t('error'));
    } finally {
      setUploadingKey(null);
    }
  }

  function triggerFileInput(certKey: string) {
    activeKeyRef.current = certKey;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && activeKeyRef.current) {
      handlePhotoUpload(activeKeyRef.current, file);
    }
  }

  function startEdit(cert: Certificate) {
    setEditingKey(cert.key);
    setEditCertNo(cert.cert_no || '');
    setEditExpiry(cert.expiry_date || '');
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditCertNo('');
    setEditExpiry('');
  }

  async function handleSaveCert(certKey: string) {
    try {
      setSavingKey(certKey);
      await employeePortalApi.updateCertificate(
        certKey,
        editCertNo.trim() || null,
        editExpiry || null,
      );
      setEditingKey(null);
      await loadCertificates();
    } catch {
      setError(t('error'));
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">{t('certificates')}</h1>
      <p className="text-sm text-gray-500 mb-4">{t('certificatesSubtitle')}</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {certs.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-sm">{t('noCertificates')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {certs.map((cert) => {
            const certName = lang === 'zh' ? cert.name_zh : cert.name_en;
            const daysLeft = getDaysLeft(cert.expiry_date);
            const isExpired = daysLeft !== null && daysLeft < 0;
            const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
            const isEditing = editingKey === cert.key;

            return (
              <div
                key={cert.key}
                className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${
                  isExpired ? 'border-red-200' : isExpiringSoon ? 'border-amber-200' : 'border-gray-100'
                }`}
              >
                {/* Header */}
                <div className={`px-4 py-3 ${isExpired ? 'bg-red-50' : isExpiringSoon ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm">{certName}</h3>
                      {!isEditing && cert.cert_no && (
                        <p className="text-xs text-gray-500 mt-0.5">{t('certNo')}: {cert.cert_no}</p>
                      )}
                      {!isEditing && cert.extra && (
                        <p className="text-xs text-gray-500 mt-0.5">{cert.extra}</p>
                      )}
                      {!isEditing && (
                        <div className="mt-1">
                          <ExpiryBadge expiryDate={cert.expiry_date} />
                        </div>
                      )}
                    </div>
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(cert)}
                        className="shrink-0 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        ✏️ 編輯
                      </button>
                    )}
                  </div>
                </div>

                {/* Edit form */}
                {isEditing && (
                  <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('certNo')}</label>
                        <input
                          type="text"
                          value={editCertNo}
                          onChange={(e) => setEditCertNo(e.target.value)}
                          placeholder="輸入證件號碼"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">到期日</label>
                        <input
                          type="date"
                          value={editExpiry}
                          onChange={(e) => setEditExpiry(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSaveCert(cert.key)}
                          disabled={savingKey === cert.key}
                          className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl active:scale-95 disabled:opacity-50"
                        >
                          {savingKey === cert.key ? '儲存中...' : '儲存'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={savingKey === cert.key}
                          className="flex-1 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl active:scale-95 disabled:opacity-50"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Photo section */}
                <div className="px-4 py-3">
                  {cert.photo_url ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => { setPreviewUrl(cert.photo_url); setPreviewName(certName); }}
                        className="block w-full"
                      >
                        <img
                          src={cert.photo_url}
                          alt={certName}
                          className="w-full h-32 object-cover rounded-xl border border-gray-200"
                        />
                      </button>
                      <button
                        onClick={() => triggerFileInput(cert.key)}
                        disabled={uploadingKey === cert.key}
                        className="w-full py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        {uploadingKey === cert.key ? t('uploading') : t('updatePhoto')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => triggerFileInput(cert.key)}
                      disabled={uploadingKey === cert.key}
                      className="w-full py-3 flex flex-col items-center gap-1 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors disabled:opacity-50"
                    >
                      {uploadingKey === cert.key ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
                          <span className="text-xs">{t('uploading')}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl">📷</span>
                          <span className="text-xs">{t('uploadCertPhoto')}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-900 text-sm">{previewName}</h3>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ✕
                </button>
              </div>
              <img src={previewUrl} alt={previewName} className="w-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
