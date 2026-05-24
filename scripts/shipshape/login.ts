// Auto-login helper for shipshape checks that need an authenticated session.
// Uses the seeded admin/dev user (dev@ship.local / admin123 by default; overridable
// via SHIPSHAPE_LOGIN_EMAIL + SHIPSHAPE_LOGIN_PASSWORD).
//
// Flow:
//   1. GET  /api/csrf-token         → captures connect.sid cookie + CSRF token
//   2. POST /api/auth/login         → with the CSRF header and a JSON body
//   3. Captures the session_id      cookie from the Set-Cookie header
//
// Returns the URL-encoded session_id value ready to splice into a
// `Cookie: session_id=<value>` header.

const DEFAULT_API = process.env.SHIPSHAPE_API_URL ?? 'http://localhost:3000';
const DEFAULT_EMAIL = process.env.SHIPSHAPE_LOGIN_EMAIL ?? 'dev@ship.local';
const DEFAULT_PASSWORD = process.env.SHIPSHAPE_LOGIN_PASSWORD ?? 'admin123';

interface LoginResult {
  sessionCookie: string; // value only; caller wraps in `session_id=…`
  apiUrl: string;
}

interface CsrfResponse {
  token: string;
}

// Concatenate multiple set-cookie headers (Node returns them as a single
// comma-joined string by default; we work directly with the raw headers
// instead so we can pull all session cookies cleanly).
function extractCookies(setCookieHeaders: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const header of setCookieHeaders) {
    const pair = header.split(';', 1)[0];
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    out.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return out;
}

function joinCookies(cookies: Map<string, string>): string {
  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export async function loginAndGetSessionCookie(opts?: {
  apiUrl?: string;
  email?: string;
  password?: string;
}): Promise<LoginResult> {
  const apiUrl = opts?.apiUrl ?? DEFAULT_API;
  const email = opts?.email ?? DEFAULT_EMAIL;
  const password = opts?.password ?? DEFAULT_PASSWORD;

  // Step 1 — get CSRF token + session cookie used by csrf-sync
  const csrfRes = await fetch(`${apiUrl}/api/csrf-token`, { method: 'GET' });
  if (!csrfRes.ok) {
    throw new Error(`csrf-token endpoint returned ${csrfRes.status}`);
  }
  const csrfCookies = extractCookies(csrfRes.headers.getSetCookie?.() ?? []);
  const csrfJson = (await csrfRes.json()) as CsrfResponse;
  if (!csrfJson.token) {
    throw new Error('csrf-token endpoint returned no token');
  }

  // Step 2 — login
  const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfJson.token,
      Cookie: joinCookies(csrfCookies),
    },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    const body = await loginRes.text().catch(() => '');
    throw new Error(`login (${email}) returned ${loginRes.status}: ${body.slice(0, 200)}`);
  }

  // Step 3 — capture session_id from Set-Cookie
  const loginCookies = extractCookies(loginRes.headers.getSetCookie?.() ?? []);
  const sessionId = loginCookies.get('session_id');
  if (!sessionId) {
    throw new Error(`login succeeded but no session_id cookie was set (got: ${[...loginCookies.keys()].join(', ')})`);
  }

  return { sessionCookie: sessionId, apiUrl };
}
