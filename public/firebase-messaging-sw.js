// Register custom notificationclick listener BEFORE importing Firebase Messaging scripts
// to ensure FCM does not overwrite custom click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;
  const orderId = event.notification.data?.orderId;

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
            client.navigate(targetUrl);
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

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Import Firebase 12.14.0 compat scripts aligned with package.json
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
  
  // Prevent duplicate background notifications:
  // When payload contains a `notification` property, Firebase Messaging automatically displays it.
  // Only manually display a notification for data-only messages (when payload.notification is absent).
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
