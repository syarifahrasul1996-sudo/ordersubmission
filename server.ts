import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import webPush from "web-push";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // VAPID keys setup
  const KEY_FILE = path.join(process.cwd(), "vapid-keys.json");
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
    fs.writeFileSync(KEY_FILE, JSON.stringify(vapidKeys, null, 2), "utf-8");
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
  const SCHEDULES_FILE = path.join(process.cwd(), "scheduled-pushes.json");

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
  app.get("/api/vapid-public-key", (_req, res) => {
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



  // Background tick to process pending push notifications
  setInterval(async () => {
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
              console.log(`Subscription expired/unsubscribed (status ${err.statusCode}). Clearing alert queues.`);
              order.alerts = []; // Clear current queue for this subscriber
              break;
            }
          }
        }
        order.alerts = activeAlerts;
      }
    }

    // Filter out orders with empty alerts queues
    const initialCount = scheduledOrders.length;
    scheduledOrders = scheduledOrders.filter(order => order.alerts.length > 0);
    if (scheduledOrders.length !== initialCount || updated) {
      saveScheduledOrders();
    }
  }, 15000); // Check every 15 seconds


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
