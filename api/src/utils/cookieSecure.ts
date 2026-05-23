// Shared cookie.secure flag used by every res.cookie() and session() call.
//
// Default: true in production (HTTPS deploys behind nginx-with-TLS or
// CloudFront), false otherwise. Override with SHIP_COOKIES_SECURE=0 when
// serving over HTTP (e.g. a demo droplet without a domain or TLS yet).
//
// Computed once at module load — process.env is populated before any
// app code imports run (systemd EnvironmentFile, dotenv-config, etc.).
//
// Setting secure:true on a cookie an HTTP-only host means Express silently
// drops the Set-Cookie header (browsers can't store secure cookies on
// insecure origins). The result is "every request looks logged-out" —
// e.g. POST /api/auth/login returns 200 but the session_id cookie never
// reaches the next request, so middleware 401s and the SPA redirects to
// login?expired=true.
export const COOKIE_SECURE: boolean =
  process.env.SHIP_COOKIES_SECURE === '0'
    ? false
    : process.env.NODE_ENV === 'production';
