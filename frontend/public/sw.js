// 明達建築 ERP - Service Worker
// 策略：靜態資源 Cache First，API 請求 Network First
// 支援 Web Push 通知（WhatsApp Console）

const CACHE_NAME = 'mingtat-erp-v2';
const STATIC_CACHE_NAME = 'mingtat-erp-static-v2';

// 預先快取的靜態資源
const PRECACHE_ASSETS = [
  '/',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.json',
  '/whatsapp-console/icon-192.png',
  '/whatsapp-console/icon-512.png',
  '/whatsapp-console/notification.mp3',
];

// ── Install：預先快取靜態資源 ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // 強制新 SW 立即接管，不等待舊 SW 釋放
  self.skipWaiting();
});

// ── Activate：清除舊版快取 ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // 立即控制所有已開啟的頁面
  self.clients.claim();
});

// ── Fetch：路由策略 ────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只處理同源請求（排除 Chrome 擴充套件等）
  if (!url.origin.startsWith('http')) return;

  // API 請求 → Network First（優先網路，失敗才回傳快取）
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 靜態資源（圖片、JS、CSS、字型）→ Cache First
  if (
    request.destination === 'image' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 頁面導航請求 → Network First（確保最新頁面）
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 其餘請求 → Network First
  event.respondWith(networkFirst(request));
});

// ── Web Push 通知接收 ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'WhatsApp 新訊息', body: event.data.text() };
  }

  const title = payload.title || 'WhatsApp 遙控台';
  const options = {
    body: payload.body || '您有新訊息',
    icon: payload.icon || '/whatsapp-console/icon-192.png',
    badge: payload.badge || '/whatsapp-console/badge-72.png',
    tag: payload.tag || 'whatsapp-message',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: false,
    silent: false,
    // iOS Safari 支援的額外選項
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── 通知點擊處理 ───────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.url || '/whatsapp-console';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 尋找已開啟的 WhatsApp Console 視窗
      for (const client of windowClients) {
        if (client.url.includes('/whatsapp-console')) {
          client.focus();
          // 傳送訊息給頁面，讓它選擇對應的對話
          if (data.chatId) {
            client.postMessage({ type: 'OPEN_CHAT', chatId: data.chatId });
          }
          return;
        }
      }
      // 沒有開啟的視窗，開新視窗
      return clients.openWindow(url);
    })
  );
});

// ── 通知關閉處理 ───────────────────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  // 可以在這裡記錄通知被關閉的事件
  console.log('[SW] Notification closed:', event.notification.tag);
});

// ── Cache First 策略 ───────────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 網路失敗且無快取，回傳空 Response
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ── Network First 策略 ─────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 網路失敗，嘗試從快取回傳
    const cached = await caches.match(request);
    if (cached) return cached;

    // 頁面導航失敗時，嘗試回傳快取的首頁
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/');
      if (fallback) return fallback;
    }

    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}
