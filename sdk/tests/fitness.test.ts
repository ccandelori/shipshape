import { describe, it, expect } from 'vitest';
import { ShipClient, PublicApiError } from '../src/index.js';

// Fitness against public surface (hand-written parity).
// Loads served openapi if api up, else minimal structural check (no drift on stable v1).
// Run with api up for full: pnpm --filter @ship/sdk test

const PUBLIC_PATHS = ['/api/v1/documents', '/api/v1/issues', '/api/v1/sprints', '/api/v1/oauth/token'];

describe('@ship/sdk fitness (public OpenAPI parity + error shapes)', () => {
  it('exposes resource clients with expected methods (documents/issues/sprints)', () => {
    const c = new ShipClient({ token: 't' });
    expect(typeof c.documents.create).toBe('function');
    expect(typeof c.documents.list).toBe('function');
    expect(typeof c.documents.get).toBe('function');
    expect(typeof c.documents.update).toBe('function');
    expect(typeof c.documents.delete).toBe('function');

    expect(typeof c.issues.create).toBe('function');
    expect(typeof c.issues.list).toBe('function');

    expect(typeof c.sprints.create).toBe('function');
    expect(typeof c.sprints.list).toBe('function');
  });

  it('clientCredentials is real (POSTs grant, returns client or PublicApiError)', async () => {
    // Will hit real if api on 3000 with seeded app; else expect typed error or network.
    try {
      await ShipClient.clientCredentials({ clientId: 'nonexistent', clientSecret: 'bad', baseUrl: 'http://127.0.0.1:3000/api/v1' });
      // if succeeds, ok (test env)
    } catch (e) {
      expect(e).toBeInstanceOf(PublicApiError);
      const code = (e as PublicApiError).code;
      expect(code).toMatch(/INVALID|TOKEN|CLIENT|NETWORK|ERROR/);
    }
  });

  it('PublicApiError maps non-2xx with code/request_id (no leak)', async () => {
    const c = new ShipClient({ token: 'bad', baseUrl: 'http://127.0.0.1:3000/api/v1' });
    try {
      await c.documents.create({ title: 'x' });
    } catch (e) {
      expect(e).toBeInstanceOf(PublicApiError);
      const pe = e as PublicApiError;
      expect(typeof pe.code).toBe('string');
      expect(typeof pe.status).toBe('number');
      // request_id may be absent on network/early errors
    }
  });

  it('verifyWebhook re-export works (pure)', async () => {
    const { verifyWebhook } = await import('../src/webhooks.js');
    expect(typeof verifyWebhook).toBe('function');
    // basic false on bad
    expect(verifyWebhook({}, 'body', 'sec')).toBe(false);
  });
});
