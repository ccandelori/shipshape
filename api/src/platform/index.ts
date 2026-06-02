import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { publicContext } from './middleware/publicContext.js';
import { oauthBearerAuth } from './middleware/oauthBearerAuth.js'; // stub for now
import { scopeEnforcer } from './middleware/scopeEnforcer.js'; // stub for now
import { v1Router } from './routes/v1.js'; // stub for now
import { generateRequestId } from '../utils/requestId.js';
import { inMemoryBus } from './events/inMemoryBus.js';
import { IEventBus } from './events/IEventBus.js';
import { createPublicRateLimiter } from './ratelimit/index.js';
import { WebhookDeliverer } from './webhooks/deliverer.js';

// Isolated sub-app for public /api/v1 surface
// This gives us clean error shape isolation and dedicated middleware stack.
const publicApp = express();

// Request ID early for all public responses/errors/logs
publicApp.use((req: Request, res: Response, next: NextFunction) => {
  const id = generateRequestId();
  (req as any).requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
});

// Body parsers (same limits as main app)
publicApp.use(express.json({ limit: '10mb' }));
publicApp.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Public context (sets req.isPublicApiRequest etc.)
publicApp.use(publicContext);

// Public rate limiter (per-app + per-token)
publicApp.use(createPublicRateLimiter());

// Dedicated OAuth bearer auth (distinct from internal authMiddleware)
// Validates app, user (if applicable), granted scopes, produces distinct expired token error.
publicApp.use(oauthBearerAuth);

// Scope enforcement for public routes
publicApp.use(scopeEnforcer);

// Mount the v1 router
publicApp.use('/', v1Router);

// Isolated error handler for public surface only - returns PublicApiError shape
publicApp.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const requestId = (req as any).requestId || 'unknown';

  // Map to public error shape
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal server error';

  // Log with request id for correlation
  console.error(`[public-api] ${requestId} ${code} ${status}: ${message}`, err.stack);

  res.status(status).json({
    code,
    message,
    details: err.details,
    request_id: requestId,
  });
});

const deliverer = new WebhookDeliverer(inMemoryBus);

// Subscribe deliverer to bus publishes (for skeleton; in real, deliverer polls or bus fans out)
(inMemoryBus as any).subscribe?.((event: any) => deliverer.handleEvent(event));

export function createPublicPlatform(app: express.Express) {
  // Mount the isolated public sub-app at /api/v1
  // This must happen before or in parallel with internal routes, but public errors are handled inside the sub-app.
  app.use('/api/v1', publicApp);

  // Start the (skeleton) deliverer. Real version will listen to bus and do HTTP deliveries.
  deliverer.start();
}

// For tests / shutdown
export function stopPublicPlatform() {
  deliverer.stop();
}

// Graceful drain on SIGTERM/SIGINT (EB etc). Pending deliveries move to DLQ on hard kill.
if (process.env.NODE_ENV !== 'test') {
  const shutdown = async (sig: string) => {
    console.log(`[public-platform] ${sig} received, draining deliverer...`);
    await stopPublicPlatform();
    // In real: await bus drain if queue
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Re-export for convenience in tests/composition
export { publicApp, inMemoryBus };
export type { IEventBus };
