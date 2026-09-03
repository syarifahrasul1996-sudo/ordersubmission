import express from "express";
import path from "path";
import crypto from "crypto";
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "5mb" }));

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
  // Primary Storage: Cloud Firestore with in-process resilient cache fallback
  // =========================================================================

  const memoryInstallationStore = new Map<string, PushInstallationRecord>();
  const memoryRemindersStore = new Map<string, OrderReminderRecord>();

  // Installation store helpers (Firestore source of truth + memory cache)
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
            console.info("[FCM Server] Firestore permission not active on project. Operating with resilient in-memory storage.");
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
    if (db && firestoreAvailable) {
      try {
        const docRef = db.collection("pushInstallations").doc(safeDocId);
        await docRef.set({
          fid: record.fid,
          secretHash: record.secretHash,
          enabled: record.enabled,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[FCM Server] Installation saved to Firestore: ...${record.fid.slice(-8)}`);
      } catch (err: any) {
        if (err?.code === 7 || err?.message?.includes("PERMISSION_DENIED") || err?.message?.includes("Missing or insufficient permissions")) {
          if (firestoreAvailable) {
            firestoreAvailable = false;
            console.info("[FCM Server] Firestore write permission not active on project. Operating with resilient in-memory storage.");
          }
        } else {
          console.warn("[FCM Server] Error writing installation to Firestore:", err?.message || err);
        }
      }
    }
  }

  async function getAllActiveInstallations(): Promise<PushInstallationRecord[]> {
    const recordsMap = new Map<string, PushInstallationRecord>();
    
    // Add memory cached items first
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
            console.info("[FCM Server] Firestore query permission not active on project. Using memory installations.");
          }
        }
      }
    }

    return Array.from(recordsMap.values());
  }

  // =========================================================================
  // FCM Push Notification Endpoints
  // =========================================================================

  // 1. Register Firebase Installation ID (FID) atomically
  app.post("/api/push/register", async (req, res) => {
    try {
      const { fid, secret } = req.body;

      if (!fid || typeof fid !== "string" || fid.trim() === "") {
        return res.status(400).json({ success: false, error: "Invalid or missing 'fid' in request body" });
      }

      const cleanFid = fid.trim();
      const safeDocId = crypto.createHash("sha256").update(cleanFid).digest("hex");

      const existing = await getInstallationFromStorage(safeDocId);

      if (!existing) {
        const newSecret = crypto.randomBytes(24).toString("hex");
        const secretHash = crypto.createHash("sha256").update(newSecret).digest("hex");
        const now = new Date().toISOString();

        const newRecord: PushInstallationRecord = {
          fid: cleanFid,
          secretHash,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };

        await saveInstallationToStorage(safeDocId, newRecord);

        console.log(`[FCM Server] Registered new anonymous FID: ...${cleanFid.slice(-8)}`);
        return res.json({ success: true, fid: cleanFid, secret: newSecret, registered: true });
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

        existing.enabled = true;
        existing.updatedAt = new Date().toISOString();

        await saveInstallationToStorage(safeDocId, existing);

        console.log(`[FCM Server] Re-registered existing FID: ...${cleanFid.slice(-8)}`);
        return res.json({ success: true, fid: cleanFid, secret: returnSecret, registered: true });
      }
    } catch (err: any) {
      console.error("[FCM Server] Registration error:", err?.message || err);
      return res.status(500).json({ success: false, error: "Failed to process push registration" });
    }
  });

  // 2. Unregister Firebase Installation ID (FID)
  app.post("/api/push/unregister", async (req, res) => {
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

      console.log(`[FCM Server] Unregistered FID: ...${cleanFid.slice(-8)}`);
      return res.json({ success: true, unregistered: true });
    } catch (err: any) {
      console.error("[FCM Server] Unregister error:", err?.message || err);
      return res.status(500).json({ success: false, error: "Failed to unregister FID" });
    }
  });

  // 3. Send Test FCM Notification with strict installation ownership verification & real error handling
  app.post("/api/push/send-test", async (req, res) => {
    try {
      const { fid, secret, title, body } = req.body;

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

      if (!messaging || !fcmMessagingAvailable) {
        return res.status(503).json({
          success: false,
          error: "Firebase Admin Cloud Messaging push permission (cloudmessaging.messages.create) is not granted to the server service account on Google Cloud. Client-side Service Worker notifications remain fully functional in your browser.",
          code: "FCM_PERMISSION_UNAVAILABLE",
        });
      }

      const notificationTitle = (title && typeof title === "string") ? title.slice(0, 100) : "🔥 Test FCM Notification";
      const notificationBody = (body && typeof body === "string") ? body.slice(0, 300) : "Firebase Cloud Messaging is active and working properly!";

      console.log(`[FCM Server] Sending authenticated test message to target: ...${targetFid.slice(-8)}`);

      const messagePayload = {
        token: targetFid,
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        webpush: {
          notification: {
            icon: "https://i.imgur.com/49kNDoe.png",
            badge: "https://i.imgur.com/49kNDoe.png",
            tag: "test_notification",
          },
          data: {
            url: "/",
            source: "fcm_test",
            timestamp: String(Date.now()),
          },
        },
      };

      try {
        const messageId = await messaging.send(messagePayload as any);
        console.log("[FCM Server] Test message accepted by FCM! MessageId:", messageId);

        return res.json({
          success: true,
          messageId,
          sentToFid: targetFid,
        });
      } catch (sendErr: any) {
        const errorCode = sendErr?.code || "FCM_SEND_ERROR";
        let userMessage = sendErr?.message || "Failed to deliver push notification via Firebase.";

        if (sendErr?.message?.includes("cloudmessaging.messages.create") || sendErr?.message?.includes("PERMISSION_DENIED") || errorCode === "messaging/authentication-error") {
          fcmMessagingAvailable = false;
          userMessage = "Google Cloud Service Account lacks 'cloudmessaging.messages.create' permission on project order-submission-501208. Browser Service Worker notifications will handle reminders.";
          console.info("[FCM Server] Cloud Messaging permission missing on Google Cloud project. Background push dispatch paused; browser notifications remain active.");
        } else if (errorCode === "messaging/invalid-registration-token" || errorCode === "messaging/registration-token-not-registered") {
          userMessage = "The device registration token or FID is expired or invalid in Firebase Cloud Messaging. Please disable and re-enable notifications.";
        }

        return res.status(502).json({
          success: false,
          error: userMessage,
          code: errorCode,
        });
      }
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

  app.post("/api/reminders/sync", async (req, res) => {
    try {
      const { orders } = req.body;
      if (!Array.isArray(orders)) {
        return res.status(400).json({ success: false, error: "Expected 'orders' array" });
      }

      const reminderStates: Record<string, { hasNotified20Min: boolean; hasDueAlerted: boolean; hasThreeHourAlerted: boolean }> = {};

      for (const ord of orders) {
        if (!ord || !ord.id || !ord.dueTimestamp) continue;

        const safeId = String(ord.id);
        const existingMem = memoryRemindersStore.get(safeId);

        const updatedRecord: OrderReminderRecord = {
          id: safeId,
          orderId: ord.orderId || safeId,
          customerName: String(ord.customerName || 'Pelanggan'),
          mainType: String(ord.mainType || 'Pesanan'),
          subType: ord.subType ? String(ord.subType) : '',
          dueTimestamp: Number(ord.dueTimestamp),
          isDelivered: Boolean(ord.isDelivered),
          isDeleted: Boolean(ord.isDeleted),
          hasNotified20Min: Boolean(ord.hasNotified20Min || existingMem?.hasNotified20Min),
          hasDueAlerted: Boolean(ord.hasDueAlerted || existingMem?.hasDueAlerted),
          hasThreeHourAlerted: Boolean(ord.hasThreeHourAlerted || existingMem?.hasThreeHourAlerted),
          googleSheetLink: ord.googleSheetLink ? String(ord.googleSheetLink) : '',
          language: ord.language === 'en' ? 'en' : 'ms',
          updatedAt: new Date().toISOString(),
        };

        memoryRemindersStore.set(safeId, updatedRecord);

        reminderStates[safeId] = {
          hasNotified20Min: updatedRecord.hasNotified20Min,
          hasDueAlerted: updatedRecord.hasDueAlerted,
          hasThreeHourAlerted: updatedRecord.hasThreeHourAlerted,
        };

        if (db && firestoreAvailable) {
          try {
            const docRef = db.collection("orderReminders").doc(safeId);
            docRef.set({
              ...updatedRecord,
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true }).catch((e) => {
              if (e?.code === 7 || e?.message?.includes("PERMISSION_DENIED")) {
                firestoreAvailable = false;
              }
            });
          } catch (_) {}
        }
      }

      return res.json({ success: true, reminderStates });
    } catch (err: any) {
      console.error("[FCM Server] Error syncing reminders:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed to sync reminders" });
    }
  });

  // Server-side reminder check loop (runs every 30 seconds)
  async function checkAndSendPushReminders() {
    if (!messaging || !fcmMessagingAvailable) return;

    try {
      const now = Date.now();
      const TWENTY_MINS = 20 * 60 * 1000;
      const THREE_HOURS = 3 * 60 * 60 * 1000;

      // 1. Gather all active orders from memory store and Firestore
      const activeOrders: OrderReminderRecord[] = [];

      for (const ord of memoryRemindersStore.values()) {
        if (!ord.isDelivered && !ord.isDeleted) {
          activeOrders.push({ ...ord });
        }
      }

      if (db && firestoreAvailable) {
        try {
          const snap = await db.collection("orderReminders")
            .where("isDelivered", "==", false)
            .where("isDeleted", "==", false)
            .get();

          snap.forEach((doc) => {
            const data = doc.data() as any;
            const existingIdx = activeOrders.findIndex(o => o.id === doc.id);
            const record: OrderReminderRecord = {
              id: doc.id,
              orderId: data.orderId || doc.id,
              customerName: data.customerName || 'Pelanggan',
              mainType: data.mainType || 'Pesanan',
              subType: data.subType || '',
              dueTimestamp: Number(data.dueTimestamp),
              isDelivered: Boolean(data.isDelivered),
              isDeleted: Boolean(data.isDeleted),
              hasNotified20Min: Boolean(data.hasNotified20Min),
              hasDueAlerted: Boolean(data.hasDueAlerted),
              hasThreeHourAlerted: Boolean(data.hasThreeHourAlerted),
              googleSheetLink: data.googleSheetLink || '',
              language: data.language === 'en' ? 'en' : 'ms',
            };

            if (existingIdx !== -1) {
              activeOrders[existingIdx] = record;
            } else {
              activeOrders.push(record);
            }
            memoryRemindersStore.set(doc.id, record);
          });
        } catch (dbErr: any) {
          if (dbErr?.code === 7 || dbErr?.message?.includes("PERMISSION_DENIED")) {
            firestoreAvailable = false;
          }
        }
      }

      if (activeOrders.length === 0) return;

      // 2. Gather all active installations
      const installations = await getAllActiveInstallations();
      if (installations.length === 0) return;

      // 3. Check deadlines
      for (const order of activeOrders) {
        if (!fcmMessagingAvailable) break;

        const timeUntilDue = order.dueTimestamp - now;
        const lang = order.language || 'ms';

        // Alert Type A: 20-minute alert
        if (!order.hasNotified20Min && timeUntilDue > 0 && timeUntilDue <= TWENTY_MINS) {
          const title = lang === 'en' ? 'Order Due Soon!' : 'Pesanan Bakal Selesai!';
          const body = lang === 'en'
            ? `Order for ${order.customerName} (${order.mainType} ${order.subType}) is due in less than 20 minutes!`
            : `Pesanan untuk ${order.customerName} (${order.mainType} ${order.subType}) berbaki kurang dari 20 minit!`;

          let sentSuccessfully = false;
          for (const inst of installations) {
            try {
              await messaging.send({
                token: inst.fid,
                notification: { title, body },
                webpush: {
                  notification: {
                    icon: "https://i.imgur.com/49kNDoe.png",
                    badge: "https://i.imgur.com/49kNDoe.png",
                    tag: `due_soon_${order.id}`,
                  },
                  data: {
                    url: "/",
                    orderId: order.orderId || order.id,
                    type: "due_soon",
                  },
                },
              } as any);
              sentSuccessfully = true;
              console.log(`[FCM Server] Sent 20-min push for order ${order.orderId || order.id} to FID ...${inst.fid.slice(-8)}`);
            } catch (err: any) {
              if (err?.message?.includes("cloudmessaging.messages.create") || err?.code === 7 || err?.message?.includes("PERMISSION_DENIED")) {
                fcmMessagingAvailable = false;
                console.info("[FCM Server] Cloud Messaging permission missing on Google Cloud project. Background push loop paused.");
                break;
              }
            }
          }

          if (sentSuccessfully) {
            order.hasNotified20Min = true;
            memoryRemindersStore.set(order.id, order);
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

          let sentSuccessfully = false;
          for (const inst of installations) {
            try {
              await messaging.send({
                token: inst.fid,
                notification: { title, body },
                webpush: {
                  notification: {
                    icon: "https://i.imgur.com/49kNDoe.png",
                    badge: "https://i.imgur.com/49kNDoe.png",
                    tag: `due_now_${order.id}`,
                  },
                  data: {
                    url: "/",
                    orderId: order.orderId || order.id,
                    type: "due_now",
                  },
                },
              } as any);
              sentSuccessfully = true;
              console.log(`[FCM Server] Sent Due-Now push for order ${order.orderId || order.id} to FID ...${inst.fid.slice(-8)}`);
            } catch (err: any) {
              if (err?.message?.includes("cloudmessaging.messages.create") || err?.code === 7 || err?.message?.includes("PERMISSION_DENIED")) {
                fcmMessagingAvailable = false;
                console.info("[FCM Server] Cloud Messaging permission missing on Google Cloud project. Background push loop paused.");
                break;
              }
            }
          }

          if (sentSuccessfully) {
            order.hasDueAlerted = true;
            memoryRemindersStore.set(order.id, order);
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

          let sentSuccessfully = false;
          for (const inst of installations) {
            try {
              await messaging.send({
                token: inst.fid,
                notification: { title, body },
                webpush: {
                  notification: {
                    icon: "https://i.imgur.com/49kNDoe.png",
                    badge: "https://i.imgur.com/49kNDoe.png",
                    tag: `three_hour_${order.id}`,
                  },
                  data: {
                    url: "/",
                    orderId: order.orderId || order.id,
                    type: "three_hour_check",
                  },
                },
              } as any);
              sentSuccessfully = true;
              console.log(`[FCM Server] Sent 3-Hour follow up push for order ${order.orderId || order.id} to FID ...${inst.fid.slice(-8)}`);
            } catch (err: any) {
              if (err?.message?.includes("cloudmessaging.messages.create") || err?.code === 7 || err?.message?.includes("PERMISSION_DENIED")) {
                fcmMessagingAvailable = false;
                console.info("[FCM Server] Cloud Messaging permission missing on Google Cloud project. Background push loop paused.");
                break;
              }
            }
          }

          if (sentSuccessfully) {
            order.hasThreeHourAlerted = true;
            memoryRemindersStore.set(order.id, order);
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

startServer();
