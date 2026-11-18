// Service Worker v2 - Direct W3C Web Push (closed-app Android/iOS PWA) + FCM compatibility

// 1. Handle notification click BEFORE importing Firebase scripts
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawData = event.notification.data?.FCM_MSG?.data || event.notification.data || {};
  const rawUrl = rawData.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;
  const orderId = rawData.orderId;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if (orderId && 'postMessage' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              orderId,
              url: targetUrl,
            });
          }
          if (client.url !== targetUrl && 'navigate' in client) {
            client.navigate(targetUrl).catch(() => {});
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// 2. Handle direct W3C Web Push payloads (works even when app & browser are closed)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    try {
      const text = event.data.text();
      payload = text ? { webPush: true, title: 'Peringatan Tempahan', body: text } : null;
    } catch {
      payload = null;
    }
  }

  if (!payload) return;

  // Yield to Firebase Messaging SDK handler if this is a Firebase FCM payload
  if (payload.FCM_MSG || payload.notification) {
    return;
  }

  if (payload.webPush || payload.title) {
    const title = payload.title || 'Pesanan & Notifikasi';
    const options = {
      body: payload.body || '',
      icon: payload.icon || 'https://i.imgur.com/49kNDoe.png',
      badge: payload.badge || 'https://i.imgur.com/49kNDoe.png',
      tag: payload.tag || payload.alertId || undefined,
      renotify: Boolean(payload.tag || payload.alertId),
      data: {
        url: payload.url || '/',
        orderId: payload.orderId,
        alertId: payload.alertId,
      },
    };

    event.waitUntil(
      Promise.all([
        self.registration.showNotification(title, options),
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'WEB_PUSH_RECEIVED',
              payload,
            });
          });
        }).catch(() => {}),
      ])
    );
  }
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Import Firebase 12.14.0 compat scripts for legacy FCM background message compatibility
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDqF5o8uNqY50gTF-I_tcY4Q8Wy-z_2dCs",
  authDomain: "order-submission-501208.firebaseapp.com",
  projectId: "order-submission-501208",
  storageBucket: "order-submission-501208.firebasestorage.app",
  messagingSenderId: "440315185873",
  appId: "1:440315185873:web:10a310f20b28a0413853f0"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);

  if (!payload.notification && payload.data) {
    const title = payload.data.title || 'Pesanan & Notifikasi';
    const body = payload.data.body || '';
    const url = payload.data.url || '/';
    const orderId = payload.data.orderId;

    const notificationOptions = {
      body,
      icon: payload.data.icon || 'https://i.imgur.com/49kNDoe.png',
      badge: 'https://i.imgur.com/49kNDoe.png',
      data: { url, orderId },
      tag: payload.data.tag || undefined,
    };

    return self.registration.showNotification(title, notificationOptions);
  }
});
