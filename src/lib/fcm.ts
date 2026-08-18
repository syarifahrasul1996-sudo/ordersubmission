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

export type FCMStatus = 'unsupported' | 'permission-default' | 'permission-denied' | 'registering' | 'enabled' | 'failed';

let messagingInstance: Messaging | null = null;
let currentRegisteredFid: string | null = null;
let currentRegistrationSecret: string | null = null;
let registeredUnsubscribe: (() => void) | null = null;
let unregisteredUnsubscribe: (() => void) | null = null;
let foregroundUnsubscribe: (() => void) | null = null;

// Clean up any stale legacy service workers (e.g., old /sw.js)
async function cleanLegacyServiceWorkers() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        if (reg.active?.scriptURL.endsWith('/sw.js')) {
          console.log('[FCM] Unregistering legacy /sw.js service worker');
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
 * If only one value exists, treats registration as stale/incomplete and cleans it up.
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

  return 'permission-default';
}

/**
 * Send registered FID to application backend for persistent storage.
 * Passes existing installation secret if available to authorize re-registration.
 */
async function syncFidToBackend(fid: string): Promise<{ success: boolean; secret?: string; error?: string }> {
  try {
    const existingSecret = getRegistrationSecret();
    const res = await fetch('/api/push/register', {
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
      console.warn('[FCM] Backend FID registration failed:', res.status, errMsg);
      return { success: false, error: errMsg };
    }

    console.log('[FCM] FID successfully synchronized with Firestore backend');
    return { success: true, secret: data.secret };
  } catch (err: any) {
    const errMsg = err?.message || 'Network error sending FID to backend';
    console.error('[FCM] Network error sending FID to backend:', err);
    return { success: false, error: errMsg };
  }
}

/**
 * Send unregister signal to application backend.
 * Checks HTTP response status and only logs success when actually confirmed by server.
 */
async function removeFidFromBackend(fid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const secret = getRegistrationSecret();
    const res = await fetch('/api/push/unregister', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fid, secret }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      console.log('[FCM] FID successfully unregistered from backend Firestore storage');
      return { success: true };
    } else {
      const errMsg = data.error || `Server responded with status ${res.status}`;
      console.warn('[FCM] Backend unregistration failed:', res.status, errMsg);
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
  // 1. Foreground listener
  if (foregroundUnsubscribe) {
    foregroundUnsubscribe();
  }
  foregroundUnsubscribe = onMessage(messaging, (payload) => {
    console.log('================================================================');
    console.log('[FCM] Foreground message received:', payload);
    console.log('================================================================');

    if (payload.notification && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const title = payload.notification.title || 'Pesanan & Notifikasi';
      const body = payload.notification.body || '';
      try {
        new Notification(title, {
          body,
          icon: payload.notification.icon || 'https://i.imgur.com/49kNDoe.png'
        });
      } catch (e) {
        console.warn('[FCM] Could not show in-app browser notification banner:', e);
      }
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
    console.log('================================================================');
    console.log('[FCM] Received onRegistered FID from Firebase SDK:', fid);
    console.log('================================================================');

    const syncResult = await syncFidToBackend(fid);

    if (syncResult.success) {
      currentRegisteredFid = fid;
      try {
        localStorage.setItem('fcm_registered_fid', fid);
      } catch (e) {}

      // If server generated a new secret (new FID), store it; if existing FID, preserve current secret
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
 * 
 * Order of operations:
 * 1. Notification.requestPermission()
 * 2. register service worker
 * 3. register() succeeds
 * 4. onRegistered(fid) receives the FID
 * 5. POST /api/push/register persists the FID to Firestore and returns/verifies secret
 * 6. ONLY upon confirmed persistence:
 *    - set currentRegisteredFid & currentRegistrationSecret
 *    - save fcm_registered_fid & fcm_registration_secret in localStorage
 *    - invoke onFidReceived(fid)
 *    - resolve { success: true, fid }
 */
export async function enableFCMNotifications(onFidReceived?: (fid: string) => void): Promise<{ success: boolean; fid: string | null; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, fid: null, error: 'Window not defined' };
  }

  try {
    const supported = await isSupported().catch(() => false);
    if (!supported || !('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[FCM] Browser does not support Firebase Cloud Messaging');
      return { success: false, fid: null, error: 'Browser not supported' };
    }

    // 1. Permission check & prompt (explicit user-triggered flow)
    let permission = Notification.permission;
    if (permission === 'denied') {
      console.warn('[FCM] Notification permission is denied');
      return { success: false, fid: null, error: 'Notification permission is blocked/denied' };
    }

    if (permission === 'default') {
      permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, fid: null, error: 'Permission not granted (' + permission + ')' };
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
            error: 'Registration timed out waiting for Firebase Installation ID'
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

      // Request registration with VAPID key
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
            error: regErr?.message || 'Firebase register() call failed'
          });
        }
      }
    });
  } catch (err: any) {
    console.error('[FCM] Registration error:', err);
    return { success: false, fid: null, error: err?.message || 'Registration failed' };
  }
}

/**
 * Startup FCM lifecycle reconciliation.
 * If permission was previously granted AND both stored FID and installation secret exist:
 * 1. Registers /firebase-messaging-sw.js silently (NO permission prompt).
 * 2. Initializes Firebase Messaging SDK.
 * 3. Attaches onRegistered, onUnregistered, and onMessage.
 * 4. Calls register() to reconcile registration state with Firebase.
 */
export async function initFCMStartupReconciliation(onPayloadReceived?: (payload: MessagePayload) => void): Promise<() => void> {
  if (typeof window === 'undefined') return () => {};

  try {
    const supported = await isSupported().catch(() => false);
    if (!supported || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return () => {};
    }

    // Never request permission on startup
    if (Notification.permission !== 'granted') {
      return () => {};
    }

    const storedFid = getCurrentFid();
    const storedSecret = getRegistrationSecret();

    // Only reconcile if both FID and secret exist locally
    if (!storedFid || !storedSecret) {
      if (storedFid || storedSecret) {
        // Clean incomplete state
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

// Retain alias for backwards compatibility
export const initFCMForegroundListener = initFCMStartupReconciliation;

/**
 * Trigger test notification via backend endpoint.
 * Passes the installation secret to verify sender ownership.
 */
export async function sendTestFCMNotification(fid: string, title?: string, body?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const secret = getRegistrationSecret();
    if (!secret) {
      return { success: false, error: 'Missing installation registration credentials on client.' };
    }

    const res = await fetch('/api/push/send-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fid,
        secret,
        title: title || '🔥 Test FCM Notification',
        body: body || 'Firebase Cloud Messaging is active and working properly!',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Server returned error ' + res.status };
    }

    return { success: true, messageId: data.messageId };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error sending test notification' };
  }
}
