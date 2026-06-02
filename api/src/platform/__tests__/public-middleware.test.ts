import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { publicContext } from '../middleware/publicContext.js';
import { oauthBearerAuth } from '../middleware/oauthBearerAuth.js';
import { scopeEnforcer } from '../middleware/scopeEnforcer.js';
import { generateRequestId } from '../../utils/requestId.js';

describe('public middleware foundation', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use((req, res, next) => {
      (req as any).requestId = generateRequestId();
      next();
    });
    app.use(publicContext);
    app.use(oauthBearerAuth);
    app.use(scopeEnforcer(['documents:read']));
    app.get('/test', (req, res) => {
      res.json({
        ok: true,
        client: (req as any).oauthClientId,
        scopes: (req as any).grantedScopes,
        request_id: (req as any).requestId,
      });
    });
    // Public error handler for the test app
    app.use((err: any, req: any, res: any, next: any) => {
      const rid = req.requestId || 'unknown';
      res.status(err.status || 500).json({
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'error',
        request_id: rid,
      });
    });
  });

  it('attaches request_id and public context on success path (with stub auth)', async () => {
    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer valid-stub-token-1234567890');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.request_id).toBeDefined();
    expect(typeof res.body.request_id).toBe('string');
    expect(res.body.client).toBe('stub-client');
  });

  it('returns PublicApiError shape with specific code on missing bearer', async () => {
    const res = await request(app).get('/test');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      code: 'PUBLIC_TOKEN_INVALID',
      message: expect.stringContaining('Missing or invalid'),
      request_id: expect.any(String),
    });
  });

  it('returns PUBLIC_SCOPE_INSUFFICIENT when scope not granted (stub)', async () => {
    // Temporarily override for this test by mounting a stricter enforcer
    const strictApp = express();
    strictApp.use((req, res, next) => { (req as any).requestId = generateRequestId(); next(); });
    strictApp.use(publicContext);
    strictApp.use(oauthBearerAuth);
    strictApp.use(scopeEnforcer(['documents:write'])); // stricter than granted stub
    strictApp.get('/strict', (req, res) => res.json({ ok: true }));

    const res = await request(strictApp)
      .get('/strict')
      .set('Authorization', 'Bearer valid-stub-token-1234567890');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PUBLIC_SCOPE_INSUFFICIENT');
    expect(res.body.request_id).toBeDefined();
  });
});
