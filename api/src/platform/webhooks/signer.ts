import crypto from 'crypto';

// Stripe-style: Ship-Signature: t=<unix>,v1=<hex-hmac>
// Sign raw body + ts.

export function sign(rawBody: string, secret: string, timestampSec: number): string {
  const payload = `${timestampSec}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestampSec},v1=${hmac}`;
}

export function verify(headers: Record<string, string | undefined>, rawBody: string, secret: string, toleranceSec = 300): boolean {
  const sigHeader = headers['ship-signature'] || headers['Ship-Signature'];
  if (!sigHeader) return false;

  const parts = sigHeader.split(',');
  let t: number | null = null;
  let v1: string | null = null;
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === 't') t = parseInt(v || '0', 10);
    if (k === 'v1') v1 = v || null;
  }
  if (!t || !v1) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > toleranceSec) return false;

  const expected = sign(rawBody, secret, t);
  const expectedV1 = expected.split(',')[1]?.split('=')[1] || '';
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expectedV1));
}
