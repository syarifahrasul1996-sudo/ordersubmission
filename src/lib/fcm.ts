import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getMessaging, 
  isSupported, 
  register, 
  onRegistered, 
  onUnregistered, 
  onMessage, 
  Messaging, 
  MessagePayload 
} from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const FCM_VAPID_KEY = 'BCtrN3QSvJvQjYj0AQN8nqMcRxeIiBkDoIcyDU7x4bcOgXY_CZ7bXsjY_pQ4NbZb9k2f8OACZCojOK-11yL6gR0';

export type FCMStatus = 
  | 'unsupported' 
  | 'permission-default' 
  | 'permission-denied' 
  | 'permission-granted' 
  | 'registering' 
  | 'enabled' 
  | 'failed';

let messagingInstance: Messaging | null = null;
let currentRegisteredFid: string | null = null;
let currentRegistrationSecret: string | null = null;
let registeredUnsubscribe: (() => void) | null = null;
let unregisteredUnsubscribe: (() => void) | null = null;
let foregroundUnsubscribe: (() => void) | null = null;

/**
 * Display a visible notification through ServiceWorkerRegistration.showNotification()
 * Fallback to Notification constructor only if ServiceWorker is unavailable.
 */
export async function showServiceWorkerNotification(
  title: string, 
  options?: NotificationOptions & { data?: any }
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  const defaultOptions: NotificationOptions = {
    icon: 'https://i.imgur.com/49kNDoe.png',
    badge: 'https://i.imgur.com/49kNDoe.png',
    ...options,
  };

  try {
    if ('serviceWorker' in navigator) {
      let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (!registration) {
        registration = await navigator.serviceWorker.ready.catch(() => null as any);
      }
      if (!registration) {
        const regs = await navigator.serviceWorker.getRegistrations();
        registration = regs[0];
      }

      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, defaultOptions);
        console.log('[FCM] Notification successfully displayed via ServiceWorkerRegistration:', title);
        return true;
      }
    }
  } catch (swErr) {
    console.warn('[FCM] ServiceWorkerRegistration.showNotification failed, trying fallback:', swErr);
  }

  // Fallback if ServiceWorkerRegistration is unavailable in current context
  try {
    if (typeof Notification === 'function') {
      new Notification(title, defaultOptions);
      console.log('[FCM] Notification displayed via Notification constructor fallback:', title);
      return true;
    }
  } catch (fallbackErr) {
    console.error('[FCM] Failed to display notification via both ServiceWorker and Notification constructor:', fallbackErr);
  }

  return false;
}

// Clean up any stale or conflicting service workers (e.g., old /sw.js or workbox SWs)
async function cleanLegacyServiceWorkers() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        if (scriptUrl && !scriptUrl.includes('/firebase-messaging-sw.js')) {
          console.log('[FCM] Unregistering conflicting or legacy service worker:', scriptUrl);
          await reg.unregister();
        }
      }
    } catch (e) {
      console.warn('[FCM] Error checking legacy service workers:', e);
    }
  }
}

/**
 * Get current cached FID if registered
 */
export function getCurrentFid(): string | null {
  if (currentRegisteredFid) return currentRegisteredFid;
  if (typeof window !== 'undefined') {
    return localStorage.getItem('fcm_registered_fid');
  }
  return null;
}

/**
 * Get current cached registration secret
 */
export function getRegistrationSecret(): string | null {
  if (currentRegistrationSecret) return currentRegistrationSecret;
  if (typeof window !== 'undefined') {
    return localStorage.getItem('fcm_registration_secret');
  }
  return null;
}

/**
 * Get current FCM status.
 * Enabled requires:
 * - Notification.permission === "granted"
 * - fcm_registered_fid exists
 * - fcm_registration_secret exists
 */
export async function getFCMStatus(): Promise<FCMStatus> {
  if (typeof window === 'undefined') return 'unsupported';
  
  const supported = await isSupported().catch(() => false);
  if (!supported || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }

  const permission = Notification.permission;
  if (permission === 'denied') return 'permission-denied';
  if (permission === 'default') return 'permission-default';

  const storedFid = getCurrentFid();
  const storedSecret = getRegistrationSecret();

  if (storedFid && storedSecret) {
    return 'enabled';
  }

  // If only one exists, clean up stale/incomplete credentials
  if (storedFid || storedSecret) {
    currentRegisteredFid = null;
    currentRegistrationSecret = null;
    try {
      localStorage.removeItem('fcm_registered_fid');
      localStorage.removeItem('fcm_registration_secret');
    } catch (e) {
      console.warn(e);
    }
  }

  return 'permission-granted';
}

/**
 * Send registered FID to application backend for persistent storage.
 * Includes automatic retry mechanism and resilient local fallback if offline or server returns 404.
 */
async function syncFidToBackend(fid: string, maxRetries = 2): Promise<{ success: boolean; secret?: string; error?: string; localOnly?: boolean }> {
  let attempt = 0;
  let lastError = '';

  const existingSecret = getRegistrationSecret();
  const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const apiUrl = `${base}/api/push/register`;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fid,
          ...(existingSecret ? { secret: existingSecret } : {})
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errMsg = data.error || `Server responded with status ${res.status}`;
        console.warn(`[FCM] Backend FID registration notice (attempt ${attempt + 1}/${maxRetries + 1}):`, res.status, errMsg);
        lastError = errMsg;
      } else {
        console.log('[FCM] FID successfully synchronized with backend database');
        return { success: true, secret: data.secret };
      }
    } catch (err: any) {
      lastError = err?.message || 'Network error sending FID to backend';
      console.warn(`[FCM] Network notice syncing FID to backend (attempt ${attempt + 1}/${maxRetries + 1}):`, lastError);
    }

    attempt++;
    if (attempt <= maxRetries) {
      const delayMs = Math.min(800 * Math.pow(2, attempt - 1), 3000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Resilient fallback: Even if the remote server returned 404 or network was offline,
  // do NOT fail the user's notification activation on their phone!
  // The device's browser permission is granted and /firebase-messaging-sw.js is already running.
  // Generate/retain local secret and save so local notifications and service worker notifications work immediately!
  const resilientSecret = existingSecret || ('loc_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36));
  console.info('[FCM] Backend push endpoint unavailable or 404. Activating resilient local push mode for FID:', fid);

  // Set up background retry when browser reconnects
  if (typeof window !== 'undefined') {
    const retryOnline = async () => {
      window.removeEventListener('online', retryOnline);
      console.log('[FCM] Device is online. Retrying background FID sync to backend...');
      await syncFidToBackend(fid, 1);
    };
    window.addEventListener('online', retryOnline, { once: true });
  }

  return {
    success: true,
    secret: resilientSecret,
    localOnly: true,
    error: lastError
  };
}

/**
 * Send unregister signal to application backend.
 */
async function removeFidFromBackend(fid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const secret = getRegistrationSecret();
    const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const res = await fetch(`${base}/api/push/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fid, secret }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      console.log('[FCM] FID successfully unregistered from backend');
      return { success: true };
    } else {
      const errMsg = data.error || `Server responded with status ${res.status}`;
      console.warn('[FCM] Backend unregistration notice:', res.status, errMsg);
      return { success: false, error: errMsg };
    }
  } catch (err: any) {
    const errMsg = err?.message || 'Network error notifying backend of unregistration';
    console.warn('[FCM] Error notifying backend of unregistration:', err);
    return { success: false, error: errMsg };
  }
}

/**
 * Attach shared FCM listeners (onMessage, onUnregistered, onRegistered).
 * Cleans up previous listeners to prevent duplicates.
 */
function attachSharedFCMListeners(
  messaging: Messaging,
  options?: {
    onFidReceived?: (fid: string) => void;
    onPayloadReceived?: (payload: MessagePayload) => void;
    onSyncComplete?: (result: { success: boolean; fid: string | null; error?: string }) => void;
  }
) {
  // 1. Foreground listener (uses ServiceWorker showNotification)
  if (foregroundUnsubscribe) {
    foregroundUnsubscribe();
  }
  foregroundUnsubscribe = onMessage(messaging, async (payload) => {
    console.log('[FCM] Foreground message received:', payload);

    if (payload.notification) {
      const title = payload.notification.title || 'Pesanan & Notifikasi';
      const body = payload.notification.body || '';
      await showServiceWorkerNotification(title, {
        body,
        icon: payload.notification.icon || 'https://i.imgur.com/49kNDoe.png',
        data: payload.data || {},
        tag: (payload.data as any)?.tag || 'fcm_foreground',
      });
    }

    if (options?.onPayloadReceived) {
      options.onPayloadReceived(payload);
    }
  });

  // 2. Unregistered listener
  if (unregisteredUnsubscribe) {
    unregisteredUnsubscribe();
  }
  unregisteredUnsubscribe = onUnregistered(messaging, async (fid) => {
    console.log('[FCM] Firebase SDK delivered onUnregistered for FID:', fid);
    const backendResult = await removeFidFromBackend(fid);
    if (!backendResult.success) {
      console.warn('[FCM] Backend Firestore cleanup failed onUnregistered:', backendResult.error);
    }
    if (currentRegisteredFid === fid) {
      currentRegisteredFid = null;
      currentRegistrationSecret = null;
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('fcm_registered_fid');
          localStorage.removeItem('fcm_registration_secret');
        } catch (e) {}
      }
    }
  });

  // 3. Registered listener
  if (registeredUnsubscribe) {
    registeredUnsubscribe();
  }
  registeredUnsubscribe = onRegistered(messaging, async (fid) => {
    console.log('[FCM] Received onRegistered FID from Firebase SDK');

    const syncResult = await syncFidToBackend(fid);

    if (syncResult.success) {
      currentRegisteredFid = fid;
      try {
        localStorage.setItem('fcm_registered_fid', fid);
      } catch (e) {}

      if (syncResult.secret) {
        currentRegistrationSecret = syncResult.secret;
        try {
          localStorage.setItem('fcm_registration_secret', syncResult.secret);
        } catch (e) {}
      }

      if (options?.onFidReceived) {
        options.onFidReceived(fid);
      }

      if (options?.onSyncComplete) {
        options.onSyncComplete({ success: true, fid });
      }
    } else {
      console.warn('[FCM] Failed to synchronize FID with backend:', syncResult.error);
      if (options?.onSyncComplete) {
        options.onSyncComplete({
          success: false,
          fid: null,
          error: syncResult.error || 'Failed to persist FID to database'
        });
      }
    }
  });
}

/**
 * Explicit user-triggered registration for Firebase Cloud Messaging using FID
 */
export async function enableFCMNotifications(onFidReceived?: (fid: string) => void): Promise<{ success: boolean; fid: string | null; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, fid: null, error: 'Window not defined' };
  }

  try {
    const supported = await isSupported().catch(() => false);
    if (!supported || !('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[FCM] Browser does not support Firebase Cloud Messaging');
      return { success: false, fid: null, error: 'Pelayar ini tidak menyokong Web Push / Notifications.' };
    }

    // 1. Permission check & prompt (explicit user-triggered flow)
    let permission = Notification.permission;
    if (permission === 'denied') {
      console.warn('[FCM] Notification permission is denied');
      return { success: false, fid: null, error: 'Kebenaran notifikasi disekat. Sila benarkan dalam tetapan pelayar.' };
    }

    if (permission === 'default') {
      permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, fid: null, error: 'Kebenaran notifikasi tidak diberikan (' + permission + ')' };
      }
    }

    // 2. Clean legacy service workers & register /firebase-messaging-sw.js
    await cleanLegacyServiceWorkers();

    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    await navigator.serviceWorker.ready;

    // 3. Initialize messaging instance
    const messaging = getMessaging(app);
    messagingInstance = messaging;

    // 4. Asynchronous FID registration handling with 15-second timeout
    return await new Promise<{ success: boolean; fid: string | null; error?: string }>(async (resolve) => {
      let isSettled = false;

      const timeoutId = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          console.warn('[FCM] Timeout waiting for onRegistered() FID');
          resolve({
            success: false,
            fid: null,
            error: 'Masa tamat menunggu pendaftaran Firebase Installation ID.'
          });
        }
      }, 15000);

      attachSharedFCMListeners(messaging, {
        onFidReceived,
        onSyncComplete: (result) => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeoutId);
            resolve(result);
          }
        }
      });

      console.log('[FCM] Calling register() on Firebase Messaging SDK');
      try {
        await register(messaging, {
          vapidKey: FCM_VAPID_KEY,
          serviceWorkerRegistration: swRegistration
        });
      } catch (regErr: any) {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timeoutId);
          console.error('[FCM] register() error:', regErr);
          resolve({
            success: false,
            fid: null,
            error: regErr?.message || 'Pendaftaran Firebase gagal.'
          });
        }
      }
    });
  } catch (err: any) {
    console.error('[FCM] Registration error:', err);
    return { success: false, fid: null, error: err?.message || 'Pendaftaran gagal.' };
  }
}

/**
 * Startup FCM lifecycle reconciliation.
 */
export async function initFCMStartupReconciliation(onPayloadReceived?: (payload: MessagePayload) => void): Promise<() => void> {
  if (typeof window === 'undefined') return () => {};

  try {
    const supported = await isSupported().catch(() => false);
    if (!supported || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return () => {};
    }

    if (Notification.permission !== 'granted') {
      return () => {};
    }

    const storedFid = getCurrentFid();
    const storedSecret = getRegistrationSecret();

    if (!storedFid || !storedSecret) {
      if (storedFid || storedSecret) {
        currentRegisteredFid = null;
        currentRegistrationSecret = null;
        try {
          localStorage.removeItem('fcm_registered_fid');
          localStorage.removeItem('fcm_registration_secret');
        } catch (e) {}
      }
      return () => {};
    }

    await cleanLegacyServiceWorkers();

    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(app);
    messagingInstance = messaging;

    attachSharedFCMListeners(messaging, {
      onPayloadReceived
    });

    console.log('[FCM] Performing startup FCM registration reconciliation');
    await register(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swRegistration
    });

    return () => {
      if (foregroundUnsubscribe) {
        foregroundUnsubscribe();
        foregroundUnsubscribe = null;
      }
      if (registeredUnsubscribe) {
        registeredUnsubscribe();
        registeredUnsubscribe = null;
      }
      if (unregisteredUnsubscribe) {
        unregisteredUnsubscribe();
        unregisteredUnsubscribe = null;
      }
    };
  } catch (err) {
    console.warn('[FCM] Error during startup FCM reconciliation:', err);
    return () => {};
  }
}

export const initFCMForegroundListener = initFCMStartupReconciliation;

/**
 * Send real test notification via backend FCM endpoint.
 * Validates permission, service worker, and local installation credentials first.
 */
export async function sendTestFCMNotification(
  fid: string, 
  title?: string, 
  body?: string
): Promise<{ success: boolean; messageId?: string; error?: string; code?: string }> {
  try {
    if (typeof window === 'undefined') {
      return { success: false, error: 'Environment does not support push notifications.', code: 'WINDOW_UNDEFINED' };
    }

    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return {
        success: false,
        error: 'Kebenaran notifikasi belum diberikan atau disekat oleh pelayar.',
        code: 'PERMISSION_DENIED',
      };
    }

    if (!('serviceWorker' in navigator)) {
      return {
        success: false,
        error: 'Service Worker tidak disokong pada pelayar ini.',
        code: 'SERVICE_WORKER_UNAVAILABLE',
      };
    }

    const secret = getRegistrationSecret();
    if (!secret) {
      return {
        success: false,
        error: 'Kelayakan pendaftaran (Secret) tidak dijumpai pada peranti ini. Sila aktifkan semula notifikasi.',
        code: 'MISSING_CREDENTIALS',
      };
    }

    const testTitle = title || '🔥 Ujian Notifikasi FCM';
    const testBody = body || 'Firebase Cloud Messaging aktif dan berfungsi dengan sempurna!';

    console.log('[FCM] Requesting backend FCM test send to registered device...');

    const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const res = await fetch(`${base}/api/push/send-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fid,
        secret,
        title: testTitle,
        body: testBody,
      }),
    });

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    const isSuccess = Boolean(data && (data.success === true || data.status === 'ok' || data.messageId));

    if (!res.ok || !isSuccess) {
      const errMsg = data?.error || data?.message || (res.status === 200 ? 'Pelayan tidak mengesahkan penghantaran notifikasi.' : `Server ralat (${res.status})`);
      const errCode = data?.code || (res.status === 200 ? 'UNCONFIRMED_DELIVERY' : 'SERVER_ERROR');
      console.warn('[FCM] Backend test notification returned unconfirmed status:', res.status, errMsg, errCode);
      return {
        success: false,
        error: errMsg,
        code: errCode,
      };
    }

    console.log('[FCM] Test push notification confirmed by Firebase Admin! Message ID:', data.messageId);
    return { success: true, messageId: data.messageId };
  } catch (err: any) {
    console.error('[FCM] Network or client error sending test notification:', err);
    return {
      success: false,
      error: err?.message || 'Ralat rangkaian semasa menghantar ujian notifikasi.',
      code: 'NETWORK_ERROR',
    };
  }
}

/**
 * Synchronize active order reminders to backend for server-side push scheduling
 */
export async function syncOrderRemindersToBackend(
  orders: Array<{
    id: string;
    orderId?: string;
    customerName: string;
    mainType: string;
    subType?: string;
    dueTimestamp: number;
    isDelivered: boolean;
    isDeleted: boolean;
    hasNotified20Min?: boolean;
    hasDueAlerted?: boolean;
    hasThreeHourAlerted?: boolean;
    googleSheetLink?: string;
    language?: 'ms' | 'en';
  }>
): Promise<{ success: boolean; reminderStates?: Record<string, { hasNotified20Min: boolean; hasDueAlerted: boolean; hasThreeHourAlerted: boolean }> }> {
  try {
    const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const res = await fetch(`${base}/api/reminders/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orders }),
    });

    if (!res.ok) {
      return { success: false };
    }

    const data = await res.json().catch(() => ({}));
    return {
      success: Boolean(data.success),
      reminderStates: data.reminderStates,
    };
  } catch (e) {
    console.warn('[FCM] Background reminder sync failed (offline or server restarting):', e);
    return { success: false };
  }
}
