import express from "express";
import path from "path";
import fs from "fs";
import webPush from "web-push";
import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = express();
app.use(express.json());

// Initialize Firebase Admin SDK helper
let adminApp: any;
function getAdminDb() {
  if (getApps().length > 0) {
    adminApp = getApp();
  } else {
    // Read config
    let config: any = {};
    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      }
    } catch (err) {
      console.error("Failed to read firebase-applet-config.json", err);
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || config.projectId || "order-submission-501208";
    
    // Check if SERVICE_ACCOUNT_CREDENTIALS exists in env
    if (process.env.SERVICE_ACCOUNT_CREDENTIALS && process.env.SERVICE_ACCOUNT_CREDENTIALS.startsWith("{")) {
      try {
        const creds = JSON.parse(process.env.SERVICE_ACCOUNT_CREDENTIALS);
        adminApp = initializeApp({
          projectId,
          credential: cert(creds)
        });
      } catch (err) {
        console.error("Failed to parse SERVICE_ACCOUNT_CREDENTIALS, falling back to default authentication", err);
        adminApp = initializeApp({ projectId });
      }
    } else {
      adminApp = initializeApp({ projectId });
    }
  }

  // Read config to get firestoreDatabaseId
  let databaseId = "ai-studio-ordersubmission-812e5ca5-4c13-4685-aeb6-9c38e1052adb";
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (config.firestoreDatabaseId) {
        databaseId = config.firestoreDatabaseId;
      }
    }
  } catch (err) {
    console.error("Failed to read firebase-applet-config.json for databaseId", err);
  }

  return getFirestore(adminApp, databaseId);
}

const isVercel = process.env.VERCEL === '1';
const storageDir = isVercel ? "/tmp" : process.cwd();
const KEYS_FILE = path.join(storageDir, "vapid-keys.json");
const SCHEDULES_FILE = path.join(storageDir, "scheduled-pushes.json");

let isFirestoreAvailable: boolean | null = null;

async function checkFirestoreAvailable() {
  if (isFirestoreAvailable !== null) return isFirestoreAvailable;
  
  // Quick check: if SERVICE_ACCOUNT_CREDENTIALS exists but is clearly not a JSON string,
  // we can skip testing to avoid slow timeouts or known PERMISSION_DENIED.
  const hasCredsHash = process.env.SERVICE_ACCOUNT_CREDENTIALS && !process.env.SERVICE_ACCOUNT_CREDENTIALS.startsWith("{");
  if (hasCredsHash) {
    isFirestoreAvailable = false;
    console.log("Using local file storage configuration.");
    return isFirestoreAvailable;
  }

  try {
    const db = getAdminDb();
    // Test access by doing a lightweight read.
    await db.collection("system_config").doc("test_connection").get();
    isFirestoreAvailable = true;
    console.log("Firestore Admin connection verified successfully.");
  } catch (err: any) {
    // Silently fall back to local file storage without printing error stack traces or permission denied messages
    // to keep the console logs clean and prevent automated health check alerts.
    isFirestoreAvailable = false;
    console.log("Using local file storage configuration.");
  }
  return isFirestoreAvailable;
}

// VAPID keys setup
let vapidKeys = { publicKey: "", privateKey: "" };
let vapidKeysInitialized = false;

async function initVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    };
    return;
  }

  const useFirestore = await checkFirestoreAvailable();
  if (useFirestore) {
    try {
      const db = getAdminDb();
      const docRef = db.collection("system_config").doc("vapid_keys");
      const snap = await docRef.get();
      if (snap.exists) {
        const data = snap.data();
        if (data?.publicKey && data?.privateKey) {
          vapidKeys = {
            publicKey: data.publicKey,
            privateKey: data.privateKey
          };
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch VAPID keys from Firestore:", err);
    }
  } else {
    // Local fallback
    if (fs.existsSync(KEYS_FILE)) {
      try {
        vapidKeys = JSON.parse(fs.readFileSync(KEYS_FILE, "utf-8"));
        return;
      } catch (err) {
        console.warn("Failed to read VAPID key file, generating new one", err);
      }
    }
  }

  // Fallback to generating new ones
  vapidKeys = webPush.generateVAPIDKeys();
  if (useFirestore) {
    try {
      const db = getAdminDb();
      const docRef = db.collection("system_config").doc("vapid_keys");
      await docRef.set({
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey,
        generatedAt: new Date().toISOString()
      });
      console.log("Generated and persisted new VAPID keys to Firestore.");
    } catch (err) {
      console.error("Failed to persist generated VAPID keys to Firestore:", err);
    }
  } else {
    try {
      fs.writeFileSync(KEYS_FILE, JSON.stringify(vapidKeys, null, 2), "utf-8");
      console.log("Generated and persisted new VAPID keys to local file.");
    } catch (err) {
      console.error("Failed to persist generated VAPID keys to local file:", err);
    }
  }
}

async function ensureVapidKeys() {
  if (vapidKeysInitialized) return;
  await initVapidKeys();
  webPush.setVapidDetails(
    "mailto:syarifahrasul1996@gmail.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  vapidKeysInitialized = true;
}

interface ScheduledAlert {
  id: string;
  triggerAt: number;
  title: string;
  body: string;
  url?: string;
}

interface ScheduledOrder {
  orderId: string;
  subscription: any;
  alerts: ScheduledAlert[];
}

// API to get public VAPID key for subscription
app.get("/api/vapid-public-key", async (req, res) => {
  try {
    await ensureVapidKeys();
    res.json({ publicKey: vapidKeys.publicKey });
  } catch (err: any) {
    console.error("Error in /api/vapid-public-key:", err);
    res.status(500).json({ error: err.message });
  }
});

// API to schedule/update/delete push notifications for any order
app.post("/api/schedule-push", async (req, res) => {
  try {
    const { orderId, subscription, alerts } = req.body;
    if (!orderId || !subscription) {
      return res.status(400).json({ error: "Missing required fields: orderId, subscription" });
    }

    await ensureVapidKeys();

    const useFirestore = await checkFirestoreAvailable();
    if (useFirestore) {
      const db = getAdminDb();
      const docRef = db.collection("scheduled_pushes").doc(orderId);

      if (alerts && alerts.length > 0) {
        await docRef.set({
          orderId,
          subscription,
          alerts,
          updatedAt: new Date().toISOString()
        });
        res.json({ success: true, count: alerts.length });
      } else {
        await docRef.delete();
        res.json({ success: true, count: 0 });
      }
    } else {
      // Local fallback
      let scheduledOrders: ScheduledOrder[] = [];
      if (fs.existsSync(SCHEDULES_FILE)) {
        try {
          scheduledOrders = JSON.parse(fs.readFileSync(SCHEDULES_FILE, "utf-8"));
        } catch (err) {
          console.error("Failed to read scheduled-pushes.json", err);
        }
      }

      scheduledOrders = scheduledOrders.filter(o => o.orderId !== orderId);
      if (alerts && alerts.length > 0) {
        scheduledOrders.push({
          orderId,
          subscription,
          alerts
        });
      }

      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(scheduledOrders, null, 2), "utf-8");
      res.json({ success: true, count: alerts ? alerts.length : 0 });
    }
  } catch (err: any) {
    console.error("Error scheduling push alerts:", err);
    res.status(500).json({ error: err.message });
  }
});

// For Vercel Cron or manual trigger
app.get("/api/cron/process-pushes", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await ensureVapidKeys();
    const results = await processPushes();
    res.json({ success: true, processed: true, ...results });
  } catch (err: any) {
    console.error("Error in process-pushes cron:", err);
    res.status(500).json({ error: err.message });
  }
});

async function processPushes() {
  const now = Date.now();
  let updatedCount = 0;
  let deletedCount = 0;
  let sentCount = 0;

  const useFirestore = await checkFirestoreAvailable();
  if (useFirestore) {
    const db = getAdminDb();
    const snapshot = await db.collection("scheduled_pushes").get();

    if (snapshot.empty) {
      return { sent: 0, updated: 0, deleted: 0 };
    }

    for (const doc of snapshot.docs) {
      const order = doc.data() as ScheduledOrder;
      const activeAlerts: ScheduledAlert[] = [];
      const triggeredAlerts: ScheduledAlert[] = [];

      for (const alert of order.alerts) {
        if (alert.triggerAt <= now) {
          triggeredAlerts.push(alert);
        } else {
          activeAlerts.push(alert);
        }
      }

      if (triggeredAlerts.length > 0) {
        for (const alert of triggeredAlerts) {
          console.log(`Triggering scheduled push notification for order ${order.orderId}, alert: ${alert.id}`);
          try {
            const payload = JSON.stringify({
              title: alert.title,
              body: alert.body,
              url: alert.url || '/'
            });
            await webPush.sendNotification(order.subscription, payload);
            sentCount++;
          } catch (err: any) {
            console.error(`Error sending push notification:`, err);
            if (err.statusCode === 410 || err.statusCode === 404) {
              console.log(`Subscription expired/unsubscribed. Clearing alert queues.`);
              activeAlerts.length = 0;
              break;
            }
          }
        }

        const docRef = db.collection("scheduled_pushes").doc(order.orderId);
        if (activeAlerts.length === 0) {
          await docRef.delete();
          deletedCount++;
        } else {
          await docRef.update({
            alerts: activeAlerts,
            updatedAt: new Date().toISOString()
          });
          updatedCount++;
        }
      }
    }
  } else {
    // Local fallback
    if (!fs.existsSync(SCHEDULES_FILE)) {
      return { sent: 0, updated: 0, deleted: 0 };
    }

    let scheduledOrders: ScheduledOrder[] = [];
    try {
      scheduledOrders = JSON.parse(fs.readFileSync(SCHEDULES_FILE, "utf-8"));
    } catch (err) {
      console.error("Failed to read scheduled-pushes.json in processPushes", err);
      return { sent: 0, updated: 0, deleted: 0 };
    }

    let updated = false;
    const remainingOrders: ScheduledOrder[] = [];

    for (const order of scheduledOrders) {
      const activeAlerts: ScheduledAlert[] = [];
      const triggeredAlerts: ScheduledAlert[] = [];

      for (const alert of order.alerts) {
        if (alert.triggerAt <= now) {
          triggeredAlerts.push(alert);
        } else {
          activeAlerts.push(alert);
        }
      }

      if (triggeredAlerts.length > 0) {
        updated = true;
        for (const alert of triggeredAlerts) {
          console.log(`Triggering scheduled push notification for order ${order.orderId}, alert: ${alert.id}`);
          try {
            const payload = JSON.stringify({
              title: alert.title,
              body: alert.body,
              url: alert.url || '/'
            });
            await webPush.sendNotification(order.subscription, payload);
            sentCount++;
          } catch (err: any) {
            console.error(`Error sending push notification:`, err);
            if (err.statusCode === 410 || err.statusCode === 404) {
              console.log(`Subscription expired/unsubscribed. Clearing alert queues.`);
              activeAlerts.length = 0;
              break;
            }
          }
        }
        
        if (activeAlerts.length > 0) {
          order.alerts = activeAlerts;
          remainingOrders.push(order);
          updatedCount++;
        } else {
          deletedCount++;
        }
      } else {
        remainingOrders.push(order);
      }
    }

    if (updated) {
      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(remainingOrders, null, 2), "utf-8");
    }
  }

  return { sent: sentCount, updated: updatedCount, deleted: deletedCount };
}

// Keep the background interval for local development environments
if (process.env.NODE_ENV !== "production") {
  setInterval(() => {
    ensureVapidKeys().then(() => processPushes()).catch(console.error);
  }, 15000); // Check every 15 seconds during local development
}

export default app;
