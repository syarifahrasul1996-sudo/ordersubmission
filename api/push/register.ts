import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const fid = typeof req.body?.fid === 'string' ? req.body.fid.trim() : '';
  const secret =
    typeof req.body?.secret === 'string' && req.body.secret.trim()
      ? req.body.secret.trim()
      : `loc_${Math.random().toString(36).slice(2, 12)}`;

  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      success: true,
      fid,
      secret,
      registered: true,
      activeDevicesCount: 1,
    })
  );
}
