'use client';

import { useState, useEffect, useCallback } from 'react';
import { verificationApi } from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/lib/auth';

interface BotStatusData {
  status: 'connected' | 'disconnected' | 'unstable' | 'needs_qr' | 'unknown';
  last_heartbeat_at: string | null;
  unstable_since?: string | null;
  recovered_from?: string | null;
  recovered_at?: string | null;
}

interface QrCodeData {
  available: boolean;
  qr_code: string | null;
}

export default function WhatsAppAlertModal() {
  const { user } = useAuth();

  // 只有 admin 角色才顯示此 modal
  if (!user || user.role !== 'admin') return null;
  const [status, setStatus] = useState<BotStatusData | null>(null);
  const [qrCode, setQrCode] = useState<QrCodeData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showRecoveredAlert, setShowRecoveredAlert] = useState(false);
  const [lastAcknowledgedRecovery, setLastAcknowledgedRecovery] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await verificationApi.getWhatsappBotStatus();
      const data = res.data;
      setStatus(data);

      // 檢查是否需要彈出緊急通知
      if (['unstable', 'needs_qr', 'disconnected'].includes(data.status)) {
        setShowModal(true);
      } else {
        setShowModal(false);
      }

      // 檢查是否有恢復通知
      if (data.recovered_from && data.recovered_at) {
        const recoveryKey = `${data.recovered_from}_${data.recovered_at}`;
        const acknowledged = localStorage.getItem('wa_recovery_acknowledged');
        if (acknowledged !== recoveryKey) {
          setLastAcknowledgedRecovery(recoveryKey);
          setShowRecoveredAlert(true);
        }
      }
    } catch (err) {
      console.error('Failed to fetch bot status', err);
    }
  }, []);

  const fetchQrCode = useCallback(async () => {
    if (status?.status !== 'needs_qr' && status?.status !== 'disconnected') return;
    try {
      const res = await verificationApi.getWhatsappQrCode();
      setQrCode(res.data);
    } catch (err) {
      setQrCode(null);
    }
  }, [status]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (showModal) {
      fetchQrCode();
      const interval = setInterval(fetchQrCode, 5000);
      return () => clearInterval(interval);
    }
  }, [showModal, fetchQrCode]);

  const handleCloseRecovery = () => {
    if (lastAcknowledgedRecovery) {
      localStorage.setItem('wa_recovery_acknowledged', lastAcknowledgedRecovery);
    }
    setShowRecoveredAlert(false);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('zh-HK', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  if (!showModal && !showRecoveredAlert) return null;

  return (
    <>
      {/* 緊急異常 Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-red-600 p-6 text-white flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-full">
                <span className="text-3xl">⚠️</span>
              </div>
              <div>
                <h3 className="text-xl font-bold">WhatsApp Bot 異常！</h3>
                <p className="text-red-100 text-sm">系統偵測到 WhatsApp 連線中斷或不穩定</p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-500 text-sm">當前狀態</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    status?.status === 'unstable' ? 'bg-orange-100 text-orange-700' : 
                    status?.status === 'needs_qr' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {status?.status === 'unstable' ? '連線不穩定' : 
                     status?.status === 'needs_qr' ? '等待掃碼重連' : '完全離線'}
                  </span>
                </div>
                {status?.unstable_since && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">異常開始時間</span>
                    <span className="text-gray-800 font-medium">{formatTime(status.unstable_since)}</span>
                  </div>
                )}
              </div>

              {/* QR Code 區域 */}
              {(status?.status === 'needs_qr' || status?.status === 'disconnected') && (
                <div className="flex flex-col items-center bg-gray-50 p-6 rounded-xl border border-dashed border-gray-300">
                  <p className="text-xs font-semibold text-gray-500 mb-4">請使用 WhatsApp 掃描此碼重新連線</p>
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    {qrCode?.qr_code ? (
                      qrCode.qr_code.startsWith('data:image') ? (
                        <img src={qrCode.qr_code} alt="QR" className="w-48 h-48" />
                      ) : (
                        <QRCodeSVG value={qrCode.qr_code} size={192} />
                      )
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center text-gray-300">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-4">每 5 秒自動刷新一次</p>
                </div>
              )}

              {status?.status === 'unstable' && (
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                  <p className="text-orange-800 text-sm leading-relaxed">
                    Bot 正在嘗試自動重連，但連線非常不穩定。這可能會導致部分 WhatsApp 訊息未能及時進入系統。請保持關注。
                  </p>
                </div>
              )}

              <button
                onClick={() => setShowModal(false)}
                className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
              >
                暫時關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 恢復通知 Alert */}
      {showRecoveredAlert && !showModal && (
        <div className="fixed top-20 right-4 z-[9998] max-w-md w-full animate-in slide-in-from-right duration-500">
          <div className="bg-white rounded-2xl shadow-2xl border-l-8 border-green-500 overflow-hidden">
            <div className="p-5">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">✅</span>
                  <h4 className="font-bold text-gray-900">WhatsApp Bot 已恢復正常</h4>
                </div>
                <button onClick={handleCloseRecovery} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                連線已穩定。從 <span className="font-bold text-gray-900">{formatTime(status?.recovered_from || null)}</span> 到 <span className="font-bold text-gray-900">{formatTime(status?.recovered_at || null)}</span> 的訊息可能遺漏，請管理員檢查並手動補錄。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCloseRecovery}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors"
                >
                  我已確認並處理
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
