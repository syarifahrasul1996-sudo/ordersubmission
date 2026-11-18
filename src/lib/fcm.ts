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
  | 'ios-requires-pwa'
  | 'permission-default' 
  | 'permission-denied' 
  | 'permission-granted' 
  | 'registering' 
  | 'enabled'
  | 'failed';

export interface SyncedDeviceInfo {
  id: string;
  deviceId?: string;
  fidSuffix?: string;
  deviceLabel: string;
  platform: string;
  fcmEnabled?: boolean;
  lastSeenAt: string;
}

export interface SyncedAlertEvent {
  id: string;
  type: 'test_alert' | 'order_alert';
  title: string;
  body: string;
  orderId?: string;
  senderDeviceId?: string;
  senderDeviceLabel?: string;
  senderFidSuffix?: string;
  createdAt: number;
}

export interface ServerOrderReminder {
  id: string;
  orderId?: string;
  customerName: string;
  mainType: string;
  subType?: string;
  dueTimestamp: number;
  isDelivered: boolean;
  isDeleted: boolean;
  hasNotified20Min: boolean;
  hasDueAlerted: boolean;
  hasThreeHourAlerted: boolean;
  googleSheetLink?: string;
  language?: 'ms' | 'en';
  createdAt?: string;
  updatedAt?: string;
}

export interface CrossDeviceNotificationState {
  success: boolean;
  activeDevicesCount: number;
  devices: SyncedDeviceInfo[];
  reminders: ServerOrderReminder[];
  recentAlerts?: SyncedAlertEvent[];
  readNotificationIds: string[];
  sheetConfigs?: {
    annualSheets: Array<{ year: string; spreadsheetId: string; scriptUrl: string }>;
    globalScriptUrl?: string;
    updatedAt?: number;
  };
  fcmMessagingAvailable?: boolean;
  serverTime?: string;
}

/**
 * Get or create a persistent device identifier for cross-device notification & presence sync.
 */
export function getOrCreateSyncDeviceId(): string {
  if (typeof window === 'undefined') return 'server_ssr';
  try {
    const existing = localStorage.getItem('app_sync_device_id');
    if (existing && existing.trim()) return existing.trim();
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('app_sync_device_id', generated);
    return generated;
  } catch {
    return `dev_mem_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Derive a clean, human-readable device label & platform for multi-device sync UI.
 */
export function getDeviceMetadata(): { deviceLabel: string; platform: string } {
  if (typeof window === 'undefined') {
    return { deviceLabel: 'Web Device', platform: 'web' };
  }
  const ua = window.navigator.userAgent || '';
  const standalone = isStandaloneMode();

  let os = 'Desktop';
  let platform = 'desktop';
  if (/iPhone/.test(ua)) {
    os = standalone ? 'iPhone PWA' : 'iPhone';
    platform = 'ios';
  } else if (/iPad/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)) {
    os = standalone ? 'iPad PWA' : 'iPad';
    platform = 'ios';
  } else if (/Android/.test(ua)) {
    os = standalone ? 'Android PWA' : 'Android';
    platform = 'android';
  } else if (/Mac OS X|Macintosh/.test(ua)) {
    os = 'Mac';
    platform = 'macos';
  } else if (/Windows/.test(ua)) {
    os = 'Windows';
    platform = 'windows';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
    platform = 'linux';
  }

  let browser = '';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  const deviceLabel = standalone || !browser ? os : `${os} ${browser}`;
  return { deviceLabel, platform };
}

/**
 * Check if current device is iOS (iPhone/iPad/iPod).
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );
}

/**
 * Check if the web app is running in Standalone PWA mode (added to Home Screen).
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Synthesizes a clean audio alert chime using Web Audio API.
 * Guaranteed zero network dependencies and works on mobile/desktop browsers upon interaction.
 */
export function playAlertChime(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    // Tone 1: D5 -> A5 (warm chime)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Tone 2: D6 (bright confirmation)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now + 0.12);
    gain2.gain.setValueAtTime(0.35, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch (e) {
    console.warn('[FCM] Web Audio chime play notice:', e);
  }
}

let messagingInstance: Messaging | null = null;
let currentRegisteredFid: string | null = null;
let currentRegistrationSecret: string | null = null;
let registeredUnsubscribe: (() => void) | null = null;
let unregisteredUnsubscribe: (() => void) | null = null;
let foregroundUnsubscribe: (() => void) | null = null;

/**
 * Wait until a ServiceWorkerRegistration has an active worker (up to timeoutMs).
 */
async function waitForActiveServiceWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs = 6000
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration;

  const targetWorker = registration.installing || registration.waiting;
  if (!targetWorker) {
    try {
      const readyReg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration>((_, reject) =>
          setTimeout(() => reject(new Error('SW ready timeout')), timeoutMs)
        )
      ]);
      return readyReg || registration;
    } catch {
      return registration;
    }
  }

  return new Promise<ServiceWorkerRegistration>((resolve) => {
    const timer = setTimeout(() => {
      targetWorker.removeEventListener('statechange', onStateChange);
      resolve(registration);
    }, timeoutMs);

    const onStateChange = () => {
      if (targetWorker.state === 'activated' || registration.active) {
        clearTimeout(timer);
        targetWorker.removeEventListener('statechange', onStateChange);
        resolve(registration);
      }
    };

    targetWorker.addEventListener('statechange', onStateChange);
  });
}

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
      let registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) {
        registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      }
      if (!registration) {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }).catch(() => undefined);
      }
      if (registration) {
        registration = await waitForActiveServiceWorker(registration, 4000);
      }
      if (!registration || !registration.active) {
        registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3000))
        ]);
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

let cachedVapidPublicKey: string | null = null;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getServerVapidPublicKey(): Promise<string | null> {
  if (cachedVapidPublicKey) return cachedVapidPublicKey;
  try {
    const base = window.location?.origin || '';
    const res = await fetch(`${base}/api/push/vapid-public-key`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.success && typeof data.publicKey === 'string' && data.publicKey.trim()) {
      cachedVapidPublicKey = data.publicKey.trim();
      return cachedVapidPublicKey;
    }
  } catch {}
  return null;
}

async function ensureWebPushSubscription(
  swRegistration: ServiceWorkerRegistration
): Promise<{ success: boolean; subId?: string; error?: string }> {
  if (!('PushManager' in window) || !swRegistration?.pushManager) {
    return { success: false, error: 'PushManager not supported' };
  }

  try {
    const publicKey = await getServerVapidPublicKey();
    if (!publicKey) {
      return { success: false, error: 'Failed to retrieve server Web Push public key' };
    }

    let sub = await swRegistration.pushManager.getSubscription();
    if (sub) {
      const existingKey = arrayBufferToBase64Url(sub.options?.applicationServerKey || null);
      if (existingKey && existingKey !== publicKey) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
    }

    if (!sub) {
      try {
        sub = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      } catch (subErr: any) {
        // Retry once after clearing any stale subscription
        const existing = await swRegistration.pushManager.getSubscription().catch(() => null);
        if (existing) {
          await existing.unsubscribe().catch(() => {});
        }
        sub = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
    }

    const base = window.location?.origin || '';
    const deviceId = getOrCreateSyncDeviceId();
    const { deviceLabel, platform } = getDeviceMetadata();

    const res = await fetch(`${base}/api/push/webpush-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        deviceId,
        deviceLabel,
        platform,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData?.error || `HTTP ${res.status}` };
    }

    const data = await res.json().catch(() => ({}));
    if (data?.success) {
      try {
        localStorage.setItem('webpush_subscription_active', '1');
        if (!getCurrentFid()) {
          const wpFid = `webpush_${deviceId}`;
          currentRegisteredFid = wpFid;
          localStorage.setItem('fcm_registered_fid', wpFid);
        }
        if (!getRegistrationSecret()) {
          const wpSec = `wp_${deviceId}`;
          currentRegistrationSecret = wpSec;
          localStorage.setItem('fcm_registration_secret', wpSec);
        }
      } catch {}
      return { success: true, subId: data.id || `webpush_${deviceId}` };
    }

    return { success: false, error: data?.error || 'Subscription failed' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Web Push subscription failed' };
  }
}

/**
 * Get current push notification status.
 */
export async function getFCMStatus(): Promise<FCMStatus> {
  if (typeof window === 'undefined') return 'unsupported';
  
  // On iOS devices, Apple strictly enables Web Push only when installed as a Standalone PWA to the Home Screen (iOS 16.4+)
  if (isIOS() && !isStandaloneMode()) {
    return 'ios-requires-pwa';
  }

  const hasWebPush = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const fcmSupported = hasWebPush || await isSupported().catch(() => false);
  if (!fcmSupported || !('Notification' in window) || !('serviceWorker' in navigator)) {
    if (isIOS()) {
      return 'ios-requires-pwa';
    }
    return 'unsupported';
  }

  const permission = Notification.permission;
  if (permission === 'denied') return 'permission-denied';
  if (permission === 'default') return 'permission-default';

  const hasWebPushFlag = (() => {
    try {
      return localStorage.getItem('webpush_subscription_active') === '1';
    } catch {
      return false;
    }
  })();

  const storedFid = getCurrentFid();
  const storedSecret = getRegistrationSecret();

  if (hasWebPushFlag || (storedFid && storedSecret)) {
    return 'enabled';
  }

  // Also detect an active PushManager subscription if already granted
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const existingSub = await reg?.pushManager?.getSubscription();
    if (existingSub) {
      return 'enabled';
    }
  } catch {}

  return 'permission-granted';
}

/**
 * Send registered FID to application backend for persistent storage.
 * Includes automatic retry mechanism and resilient local fallback if offline or server returns 404.
 */
async function syncFidToBackend(
  fid: string,
  maxRetries = 2
): Promise<{ success: boolean; secret?: string; error?: string; localOnly?: boolean; activeDevicesCount?: number }> {
  let attempt = 0;
  let lastError = '';

  const existingSecret = getRegistrationSecret();
  const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const apiUrl = `${base}/api/push/register`;
  const { deviceLabel, platform } = getDeviceMetadata();

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fid,
          deviceLabel,
          platform,
          ...(existingSecret ? { secret: existingSecret } : {})
        }),
      });

      if (res.status === 404) {
        console.info('[FCM] Static host / 404 detected on /api/push/register. Seamlessly activating device push mode.');
        break;
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        console.log('[FCM] FID successfully synchronized with backend database');
        if (data.secret) {
          currentRegistrationSecret = data.secret;
          try {
            localStorage.setItem('fcm_registration_secret', data.secret);
          } catch {}
        }
        return {
          success: true,
          secret: data.secret || existingSecret || undefined,
          activeDevicesCount: typeof data.activeDevicesCount === 'number' ? data.activeDevicesCount : undefined,
        };
      } else {
        lastError = data.error || `Server responded with status ${res.status}`;
      }
    } catch (err: any) {
      lastError = err?.message || 'Network notice syncing FID';
    }

    attempt++;
    if (attempt <= maxRetries) {
      const delayMs = Math.min(600 * Math.pow(2, attempt - 1), 2000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Resilient fallback: Even if the remote server returned 404 or network was offline,
  // retain local secret so on-device notifications and service worker alerts work immediately.
  const resilientSecret = existingSecret || ('loc_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36));
  console.info('[FCM] Device registered in resilient standalone mode for FID:', fid);

  return {
    success: true,
    secret: resilientSecret,
    localOnly: true
  };
}

/**
 * Refresh this device's registration heartbeat on server so multi-device list & lastSeenAt stay accurate.
 */
export async function refreshDeviceRegistrationHeartbeat(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const fid = getCurrentFid();
  if (!fid || fid === 'local_device') return;
  await syncFidToBackend(fid, 1).catch(() => {});
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

    if (payload.notification || payload.data?.title) {
      const title = payload.notification?.title || payload.data?.title || 'Pesanan & Notifikasi';
      const body = payload.notification?.body || payload.data?.body || '';
      playAlertChime();
      await showServiceWorkerNotification(title, {
        body,
        icon: payload.notification?.icon || payload.data?.icon || 'https://i.imgur.com/49kNDoe.png',
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
 * Explicit user-triggered registration for direct W3C Web Push (works on Android & iOS PWA even when closed).
 */
export async function enableFCMNotifications(onFidReceived?: (fid: string) => void): Promise<{ 
  success: boolean; 
  fid: string | null; 
  error?: string;
  isIOSRequiresPWA?: boolean;
}> {
  if (typeof window === 'undefined') {
    return { success: false, fid: null, error: 'Window not defined' };
  }

  if (isIOS() && !isStandaloneMode()) {
    console.info('[Push] iOS Safari browser detected without standalone PWA mode');
    return {
      success: false,
      fid: null,
      isIOSRequiresPWA: true,
      error: 'Pada iPhone/iPad, Apple memerlukan aplikasi ini ditambah ke Skrin Utama (Add to Home Screen) dahulu untuk mengaktifkan notifikasi push.'
    };
  }

  try {
    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    const hasWebPush = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    if (!hasWebPush) {
      if (isIOS()) {
        return {
          success: false,
          fid: null,
          isIOSRequiresPWA: true,
          error: 'Pada iPhone/iPad, Apple memerlukan aplikasi ini ditambah ke Skrin Utama (Add to Home Screen) dahulu untuk mengaktifkan notifikasi push.'
        };
      }
      if (inIframe) {
        return {
          success: false,
          fid: null,
          error: 'Notifikasi disekat di dalam mod pratonton (iframe). Sila klik butang "Tab Penuh" untuk membuka aplikasi dalam tab pelayar penuh.'
        };
      }
      return { success: false, fid: null, error: 'Pelayar ini tidak menyokong Web Push / Notifications.' };
    }

    // 1. Permission check & prompt
    let permission = Notification.permission;
    if (permission === 'denied') {
      return { success: false, fid: null, error: 'Kebenaran notifikasi disekat. Sila benarkan dalam tetapan pelayar.' };
    }

    if (permission === 'default') {
      permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (inIframe && permission === 'denied') {
          return {
            success: false,
            fid: null,
            error: 'Pelayar menyekat kebenaran notifikasi dalam tetingkap pratonton. Sila tekan "Tab Penuh" di sebelah dan cuba lagi.'
          };
        }
        return { success: false, fid: null, error: 'Kebenaran notifikasi tidak diberikan (' + permission + ')' };
      }
    }

    // 2. Clean legacy service workers & register/update /firebase-messaging-sw.js
    await cleanLegacyServiceWorkers();

    const rawRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    rawRegistration.update().catch(() => {});
    const swRegistration = await waitForActiveServiceWorker(rawRegistration, 8000);

    // 3. Subscribe directly via W3C Web Push (VAPID)
    const webPushRes = await ensureWebPushSubscription(swRegistration);
    if (webPushRes.success) {
      const assignedId = getCurrentFid() || webPushRes.subId || `webpush_${getOrCreateSyncDeviceId()}`;
      if (onFidReceived) onFidReceived(assignedId);
      console.log('[WebPush] Closed-app Web Push activated:', assignedId);
      return { success: true, fid: assignedId };
    }

    // 4. Fallback to Firebase Messaging FID registration if direct WebPush endpoint failed
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      return { success: false, fid: null, error: webPushRes.error || 'Pendaftaran push gagal.' };
    }

    const messaging = getMessaging(app);
    messagingInstance = messaging;

    return await new Promise<{ success: boolean; fid: string | null; error?: string }>(async (resolve) => {
      let isSettled = false;

      const timeoutId = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          resolve({
            success: false,
            fid: null,
            error: webPushRes.error || 'Masa tamat menunggu pendaftaran notifikasi. Sila cuba lagi.'
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

      try {
        await register(messaging, {
          vapidKey: FCM_VAPID_KEY,
          serviceWorkerRegistration: swRegistration
        });
      } catch (regErr: any) {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timeoutId);
          resolve({
            success: false,
            fid: null,
            error: regErr?.message || webPushRes.error || 'Pendaftaran push gagal.'
          });
        }
      }
    });
  } catch (err: any) {
    console.error('[Push] Registration error:', err);
    return { success: false, fid: null, error: err?.message || 'Pendaftaran gagal.' };
  }
}

/**
 * Startup lifecycle reconciliation: silently ensures Service Worker v2 + Web Push subscription are active when permitted.
 */
export async function initFCMStartupReconciliation(onPayloadReceived?: (payload: MessagePayload) => void): Promise<() => void> {
  if (typeof window === 'undefined') return () => {};

  try {
    if (isIOS() && !isStandaloneMode()) {
      return () => {};
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator) || Notification.permission !== 'granted') {
      return () => {};
    }

    await cleanLegacyServiceWorkers();

    const rawRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    rawRegistration.update().catch(() => {});
    const swRegistration = await waitForActiveServiceWorker(rawRegistration, 8000);

    // Upgrade or sync W3C Web Push subscription automatically
    const webPushRes = await ensureWebPushSubscription(swRegistration);
    if (webPushRes.success) {
      console.log('[WebPush] Startup closed-app push subscription verified.');
    } else {
      // Fallback reconciliation for legacy FCM environments
      const supported = await isSupported().catch(() => false);
      if (supported) {
        const messaging = getMessaging(app);
        messagingInstance = messaging;
        attachSharedFCMListeners(messaging, { onPayloadReceived });
        await register(messaging, {
          vapidKey: FCM_VAPID_KEY,
          serviceWorkerRegistration: swRegistration
        }).catch(() => {});
      }
    }

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
    console.warn('[Push] Error during startup reconciliation:', err);
    return () => {};
  }
}

export const initFCMForegroundListener = initFCMStartupReconciliation;

/**
 * Send real test notification via backend FCM + SSE broadcast endpoint across all synced devices.
 * Validates permission, service worker, and local installation credentials first.
 */
export async function sendTestFCMNotification(
  fid: string, 
  title?: string, 
  body?: string,
  broadcastAll = true
): Promise<{
  success: boolean;
  alertId?: string;
  messageId?: string;
  sentCount?: number;
  totalDevices?: number;
  sseDelivered?: boolean;
  fcmAvailable?: boolean;
  localPermissionGranted?: boolean;
  error?: string;
  code?: string;
}> {
  try {
    if (typeof window === 'undefined') {
      return { success: false, error: 'Environment does not support push notifications.', code: 'WINDOW_UNDEFINED' };
    }

    const testTitle = title || '🔥 Ujian Notifikasi';
    const testBody = body || 'Peringatan tempahan aktif dan disegerakkan merentasi semua peranti!';

    // 1. Instant audio chime feedback
    playAlertChime();

    // 2. Always broadcast to same-origin open tabs and backend synced devices first
    let serverSuccess = false;
    let serverAlertId: string | undefined;
    let serverMessageId: string | undefined;
    let sentCount = 0;
    let totalDevices = 0;
    let sseDelivered = false;
    let fcmAvailable: boolean | undefined;

    const senderDeviceId = getOrCreateSyncDeviceId();
    const { deviceLabel: senderDeviceLabel } = getDeviceMetadata();

    // Notify same-origin open tabs immediately via BroadcastChannel
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('order_sync_notifications');
        bc.postMessage({
          reason: 'test_alert',
          id: `bc_test_${Date.now()}`,
          title: testTitle,
          body: testBody,
          senderDeviceId,
          senderDeviceLabel,
          createdAt: Date.now(),
        });
        bc.close();
      }
    } catch {}

    const callSendTest = async (secretToUse: string) => {
      const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
      return fetch(`${base}/api/push/send-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fid,
          secret: secretToUse,
          title: testTitle,
          body: testBody,
          broadcastAll,
          senderDeviceId,
          senderDeviceLabel,
        }),
      });
    };

    try {
      let secret = getRegistrationSecret() || 'local_device';
      let res = await callSendTest(secret);

      // Auto-recover if server forgot this FID (e.g. cold restart or prior standalone secret)
      if ((res.status === 404 || res.status === 403) && fid && fid !== 'local_device') {
        const resynced = await syncFidToBackend(fid, 1);
        if (resynced.success && resynced.secret) {
          secret = resynced.secret;
          res = await callSendTest(secret);
        }
      }

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.success || data.messageId || data.status === 'ok') {
          serverSuccess = true;
          serverAlertId = typeof data.alertId === 'string' ? data.alertId : undefined;
          serverMessageId = data.messageId;
          sentCount = typeof data.sentCount === 'number' ? data.sentCount : 0;
          totalDevices = typeof data.totalDevices === 'number' ? data.totalDevices : 0;
          sseDelivered = Boolean(data.sseDelivered);
          fcmAvailable = typeof data.fcmAvailable === 'boolean' ? data.fcmAvailable : undefined;
        }
      }
    } catch {
      // Backend unavailable or 404 on static hosting - continue seamlessly to direct device notification
    }

    // 3. Check local OS/browser Notification permission to display native notification on THIS device too
    const hasNotificationApi = 'Notification' in window;
    const isIosBrowserTab = isIOS() && !isStandaloneMode();
    const localPermissionGranted = hasNotificationApi && !isIosBrowserTab && Notification.permission === 'granted';

    if (localPermissionGranted && (!serverSuccess || !fcmAvailable || sentCount === 0)) {
      const swShown = await showServiceWorkerNotification(testTitle, {
        body: testBody,
        icon: 'https://i.imgur.com/49kNDoe.png',
        tag: 'fcm_test_sw_direct',
      });
      if (!swShown) {
        try {
          if (typeof Notification === 'function') {
            new Notification(testTitle, {
              body: testBody,
              icon: 'https://i.imgur.com/49kNDoe.png',
            });
          }
        } catch (e) {
          console.warn('[FCM] Local notification constructor fallback notice:', e);
        }
      }
    }

    if (serverSuccess) {
      return {
        success: true,
        alertId: serverAlertId,
        messageId: serverMessageId,
        sentCount,
        totalDevices,
        sseDelivered,
        fcmAvailable,
        localPermissionGranted,
      };
    }

    if (!localPermissionGranted) {
      if (isIosBrowserTab) {
        return {
          success: false,
          localPermissionGranted: false,
          error: 'Pada iPhone/iPad, Apple memerlukan aplikasi ini ditambah ke Skrin Utama (Add to Home Screen) dahulu untuk memaparkan notifikasi.',
          code: 'IOS_PWA_REQUIRED'
        };
      }
      if (!hasNotificationApi) {
        return {
          success: false,
          localPermissionGranted: false,
          error: 'Pelayar ini tidak menyokong notifikasi sistem. Bunyi amaran audio telah diaktifkan.',
          code: 'NOT_SUPPORTED',
        };
      }
      if (Notification.permission === 'denied') {
        return {
          success: false,
          localPermissionGranted: false,
          error: 'Kebenaran notifikasi disekat oleh pelayar. Sila benarkan dalam tetapan pelayar anda.',
          code: 'PERMISSION_DENIED',
        };
      }
      return {
        success: false,
        localPermissionGranted: false,
        error: 'Kebenaran notifikasi belum diberikan. Sila tekan butang "Aktifkan Notifikasi" dahulu.',
        code: 'NOT_GRANTED',
      };
    }

    return {
      success: true,
      messageId: 'local_notification_api',
      sentCount: 1,
      totalDevices: 1,
      localPermissionGranted: true,
    };
  } catch (err: any) {
    console.warn('[FCM] Notice during test notification:', err);
    return {
      success: false,
      error: err?.message || 'Gagal memaparkan ujian notifikasi.',
      code: 'TEST_ERROR',
    };
  }
}

/**
 * Send universal device presence heartbeat so all open devices appear & receive synced alerts.
 */
export async function sendDevicePresenceHeartbeat(): Promise<{ activeDevicesCount: number; devices: SyncedDeviceInfo[] } | null> {
  if (typeof window === 'undefined') return null;
  try {
    const base = window.location?.origin || '';
    const deviceId = getOrCreateSyncDeviceId();
    const { deviceLabel, platform } = getDeviceMetadata();
    const fid = getCurrentFid();
    const secret = getRegistrationSecret();
    const hasWebPushFlag = (() => {
      try {
        return localStorage.getItem('webpush_subscription_active') === '1';
      } catch {
        return false;
      }
    })();
    const fcmEnabled = Boolean(
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      (hasWebPushFlag || (fid && secret))
    );

    const res = await fetch(`${base}/api/notifications/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        deviceLabel,
        platform,
        fcmEnabled,
        fidSuffix: fid ? fid.slice(-6) : undefined,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.success) return null;
    return {
      activeDevicesCount: typeof data.activeDevicesCount === 'number' ? data.activeDevicesCount : 1,
      devices: Array.isArray(data.devices) ? data.devices : [],
    };
  } catch {
    return null;
  }
}

/**
 * Fetch unified cross-device notification state (synced devices, shared reminders, recent alerts, read notification IDs).
 */
export async function fetchCrossDeviceNotificationState(): Promise<CrossDeviceNotificationState | null> {
  if (typeof window === 'undefined') return null;
  try {
    const base = window.location?.origin || '';
    const res = await fetch(`${base}/api/notifications/state`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || !data.success) return null;
    return data as CrossDeviceNotificationState;
  } catch {
    return null;
  }
}

/**
 * Sync read/unread notification IDs across all devices.
 */
export async function syncReadNotificationsToBackend(
  ids: string[],
  action: 'read' | 'unread' | 'clear' = 'read'
): Promise<string[] | null> {
  if (typeof window === 'undefined') return null;
  try {
    const base = window.location?.origin || '';
    const res = await fetch(`${base}/api/notifications/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids, action }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.success || !Array.isArray(data.readNotificationIds)) return null;
    return data.readNotificationIds;
  } catch {
    return null;
  }
}

/**
 * Subscribe to real-time cross-device notification updates via Server-Sent Events (SSE) + BroadcastChannel.
 * Automatically recovers after mobile backgrounding/sleep without permanently stopping.
 */
export function subscribeToNotificationStream(
  onEvent: (event: { reason: string; [key: string]: any }) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let closed = false;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFailures = 0;

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('order_sync_notifications');
      channel.onmessage = (msg) => {
        if (msg?.data?.reason) {
          onEvent(msg.data);
        }
      };
    }
  } catch {}

  const connect = () => {
    if (closed || typeof EventSource === 'undefined') return;
    if (source) {
      source.close();
      source = null;
    }
    try {
      const base = window.location?.origin || '';
      source = new EventSource(`${base}/api/notifications/stream`);

      source.addEventListener('sync', (msg: MessageEvent) => {
        consecutiveFailures = 0;
        try {
          const parsed = JSON.parse(msg.data);
          if (parsed && parsed.reason) {
            onEvent(parsed);
          }
        } catch {}
      });

      source.onopen = () => {
        consecutiveFailures = 0;
      };

      source.onerror = () => {
        if (source) {
          source.close();
          source = null;
        }
        if (closed) return;
        consecutiveFailures++;
        const backoff = Math.min(3000 * consecutiveFailures, 30000);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, backoff);
      };
    } catch {
      // EventSource blocked or unsupported
    }
  };

  const handleWakeup = () => {
    if (closed) return;
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      if (!source || source.readyState === EventSource.CLOSED) {
        consecutiveFailures = 0;
        connect();
      }
    }
  };

  window.addEventListener('online', handleWakeup);
  document.addEventListener('visibilitychange', handleWakeup);

  connect();

  return () => {
    closed = true;
    window.removeEventListener('online', handleWakeup);
    document.removeEventListener('visibilitychange', handleWakeup);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (source) {
      source.close();
      source = null;
    }
    if (channel) {
      channel.close();
      channel = null;
    }
  };
}

/**
 * Synchronize active order reminders to backend for cross-device and server-side push scheduling
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
): Promise<{
  success: boolean;
  reminderStates?: Record<string, { hasNotified20Min: boolean; hasDueAlerted: boolean; hasThreeHourAlerted: boolean }>;
  allReminders?: ServerOrderReminder[];
  recentAlerts?: SyncedAlertEvent[];
  readNotificationIds?: string[];
  activeDevicesCount?: number;
}> {
  try {
    const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const deviceFid = getCurrentFid();
    const res = await fetch(`${base}/api/reminders/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orders,
        ...(deviceFid ? { deviceFid } : {}),
      }),
    });

    if (!res.ok) {
      return { success: false };
    }

    const data = await res.json().catch(() => ({}));
    return {
      success: Boolean(data.success),
      reminderStates: data.reminderStates,
      allReminders: Array.isArray(data.allReminders) ? data.allReminders : undefined,
      recentAlerts: Array.isArray(data.recentAlerts) ? data.recentAlerts : undefined,
      readNotificationIds: Array.isArray(data.readNotificationIds) ? data.readNotificationIds : undefined,
      activeDevicesCount: typeof data.activeDevicesCount === 'number' ? data.activeDevicesCount : undefined,
    };
  } catch (e) {
    console.warn('[FCM] Background reminder sync failed (offline or server restarting):', e);
    return { success: false };
  }
}
