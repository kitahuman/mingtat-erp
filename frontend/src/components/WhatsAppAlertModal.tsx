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
  reconnect_count?: number;
  offline_duration_ms?: number | null;
}

interface QrCodeData {
  available: boolean;
  qr_code: string | null;
}

/** 計算距離現在多久（毫秒），null 表示無法計算 */
function msAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Date.now() - new Date(dateStr).getTime();
}

/** 格式化「X 分 Y 秒前」 */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} 秒`;
  if (sec === 0) return `${min} 分鐘`;
  return `${min} 分 ${sec} 秒`;
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
  const [now, setNow] = useState(() => Date.now());

  // 每秒更新 now，讓「已斷線 X 分 Y 秒」即時更新
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await verificationApi.getWhatsappBotStatus();
      const data = res.data;
      setStatus(data);

      if (['unstable', 'needs_qr', 'disconnected'].includes(data.status)) {
        setShowModal(true);
      } else {
        setShowModal(false);
      }

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

  // QR code 只在 needs_qr 時才抓取
  const fetchQrCode = useCallback(async () => {
    if (status?.status !== 'needs_qr') return;
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
    if (showModal && status?.status === 'needs_qr') {
      fetchQrCode();
      const interval = setInterval(fetchQrCode, 5000);
      return () => clearInterval(interval);
    }
  }, [showModal, fetchQrCode, status?.status]);

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

  // 計算已斷線時長（毫秒）
  const offlineMs = status?.last_heartbeat_at
    ? now - new Date(status.last_heartbeat_at).getTime()
    : null;
  const isLongOffline = offlineMs !== null && offlineMs > 5 * 60 * 1000;

  // 根據狀態決定 header 顏色
  const headerBg =
    status?.status === 'needs_qr'
      ? 'bg-blue-600'
      : status?.status === 'unstable'
      ? 'bg-orange-500'
      : isLongOffline
      ? 'bg-red-600'
      : 'bg-yellow-500';

  if (!showModal && !showRecoveredAlert) return null;

  return (
    <>
      {/* 緊急異常 Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className={`${headerBg} p-6 text-white flex items-center gap-4`}>
              <div className="bg-white/20 p-3 rounded-full">
                <span className="text-3xl">
                  {status?.status === 'needs_qr' ? '📱' : status?.status === 'unstable' ? '⚡' : '⚠️'}
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold">WhatsApp Bot 異常！</h3>
                <p className="text-white/80 text-sm">系統偵測到 WhatsApp 連線異常</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* 狀態列表 */}
              <div className="space-y-2">
                {/* 當前狀態 badge */}
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-500 text-sm">當前狀態</span>
                  {status?.status === 'disconnected' && (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${isLongOffline ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {isLongOffline ? '長時間離線' : '暫時離線'}
                    </span>
                  )}
                  {status?.status === 'unstable' && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">連線不穩定</span>
                  )}
                  {status?.status === 'needs_qr' && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">需要重新掃碼</span>
                  )}
                </div>

                {/* 上次成功連線時間 */}
                {status?.last_heartbeat_at && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">上次連線時間</span>
                    <span className="text-gray-800 font-medium text-sm">{formatTime(status.last_heartbeat_at)}</span>
                  </div>
                )}

                {/* 已斷線時長 */}
                {offlineMs !== null && status?.status !== 'unstable' && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">已斷線時長</span>
                    <span className={`font-medium text-sm ${isLongOffline ? 'text-red-600' : 'text-yellow-600'}`}>
                      {formatDuration(offlineMs)}
                    </span>
                  </div>
                )}

                {/* 重連嘗試次數（disconnected 時顯示） */}
                {status?.status === 'disconnected' && (status?.reconnect_count ?? 0) > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">重連嘗試次數</span>
                    <span className="text-gray-800 font-medium text-sm">{status.reconnect_count} 次</span>
                  </div>
                )}

                {/* 異常開始時間（unstable 時顯示） */}
                {status?.status === 'unstable' && status?.unstable_since && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">異常開始時間</span>
                    <span className="text-gray-800 font-medium text-sm">{formatTime(status.unstable_since)}</span>
                  </div>
                )}

                {/* 連續斷線次數（unstable 時顯示） */}
                {status?.status === 'unstable' && (status?.reconnect_count ?? 0) > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">連續斷線次數</span>
                    <span className="text-orange-600 font-medium text-sm">{status.reconnect_count} 次</span>
                  </div>
                )}
              </div>

              {/* disconnected：根據時長顯示不同提示 */}
              {status?.status === 'disconnected' && (
                <div className={`p-4 rounded-xl border ${isLongOffline ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'}`}>
                  <p className={`text-sm leading-relaxed ${isLongOffline ? 'text-red-800' : 'text-yellow-800'}`}>
                    {isLongOffline
                      ? 'Bot 已離線超過 5 分鐘，自動重連可能失敗。請聯絡管理員或手動重啟 Bot 服務。'
                      : 'Bot 連線暫時中斷，正在自動重連，請稍候。通常數秒至數分鐘內可自動恢復。'}
                  </p>
                </div>
              )}

              {/* unstable：提示觀察 */}
              {status?.status === 'unstable' && (
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                  <p className="text-orange-800 text-sm leading-relaxed">
                    Bot 連線不穩定，已連續斷線 {status.reconnect_count ?? 0} 次。部分 WhatsApp 訊息可能未能及時進入系統，請保持關注。如持續不穩定，可考慮重啟 Bot 服務。
                  </p>
                </div>
              )}

              {/* needs_qr：顯示 QR code */}
              {status?.status === 'needs_qr' && (
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
