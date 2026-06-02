import { PublicApiError, type ClientCredentialsOptions, type DeviceLoginOptions, type AuthCodeOptions, type ITokenStore } from './types.js';

export interface ShipClientOptions {
  token: string;
  baseUrl?: string;
}

function makeError(status: number, body: any): PublicApiError {
  const b = body && typeof body === 'object' ? body : { code: 'UNKNOWN', message: String(body) };
  return new PublicApiError(status, { code: b.code || 'HTTP_ERROR', message: b.message || `HTTP ${status}`, details: b.details, request_id: b.request_id });
}

async function doFetch(url: string, init: RequestInit, token: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
  } catch (e: any) {
    // Network / dns / timeout -> typed PublicApiError
    const pe = new PublicApiError(0, { code: 'NETWORK_ERROR', message: e.message || 'fetch failed', details: { url } });
    throw pe;
  }
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!res.ok) {
    throw makeError(res.status, body);
  }
  return body;
}

export class ShipClient {
  private token: string;
  private baseUrl: string;

  constructor(opts: ShipClientOptions) {
    this.token = opts.token;
    this.baseUrl = (opts.baseUrl || 'http://localhost:3000/api/v1').replace(/\/$/, '');
  }

  // Device flow (full poll with slow_down per RFC)
  static async deviceLogin(opts: DeviceLoginOptions): Promise<ShipClient> {
    const base = (opts.baseUrl || 'http://localhost:3000/api/v1').replace(/\/$/, '');
    const codeRes = await fetch(`${base}/oauth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'device-public' }), // for test; real uses registered
    });
    if (!codeRes.ok) throw makeError(codeRes.status, await codeRes.json().catch(() => ({})));
    const { device_code, user_code, verification_uri } = await codeRes.json();
    opts.onUserCode(user_code, verification_uri || '');

    // Poll
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const tokenRes = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code }),
      });
      const t = await tokenRes.json().catch(() => ({}));
      if (tokenRes.ok && t.access_token) {
        return new ShipClient({ token: t.access_token, baseUrl: opts.baseUrl });
      }
      if (t.error === 'slow_down') { await new Promise(r => setTimeout(r, 2000)); continue; }
      if (t.error === 'expired_token' || t.error === 'access_denied') throw makeError(400, t);
    }
    throw new Error('device poll timeout');
  }

  static async authorizationCodeFlow(opts: AuthCodeOptions & { code?: string; codeVerifier?: string; redirectUri?: string; clientId?: string }): Promise<ShipClient> {
    // For CLI/browser: in real app would open url, receive callback with code.
    // Here support direct exchange if code provided (for tests/CLI).
    const base = (opts.baseUrl || 'http://localhost:3000/api/v1').replace(/\/$/, '');
    if (opts.code && opts.codeVerifier && opts.redirectUri && opts.clientId) {
      const res = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: opts.code,
          code_verifier: opts.codeVerifier,
          redirect_uri: opts.redirectUri,
          client_id: opts.clientId,
        }),
      });
      const t = await res.json().catch(() => ({}));
      if (!res.ok || !t.access_token) throw makeError(res.status, t);
      return new ShipClient({ token: t.access_token, baseUrl: opts.baseUrl });
    }
    // Stub redirect start (consumer handles browser redirect)
    return new ShipClient({ token: 'stub-authcode-token', baseUrl: opts.baseUrl });
  }

  static async clientCredentials(opts: ClientCredentialsOptions): Promise<ShipClient> {
    const base = (opts.baseUrl || 'http://localhost:3000/api/v1').replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
        }),
      });
    } catch (e: any) {
      throw new PublicApiError(0, { code: 'NETWORK_ERROR', message: e.message || 'fetch failed', details: { url: `${base}/oauth/token` } });
    }
    const t = await res.json().catch(() => ({}));
    if (!res.ok || !t.access_token) throw makeError(res.status, t);
    return new ShipClient({ token: t.access_token, baseUrl: opts.baseUrl });
  }

  // With pluggable store (for CLI persist)
  static async fromStore(store: ITokenStore, baseUrl?: string): Promise<ShipClient> {
    const tok = await store.get();
    if (!tok) throw new Error('no token in store');
    return new ShipClient({ token: tok, baseUrl });
  }

  async saveToStore(store: ITokenStore): Promise<void> {
    await store.set(this.token);
  }

  // Resources
  get documents() {
    const base = this.baseUrl;
    const tok = this.token;
    return {
      create: async (body: { title: string; content?: any }) => doFetch(`${base}/documents`, { method: 'POST', body: JSON.stringify(body) }, tok),
      list: async (q?: { cursor?: string; limit?: number }) => {
        const usp = new URLSearchParams();
        if (q?.cursor) usp.set('cursor', q.cursor);
        if (q?.limit) usp.set('limit', String(q.limit));
        const qs = usp.toString() ? `?${usp}` : '';
        return doFetch(`${base}/documents${qs}`, { method: 'GET' }, tok);
      },
      get: async (id: string) => doFetch(`${base}/documents/${id}`, { method: 'GET' }, tok),
      update: async (id: string, body: { title?: string; content?: any }) => doFetch(`${base}/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, tok),
      delete: async (id: string) => {
        const res = await fetch(`${base}/documents/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${tok}` } });
        if (!res.ok && res.status !== 204) {
          const b = await res.json().catch(() => ({}));
          throw makeError(res.status, b);
        }
        return true;
      },
    };
  }

  get issues() {
    const base = this.baseUrl;
    const tok = this.token;
    return {
      create: async (body: { title: string; state?: string; priority?: string; assignee_id?: string | null }) => doFetch(`${base}/issues`, { method: 'POST', body: JSON.stringify(body) }, tok),
      list: async (q?: { cursor?: string; limit?: number }) => {
        const usp = new URLSearchParams(); if (q?.cursor) usp.set('cursor', q.cursor); if (q?.limit) usp.set('limit', String(q.limit));
        const qs = usp.toString() ? `?${usp}` : '';
        return doFetch(`${base}/issues${qs}`, { method: 'GET' }, tok);
      },
      get: async (id: string) => doFetch(`${base}/issues/${id}`, { method: 'GET' }, tok),
      update: async (id: string, body: { title?: string; state?: string; priority?: string; assignee_id?: string | null }) => doFetch(`${base}/issues/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, tok),
      delete: async (id: string) => {
        const res = await fetch(`${base}/issues/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${tok}` } });
        if (!res.ok && res.status !== 204) throw makeError(res.status, await res.json().catch(() => ({})));
        return true;
      },
    };
  }

  get sprints() {
    const base = this.baseUrl;
    const tok = this.token;
    return {
      create: async (body: { title: string; start_date?: string; end_date?: string }) => doFetch(`${base}/sprints`, { method: 'POST', body: JSON.stringify(body) }, tok),
      list: async (q?: { cursor?: string; limit?: number }) => {
        const usp = new URLSearchParams(); if (q?.cursor) usp.set('cursor', q.cursor); if (q?.limit) usp.set('limit', String(q.limit));
        const qs = usp.toString() ? `?${usp}` : '';
        return doFetch(`${base}/sprints${qs}`, { method: 'GET' }, tok);
      },
      get: async (id: string) => doFetch(`${base}/sprints/${id}`, { method: 'GET' }, tok),
      update: async (id: string, body: { title?: string; start_date?: string; end_date?: string }) => doFetch(`${base}/sprints/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, tok),
      delete: async (id: string) => {
        const res = await fetch(`${base}/sprints/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${tok}` } });
        if (!res.ok && res.status !== 204) throw makeError(res.status, await res.json().catch(() => ({})));
        return true;
      },
    };
  }
}

export default ShipClient;
