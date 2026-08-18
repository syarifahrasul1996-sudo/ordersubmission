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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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

  const FIRESTORE_DATABASE_ID =
    process.env.FIRESTORE_DATABASE_ID ||
    "ai-studio-ordersubmission-812e5ca5-4c13-4685-aeb6-9c38e1052adb";

  try {
    db = getFirestore(adminApp, FIRESTORE_DATABASE_ID);
    console.log(
      `[Firebase Admin] Firestore database: ${FIRESTORE_DATABASE_ID}`
    );
    messaging = getMessaging(adminApp);
  } catch (err) {
    console.error("[Firebase Admin] Error accessing services:", err);
  }

  // =========================================================================
  // FCM Push Notification Endpoints (Path B - Anonymous Installation Model)
  // Secure per-installation self-test mechanism using cryptographic secret token
  // Single Source of Truth: Cloud Firestore (No In-Memory Fallback)
  // =========================================================================

  // 1. Register Firebase Installation ID (FID) atomically using a Firestore Transaction
  app.post("/api/push/register", async (req, res) => {
    try {
      const { fid, secret } = req.body;

      if (!fid || typeof fid !== "string" || fid.trim() === "") {
        return res.status(400).json({ success: false, error: "Invalid or missing 'fid' in request body" });
      }

      if (!db) {
        console.error("[FCM Server] Firestore is not initialized");
        return res.status(503).json({ success: false, error: "Firestore database service is unavailable" });
      }

      const cleanFid = fid.trim();
      const safeDocId = crypto.createHash("sha256").update(cleanFid).digest("hex");
      const docRef = db.collection("pushInstallations").doc(safeDocId);

      // Perform atomic read-modify-write inside a Firestore transaction
      const txResult = await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(docRef);

        if (!docSnap.exists) {
          // Brand-new FID: Generate a cryptographically random secret associated strictly with this installation
          const newSecret = crypto.randomBytes(24).toString("hex");
          const secretHash = crypto.createHash("sha256").update(newSecret).digest("hex");

          transaction.set(docRef, {
            fid: cleanFid,
            secretHash,
            enabled: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          return { status: 200, isNew: true, secret: newSecret };
        } else {
          // Existing FID: Require the existing installation secret
          if (!secret || typeof secret !== "string" || secret.trim() === "") {
            return { status: 401, error: "Missing installation secret for existing registration." };
          }

          const docData = docSnap.data();
          const providedHash = crypto.createHash("sha256").update(secret.trim()).digest("hex");
          const storedHash = docData?.secretHash;

          if (!storedHash || !timingSafeCompare(storedHash, providedHash)) {
            return { status: 403, error: "Unauthorized: Invalid installation secret for this FID." };
          }

          transaction.update(docRef, {
            enabled: true,
            updatedAt: FieldValue.serverTimestamp(),
          });

          return { status: 200, isNew: false };
        }
      });

      if (txResult.status === 401) {
        return res.status(401).json({ success: false, error: txResult.error });
      }
      if (txResult.status === 403) {
        return res.status(403).json({ success: false, error: txResult.error });
      }

      if (txResult.isNew) {
        console.log(`[FCM Server] Registered new anonymous FID in Firestore: ...${cleanFid.slice(-8)}`);
        return res.json({ success: true, fid: cleanFid, secret: txResult.secret, registered: true });
      } else {
        console.log(`[FCM Server] Re-registered existing FID in Firestore: ...${cleanFid.slice(-8)}`);
        return res.json({ success: true, fid: cleanFid, registered: true });
      }
    } catch (err: any) {
      console.error("[FCM Server] Error in /api/push/register transaction:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed to persist FID to Firestore" });
    }
  });

  // 2. Unregister Firebase Installation ID (FID) with Firestore verification
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

      if (!db) {
        console.error("[FCM Server] Firestore is not initialized");
        return res.status(503).json({ success: false, error: "Firestore database service is unavailable" });
      }

      const cleanFid = fid.trim();
      const safeDocId = crypto.createHash("sha256").update(cleanFid).digest("hex");
      const docRef = db.collection("pushInstallations").doc(safeDocId);

      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({
          success: false,
          error: "Installation ID not found in registered devices.",
        });
      }

      const docData = docSnap.data();
      const providedHash = crypto.createHash("sha256").update(secret.trim()).digest("hex");
      const storedHash = docData?.secretHash;

      if (!storedHash || !timingSafeCompare(storedHash, providedHash)) {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: Invalid installation secret. You cannot unregister another installation's FID.",
        });
      }

      await docRef.update({
        enabled: false,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(`[FCM Server] Unregistered FID in Firestore: ...${cleanFid.slice(-8)}`);
      return res.json({ success: true, unregistered: true });
    } catch (err: any) {
      console.error("[FCM Server] Error in /api/push/unregister:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed to unregister FID in Firestore" });
    }
  });

  // 3. Send Test FCM Notification with strict Firestore installation ownership verification
  app.post("/api/push/send-test", async (req, res) => {
    try {
      const { fid, secret, title, body } = req.body;

      if (!fid || typeof fid !== "string" || fid.trim() === "") {
        return res.status(400).json({ success: false, error: "Missing or invalid 'fid' parameter" });
      }

      if (!secret || typeof secret !== "string" || secret.trim() === "") {
        return res.status(401).json({
          success: false,
          error: "Missing installation credentials. Test notifications are restricted to the registered device owner.",
        });
      }

      if (!db) {
        return res.status(503).json({ success: false, error: "Firestore database service is unavailable on server" });
      }

      if (!messaging) {
        return res.status(503).json({ success: false, error: "Firebase Messaging service is not initialized on server" });
      }

      const targetFid = fid.trim();
      const safeDocId = crypto.createHash("sha256").update(targetFid).digest("hex");
      const docRef = db.collection("pushInstallations").doc(safeDocId);

      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({
          success: false,
          error: "Installation ID not found in registered devices.",
        });
      }

      const docData = docSnap.data();
      if (!docData || !docData.enabled) {
        return res.status(400).json({
          success: false,
          error: "Installation is disabled or unregistered.",
        });
      }

      const providedHash = crypto.createHash("sha256").update(secret.trim()).digest("hex");
      const storedHash = docData.secretHash;

      if (!storedHash || !timingSafeCompare(storedHash, providedHash)) {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: Invalid installation secret. You cannot send notifications to another installation's FID.",
        });
      }

      if (!messaging) {
        return res.status(503).json({ success: false, error: "Firebase Messaging service is not initialized on server" });
      }

      const notificationTitle = (title && typeof title === "string") ? title.slice(0, 100) : "🔥 Test FCM Notification";
      const notificationBody = (body && typeof body === "string") ? body.slice(0, 300) : "Firebase Cloud Messaging is active and working properly!";

      console.log(`[FCM Server] Sending authenticated test message to FID: ...${targetFid.slice(-8)}`);

      const messagePayload = {
        fid: targetFid,
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        webpush: {
          notification: {
            icon: "https://i.imgur.com/49kNDoe.png",
            badge: "https://i.imgur.com/49kNDoe.png",
          },
          data: {
            url: "/",
            source: "fcm_test",
            timestamp: String(Date.now()),
          },
        },
      };

      const messageId = await messaging.send(messagePayload);
      console.log("[FCM Server] Test message sent successfully! MessageId:", messageId);

      return res.json({
        success: true,
        messageId,
        sentToFid: targetFid,
      });
    } catch (err: any) {
      console.error("[FCM Server] Error sending FCM message via Admin SDK:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Failed to send FCM notification via Firebase Admin SDK",
      });
    }
  });

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
