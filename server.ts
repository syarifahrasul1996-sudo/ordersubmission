import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import webPush from 'web-push';

interface ScheduledAlert {
  id: string;
  triggerAt: number;
  title: string;
  body: string;
  url?: string;
}

interface ScheduledOrder {
  orderId: string;
  subscription: webPush.PushSubscription;
  alerts: ScheduledAlert[];
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return fallback;
    return JSON.parse(content) as T;
  } catch (error) {
    console.warn(`Unable to read ${path.basename(filePath)}:`, error);
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function isPushSubscription(value: unknown): value is webPush.PushSubscription {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<webPush.PushSubscription>;
  return typeof candidate.endpoint === 'string' && candidate.endpoint.startsWith('http');
}

function normalizeAlerts(value: unknown): ScheduledAlert[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value.slice(0, 10).flatMap((alert): ScheduledAlert[] => {
    if (!alert || typeof alert !== 'object') return [];
    const candidate = alert as Partial<ScheduledAlert>;
    const triggerAt = Number(candidate.triggerAt);
    const title = String(candidate.title || '').trim().slice(0, 120);
    const body = String(candidate.body || '').trim().slice(0, 500);
    if (!candidate.id || !Number.isFinite(triggerAt) || triggerAt < now - 60_000 || !title || !body) return [];
    return [{
      id: String(candidate.id).slice(0, 80),
      triggerAt,
      title,
      body,
      url: typeof candidate.url === 'string' && candidate.url.startsWith('/') ? candidate.url : '/'
    }];
  });
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const dataDirectory = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : process.cwd();
  fs.mkdirSync(dataDirectory, { recursive: true });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const keyFile = path.join(dataDirectory, 'vapid-keys.json');
  let vapidKeys = readJsonFile<{ publicKey: string; privateKey: string }>(keyFile, { publicKey: '', privateKey: '' });
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    vapidKeys = webPush.generateVAPIDKeys();
    writeJsonFile(keyFile, vapidKeys);
  }

  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  webPush.setVapidDetails(vapidSubject, vapidKeys.publicKey, vapidKeys.privateKey);

  const schedulesFile = path.join(dataDirectory, 'scheduled-pushes.json');
  let scheduledOrders = readJsonFile<ScheduledOrder[]>(schedulesFile, []).filter(order =>
    Boolean(order?.orderId) && isPushSubscription(order?.subscription) && Array.isArray(order?.alerts)
  );

  const saveScheduledOrders = () => {
    try {
      writeJsonFile(schedulesFile, scheduledOrders);
    } catch (error) {
      console.error('Failed to save scheduled push notifications:', error);
    }
  };

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/vapid-public-key', (_req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post('/api/schedule-push', (req, res) => {
    const orderId = String(req.body?.orderId || '').trim().slice(0, 160);
    const subscription = req.body?.subscription;
    if (!orderId || !isPushSubscription(subscription)) {
      return res.status(400).json({ error: 'A valid orderId and push subscription are required.' });
    }

    const alerts = normalizeAlerts(req.body?.alerts);
    const endpoint = subscription.endpoint;
    scheduledOrders = scheduledOrders.filter(order =>
      !(order.orderId === orderId && order.subscription.endpoint === endpoint)
    );

    if (alerts.length > 0) scheduledOrders.push({ orderId, subscription, alerts });
    saveScheduledOrders();
    return res.json({ success: true, count: alerts.length });
  });

  app.post('/api/generate-letter', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(503).json({ error: 'Gemini API key is not configured on the server.' });

      const customerDetails = req.body?.customerDetails ?? {};
      const templateContent = String(req.body?.templateContent || '').slice(0, 50_000);
      const documentMode = req.body?.documentMode === 'agreement' ? 'agreement' : 'letter';
      const language = req.body?.language === 'English' ? 'English' : 'Melayu';
      const serializedDetails = JSON.stringify(customerDetails, null, 2).slice(0, 30_000);

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
You are a professional document generation assistant.

DOCUMENT_MODE: ${documentMode}
LANGUAGE: ${language}

If DOCUMENT_MODE is "agreement":
- Preserve all wording, clauses, numbering, headings, schedules and signature blocks.
- Replace editable information only.
- Do not rewrite legal clauses.

If DOCUMENT_MODE is "letter":
- Use TEMPLATE_CONTENT as a guide, not a strict contract.
- Keep the same purpose and formal structure.
- You may improve wording, flow and grammar.
- If TEMPLATE_CONTENT is empty, generate a suitable formal letter from CUSTOMER_DETAILS.
- Use Bahasa Melayu Malaysia when LANGUAGE is Melayu.
- Do not invent facts.

For all documents:
- Use CUSTOMER_DETAILS as the source of truth.
- If data is missing, leave a suitable placeholder.
- Return plain text only.

CUSTOMER_DETAILS:
${serializedDetails}

TEMPLATE_CONTENT:
${templateContent}
`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
        contents: prompt
      });

      const text = response.text?.trim();
      if (!text) throw new Error('The AI service returned an empty response.');
      return res.json({ text });
    } catch (error) {
      console.error('Error generating letter:', error);
      const message = error instanceof Error ? error.message : 'Unknown generation error';
      return res.status(500).json({ error: message });
    }
  });

  const processPushes = async () => {
    const now = Date.now();
    let changed = false;
    const nextSchedules: ScheduledOrder[] = [];

    for (const order of scheduledOrders) {
      const remainingAlerts: ScheduledAlert[] = [];
      let subscriptionExpired = false;

      for (const alert of order.alerts) {
        if (alert.triggerAt > now) {
          remainingAlerts.push(alert);
          continue;
        }

        changed = true;
        try {
          await webPush.sendNotification(order.subscription, JSON.stringify({
            title: alert.title,
            body: alert.body,
            url: alert.url || '/'
          }));
        } catch (error: unknown) {
          const statusCode = typeof error === 'object' && error && 'statusCode' in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;
          if (statusCode === 404 || statusCode === 410) {
            subscriptionExpired = true;
            break;
          }
          console.error(`Failed to send push alert ${alert.id} for order ${order.orderId}:`, error);
        }
      }

      if (!subscriptionExpired && remainingAlerts.length > 0) {
        nextSchedules.push({ ...order, alerts: remainingAlerts });
      } else if (subscriptionExpired || remainingAlerts.length !== order.alerts.length) {
        changed = true;
      }
    }

    if (changed || nextSchedules.length !== scheduledOrders.length) {
      scheduledOrders = nextSchedules;
      saveScheduledOrders();
    }
  };

  const pushTimer = setInterval(() => {
    processPushes().catch(error => console.error('Push scheduler tick failed:', error));
  }, 15_000);
  pushTimer.unref();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer().catch(error => {
  console.error('Server failed to start:', error);
  process.exitCode = 1;
});
