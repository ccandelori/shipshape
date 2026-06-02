import { IEventBus, DomainEvent } from '../events/IEventBus.js';
import { findSubscriptionsForEvent } from './matcher.js';
import { sign } from './signer.js';
import { pool } from '../../db/client.js';

// Real in-process deliverer per plan (U4/U7).
// Exact backoff: 1s,4s,16s,1m,5m,30m (6 attempts total).
// 2xx success; 4xx permanent DLQ (failed_permanent); 5xx/timeout/network retry up to 6 then dlq.
// Records every attempt to webhook_deliveries with correct columns + secret_snapshot at sign time.
// Supports replay via deliverWithSecretSnapshot (uses snapshot, not current sub secret).
// stop() clears pending retry timers (P1 hardening).

const BACKOFF = [1000, 4000, 16000, 60000, 300000, 1800000]; // ms

export class WebhookDeliverer {
  private running = false;
  private pending: Map<string, any> = new Map(); // id -> state
  private timers: Map<string, NodeJS.Timeout> = new Map(); // id -> retry timer for drain

  constructor(private bus: IEventBus) {}

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[webhook-deliverer] started');
  }

  stop() {
    this.running = false;
    // Drain: clear all pending retry timers (no new attempts after stop)
    for (const t of this.timers.values()) {
      clearTimeout(t);
    }
    this.timers.clear();
    // Pending in-flight (no timer) are abandoned on hard kill; graceful gives time for attempts to finish
    console.log('[webhook-deliverer] stopped (timers cleared)');
  }

  async handleEvent(event: DomainEvent) {
    if (!this.running) return;
    const subs = await findSubscriptionsForEvent(event.type);
    for (const sub of subs) {
      const deliveryId = 'del-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      this.pending.set(deliveryId, { sub, event, attempt: 1, idempotency: event.idempotencyKey });
      this.attemptDelivery(deliveryId);
    }
  }

  // For replay (uses snapshot secret from historical delivery row)
  async deliverWithSecretSnapshot(subscriptionId: string, payload: any, idempotencyKey: string, secretSnapshot: string) {
    if (!this.running) return;
    const sres = await pool.query(
      `SELECT id as subscription_id, target_url, event_type FROM webhook_subscriptions WHERE id = $1 AND active = true`,
      [subscriptionId]
    );
    if (!sres.rows[0]) return;
    const sub = { ...sres.rows[0], secret: secretSnapshot }; // override for this replay only
    const deliveryId = 'replay-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const event = { type: sub.event_type, payload, idempotencyKey };
    this.pending.set(deliveryId, { sub, event, attempt: 1, idempotency: idempotencyKey });
    this.attemptDelivery(deliveryId);
  }

  private async attemptDelivery(id: string) {
    const state = this.pending.get(id);
    if (!state) return;
    const { sub, event, attempt, idempotency } = state;
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(event.payload);
    const signature = sign(body, sub.secret, ts);

    const start = Date.now();
    let resStatus: number | null = null;
    let excerpt = '';
    let success = false;
    let permanent = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(sub.target_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotency || id,
          'Ship-Signature': signature,
          'User-Agent': 'Ship-Webhook-Deliverer/1.0',
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      resStatus = res.status;
      try {
        const text = await res.text();
        excerpt = text.slice(0, 200);
      } catch {}
      if (resStatus >= 200 && resStatus < 300) {
        success = true;
      } else if (resStatus >= 400 && resStatus < 500) {
        permanent = true;
      }
    } catch (e: any) {
      // timeout / network / abort -> treat as retryable (5xx equiv)
      resStatus = null;
      excerpt = String(e && e.message || 'fetch error');
    }

    const latency = Date.now() - start;

    // Record attempt (use correct schema cols from 046/047)
    try {
      const status = success ? 'success' : (permanent ? 'failed_permanent' : (attempt >= 6 ? 'dlq' : 'pending'));
      await pool.query(
        `INSERT INTO webhook_deliveries (subscription_id, event_type, event_payload, idempotency_key, attempt_number, status, response_status, response_excerpt, latency_ms, signed_at, secret_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), $11)`,
        [sub.id || sub.subscription_id, sub.event_type, event.payload, idempotency, attempt, status, resStatus, excerpt, latency, ts, sub.secret]
      );
    } catch (dbErr) {
      console.error('[deliverer] deliveries insert failed', dbErr);
    }

    if (success) {
      this.pending.delete(id);
      this.timers.delete(id);
      return;
    }

    if (permanent || attempt >= 6) {
      this.pending.delete(id);
      this.timers.delete(id);
      return;
    }

    // retry
    const delay = BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)];
    state.attempt = attempt + 1;
    const t = setTimeout(() => this.attemptDelivery(id), delay);
    this.timers.set(id, t);
  }
}
