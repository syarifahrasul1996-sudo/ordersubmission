import express from "express";
import path from "path";
import fs from "fs";
import webPush from "web-push";

const app = express();
app.use(express.json());

const isVercel = process.env.VERCEL === '1';
const storageDir = isVercel ? "/tmp" : process.cwd();

// VAPID keys setup
const KEY_FILE = path.join(storageDir, "vapid-keys.json");
let vapidKeys = { publicKey: "", privateKey: "" };

if (fs.existsSync(KEY_FILE)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(KEY_FILE, "utf-8"));
  } catch (err) {
    console.warn("Failed to read VAPID key file, generating new one", err);
  }
}

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  vapidKeys = webPush.generateVAPIDKeys();
  try {
    fs.writeFileSync(KEY_FILE, JSON.stringify(vapidKeys, null, 2), "utf-8");
  } catch(e) {
    console.warn("Could not write vapid keys to disk:", e);
  }
}

webPush.setVapidDetails(
  "mailto:syarifahrasul1996@gmail.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

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

let scheduledOrders: ScheduledOrder[] = [];
const SCHEDULES_FILE = path.join(storageDir, "scheduled-pushes.json");

function loadScheduledOrders() {
  if (fs.existsSync(SCHEDULES_FILE)) {
    try {
      scheduledOrders = JSON.parse(fs.readFileSync(SCHEDULES_FILE, "utf-8"));
      console.log(`Loaded ${scheduledOrders.length} scheduled orders from storage`);
    } catch (err) {
      console.error("Failed to read scheduled orders file:", err);
    }
  }
}

function saveScheduledOrders() {
  try {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(scheduledOrders, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save scheduled orders file:", err);
  }
}

loadScheduledOrders();

// API to get public VAPID key for subscription
app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// API to schedule/update/delete push notifications for any order
app.post("/api/schedule-push", (req, res) => {
  try {
    const { orderId, subscription, alerts } = req.body;
    if (!orderId || !subscription) {
      return res.status(400).json({ error: "Missing required fields: orderId, subscription" });
    }

    // Remove existing schedule for this orderId
    scheduledOrders = scheduledOrders.filter(o => o.orderId !== orderId);

    // Add new alerts if any
    if (alerts && alerts.length > 0) {
      scheduledOrders.push({
        orderId,
        subscription,
        alerts
      });
    }
    saveScheduledOrders();
    res.json({ success: true, count: alerts ? alerts.length : 0 });
  } catch (err: any) {
    console.error("Error scheduling push alerts:", err);
    res.status(500).json({ error: err.message });
  }
});

// For Vercel Cron or manual trigger
app.get("/api/cron/process-pushes", async (req, res) => {
  await processPushes();
  res.json({ success: true, processed: true });
});

async function processPushes() {
  const now = Date.now();
  let updated = false;

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
        } catch (err: any) {
          console.error(`Error sending push notification:`, err);
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`Subscription expired/unsubscribed. Clearing alert queues.`);
            order.alerts = [];
            break;
          }
        }
      }
      order.alerts = activeAlerts;
    }
  }

  const initialCount = scheduledOrders.length;
  scheduledOrders = scheduledOrders.filter(order => order.alerts.length > 0);

  if (scheduledOrders.length !== initialCount || updated) {
    saveScheduledOrders();
  }
}

// Keep the background interval for non-Vercel environments (like Cloud Run)
if (!isVercel) {
  setInterval(processPushes, 15000); // Check every 15 seconds
}

export default app;
