'use client';

import { useEffect, useRef } from 'react';
import { whatsappConsoleApi } from '@/lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    const setup = async () => {
      // 檢查瀏覽器支援
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Web Push not supported in this browser');
        return;
      }

      try {
        // 等待 Service Worker 就緒
        const registration = await navigator.serviceWorker.ready;

        // 取得 VAPID 公鑰
        const vapidRes = await whatsappConsoleApi.getVapidKey();
        const vapidPublicKey = vapidRes.data.publicKey;
        if (!vapidPublicKey) {
          console.log('VAPID public key not configured');
          return;
        }

        // 檢查現有訂閱
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          // 請求通知權限
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            console.log('Notification permission denied');
            return;
          }

          // 建立新訂閱
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
        }

        // 向後端儲存訂閱
        await whatsappConsoleApi.subscribePush(subscription.toJSON() as PushSubscriptionJSON);
        console.log('Web Push subscription saved');
      } catch (err) {
        console.error('Web Push setup failed:', err);
      }
    };

    // 延遲執行，避免影響頁面載入
    const timer = setTimeout(setup, 2000);
    return () => clearTimeout(timer);
  }, []);
}
