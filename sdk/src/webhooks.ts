import crypto from 'crypto';

export function verifyWebhook(headers: Record<string, string>, rawBody: string, secret: string, toleranceSec = 300): boolean {
  const sigHeader = headers['ship-signature'] || headers['Ship-Signature'];
  if (!sigHeader) return false;

  const parts = sigHeader.split(',');
  let t: number | null = null;
  let v1: string | null = null;
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === 't') t = parseInt(v, 10);
    if (k === 'v1') v1 = v;
  }
  if (!t || !v1) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > toleranceSec) return false;

  const payload = `${t}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(hmac));
}
