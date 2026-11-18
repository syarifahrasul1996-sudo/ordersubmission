import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as webpush from "web-push";
import { createServer as createViteServer } from "vite";
import { initializeApp, getApps, App } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { getMessaging, Messaging } from "firebase-admin/messaging";

function timingSafeCompare(stored: string, provided: string): boolean {
  if (!stored || !provided) return false;
  const bufStored = Buffer.from(stored, "utf8");
  const bufProvided = Buffer.from(provided, "utf8");
  if (bufStored.length !== bufProvided.length) return false;
  return crypto.timingSafeEqual(bufStored, bufProvided);
}

interface PushInstallationRecord {
  fid: string;
  secretHash: string;
  enabled: boolean;
  deviceLabel?: string;
  platform?: string;
  userAgent?: string;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface OrderReminderRecord {
  id: string; // historyId or unique order id
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
  lastNotified20MinAt?: string;
  lastDueAlertedAt?: string;
  lastThreeHourAlertedAt?: string;
}

interface SyncedDevicePresence {
  deviceId: string;
  deviceLabel: string;
  platform: string;
  fidSuffix?: string;
  fcmEnabled: boolean;
  lastSeenAt: string;
}

interface SyncedAlertEvent {
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

interface StoredWebPushSubscription {
  id: string;
  deviceId?: string;
  deviceLabel?: string;
  platform?: string;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
    expirationTime?: number | null;
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
}

interface SyncedSheetConfigItem {
  year: string;
  spreadsheetId: string;
  scriptUrl: string;
}

interface SyncedSheetConfigsState {
  annualSheets: SyncedSheetConfigItem[];
  globalScriptUrl: string;
  updatedAt: number;
}

interface PersistedPushStore {
  installations: Record<string, PushInstallationRecord>;
  reminders: Record<string, OrderReminderRecord>;
  readNotificationIds: Record<string, number>;
  presenceDevices?: Record<string, SyncedDevicePresence>;
  recentAlerts?: SyncedAlertEvent[];
  vapidKeys?: { publicKey: string; privateKey: string };
  webPushSubscriptions?: Record<string, StoredWebPushSubscription>;
  sheetConfigs?: SyncedSheetConfigsState;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "5mb" }));

  // Support CORS and preflight requests for mobile clients, PWA, and shared preview URLs
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.path === "/firebase-messaging-sw.js") {
      res.header("Cache-Control", "no-cache, no-store, must-revalidate");
      res.header("Service-Worker-Allowed", "/");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  function buildTargetPayload(targetId: string, base: Record<string, any>) {
    // Legacy FCM registration tokens contain ':', whereas Firebase Installation IDs (FIDs) do not
    if (targetId.includes(":")) {
      return { token: targetId, ...base };
    }
    return { fid: targetId, ...base };
  }

  // Initialize Firebase Admin SDK (singleton)
  let adminApp: App;
  if (!getApps().length) {
    try {
      adminApp = initializeApp({
        projectId: "order-submission-501208",
      });
      console.log("[Firebase Admin] Initialized for project: order-submission-501208");
    } catch (err) {
      console.error("[Firebase Admin] Initialization error:", err);
      adminApp = getApps()[0] || initializeApp();
    }
  } else {
    adminApp = getApps()[0];
  }

  let db: Firestore | null = null;
  let messaging: Messaging | null = null;
  let firestoreAvailable = true;
  let fcmMessagingAvailable = true;

  const FIRESTORE_DATABASE_ID =
    process.env.FIRESTORE_DATABASE_ID ||
    "ai-studio-ordersubmission-812e5ca5-4c13-4685-aeb6-9c38e1052adb";

  try {
    db = getFirestore(adminApp, FIRESTORE_DATABASE_ID);
    console.log(`[Firebase Admin] Firestore database configured: ${FIRESTORE_DATABASE_ID}`);
  } catch (err: any) {
    firestoreAvailable = false;
    console.warn("[Firebase Admin] Firestore initialization notice:", err?.message || err);
  }

  try {
    messaging = getMessaging(adminApp);
    console.log("[Firebase Admin] Cloud Messaging service initialized.");
  } catch (err: any) {
    fcmMessagingAvailable = false;
    console.warn("[Firebase Admin] Cloud Messaging initialization notice:", err?.message || err);
  }

  // =========================================================================
  // Primary Storage: Cloud Firestore + Durable Disk Store (.data/push-store.json)
  // =========================================================================

  const DATA_DIR = path.join(process.cwd(), ".data");
  const PUSH_STORE_PATH = path.join(DATA_DIR, "push-store.json");

  const memoryInstallationStore = new Map<string, PushInstallationRecord>();
  const memoryRemindersStore = new Map<string, OrderReminderRecord>();
  const readNotificationMap = new Map<string, number>();
  const presenceDevicesStore = new Map<string, SyncedDevicePresence>();
  const webPushSubscriptionsStore = new Map<string, StoredWebPushSubscription>();
  let recentAlertsStore: SyncedAlertEvent[] = [];
  let vapidKeysState: { publicKey: string; privateKey: string } | null = null;
  const DEFAULT_SERVER_SPREADSHEET_ID = "1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo";
  const DEFAULT_SERVER_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec";
  let sheetConfigsState: SyncedSheetConfigsState = {
    annualSheets: [
      { year: "2026", spreadsheetId: DEFAULT_SERVER_SPREADSHEET_ID, scriptUrl: "" },
      { year: "2025", spreadsheetId: DEFAULT_SERVER_SPREADSHEET_ID, scriptUrl: "" },
      { year: "2024", spreadsheetId: DEFAULT_SERVER_SPREADSHEET_ID, scriptUrl: "" },
    ],
    globalScriptUrl: DEFAULT_SERVER_SCRIPT_URL,
    updatedAt: 0,
  };

  function appendSyncedAlert(alert: SyncedAlertEvent) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    recentAlertsStore = [
      alert,
      ...recentAlertsStore.filter((a) => a.id !== alert.id && a.createdAt >= cutoff),
    ].slice(0, 30);
  }

  // Load persisted store from disk on startup
  function loadPersistedStoreFromDisk() {
    try {
      if (!fs.existsSync(PUSH_STORE_PATH)) return;
      const raw = fs.readFileSync(PUSH_STORE_PATH, "utf8");
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw) as Partial<PersistedPushStore>;
      if (parsed.installations && typeof parsed.installations === "object") {
        for (const [k, v] of Object.entries(parsed.installations)) {
          if (v && v.fid) {
            memoryInstallationStore.set(k, v);
          }
        }
      }
      if (parsed.reminders && typeof parsed.reminders === "object") {
        for (const [k, v] of Object.entries(parsed.reminders)) {
          if (v && v.id) {
            memoryRemindersStore.set(k, v);
          }
        }
      }
      if (parsed.readNotificationIds && typeof parsed.readNotificationIds === "object") {
        for (const [k, ts] of Object.entries(parsed.readNotificationIds)) {
          if (typeof ts === "number") {
            readNotificationMap.set(k, ts);
          }
        }
      }
      if (parsed.presenceDevices && typeof parsed.presenceDevices === "object") {
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const [k, dev] of Object.entries(parsed.presenceDevices)) {
          if (dev && dev.deviceId && Date.parse(dev.lastSeenAt || "") >= weekAgo) {
            presenceDevicesStore.set(k, dev);
          }
        }
      }
      if (Array.isArray(parsed.recentAlerts)) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        recentAlertsStore = parsed.recentAlerts.filter((a) => a && a.id && a.createdAt >= cutoff).slice(0, 30);
      }
      if (parsed.vapidKeys?.publicKey && parsed.vapidKeys?.privateKey) {
        vapidKeysState = {
          publicKey: parsed.vapidKeys.publicKey,
          privateKey: parsed.vapidKeys.privateKey,
        };
      }
      if (parsed.webPushSubscriptions && typeof parsed.webPushSubscriptions === "object") {
        for (const [k, sub] of Object.entries(parsed.webPushSubscriptions)) {
          if (sub && sub.subscription?.endpoint && sub.subscription?.keys?.p256dh && sub.subscription?.keys?.auth) {
            webPushSubscriptionsStore.set(k, sub);
          }
        }
      }
      if (parsed.sheetConfigs && Array.isArray(parsed.sheetConfigs.annualSheets)) {
        const loadedSheets = parsed.sheetConfigs.annualSheets
          .filter((s) => s && typeof s.year === "string")
          .map((s) => {
            const yr = String(s.year).trim();
            const rawId = String(s.spreadsheetId || "").trim();
            return {
              year: yr,
              spreadsheetId: rawId || (yr === "2026" || yr === "2025" || yr === "2024" ? DEFAULT_SERVER_SPREADSHEET_ID : ""),
              scriptUrl: String(s.scriptUrl || "").trim(),
            };
          });
        if (loadedSheets.length > 0) {
          sheetConfigsState = {
            annualSheets: loadedSheets,
            globalScriptUrl: String(parsed.sheetConfigs.globalScriptUrl || "").trim() || DEFAULT_SERVER_SCRIPT_URL,
            updatedAt: Number(parsed.sheetConfigs.updatedAt || 0),
          };
        }
      }
      console.log(
        `[Push Store] Loaded ${memoryInstallationStore.size} installations, ${webPushSubscriptionsStore.size} webPush subs, ${presenceDevicesStore.size} devices, ${memoryRemindersStore.size} reminders from disk`
      );
    } catch (err: any) {
      console.warn("[Push Store] Failed to load persisted store:", err?.message || err);
    }
  }

  let persistTimer: NodeJS.Timeout | null = null;
  function writeStoreSyncAtomic() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const payload: PersistedPushStore = {
        installations: Object.fromEntries(memoryInstallationStore.entries()),
        reminders: Object.fromEntries(memoryRemindersStore.entries()),
        readNotificationIds: Object.fromEntries(readNotificationMap.entries()),
        presenceDevices: Object.fromEntries(presenceDevicesStore.entries()),
        recentAlerts: recentAlertsStore,
        ...(vapidKeysState ? { vapidKeys: vapidKeysState } : {}),
        webPushSubscriptions: Object.fromEntries(webPushSubscriptionsStore.entries()),
        sheetConfigs: sheetConfigsState,
      };
      const tmpPath = `${PUSH_STORE_PATH}.tmp.${process.pid}`;
      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf8");
      fs.renameSync(tmpPath, PUSH_STORE_PATH);
    } catch (err: any) {
      console.warn("[Push Store] Failed to persist store to disk:", err?.message || err);
    }
  }

  function schedulePersistToDisk(immediate = false) {
    if (immediate) {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      writeStoreSyncAtomic();
      return;
    }
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      writeStoreSyncAtomic();
    }, 250);
  }

  loadPersistedStoreFromDisk();

  // Initialize or reuse persistent VAPID keys for direct W3C Web Push (works on Android & iOS PWA when closed)
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidKeysState = {
      publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
      privateKey: process.env.VAPID_PRIVATE_KEY.trim(),
    };
  } else if (!vapidKeysState) {
    vapidKeysState = webpush.generateVAPIDKeys();
    writeStoreSyncAtomic();
    console.log("[WebPush] Generated and persisted new VAPID keypair.");
  }
  webpush.setVapidDetails("mailto:notifications@ordersub.app", vapidKeysState.publicKey, vapidKeysState.privateKey);
  console.log("[WebPush] Direct W3C Web Push initialized.");

  // =========================================================================
  // Real-time Cross-Device SSE Broadcaster
  // =========================================================================
  const sseClients = new Set<express.Response>();

  function broadcastNotificationSync(reason: string, extra?: Record<string, any>) {
    if (sseClients.size === 0) return;
    const payload = JSON.stringify({
      reason,
      serverTime: new Date().toISOString(),
      ...extra,
    });
    const frame = `event: sync\ndata: ${payload}\n\n`;
    for (const client of Array.from(sseClients)) {
      try {
        client.write(frame);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // Installation store helpers (Firestore + durable disk + memory cache)
  async function getInstallationFromStorage(safeDocId: string): Promise<PushInstallationRecord | null> {
    if (db && firestoreAvailable) {
      try {
        const docRef = db.collection("pushInstallations").doc(safeDocId);
        const snap = await docRef.get();
        if (snap.exists) {
          const data = snap.data() as any;
          const record: PushInstallationRecord = {
            fid: data.fid,
            secretHash: data.secretHash,
            enabled: data.enabled !== false,
            deviceLabel: data.deviceLabel,
            platform: data.platform,
            userAgent: data.userAgent,
            lastSeenAt: data.lastSeenAt || (data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt),
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (data.updatedAt || new Date().toISOString()),
          };
          memoryInstallationStore.set(safeDocId, record);
          return record;
        }
      } catch (err: any) {
        if (err?.code === 7 || err?.message?.includes("PERMISSION_DENIED") || err?.message?.includes("Missing or insufficient permissions")) {
          if (firestoreAvailable) {
            firestoreAvailable = false;
            console.info("[FCM Server] Firestore permission not active on project. Operating with durable disk storage.");
          }
        } else {
          console.warn("[FCM Server] Firestore lookup notice:", err?.message || err);
        }
      }
    }
    return memoryInstallationStore.get(safeDocId) || null;
  }

  async function saveInstallationToStorage(safeDocId: string, record: PushInstallationRecord): Promise<void> {
    memoryInstallationStore.set(safeDocId, record);
    schedulePersistToDisk(true);
    if (db && firestoreAvailable) {
      try {
        const docRef = db.collection("pushInstallations").doc(safeDocId);
        await docRef.set({
          fid: record.fid,
          secretHash: record.secretHash,
          enabled: record.enabled,
          deviceLabel: record.deviceLabel || "",
          platform: record.platform || "",
          lastSeenAt: record.lastSeenAt || record.updatedAt,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[FCM Server] Installation saved to Firestore: ...${record.fid.slice(-8)}`);
      } catch (err: any) {
        if (err?.code === 7 || err?.message?.includes("PERMISSION_DENIED") || err?.message?.includes("Missing or insufficient permissions")) {
          if (firestoreAvailable) {
            firestoreAvailable = false;
            console.info("[FCM Server] Firestore write permission not active on project. Operating with durable disk storage.");
          }
        } else {
          console.warn("[FCM Server] Error writing installation to Firestore:", err?.message || err);
        }
      }
    }
  }

  async function getAllActiveInstallations(): Promise<PushInstallationRecord[]> {
    const recordsMap = new Map<string, PushInstallationRecord>();

    // Add persisted/memory cached items first
    for (const [id, rec] of memoryInstallationStore.entries()) {
      if (rec.enabled) {
        recordsMap.set(id, rec);
      }
    }

    if (db && firestoreAvailable) {
      try {
        const snap = await db.collection("pushInstallations").where("enabled", "==", true).get();
        snap.forEach((doc) => {
          const data = doc.data() as any;
          const record: PushInstallationRecord = {
            fid: data.fid,
            secretHash: data.secretHash,
            enabled: data.enabled !== false,
            deviceLabel: data.deviceLabel,
            platform: data.platform,
            lastSeenAt: data.lastSeenAt || (data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt),
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (data.updatedAt || new Date().toISOString()),
          };
          recordsMap.set(doc.id, record);
          memoryInstallationStore.set(doc.id, record);
        });
      } catch (err: any) {
        if (err?.code === 7 || err?.message?.includes("PERMISSION_DENIED") || err?.message?.includes("Missing or insufficient permissions")) {
          if (firestoreAvailable) {
            firestoreAvailable = false;
            console.info("[FCM Server] Firestore query permission not active on project. Using durable disk installations.");
          }
        }
      }
    }

    return Array.from(recordsMap.values());
  }

  async function getAllNonDeletedReminders(): Promise<OrderReminderRecord[]> {
    if (db && firestoreAvailable) {
      try {
        const snap = await db.collection("orderReminders").where("isDeleted", "==", false).get();
        snap.forEach((doc) => {
          const data = doc.data() as any;
          const existing = memoryRemindersStore.get(doc.id);
          const record: OrderReminderRecord = {
            id: doc.id,
            orderId: data.orderId || doc.id,
            customerName: data.customerName || "Pelanggan",
            mainType: data.mainType || "Pesanan",
            subType: data.subType || "",
            dueTimestamp: Number(data.dueTimestamp || 0),
            isDelivered: Boolean(data.isDelivered),
            isDeleted: Boolean(data.isDeleted),
            hasNotified20Min: Boolean(data.hasNotified20Min || existing?.hasNotified20Min),
            hasDueAlerted: Boolean(data.hasDueAlerted || existing?.hasDueAlerted),
            hasThreeHourAlerted: Boolean(data.hasThreeHourAlerted || existing?.hasThreeHourAlerted),
            googleSheetLink: data.googleSheetLink || "",
            language: data.language === "en" ? "en" : "ms",
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (data.updatedAt || existing?.updatedAt),
          };
          memoryRemindersStore.set(doc.id, record);
        });
      } catch (err: any) {
        if (err?.code === 7 || err?.message?.includes("PERMISSION_DENIED")) {
          firestoreAvailable = false;
        }
      }
    }

    return Array.from(memoryRemindersStore.values()).filter((r) => !r.isDeleted);
  }

  // =========================================================================
  // FCM Push Notification Endpoints
  // =========================================================================

  async function getMergedSyncedDevices() {
    const activeInstallations = await getAllActiveInstallations();
    const byKey = new Map<string, {
      id: string;
      deviceId?: string;
      fidSuffix?: string;
      deviceLabel: string;
      platform: string;
      fcmEnabled: boolean;
      lastSeenAt: string;
    }>();

    const matchedPresenceFids = new Set<string>();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const dev of presenceDevicesStore.values()) {
      if (Date.parse(dev.lastSeenAt || "") < weekAgo) continue;
      if (dev.fidSuffix) matchedPresenceFids.add(dev.fidSuffix);
      byKey.set(`dev_${dev.deviceId}`, {
        id: dev.deviceId.slice(0, 12),
        deviceId: dev.deviceId,
        fidSuffix: dev.fidSuffix,
        deviceLabel: dev.deviceLabel || "Peranti Web",
        platform: dev.platform || "web",
        fcmEnabled: Boolean(dev.fcmEnabled),
        lastSeenAt: dev.lastSeenAt,
      });
    }

    for (const sub of webPushSubscriptionsStore.values()) {
      if (!sub.enabled) continue;
      if (sub.deviceId && byKey.has(`dev_${sub.deviceId}`)) {
        const existing = byKey.get(`dev_${sub.deviceId}`)!;
        existing.fcmEnabled = true;
        if (sub.lastSeenAt && Date.parse(sub.lastSeenAt) > Date.parse(existing.lastSeenAt || "")) {
          existing.lastSeenAt = sub.lastSeenAt;
        }
        continue;
      }
      byKey.set(`wp_${sub.id}`, {
        id: sub.id.slice(0, 12),
        deviceId: sub.deviceId,
        deviceLabel: sub.deviceLabel || "Peranti Web Push",
        platform: sub.platform || "web",
        fcmEnabled: true,
        lastSeenAt: sub.lastSeenAt || sub.updatedAt,
      });
    }

    for (const inst of activeInstallations) {
      const fidSuffix = inst.fid.slice(-6);
      if (matchedPresenceFids.has(fidSuffix)) {
        for (const existing of byKey.values()) {
          if (existing.fidSuffix === fidSuffix) {
            existing.fcmEnabled = true;
            if (inst.lastSeenAt && Date.parse(inst.lastSeenAt) > Date.parse(existing.lastSeenAt || "")) {
              existing.lastSeenAt = inst.lastSeenAt;
            }
          }
        }
        continue;
      }
      const hashId = crypto.createHash("sha256").update(inst.fid).digest("hex").slice(0, 12);
      byKey.set(`fcm_${hashId}`, {
        id: hashId,
        fidSuffix,
        deviceLabel: inst.deviceLabel || "Peranti Berdaftar",
        platform: inst.platform || "web",
        fcmEnabled: true,
        lastSeenAt: inst.lastSeenAt || inst.updatedAt,
      });
    }

    return Array.from(byKey.values()).sort(
      (a, b) => (Date.parse(b.lastSeenAt || "") || 0) - (Date.parse(a.lastSeenAt || "") || 0)
    );
  }

  async function sendWebPushToAllSubscribers(
    payload: {
      title: string;
      body: string;
      url?: string;
      orderId?: string;
      tag?: string;
      icon?: string;
      alertId?: string;
      senderDeviceId?: string;
      senderDeviceLabel?: string;
    },
    excludeDeviceId?: string
  ): Promise<{ sentCount: number; failedCount: number }> {
    const activeSubs = Array.from(webPushSubscriptionsStore.values()).filter(
      (s) => s.enabled && (!excludeDeviceId || s.deviceId !== excludeDeviceId)
    );
    if (activeSubs.length === 0) {
      return { sentCount: 0, failedCount: 0 };
    }

    const message = JSON.stringify({
      webPush: true,
      title: payload.title,
      body: payload.body,
      url: payload.url || "/",
      orderId: payload.orderId,
      tag: payload.tag || payload.alertId,
      alertId: payload.alertId,
      icon: payload.icon || "https://i.imgur.com/49kNDoe.png",
      badge: "https://i.imgur.com/49kNDoe.png",
      senderDeviceId: payload.senderDeviceId,
      senderDeviceLabel: payload.senderDeviceLabel,
      timestamp: Date.now(),
    });

    let sentCount = 0;
    let failedCount = 0;
    let storeChanged = false;

    await Promise.allSettled(
      activeSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, message, {
            TTL: 86400,
            urgency: "high",
          });
          sentCount++;
          sub.lastSeenAt = new Date().toISOString();
          storeChanged = true;
        } catch (err: any) {
          failedCount++;
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            sub.enabled = false;
            sub.updatedAt = new Date().toISOString();
            storeChanged = true;
            console.log(`[WebPush] Deactivated expired subscription ${sub.id}`);
          } else {
            console.warn(`[WebPush] Delivery notice (${status || err?.code || "ERR"}):`, err?.message || err);
          }
        }
      })
    );

    if (storeChanged) {
      schedulePersistToDisk();
    }

    return { sentCount, failedCount };
  }

  // 0. Diagnostic status endpoint
  app.get(["/api/push/status", "/api/push/status/"], async (_req, res) => {
    const [active, mergedDevices] = await Promise.all([
      getAllActiveInstallations(),
      getMergedSyncedDevices(),
    ]);
    const activeWebPushCount = Array.from(webPushSubscriptionsStore.values()).filter((s) => s.enabled).length;
    return res.json({
      status: "ok",
      activeInstallationsCount: active.length,
      webPushSubscriptionsCount: activeWebPushCount,
      webPushReady: Boolean(vapidKeysState?.publicKey),
      syncedDevicesCount: mergedDevices.length,
      remindersCount: memoryRemindersStore.size,
      recentAlertsCount: recentAlertsStore.length,
      sseClientsCount: sseClients.size,
      firestoreAvailable,
      fcmMessagingAvailable,
      serverTime: new Date().toISOString()
    });
  });

  // 0a. Direct W3C Web Push VAPID public key + subscription endpoints
  app.get(["/api/push/vapid-public-key", "/api/push/vapid-public-key/"], (_req, res) => {
    if (!vapidKeysState?.publicKey) {
      return res.status(503).json({ success: false, error: "VAPID keypair not initialized" });
    }
    return res.json({ success: true, publicKey: vapidKeysState.publicKey });
  });

  app.post(["/api/push/webpush-subscribe", "/api/push/webpush-subscribe/"], async (req, res) => {
    try {
      const { subscription, deviceId, deviceLabel, platform } = req.body || {};
      const endpoint = subscription?.endpoint;
      const p256dh = subscription?.keys?.p256dh;
      const auth = subscription?.keys?.auth;

      if (
        typeof endpoint !== "string" || !endpoint.startsWith("https://") ||
        typeof p256dh !== "string" || !p256dh ||
        typeof auth !== "string" || !auth
      ) {
        return res.status(400).json({ success: false, error: "Invalid Web Push subscription payload" });
      }

      const subId = crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 24);
      const cleanDeviceId = typeof deviceId === "string" && deviceId.trim() ? deviceId.trim().slice(0, 64) : undefined;
      const cleanLabel = typeof deviceLabel === "string" && deviceLabel.trim() ? deviceLabel.trim().slice(0, 60) : "Peranti Web Push";
      const cleanPlatform = typeof platform === "string" && platform.trim() ? platform.trim().slice(0, 40) : "web";
      const now = new Date().toISOString();

      // Disable older endpoints belonging to the exact same deviceId so device doesn't get duplicate pushes
      if (cleanDeviceId) {
        for (const existing of webPushSubscriptionsStore.values()) {
          if (existing.deviceId === cleanDeviceId && existing.id !== subId && existing.enabled) {
            existing.enabled = false;
            existing.updatedAt = now;
          }
        }
      }

      const prev = webPushSubscriptionsStore.get(subId);
      const isNew = !prev || !prev.enabled;

      webPushSubscriptionsStore.set(subId, {
        id: subId,
        deviceId: cleanDeviceId,
        deviceLabel: cleanLabel,
        platform: cleanPlatform,
        subscription: {
          endpoint,
          keys: { p256dh, auth },
          expirationTime: subscription.expirationTime ?? null,
        },
        enabled: true,
        createdAt: prev?.createdAt || now,
        updatedAt: now,
        lastSeenAt: now,
      });

      if (cleanDeviceId) {
        const existingPresence = presenceDevicesStore.get(cleanDeviceId);
        presenceDevicesStore.set(cleanDeviceId, {
          deviceId: cleanDeviceId,
          deviceLabel: cleanLabel,
          platform: cleanPlatform,
          fidSuffix: existingPresence?.fidSuffix,
          fcmEnabled: true,
          lastSeenAt: now,
        });
      }

      schedulePersistToDisk(true);
      const mergedDevices = await getMergedSyncedDevices();
      if (isNew) {
        broadcastNotificationSync("devices_updated", { activeDevicesCount: mergedDevices.length });
      }

      console.log(`[WebPush] Subscribed device ${cleanLabel} (${subId.slice(0, 8)})`);
      return res.json({
        success: true,
        id: subId,
        activeDevicesCount: mergedDevices.length,
        webPushEnabled: true,
      });
    } catch (err: any) {
      console.error("[WebPush] Subscribe error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed to save Web Push subscription" });
    }
  });

  app.post(["/api/push/webpush-unsubscribe", "/api/push/webpush-unsubscribe/"], async (req, res) => {
    try {
      const { endpoint, deviceId } = req.body || {};
      let modified = false;
      const now = new Date().toISOString();

      if (typeof endpoint === "string" && endpoint) {
        const subId = crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 24);
        const rec = webPushSubscriptionsStore.get(subId);
        if (rec) {
          rec.enabled = false;
          rec.updatedAt = now;
          modified = true;
        }
      }
      if (typeof deviceId === "string" && deviceId.trim()) {
        for (const rec of webPushSubscriptionsStore.values()) {
          if (rec.deviceId === deviceId.trim()) {
            rec.enabled = false;
            rec.updatedAt = now;
            modified = true;
          }
        }
      }

      if (modified) {
        schedulePersistToDisk(true);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Failed to unsubscribe" });
    }
  });

  // 0b. Real-time Server-Sent Events (SSE) stream for multi-device instant sync
  app.get(["/api/notifications/stream", "/api/notifications/stream/"], async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    sseClients.add(res);

    const mergedDevices = await getMergedSyncedDevices();
    res.write(
      `event: sync\ndata: ${JSON.stringify({
        reason: "connected",
        activeDevicesCount: mergedDevices.length,
        serverTime: new Date().toISOString(),
      })}\n\n`
    );

    const keepalive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(keepalive);
        sseClients.delete(res);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
  });

  // 0b-2. Universal device presence heartbeat (tracks every device running the app even without FCM)
  app.post(["/api/notifications/heartbeat", "/api/notifications/heartbeat/"], async (req, res) => {
    try {
      const { deviceId, deviceLabel, platform, fcmEnabled, fidSuffix } = req.body || {};
      if (!deviceId || typeof deviceId !== "string" || !deviceId.trim()) {
        return res.status(400).json({ success: false, error: "Missing 'deviceId'" });
      }
      const cleanId = deviceId.trim().slice(0, 64);
      const isNew = !presenceDevicesStore.has(cleanId);
      const now = new Date().toISOString();

      presenceDevicesStore.set(cleanId, {
        deviceId: cleanId,
        deviceLabel: typeof deviceLabel === "string" && deviceLabel.trim() ? deviceLabel.trim().slice(0, 60) : "Peranti Web",
        platform: typeof platform === "string" && platform.trim() ? platform.trim().slice(0, 40) : "web",
        fidSuffix: typeof fidSuffix === "string" && fidSuffix.trim() ? fidSuffix.trim().slice(-6) : undefined,
        fcmEnabled: Boolean(fcmEnabled),
        lastSeenAt: now,
      });

      schedulePersistToDisk();
      const mergedDevices = await getMergedSyncedDevices();
      if (isNew) {
        broadcastNotificationSync("devices_updated", { activeDevicesCount: mergedDevices.length });
      }

      return res.json({
        success: true,
        activeDevicesCount: mergedDevices.length,
        devices: mergedDevices,
      });
    } catch (err: any) {
      console.error("[Sync Server] Heartbeat error:", err);
      return res.status(500).json({ success: false, error: "Failed to record device heartbeat" });
    }
  });

  // 0c. Unified cross-device notification state endpoint
  app.get(["/api/notifications/state", "/api/notifications/state/"], async (_req, res) => {
    try {
      const [mergedDevices, reminders] = await Promise.all([
        getMergedSyncedDevices(),
        getAllNonDeletedReminders(),
      ]);

      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const validAlerts = recentAlertsStore.filter((a) => a.createdAt >= cutoff);

      return res.json({
        success: true,
        activeDevicesCount: mergedDevices.length,
        devices: mergedDevices,
        reminders,
        recentAlerts: validAlerts,
        readNotificationIds: Array.from(readNotificationMap.keys()),
        sheetConfigs: sheetConfigsState,
        fcmMessagingAvailable,
        serverTime: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[Sync Server] Error fetching notification state:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed to fetch notification state" });
    }
  });

  // 0c-2. Cross-device Google Sheet links & Apps Script config sync
  app.get(["/api/settings/sheets", "/api/settings/sheets/"], (_req, res) => {
    return res.json({
      success: true,
      sheetConfigs: sheetConfigsState,
    });
  });

  app.post(["/api/settings/sheets", "/api/settings/sheets/"], (req, res) => {
    try {
      const { annualSheets, globalScriptUrl } = req.body || {};
      if (!Array.isArray(annualSheets)) {
        return res.status(400).json({ success: false, error: "Expected 'annualSheets' array" });
      }

      const sanitizedSheets: SyncedSheetConfigItem[] = annualSheets
        .filter((s) => s && typeof s.year === "string" && s.year.trim())
        .slice(0, 20)
        .map((s) => {
          const yr = String(s.year).trim().slice(0, 20);
          const rawId = String(s.spreadsheetId || "").trim().slice(0, 300);
          return {
            year: yr,
            spreadsheetId: rawId || (yr === "2026" || yr === "2025" || yr === "2024" ? DEFAULT_SERVER_SPREADSHEET_ID : ""),
            scriptUrl: String(s.scriptUrl || "").trim().slice(0, 400),
          };
        });

      const cleanGlobalUrl =
        typeof globalScriptUrl === "string" && globalScriptUrl.trim()
          ? globalScriptUrl.trim().slice(0, 400)
          : DEFAULT_SERVER_SCRIPT_URL;

      sheetConfigsState = {
        annualSheets: sanitizedSheets.length > 0 ? sanitizedSheets : sheetConfigsState.annualSheets,
        globalScriptUrl: cleanGlobalUrl,
        updatedAt: Date.now(),
      };

      schedulePersistToDisk(true);
      broadcastNotificationSync("sheets_updated", { sheetConfigs: sheetConfigsState });

      return res.json({
        success: true,
        sheetConfigs: sheetConfigsState,
      });
    } catch (err: any) {
      console.error("[Sync Server] Error updating sheet configs:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed to save sheet configs" });
    }
  });

  // 0d. Shared read/unread notification state sync across all devices
  app.post(["/api/notifications/read", "/api/notifications/read/"], async (req, res) => {
    try {
      const { ids, action } = req.body || {};
      const op = action === "unread" || action === "clear" ? action : "read";
      const now = Date.now();

      if (op === "clear") {
        readNotificationMap.clear();
      } else if (Array.isArray(ids)) {
        for (const rawId of ids.slice(0, 500)) {
          if (typeof rawId !== "string" || !rawId.trim()) continue;
          const cleanId = rawId.trim().slice(0, 200);
          if (op === "unread") {
            readNotificationMap.delete(cleanId);
          } else {
            readNotificationMap.set(cleanId, now);
          }
        }
      } else {
        return res.status(400).json({ success: false, error: "Expected 'ids' array or action='clear'" });
      }

      // Prune oldest read entries if store grows beyond 500 items
      if (readNotificationMap.size > 500) {
        const sorted = Array.from(readNotificationMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 500);
        readNotificationMap.clear();
        for (const [k, v] of sorted) {
          readNotificationMap.set(k, v);
        }
      }

      schedulePersistToDisk();
      const readList = Array.from(readNotificationMap.keys());
      broadcastNotificationSync("read_updated", { readNotificationIds: readList });

      return res.json({ success: true, readNotificationIds: readList });
    } catch (err: any) {
      console.error("[Sync Server] Error updating read notifications:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed to update read notifications" });
    }
  });

  // 1. Register Firebase Installation ID (FID) atomically
  app.get(["/api/push/register", "/api/push/register/"], (_req, res) => {
    return res.json({
      success: true,
      status: "ready",
      message: "Push registration endpoint is active. Send POST with { fid, secret? } to register device."
    });
  });

  app.post(["/api/push/register", "/api/push/register/"], async (req, res) => {
    try {
      const { fid, secret, deviceLabel, platform } = req.body;

      if (!fid || typeof fid !== "string" || fid.trim() === "") {
        return res.status(400).json({ success: false, error: "Invalid or missing 'fid' in request body" });
      }

      const cleanFid = fid.trim();
      const safeDocId = crypto.createHash("sha256").update(cleanFid).digest("hex");
      const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 200) : "";
      const cleanLabel = typeof deviceLabel === "string" && deviceLabel.trim() ? deviceLabel.trim().slice(0, 60) : undefined;
      const cleanPlatform = typeof platform === "string" && platform.trim() ? platform.trim().slice(0, 40) : undefined;

      const existing = await getInstallationFromStorage(safeDocId);

      if (!existing) {
        const newSecret = crypto.randomBytes(24).toString("hex");
        const secretHash = crypto.createHash("sha256").update(newSecret).digest("hex");
        const now = new Date().toISOString();

        const newRecord: PushInstallationRecord = {
          fid: cleanFid,
          secretHash,
          enabled: true,
          deviceLabel: cleanLabel || "Peranti Berdaftar",
          platform: cleanPlatform || "web",
          userAgent: ua,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        };

        await saveInstallationToStorage(safeDocId, newRecord);
        const active = await getAllActiveInstallations();
        broadcastNotificationSync("devices_updated", { activeDevicesCount: active.length });

        console.log(`[FCM Server] Registered new anonymous FID: ...${cleanFid.slice(-8)} (${newRecord.deviceLabel})`);
        return res.json({ success: true, fid: cleanFid, secret: newSecret, registered: true, activeDevicesCount: active.length });
      } else {
        let returnSecret = secret;
        if (!secret || typeof secret !== "string" || secret.trim() === "") {
          const newSecret = crypto.randomBytes(24).toString("hex");
          existing.secretHash = crypto.createHash("sha256").update(newSecret).digest("hex");
          returnSecret = newSecret;
        } else {
          const providedHash = crypto.createHash("sha256").update(secret.trim()).digest("hex");
          if (!timingSafeCompare(existing.secretHash, providedHash)) {
            const newSecret = crypto.randomBytes(24).toString("hex");
            existing.secretHash = crypto.createHash("sha256").update(newSecret).digest("hex");
            returnSecret = newSecret;
          }
        }

        const now = new Date().toISOString();
        const wasDisabled = !existing.enabled;
        existing.enabled = true;
        existing.lastSeenAt = now;
        existing.updatedAt = now;
        if (cleanLabel) existing.deviceLabel = cleanLabel;
        if (cleanPlatform) existing.platform = cleanPlatform;
        if (ua) existing.userAgent = ua;

        await saveInstallationToStorage(safeDocId, existing);
        const active = await getAllActiveInstallations();
        if (wasDisabled) {
          broadcastNotificationSync("devices_updated", { activeDevicesCount: active.length });
        }

        console.log(`[FCM Server] Re-registered existing FID: ...${cleanFid.slice(-8)}`);
        return res.json({ success: true, fid: cleanFid, secret: returnSecret, registered: true, activeDevicesCount: active.length });
      }
    } catch (err: any) {
      console.error("[FCM Server] Registration error:", err?.message || err);
      return res.status(500).json({ success: false, error: "Failed to process push registration" });
    }
  });

  // 2. Unregister Firebase Installation ID (FID)
  app.post(["/api/push/unregister", "/api/push/unregister/"], async (req, res) => {
    try {
      const { fid, secret } = req.body;
      if (!fid || typeof fid !== "string" || fid.trim() === "") {
        return res.status(400).json({ success: false, error: "Invalid or missing 'fid'" });
      }

      if (!secret || typeof secret !== "string" || secret.trim() === "") {
        return res.status(401).json({
          success: false,
          error: "Missing installation credentials. Unregistration is restricted to the registered device owner.",
        });
      }

      const cleanFid = fid.trim();
      const safeDocId = crypto.createHash("sha256").update(cleanFid).digest("hex");
      const existing = await getInstallationFromStorage(safeDocId);

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "Installation ID not found in registered devices.",
        });
      }

      const providedHash = crypto.createHash("sha256").update(secret.trim()).digest("hex");
      if (!timingSafeCompare(existing.secretHash, providedHash)) {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: Invalid installation secret. You cannot unregister another installation's FID.",
        });
      }

      existing.enabled = false;
      existing.updatedAt = new Date().toISOString();

      await saveInstallationToStorage(safeDocId, existing);
      const active = await getAllActiveInstallations();
      broadcastNotificationSync("devices_updated", { activeDevicesCount: active.length });

      console.log(`[FCM Server] Unregistered FID: ...${cleanFid.slice(-8)}`);
      return res.json({ success: true, unregistered: true });
    } catch (err: any) {
      console.error("[FCM Server] Unregister error:", err?.message || err);
      return res.status(500).json({ success: false, error: "Failed to unregister FID" });
    }
  });

  // 3. Send Test Notification across ALL synced devices (FCM + real-time SSE + persisted alert queue)
  app.post(["/api/push/send-test", "/api/push/send-test/"], async (req, res) => {
    try {
      const { fid, secret, title, body, broadcastAll = true, senderDeviceId, senderDeviceLabel } = req.body;

      if (!fid || typeof fid !== "string" || fid.trim() === "") {
        return res.status(400).json({ success: false, error: "Missing or invalid 'fid' parameter", code: "INVALID_FID" });
      }

      if (!secret || typeof secret !== "string" || secret.trim() === "") {
        return res.status(401).json({
          success: false,
          error: "Missing installation credentials. Test notifications are restricted to the registered device owner.",
          code: "MISSING_CREDENTIALS",
        });
      }

      const targetFid = fid.trim();
      const isLocalPlaceholder = targetFid === "local_device" || targetFid.startsWith("webpush_");

      if (!isLocalPlaceholder) {
        const safeDocId = crypto.createHash("sha256").update(targetFid).digest("hex");
        const existing = await getInstallationFromStorage(safeDocId);

        if (!existing) {
          return res.status(404).json({
            success: false,
            error: "Installation ID not found in registered devices. Please re-register notifications.",
            code: "INSTALLATION_NOT_FOUND",
          });
        }

        if (!existing.enabled) {
          return res.status(400).json({
            success: false,
            error: "Installation is disabled or unregistered.",
            code: "INSTALLATION_DISABLED",
          });
        }

        const providedHash = crypto.createHash("sha256").update(secret.trim()).digest("hex");
        if (!timingSafeCompare(existing.secretHash, providedHash)) {
          return res.status(403).json({
            success: false,
            error: "Unauthorized: Invalid installation secret. You cannot send notifications to another installation's FID.",
            code: "INVALID_SECRET",
          });
        }

        existing.lastSeenAt = new Date().toISOString();
        memoryInstallationStore.set(safeDocId, existing);
        schedulePersistToDisk();
      }

      const notificationTitle = (title && typeof title === "string") ? title.slice(0, 100) : "🔥 Ujian Notifikasi";
      const notificationBody = (body && typeof body === "string") ? body.slice(0, 300) : "Peringatan pesanan disegerakkan merentasi semua peranti!";

      const [allInstallations, mergedDevices] = await Promise.all([
        broadcastAll
          ? getAllActiveInstallations()
          : Promise.resolve(isLocalPlaceholder ? [] : [{ fid: targetFid } as PushInstallationRecord]),
        getMergedSyncedDevices(),
      ]);

      // Persist test alert into recentAlerts so devices polling or waking up from background also receive it
      const alertEvent: SyncedAlertEvent = {
        id: `test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
        type: "test_alert",
        title: notificationTitle,
        body: notificationBody,
        senderDeviceId: typeof senderDeviceId === "string" && senderDeviceId.trim() ? senderDeviceId.trim().slice(0, 64) : undefined,
        senderDeviceLabel: typeof senderDeviceLabel === "string" && senderDeviceLabel.trim() ? senderDeviceLabel.trim().slice(0, 60) : undefined,
        senderFidSuffix: isLocalPlaceholder ? undefined : targetFid.slice(-8),
        createdAt: Date.now(),
      };
      appendSyncedAlert(alertEvent);
      schedulePersistToDisk(true);

      // Broadcast real-time SSE alert immediately to all connected devices/tabs
      broadcastNotificationSync("test_alert", {
        alert: alertEvent,
        id: alertEvent.id,
        title: alertEvent.title,
        body: alertEvent.body,
        senderDeviceId: alertEvent.senderDeviceId,
        senderDeviceLabel: alertEvent.senderDeviceLabel,
        senderFidSuffix: alertEvent.senderFidSuffix,
        timestamp: alertEvent.createdAt,
      });

      let sentCount = 0;
      let webPushSentCount = 0;
      let firstMessageId: string | undefined;
      let lastFcmError: string | undefined;

      // 1. Direct W3C Web Push (works on Android Chrome & iOS 16.4+ PWA even when completely closed)
      const webPushResult = await sendWebPushToAllSubscribers(
        {
          title: notificationTitle,
          body: notificationBody,
          url: "/",
          tag: alertEvent.id,
          alertId: alertEvent.id,
          senderDeviceId: alertEvent.senderDeviceId,
          senderDeviceLabel: alertEvent.senderDeviceLabel,
        },
        broadcastAll ? alertEvent.senderDeviceId : undefined
      );
      webPushSentCount = webPushResult.sentCount;
      sentCount += webPushSentCount;

      // 2. Legacy Firebase Admin fallback (if IAM permissions are available)
      if (messaging && fcmMessagingAvailable && allInstallations.length > 0 && webPushSentCount === 0) {
        await Promise.allSettled(
          allInstallations.map(async (inst) => {
            const messagePayload = buildTargetPayload(inst.fid, {
              notification: {
                title: notificationTitle,
                body: notificationBody,
              },
              webpush: {
                notification: {
                  icon: "https://i.imgur.com/49kNDoe.png",
                  badge: "https://i.imgur.com/49kNDoe.png",
                  tag: alertEvent.id,
                },
                fcmOptions: {
                  link: "/",
                },
                data: {
                  url: "/",
                  source: "fcm_test",
                  alertId: alertEvent.id,
                  timestamp: String(alertEvent.createdAt),
                },
              },
            });

            try {
              const msgId = await messaging!.send(messagePayload as any);
              sentCount++;
              if (!firstMessageId) firstMessageId = msgId;
              console.log(`[FCM Server] Test message accepted by FCM for ...${inst.fid.slice(-8)}! MessageId:`, msgId);
            } catch (sendErr: any) {
              const errorCode = sendErr?.code || "FCM_SEND_ERROR";
              if (
                sendErr?.message?.includes("cloudmessaging.messages.create") ||
                sendErr?.message?.includes("PERMISSION_DENIED") ||
                errorCode === "messaging/authentication-error"
              ) {
                fcmMessagingAvailable = false;
                lastFcmError = "Google Cloud Service Account lacks 'cloudmessaging.messages.create' permission.";
              } else if (
                errorCode === "messaging/invalid-registration-token" ||
                errorCode === "messaging/registration-token-not-registered"
              ) {
                const staleDocId = crypto.createHash("sha256").update(inst.fid).digest("hex");
                const staleRec = memoryInstallationStore.get(staleDocId);
                if (staleRec) {
                  staleRec.enabled = false;
                  staleRec.updatedAt = new Date().toISOString();
                  saveInstallationToStorage(staleDocId, staleRec).catch(() => {});
                }
                lastFcmError = "Expired device token deactivated.";
              } else {
                lastFcmError = sendErr?.message || errorCode;
              }
            }
          })
        );
      }

      return res.json({
        success: true,
        alertId: alertEvent.id,
        messageId: firstMessageId || (webPushSentCount > 0 ? "webpush_sent" : sseClients.size > 0 ? "sse_broadcast" : "synced_queue"),
        sentCount,
        webPushSentCount,
        totalDevices: mergedDevices.length,
        pushDevicesCount: allInstallations.length,
        sseDelivered: sseClients.size > 0,
        fcmAvailable: fcmMessagingAvailable,
        webPushAvailable: Boolean(vapidKeysState?.publicKey),
        ...(lastFcmError ? { fcmNotice: lastFcmError } : {}),
      });
    } catch (err: any) {
      console.error("[FCM Server] Push test endpoint error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Failed to process push test request",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // =========================================================================
  // 4. Order Reminder Synchronization & Scheduled Push Dispatch
  // =========================================================================

  app.post(["/api/reminders/sync", "/api/reminders/sync/"], async (req, res) => {
    try {
      const { orders, deviceFid } = req.body;
      if (!Array.isArray(orders)) {
        return res.status(400).json({ success: false, error: "Expected 'orders' array" });
      }

      if (deviceFid && typeof deviceFid === "string" && deviceFid.trim()) {
        const devDocId = crypto.createHash("sha256").update(deviceFid.trim()).digest("hex");
        const devRec = memoryInstallationStore.get(devDocId);
        if (devRec) {
          devRec.lastSeenAt = new Date().toISOString();
          memoryInstallationStore.set(devDocId, devRec);
        }
      }

      const reminderStates: Record<string, { hasNotified20Min: boolean; hasDueAlerted: boolean; hasThreeHourAlerted: boolean }> = {};
      let hasMeaningfulChange = false;

      for (const ord of orders) {
        if (!ord || !ord.id || !ord.dueTimestamp) continue;

        const safeId = String(ord.id);
        const existingMem = memoryRemindersStore.get(safeId);
        const nextDueTimestamp = Number(ord.dueTimestamp);
        const wasRescheduledFuture =
          existingMem &&
          nextDueTimestamp !== existingMem.dueTimestamp &&
          nextDueTimestamp > Date.now();

        const nextRecord: OrderReminderRecord = {
          id: safeId,
          orderId: ord.orderId || safeId,
          customerName: String(ord.customerName || 'Pelanggan'),
          mainType: String(ord.mainType || 'Pesanan'),
          subType: ord.subType ? String(ord.subType) : '',
          dueTimestamp: nextDueTimestamp,
          isDelivered: Boolean(ord.isDelivered),
          isDeleted: Boolean(ord.isDeleted),
          hasNotified20Min: wasRescheduledFuture ? Boolean(ord.hasNotified20Min) : Boolean(ord.hasNotified20Min || existingMem?.hasNotified20Min),
          hasDueAlerted: wasRescheduledFuture ? Boolean(ord.hasDueAlerted) : Boolean(ord.hasDueAlerted || existingMem?.hasDueAlerted),
          hasThreeHourAlerted: wasRescheduledFuture ? Boolean(ord.hasThreeHourAlerted) : Boolean(ord.hasThreeHourAlerted || existingMem?.hasThreeHourAlerted),
          googleSheetLink: ord.googleSheetLink ? String(ord.googleSheetLink) : (existingMem?.googleSheetLink || ''),
          language: ord.language === 'en' ? 'en' : 'ms',
          createdAt: existingMem?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (
          !existingMem ||
          existingMem.dueTimestamp !== nextRecord.dueTimestamp ||
          existingMem.isDelivered !== nextRecord.isDelivered ||
          existingMem.isDeleted !== nextRecord.isDeleted ||
          existingMem.googleSheetLink !== nextRecord.googleSheetLink ||
          existingMem.customerName !== nextRecord.customerName
        ) {
          hasMeaningfulChange = true;
        }

        memoryRemindersStore.set(safeId, nextRecord);

        reminderStates[safeId] = {
          hasNotified20Min: nextRecord.hasNotified20Min,
          hasDueAlerted: nextRecord.hasDueAlerted,
          hasThreeHourAlerted: nextRecord.hasThreeHourAlerted,
        };

        if (db && firestoreAvailable) {
          try {
            const docRef = db.collection("orderReminders").doc(safeId);
            docRef.set({
              ...nextRecord,
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true }).catch((e) => {
              if (e?.code === 7 || e?.message?.includes("PERMISSION_DENIED")) {
                firestoreAvailable = false;
              }
            });
          } catch (_) {}
        }
      }

      if (hasMeaningfulChange || orders.length > 0) {
        schedulePersistToDisk();
      }
      if (hasMeaningfulChange) {
        broadcastNotificationSync("reminders_updated", { count: orders.length });
      }

      const [allReminders, mergedDevices] = await Promise.all([
        getAllNonDeletedReminders(),
        getMergedSyncedDevices(),
      ]);

      return res.json({
        success: true,
        reminderStates,
        allReminders,
        recentAlerts: recentAlertsStore,
        readNotificationIds: Array.from(readNotificationMap.keys()),
        activeDevicesCount: mergedDevices.length,
      });
    } catch (err: any) {
      console.error("[FCM Server] Error syncing reminders:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed to sync reminders" });
    }
  });

  // Server-side reminder check loop (runs every 30 seconds)
  async function checkAndSendPushReminders() {
    try {
      const now = Date.now();
      const TWENTY_MINS = 20 * 60 * 1000;
      const THREE_HOURS = 3 * 60 * 60 * 1000;

      const allNonDeleted = await getAllNonDeletedReminders();
      const activeOrders = allNonDeleted.filter((ord) => !ord.isDelivered && !ord.isDeleted);
      if (activeOrders.length === 0) return;

      const installations = await getAllActiveInstallations();
      let storeModified = false;

      for (const order of activeOrders) {
        const timeUntilDue = order.dueTimestamp - now;
        const lang = order.language || 'ms';

        // Alert Type A: 20-minute alert
        if (!order.hasNotified20Min && timeUntilDue > 0 && timeUntilDue <= TWENTY_MINS) {
          const title = lang === 'en' ? 'Order Due Soon!' : 'Pesanan Bakal Selesai!';
          const body = lang === 'en'
            ? `Order for ${order.customerName} (${order.mainType} ${order.subType}) is due in less than 20 minutes!`
            : `Pesanan untuk ${order.customerName} (${order.mainType} ${order.subType}) berbaki kurang dari 20 minit!`;

          const alertObj: SyncedAlertEvent = {
            id: `order_due_soon_${order.id}`,
            type: "order_alert",
            title,
            body,
            orderId: order.orderId || order.id,
            createdAt: now,
          };
          appendSyncedAlert(alertObj);

          let sentSuccessfully = true;
          broadcastNotificationSync("order_alert", {
            alert: alertObj,
            id: alertObj.id,
            orderId: order.orderId || order.id,
            alertType: "due_soon",
            title,
            body,
            timestamp: now,
          });

          await sendWebPushToAllSubscribers({
            title,
            body,
            url: "/",
            orderId: order.orderId || order.id,
            tag: `due_soon_${order.id}`,
            alertId: alertObj.id,
          }).catch(() => {});

          if (messaging && fcmMessagingAvailable && installations.length > 0) {
            for (const inst of installations) {
              try {
                await messaging.send(buildTargetPayload(inst.fid, {
                  notification: { title, body },
                  webpush: {
                    notification: {
                      icon: "https://i.imgur.com/49kNDoe.png",
                      badge: "https://i.imgur.com/49kNDoe.png",
                      tag: `due_soon_${order.id}`,
                    },
                    fcmOptions: { link: "/" },
                    data: {
                      url: "/",
                      orderId: order.orderId || order.id,
                      type: "due_soon",
                    },
                  },
                }) as any);
                sentSuccessfully = true;
                console.log(`[FCM Server] Sent 20-min push for order ${order.orderId || order.id} to FID ...${inst.fid.slice(-8)}`);
              } catch (err: any) {
                if (err?.message?.includes("cloudmessaging.messages.create") || err?.code === 7 || err?.message?.includes("PERMISSION_DENIED") || err?.code === "messaging/authentication-error") {
                  fcmMessagingAvailable = false;
                  break;
                } else if (err?.code === "messaging/registration-token-not-registered" || err?.code === "messaging/invalid-registration-token") {
                  const staleDocId = crypto.createHash("sha256").update(inst.fid).digest("hex");
                  inst.enabled = false;
                  saveInstallationToStorage(staleDocId, inst).catch(() => {});
                }
              }
            }
          }

          if (sentSuccessfully) {
            order.hasNotified20Min = true;
            order.lastNotified20MinAt = new Date().toISOString();
            memoryRemindersStore.set(order.id, order);
            storeModified = true;
            if (db && firestoreAvailable) {
              try {
                await db.collection("orderReminders").doc(order.id).update({
                  hasNotified20Min: true,
                  lastNotified20MinAt: FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp(),
                });
              } catch (_) {}
            }
          }
        }

        // Alert Type B: Due-Now alert (deadline reached)
        if (!order.hasDueAlerted && timeUntilDue <= 0 && timeUntilDue >= -THREE_HOURS) {
          const title = lang === 'en' ? 'Order Deadline Reached!' : 'Tempahan Sudah Sampai Tempoh!';
          const body = lang === 'en'
            ? `Order for ${order.customerName} (${order.mainType} ${order.subType}) is due now!`
            : `Tempahan untuk ${order.customerName} (${order.mainType} ${order.subType}) sudah sampai tempoh sekarang!`;

          const alertObj: SyncedAlertEvent = {
            id: `order_due_now_${order.id}`,
            type: "order_alert",
            title,
            body,
            orderId: order.orderId || order.id,
            createdAt: now,
          };
          appendSyncedAlert(alertObj);

          let sentSuccessfully = true;
          broadcastNotificationSync("order_alert", {
            alert: alertObj,
            id: alertObj.id,
            orderId: order.orderId || order.id,
            alertType: "due_now",
            title,
            body,
            timestamp: now,
          });

          await sendWebPushToAllSubscribers({
            title,
            body,
            url: "/",
            orderId: order.orderId || order.id,
            tag: `due_now_${order.id}`,
            alertId: alertObj.id,
          }).catch(() => {});

          if (messaging && fcmMessagingAvailable && installations.length > 0) {
            for (const inst of installations) {
              try {
                await messaging.send(buildTargetPayload(inst.fid, {
                  notification: { title, body },
                  webpush: {
                    notification: {
                      icon: "https://i.imgur.com/49kNDoe.png",
                      badge: "https://i.imgur.com/49kNDoe.png",
                      tag: `due_now_${order.id}`,
                    },
                    fcmOptions: { link: "/" },
                    data: {
                      url: "/",
                      orderId: order.orderId || order.id,
                      type: "due_now",
                    },
                  },
                }) as any);
                sentSuccessfully = true;
                console.log(`[FCM Server] Sent Due-Now push for order ${order.orderId || order.id} to FID ...${inst.fid.slice(-8)}`);
              } catch (err: any) {
                if (err?.message?.includes("cloudmessaging.messages.create") || err?.code === 7 || err?.message?.includes("PERMISSION_DENIED") || err?.code === "messaging/authentication-error") {
                  fcmMessagingAvailable = false;
                  break;
                } else if (err?.code === "messaging/registration-token-not-registered" || err?.code === "messaging/invalid-registration-token") {
                  const staleDocId = crypto.createHash("sha256").update(inst.fid).digest("hex");
                  inst.enabled = false;
                  saveInstallationToStorage(staleDocId, inst).catch(() => {});
                }
              }
            }
          }

          if (sentSuccessfully) {
            order.hasDueAlerted = true;
            order.lastDueAlertedAt = new Date().toISOString();
            memoryRemindersStore.set(order.id, order);
            storeModified = true;
            if (db && firestoreAvailable) {
              try {
                await db.collection("orderReminders").doc(order.id).update({
                  hasDueAlerted: true,
                  lastDueAlertedAt: FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp(),
                });
              } catch (_) {}
            }
          }
        }

        // Alert Type C: 3-Hour follow up ("Dah siap ke belum?")
        const elapsedSinceDue = now - order.dueTimestamp;
        if (!order.hasThreeHourAlerted && elapsedSinceDue >= THREE_HOURS && elapsedSinceDue <= 24 * 60 * 60 * 1000) {
          const title = lang === 'en' ? 'Order Status Check' : 'Status Tempahan';
          const body = `${order.customerName} (${order.mainType}) - Dah siap ke belum? Sila semak status pesanan.`;

          const alertObj: SyncedAlertEvent = {
            id: `order_three_hour_${order.id}`,
            type: "order_alert",
            title,
            body,
            orderId: order.orderId || order.id,
            createdAt: now,
          };
          appendSyncedAlert(alertObj);

          let sentSuccessfully = true;
          broadcastNotificationSync("order_alert", {
            alert: alertObj,
            id: alertObj.id,
            orderId: order.orderId || order.id,
            alertType: "three_hour_check",
            title,
            body,
            timestamp: now,
          });

          await sendWebPushToAllSubscribers({
            title,
            body,
            url: "/",
            orderId: order.orderId || order.id,
            tag: `three_hour_${order.id}`,
            alertId: alertObj.id,
          }).catch(() => {});

          if (messaging && fcmMessagingAvailable && installations.length > 0) {
            for (const inst of installations) {
              try {
                await messaging.send(buildTargetPayload(inst.fid, {
                  notification: { title, body },
                  webpush: {
                    notification: {
                      icon: "https://i.imgur.com/49kNDoe.png",
                      badge: "https://i.imgur.com/49kNDoe.png",
                      tag: `three_hour_${order.id}`,
                    },
                    fcmOptions: { link: "/" },
                    data: {
                      url: "/",
                      orderId: order.orderId || order.id,
                      type: "three_hour_check",
                    },
                  },
                }) as any);
                sentSuccessfully = true;
                console.log(`[FCM Server] Sent 3-Hour follow up push for order ${order.orderId || order.id} to FID ...${inst.fid.slice(-8)}`);
              } catch (err: any) {
                if (err?.message?.includes("cloudmessaging.messages.create") || err?.code === 7 || err?.message?.includes("PERMISSION_DENIED") || err?.code === "messaging/authentication-error") {
                  fcmMessagingAvailable = false;
                  break;
                } else if (err?.code === "messaging/registration-token-not-registered" || err?.code === "messaging/invalid-registration-token") {
                  const staleDocId = crypto.createHash("sha256").update(inst.fid).digest("hex");
                  inst.enabled = false;
                  saveInstallationToStorage(staleDocId, inst).catch(() => {});
                }
              }
            }
          }

          if (sentSuccessfully) {
            order.hasThreeHourAlerted = true;
            order.lastThreeHourAlertedAt = new Date().toISOString();
            memoryRemindersStore.set(order.id, order);
            storeModified = true;
            if (db && firestoreAvailable) {
              try {
                await db.collection("orderReminders").doc(order.id).update({
                  hasThreeHourAlerted: true,
                  lastThreeHourAlertedAt: FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp(),
                });
              } catch (_) {}
            }
          }
        }
      }

      if (storeModified) {
        schedulePersistToDisk();
        broadcastNotificationSync("reminders_updated");
      }
    } catch (loopErr: any) {
      console.error("[FCM Server] Scheduled reminder loop error:", loopErr?.message || loopErr);
    }
  }

  // Start background scheduler every 30 seconds
  const reminderInterval = setInterval(checkAndSendPushReminders, 30000);
  console.log("[FCM Server] Background scheduled reminder worker active (30s interval)");

  // ==========================================
  // Application Data & Proxy Endpoints
  // ==========================================

  // Server-side proxy for Google Apps Script requests to bypass browser CORS & script injection limits
  app.get("/api/sync-proxy", async (req, res) => {
    const controller = new AbortController();
    let isTimeout = false;
    const timeoutId = setTimeout(() => {
      isTimeout = true;
      controller.abort();
    }, 50000);

    req.on("close", () => {
      clearTimeout(timeoutId);
      if (!res.headersSent) {
        controller.abort();
      }
    });

    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl || (!targetUrl.startsWith("https://script.google.com/") && !targetUrl.startsWith("http://script.google.com/"))) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: "Invalid or missing target URL" });
      }

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      clearTimeout(timeoutId);

      const text = await response.text();
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json");
        res.send(text);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (res.headersSent) return;

      if (err.name === "AbortError" || isTimeout) {
        console.warn("Sync proxy request timed out or client disconnected.");
        return res.status(504).json({ error: "Google Script request timed out" });
      }

      console.error("Sync proxy error:", err?.message || err);
      res.status(500).json({ error: err?.message || "Proxy request failed" });
    }
  });

  // ==========================================
  // Vite Middleware & Static Serving
  // ==========================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error starting server:", err);
});
