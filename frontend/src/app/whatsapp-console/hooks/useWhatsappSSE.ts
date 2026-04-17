'use client';

import { useEffect, useRef } from 'react';
import Cookies from 'js-cookie';
import { WaMessage } from '../page';

interface UseWhatsappSSEOptions {
  onMessage: (msg: WaMessage) => void;
  onStatus: (status: string) => void;
}

export function useWhatsappSSE({ onMessage, onStatus }: UseWhatsappSSEOptions) {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatus);

  // 保持最新的回調引用
  onMessageRef.current = onMessage;
  onStatusRef.current = onStatus;

  useEffect(() => {
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      const token = Cookies.get('token');
      if (!token) return;

      // 關閉舊連線
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }

      const url = `/api/whatsapp-console/events`;
      const es = new EventSource(url, {
        // EventSource 不支援自定義 headers，需要用 cookie 或 query param
        // 這裡用 URL query param 傳遞 token
      });

      // 由於 EventSource 不支援自定義 headers，改用 fetch + ReadableStream
      // 先關閉 EventSource，改用 fetch
      es.close();

      // 使用 fetch 實現 SSE（支援自定義 headers）
      const controller = new AbortController();
      const fetchSSE = async () => {
        try {
          const response = await fetch('/api/whatsapp-console/events', {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            throw new Error(`SSE connect failed: ${response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'message' && data.message) {
                    onMessageRef.current(data.message);
                  } else if (data.type === 'status') {
                    onStatusRef.current(data.status);
                  }
                } catch {
                  // 忽略解析錯誤
                }
              }
            }
          }
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.warn('SSE disconnected, reconnecting in 5s...', err.message);
          if (!unmounted) {
            reconnectTimerRef.current = setTimeout(connect, 5000);
          }
        }
      };

      // 儲存 abort controller 以便清理
      (esRef as any).current = { close: () => controller.abort() };
      fetchSSE();
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (esRef.current) {
        (esRef.current as any).close();
      }
    };
  }, []);
}
