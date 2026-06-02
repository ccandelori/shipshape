import { pool } from '../../db/client.js';

// Pure-ish matcher for active subscriptions per event + app.

export interface WebhookSubscription {
  id: string;
  app_id: string;
  event_type: string;
  target_url: string;
  secret: string;
}

export async function findSubscriptionsForEvent(eventType: string, appId?: string): Promise<WebhookSubscription[]> {
  const params: any[] = [eventType];
  let query = `SELECT id, app_id, event_type, target_url, secret FROM webhook_subscriptions WHERE event_type = $1 AND active = true`;
  if (appId) {
    query += ` AND app_id = $2`;
    params.push(appId);
  }
  const res = await pool.query(query, params);
  return res.rows;
}
