import { IEventBus, DomainEvent } from '../events/IEventBus.js';
import { findSubscriptionsForEvent } from './matcher.js';
import { sign, verify } from './signer.js';
import https from 'https';

// Basic in-process deliverer for MVP per plan.
// Exact backoff: 1s,4s,16s,1m,5m,30m
// 4xx permanent, 5xx/timeout retry, DLQ after 6, replay with original key.

const BACKOFF = [1000, 4000, 16000, 60000, 300000, 1800000]; // ms

export class WebhookDeliverer {
  private running = false;
  private pending: Map<string, any> = new Map(); // id -> delivery state

  constructor(private bus: IEventBus) {
    // In real, subscribe to bus or poll DB
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[webhook-deliverer] started');
    // For skeleton, the handleEvent is called from publish in bus for demo
  }

  stop() {
    this.running = false;
    console.log('[webhook-deliverer] stopped');
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

  private async attemptDelivery(id: string) {
    const state = this.pending.get(id);
    if (!state) return;
    const { sub, event, attempt, idempotency } = state;
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(event.payload);
    const signature = sign(body, sub.secret, ts);

    // Real delivery would use undici/fetch with timeout here (MVP skeleton simulates for wiring tests)
    console.log(`[deliverer] attempt ${attempt} for ${sub.event_type} to ${sub.target_url} sig=${signature}`);

    // Simulate success for skeleton (in real: actual fetch, classify 4xx permanent vs 5xx retry)
    const success = true;
    if (success) {
      console.log(`[deliverer] success for ${id}`);
      this.pending.delete(id);
      // In real: insert to deliveries table with status success
    } else {
      if (attempt >= 6) {
        console.log(`[deliverer] DLQ ${id}`);
        this.pending.delete(id);
      } else {
        const delay = BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)];
        state.attempt = attempt + 1;
        setTimeout(() => this.attemptDelivery(id), delay);
      }
    }
  }
}
