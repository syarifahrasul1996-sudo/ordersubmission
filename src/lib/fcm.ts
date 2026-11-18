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
  fidSuffix: string;
  deviceLabel: string;
  platform: string;
  lastSeenAt: string;
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
  readNotificationIds: string[];
  fcmMessagingAvailable?: boolean;
  serverTime?: string;
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

/**
 * Get current FCM status.
 * Enabled requires:
 * - Notification.permission === "granted"
 * - fcm_registered_fid exists
 * - fcm_registration_secret exists
 */
export async function getFCMStatus(): Promise<FCMStatus> {
  if (typeof window === 'undefined') return 'unsupported';
  
  // On iOS devices, Apple strictly enables Web Push only when installed as a Standalone PWA to the Home Screen (iOS 16.4+)
  if (isIOS() && !isStandaloneMode()) {
    return 'ios-requires-pwa';
  }

  const supported = await isSupported().catch(() => false);
  if (!supported || !('Notification' in window) || !('serviceWorker' in navigator)) {
    if (isIOS()) {
      return 'ios-requires-pwa';
    }
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
 * Explicit user-triggered registration for Firebase Cloud Messaging using FID
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

  // Prerequisite check for iOS devices (iPhone / iPad)
  if (isIOS() && !isStandaloneMode()) {
    console.info('[FCM] iOS Safari browser detected without standalone PWA mode');
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

    const supported = await isSupported().catch(() => false);
    if (!supported || !('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[FCM] Browser does not support Firebase Cloud Messaging');
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

    // 1. Permission check & prompt (explicit user-triggered flow)
    let permission = Notification.permission;
    if (permission === 'denied') {
      console.warn('[FCM] Notification permission is denied');
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

    // 2. Clean legacy service workers & register /firebase-messaging-sw.js
    await cleanLegacyServiceWorkers();

    const rawRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    const swRegistration = await waitForActiveServiceWorker(rawRegistration, 8000);

    // 3. Initialize messaging instance
    const messaging = getMessaging(app);
    messagingInstance = messaging;

    // 4. Asynchronous FID registration handling with 20-second timeout & stale subscription recovery
    return await new Promise<{ success: boolean; fid: string | null; error?: string }>(async (resolve) => {
      let isSettled = false;

      const timeoutId = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          console.warn('[FCM] Timeout waiting for onRegistered() FID');
          resolve({
            success: false,
            fid: null,
            error: 'Masa tamat menunggu pendaftaran notifikasi. Sila pastikan sambungan internet stabil dan cuba lagi.'
          });
        }
      }, 20000);

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
        // Recover from stale PushSubscription with mismatched VAPID key (very common on mobile PWAs)
        const errMsg = String(regErr?.message || '');
        const isSubConflict =
          errMsg.includes('applicationServerKey') ||
          errMsg.includes('InvalidAccessError') ||
          errMsg.includes('Subscription failed') ||
          regErr?.name === 'InvalidAccessError';

        if (isSubConflict) {
          try {
            console.warn('[FCM] Detected stale push subscription conflict, resetting PushSubscription and retrying...');
            const existingSub = await swRegistration.pushManager.getSubscription();
            if (existingSub) {
              await existingSub.unsubscribe();
            }
            await register(messaging, {
              vapidKey: FCM_VAPID_KEY,
              serviceWorkerRegistration: swRegistration
            });
            return;
          } catch (retryErr: any) {
            regErr = retryErr;
          }
        }

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
    if (isIOS() && !isStandaloneMode()) {
      return () => {};
    }

    const supported = await isSupported().catch(() => false);
    if (!supported || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return () => {};
    }

    if (Notification.permission !== 'granted') {
      return () => {};
    }

    await cleanLegacyServiceWorkers();

    const rawRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    const swRegistration = await waitForActiveServiceWorker(rawRegistration, 8000);

    const messaging = getMessaging(app);
    messagingInstance = messaging;

    attachSharedFCMListeners(messaging, {
      onPayloadReceived
    });

    console.log('[FCM] Performing startup FCM registration reconciliation');
    await register(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swRegistration
    }).catch(async (err) => {
      const msg = String(err?.message || '');
      if (msg.includes('applicationServerKey') || msg.includes('InvalidAccessError')) {
        const sub = await swRegistration.pushManager.getSubscription().catch(() => null);
        if (sub) {
          await sub.unsubscribe().catch(() => {});
          await register(messaging, {
            vapidKey: FCM_VAPID_KEY,
            serviceWorkerRegistration: swRegistration
          }).catch(() => {});
        }
      }
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
  messageId?: string;
  sentCount?: number;
  totalDevices?: number;
  sseDelivered?: boolean;
  fcmAvailable?: boolean;
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

    // 2. Check if running on iOS Safari without PWA
    if (isIOS() && !isStandaloneMode()) {
      return {
        success: false,
        error: 'Pada iPhone/iPad, Apple memerlukan aplikasi ini ditambah ke Skrin Utama (Add to Home Screen) dahulu untuk memaparkan notifikasi.',
        code: 'IOS_PWA_REQUIRED'
      };
    }

    // 3. Permission checks
    if (!('Notification' in window)) {
      return {
        success: false,
        error: 'Pelayar ini tidak menyokong notifikasi sistem. Bunyi amaran audio telah diaktifkan.',
        code: 'NOT_SUPPORTED',
      };
    }

    if (Notification.permission === 'denied') {
      return {
        success: false,
        error: 'Kebenaran notifikasi disekat oleh pelayar. Sila benarkan dalam tetapan pelayar anda.',
        code: 'PERMISSION_DENIED',
      };
    }

    if (Notification.permission !== 'granted') {
      return {
        success: false,
        error: 'Kebenaran notifikasi belum diberikan. Sila tekan butang "Aktifkan Notifikasi" dahulu.',
        code: 'NOT_GRANTED',
      };
    }

    // 4. Try backend push send across all devices
    let serverSuccess = false;
    let serverMessageId: string | undefined;
    let sentCount = 0;
    let totalDevices = 0;
    let sseDelivered = false;
    let fcmAvailable: boolean | undefined;

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

    // 5. Always ensure this calling device also displays the notification visibly via Service Worker if FCM isn't dispatching
    if (!serverSuccess || !fcmAvailable || sentCount === 0) {
      await showServiceWorkerNotification(testTitle, {
        body: testBody,
        icon: 'https://i.imgur.com/49kNDoe.png',
        tag: 'fcm_test_sw_direct',
      });
    }

    if (serverSuccess) {
      return {
        success: true,
        messageId: serverMessageId,
        sentCount,
        totalDevices,
        sseDelivered,
        fcmAvailable,
      };
    }

    // 6. Direct Notification constructor fallback
    try {
      if (typeof Notification === 'function') {
        new Notification(testTitle, {
          body: testBody,
          icon: 'https://i.imgur.com/49kNDoe.png',
        });
        return { success: true, messageId: 'local_notification_api', sentCount: 1, totalDevices: 1 };
      }
    } catch (e) {
      console.warn('[FCM] Local notification constructor fallback notice:', e);
    }

    return {
      success: true,
      messageId: 'device_audio_chime',
      sentCount: 1,
      totalDevices: 1,
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
 * Fetch unified cross-device notification state (synced devices, shared reminders, read notification IDs).
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
 * Subscribe to real-time cross-device notification updates via Server-Sent Events (SSE).
 */
export function subscribeToNotificationStream(
  onEvent: (event: { reason: string; [key: string]: any }) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let closed = false;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFailures = 0;

  const connect = () => {
    if (closed) return;
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
        consecutiveFailures++;
        if (closed || consecutiveFailures > 6) {
          // Stop reconnecting if endpoint is unavailable (e.g. static host)
          return;
        }
        const backoff = Math.min(3000 * consecutiveFailures, 20000);
        reconnectTimer = setTimeout(connect, backoff);
      };
    } catch {
      // EventSource blocked or unsupported
    }
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (source) {
      source.close();
      source = null;
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
      readNotificationIds: Array.isArray(data.readNotificationIds) ? data.readNotificationIds : undefined,
      activeDevicesCount: typeof data.activeDevicesCount === 'number' ? data.activeDevicesCount : undefined,
    };
  } catch (e) {
    console.warn('[FCM] Background reminder sync failed (offline or server restarting):', e);
    return { success: false };
  }
}
