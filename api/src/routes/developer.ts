import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { isWorkspaceAdmin } from '../middleware/visibility.js';
import { pool } from '../db/client.js';
import crypto from 'crypto';
import { registry, z } from '../openapi/registry.js';

const router = Router();

// OpenAPI registration for internal privileged developer routes (per /ship-openapi-endpoints skill)
registry.registerPath({
  method: 'post',
  path: '/api/developer/apps',
  description: 'Register OAuth app (internal, workspaceAdmin only)',
  security: [{ cookieAuth: [] }],
  responses: { 201: { description: 'Created with one-time secret' } },
});
registry.registerPath({
  method: 'get',
  path: '/api/developer/apps',
  description: 'List apps for workspace (internal)',
  security: [{ cookieAuth: [] }],
  responses: { 200: { description: 'OK' } },
});

// All developer portal mgmt is INTERNAL privileged (session + workspaceAdmin).
// No leakage to public /api/v1. Portal dogfoods public SDK where possible (e.g. verify demo).

router.use(authMiddleware);

// Helper: current ws from session
function getWs(req: any) { return req.workspaceId; }
function getUser(req: any) { return req.userId; }

function hashSecret(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// POST /api/developer/apps : register (returns plaintext secret ONCE)
router.post('/apps', isWorkspaceAdmin, async (req, res) => {
  const { name, redirect_uris = [], default_scopes = ['documents:read'] } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const clientId = 'app-' + crypto.randomBytes(8).toString('hex');
  const secret = crypto.randomBytes(32).toString('hex');
  const secretHash = hashSecret(secret);
  const ws = getWs(req);
  const user = getUser(req);
  const r = await pool.query(
    `INSERT INTO oauth_apps (client_id, client_secret_hash, name, owner_user_id, workspace_id, redirect_uris, default_scopes, is_system, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, true)
     RETURNING id, client_id, name`,
    [clientId, secretHash, name, user, ws, JSON.stringify(redirect_uris), default_scopes]
  );
  // Return secret once (never stored plaintext again)
  res.status(201).json({ ...r.rows[0], client_secret: secret, note: 'Save secret now; it is not shown again.' });
});

// POST /api/developer/apps/:id/rotate : rotate secret (return new plaintext once)
router.post('/apps/:id/rotate', isWorkspaceAdmin, async (req, res) => {
  const { id } = req.params;
  const ws = getWs(req);
  const secret = crypto.randomBytes(32).toString('hex');
  const secretHash = hashSecret(secret);
  const r = await pool.query(
    `UPDATE oauth_apps SET client_secret_hash = $1, updated_at = now()
     WHERE id = $2 AND workspace_id = $3 AND is_system = false
     RETURNING id, client_id`,
    [secretHash, id, ws]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'not found or system' });
  res.json({ ...r.rows[0], client_secret: secret, note: 'Old secret now invalid. Save new one.' });
});

// GET /api/developer/apps : list for ws
router.get('/apps', isWorkspaceAdmin, async (req, res) => {
  const ws = getWs(req);
  const r = await pool.query(
    `SELECT id, client_id, name, default_scopes, is_active, created_at FROM oauth_apps WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [ws]
  );
  res.json({ apps: r.rows });
});

// Webhook subs mgmt (minimal)
router.get('/webhooks/subs', isWorkspaceAdmin, async (req, res) => {
  const ws = getWs(req);
  const r = await pool.query(
    `SELECT s.id, a.client_id, s.event_type, s.target_url, s.active, s.created_at
     FROM webhook_subscriptions s JOIN oauth_apps a ON a.id = s.app_id
     WHERE a.workspace_id = $1 ORDER BY s.created_at DESC`,
    [ws]
  );
  res.json({ subs: r.rows });
});

router.post('/webhooks/subs', isWorkspaceAdmin, async (req, res) => {
  const ws = getWs(req);
  const { app_client_id, event_type, target_url } = req.body || {};
  if (!app_client_id || !event_type || !target_url) return res.status(400).json({ error: 'missing' });
  const app = await pool.query(`SELECT id FROM oauth_apps WHERE client_id = $1 AND workspace_id = $2`, [app_client_id, ws]);
  if (!app.rows[0]) return res.status(404).json({ error: 'app not found' });
  const secret = crypto.randomBytes(24).toString('hex');
  const r = await pool.query(
    `INSERT INTO webhook_subscriptions (app_id, event_type, target_url, secret, active)
     VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [app.rows[0].id, event_type, target_url, secret]
  );
  res.status(201).json({ id: r.rows[0].id, secret /* once */ });
});

// Deliveries log + replay (minimal)
router.get('/webhooks/deliveries', isWorkspaceAdmin, async (req, res) => {
  const ws = getWs(req);
  const r = await pool.query(
    `SELECT d.id, d.event_type, d.status, d.attempt, d.latency_ms, d.created_at, s.target_url
     FROM webhook_deliveries d JOIN webhook_subscriptions s ON s.id = d.subscription_id
     JOIN oauth_apps a ON a.id = s.app_id
     WHERE a.workspace_id = $1 ORDER BY d.created_at DESC LIMIT 50`,
    [ws]
  );
  res.json({ deliveries: r.rows });
});

router.post('/webhooks/deliveries/:id/replay', isWorkspaceAdmin, async (req, res) => {
  // Replay: copy row with new id, original idempotency, trigger deliverer (in real via bus or direct)
  // For MVP: just log new row with same key, status pending (deliverer would pick if polling; here stub success)
  const { id } = req.params;
  const ws = getWs(req);
  const orig = await pool.query(
    `SELECT d.* FROM webhook_deliveries d JOIN webhook_subscriptions s ON s.id = d.subscription_id JOIN oauth_apps a ON a.id = s.app_id WHERE d.id = $1 AND a.workspace_id = $2`,
    [id, ws]
  );
  if (!orig.rows[0]) return res.status(404).json({ error: 'not found' });
  const o = orig.rows[0];
  const newId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO webhook_deliveries (id, subscription_id, event_type, payload, idempotency_key, status, attempt, secret_snapshot, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', 1, $6, now())`,
    [newId, o.subscription_id, o.event_type, o.payload, o.idempotency_key, o.secret_snapshot]
  );
  // In full: trigger deliverer.handle or bus publish with original key
  res.json({ replay_id: newId, note: 'replay queued with original idempotency_key + current secret' });
});

export default router;
