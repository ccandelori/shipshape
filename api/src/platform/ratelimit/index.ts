import rateLimit from 'express-rate-limit';
import { Request } from 'express';

// Public rate limit: per-app + per-token (as per plan and Pre-Search).
// Uses in-memory for MVP (boring tech).
// Returns standard headers + 429 with Retry-After.

export function createPublicRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 100, // will be tuned; per Pre-Search we can make per-app later
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const client = (req as any).oauthClientId || 'anon';
      const token = req.headers.authorization?.slice(7, 20) || 'no-token'; // prefix only
      return `public:${client}:${token}`;
    },
    message: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
    // Test bypass support (same as main apiLimiter)
    skip: (req) => (process.env.NODE_ENV === 'test' || process.env.E2E_TEST === '1') && req.headers['x-bench'] === '1',
  });
}
