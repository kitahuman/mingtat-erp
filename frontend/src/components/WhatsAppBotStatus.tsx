'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { verificationApi } from '@/lib/api';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

interface BotStatusData {
  status: 'connected' | 'disconnected' | 'unknown';
  reported_status: string;
  last_heartbeat_at: string | null;
  last_message_at: string | null;
  uptime: number | null;
  offline_duration_ms: number | null;
  has_qr_code: boolean;
  server_time: string;
}

interface QrCodeData {
  available: boolean;
  qr_code: string | null;
  generated_at: string | null;
  expired: boolean;
  age_ms?: number;
}

// ══════════════════════════════════════════════════════════════
// 工具函數
// ══════════════════════════════════════════════════════════════

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return `${hours} 小時 ${remainMinutes} 分鐘`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return `${days} 天 ${remainHours} 小時`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

// ══════════════════════════════════════════════════════════════
// 狀態指示器組件（放在 sidebar 底部）
// ══════════════════════════════════════════════════════════════

interface WhatsAppBotStatusProps {
  collapsed?: boolean;
}

export default function WhatsAppBotStatus({ collapsed = false }: WhatsAppBotStatusProps) {
  const [botStatus, setBotStatus] = useState<BotStatusData | null>(null);
  const [qrCode, setQrCode] = useState<QrCodeData | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── 取得 bot 狀態 ──────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await verificationApi.getWhatsappBotStatus();
      setBotStatus(res.data);
    } catch (err) {
      // API 錯誤時設為 unknown
      setBotStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 取得 QR code ──────────────────────────────────────────
  const fetchQrCode = useCallback(async () => {
    if (!botStatus?.has_qr_code && botStatus?.status !== 'disconnected') return;
    setQrLoading(true);
    try {
      const res = await verificationApi.getWhatsappQrCode();
      setQrCode(res.data);
    } catch {
      setQrCode(null);
    } finally {
      setQrLoading(false);
    }
  }, [botStatus?.has_qr_code, botStatus?.status]);

  // ── 定時輪詢 bot 狀態（每 30 秒）─────────────────────────
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // ── 面板打開時取得 QR code 並定時刷新（每 5 秒）──────────
  useEffect(() => {
    if (!panelOpen) return;
    fetchQrCode();
    const interval = setInterval(fetchQrCode, 5_000);
    return () => clearInterval(interval);
  }, [panelOpen, fetchQrCode]);

  // ── 點擊外部關閉面板 ──────────────────────────────────────
  useEffect(() => {
    if (!panelOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [panelOpen]);

  // ── 狀態配置 ──────────────────────────────────────────────
  const getStatusConfig = () => {
    if (loading || !botStatus) {
      return {
        color: 'bg-yellow-400',
        pulseColor: 'bg-yellow-400',
        label: '狀態未知',
        textColor: 'text-yellow-400',
        description: '正在檢查...',
      };
    }

    switch (botStatus.status) {
      case 'connected':
        return {
          color: 'bg-green-400',
          pulseColor: 'bg-green-400',
          label: 'Bot 已連線',
          textColor: 'text-green-400',
          description: botStatus.uptime ? `已運行 ${formatUptime(botStatus.uptime)}` : '已連線',
        };
      case 'disconnected':
        return {
          color: 'bg-red-500',
          pulseColor: 'bg-red-500',
          label: 'Bot 離線',
          textColor: 'text-red-400',
          description: botStatus.offline_duration_ms
            ? `離線 ${formatDuration(botStatus.offline_duration_ms)}`
            : '已斷線',
        };
      default:
        return {
          color: 'bg-yellow-400',
          pulseColor: 'bg-yellow-400',
          label: '狀態未知',
          textColor: 'text-yellow-400',
          description: '從未收到心跳',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="relative" ref={panelRef}>
      {/* ── 狀態指示器（sidebar 底部按鈕）──────────────── */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className={`
          flex items-center gap-2 w-full px-4 py-2 transition-colors
          hover:bg-gray-800 rounded-lg text-left
          ${collapsed ? 'justify-center px-2' : ''}
        `}
        title={collapsed ? `WhatsApp ${config.label}` : undefined}
      >
        {/* 狀態圓點（帶脈衝動畫） */}
        <span className="relative flex h-3 w-3 flex-shrink-0">
          {botStatus?.status === 'connected' && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.pulseColor} opacity-75`} />
          )}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${config.color}`} />
        </span>

        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className={`text-xs font-medium ${config.textColor}`}>
              WhatsApp {config.label}
            </div>
            <div className="text-[10px] text-gray-500 truncate">
              {config.description}
            </div>
          </div>
        )}
      </button>

      {/* ── 展開的狀態面板 ────────────────────────────── */}
      {panelOpen && (
        <div className={`
          absolute bottom-full mb-2 z-50
          bg-gray-800 border border-gray-700 rounded-lg shadow-2xl
          ${collapsed ? 'left-full ml-2 bottom-0' : 'left-0 right-0 mx-2'}
          min-w-[280px]
        `}>
          {/* 面板標題 */}
          <div className="px-4 py-3 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <span className="text-sm font-semibold text-white">WhatsApp Bot 狀態</span>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* 連線狀態 */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex h-3 w-3">
                {botStatus?.status === 'connected' && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.pulseColor} opacity-75`} />
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${config.color}`} />
              </span>
              <span className={`text-sm font-medium ${config.textColor}`}>
                {config.label}
              </span>
            </div>

            {/* 詳細資訊 */}
            <div className="space-y-1.5 text-xs">
              {botStatus?.last_heartbeat_at && (
                <div className="flex justify-between">
                  <span className="text-gray-400">最後心跳</span>
                  <span className="text-gray-300">{formatTime(botStatus.last_heartbeat_at)}</span>
                </div>
              )}
              {botStatus?.last_message_at && (
                <div className="flex justify-between">
                  <span className="text-gray-400">最後訊息</span>
                  <span className="text-gray-300">{formatTime(botStatus.last_message_at)}</span>
                </div>
              )}
              {botStatus?.uptime != null && botStatus.status === 'connected' && (
                <div className="flex justify-between">
                  <span className="text-gray-400">運行時間</span>
                  <span className="text-gray-300">{formatUptime(botStatus.uptime)}</span>
                </div>
              )}
              {botStatus?.status === 'disconnected' && botStatus.offline_duration_ms && (
                <div className="flex justify-between">
                  <span className="text-gray-400">離線時長</span>
                  <span className="text-red-400 font-medium">{formatDuration(botStatus.offline_duration_ms)}</span>
                </div>
              )}
            </div>
          </div>

          {/* QR Code 區域（僅在離線且有 QR code 時顯示）*/}
          {botStatus?.status === 'disconnected' && (
            <div className="px-4 py-3 border-t border-gray-700">
              <div className="text-xs font-medium text-gray-400 mb-2">掃碼重新連線</div>

              {qrLoading && !qrCode?.available && (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full" />
                  <span className="ml-2 text-xs text-gray-400">載入 QR Code...</span>
                </div>
              )}

              {qrCode?.available && qrCode.qr_code && (
                <div className="flex flex-col items-center">
                  {/* QR Code 圖片 */}
                  <div className="bg-white p-3 rounded-lg mb-2">
                    {qrCode.qr_code.startsWith('data:image') ? (
                      // base64 圖片格式
                      <img
                        src={qrCode.qr_code}
                        alt="WhatsApp QR Code"
                        className="w-48 h-48"
                      />
                    ) : qrCode.qr_code.startsWith('http') ? (
                      // URL 格式
                      <img
                        src={qrCode.qr_code}
                        alt="WhatsApp QR Code"
                        className="w-48 h-48"
                      />
                    ) : (
                      // 純文字 QR data — 用 canvas 渲染
                      <QrCodeCanvas data={qrCode.qr_code} size={192} />
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 text-center">
                    用 WhatsApp 掃描此 QR Code 重新連線
                    <br />
                    每 5 秒自動刷新
                  </div>
                  {qrCode.age_ms != null && (
                    <div className="text-[10px] text-gray-600 mt-1">
                      {Math.floor(qrCode.age_ms / 1000)}s ago
                    </div>
                  )}
                </div>
              )}

              {!qrCode?.available && !qrLoading && (
                <div className="text-center py-4">
                  <div className="text-xs text-gray-500 mb-2">
                    {qrCode?.expired
                      ? 'QR Code 已過期，等待 Bot 發送新的...'
                      : '等待 Bot 發送 QR Code...'}
                  </div>
                  <div className="text-[10px] text-gray-600">
                    請確認 Bot 伺服器正在運行
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 連線正常時的提示 */}
          {botStatus?.status === 'connected' && (
            <div className="px-4 py-3 border-t border-gray-700">
              <div className="flex items-center gap-2 text-xs text-green-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>WhatsApp Bot 運作正常，訊息接收中</span>
              </div>
            </div>
          )}

          {/* 未知狀態時的提示 */}
          {botStatus?.status === 'unknown' && (
            <div className="px-4 py-3 border-t border-gray-700">
              <div className="text-xs text-yellow-400 mb-1">從未收到 Bot 心跳</div>
              <div className="text-[10px] text-gray-500">
                請確認 WhatsApp Bot 已配置心跳功能並指向正確的 ERP 端點。
              </div>
            </div>
          )}

          {/* 刷新按鈕 */}
          <div className="px-4 py-2 border-t border-gray-700">
            <button
              onClick={() => { fetchStatus(); fetchQrCode(); }}
              className="w-full text-xs text-gray-400 hover:text-white transition-colors py-1 flex items-center justify-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              立即刷新
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// QR Code 渲染組件（支援純文字 QR data，使用 qrcode.react 渲染）
// ══════════════════════════════════════════════════════════════

function QrCodeCanvas({ data, size }: { data: string; size: number }) {
  return (
    <QRCodeSVG
      value={data}
      size={size}
      bgColor="#ffffff"
      fgColor="#000000"
      level="M"
      includeMargin={false}
    />
  );
}
