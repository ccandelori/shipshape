import { Request, Response, NextFunction } from 'express';
import { oauthService } from '../oauth/service.js';

// Dedicated public OAuth bearer auth middleware.
// This is SEPARATE from the internal authMiddleware.
// It validates OAuth access tokens issued via the public flows (Device, AuthCode+PKCE, Client Credentials).
// Populates:
//   - req.oauthClientId
//   - req.grantedScopes
//   - Produces distinct error codes (PUBLIC_TOKEN_EXPIRED, etc.)

export async function oauthBearerAuth(req: Request, res: Response, next: NextFunction) {
  const path = req.path || req.url || '';
  // Public discovery endpoints (no auth required)
  if (path === '/health' || path.endsWith('/health') || path === '/openapi.json' || path.endsWith('/openapi.json')) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const requestId = (req as any).requestId || 'unknown';

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 'PUBLIC_TOKEN_INVALID',
      message: 'Missing or invalid Authorization header. Use Bearer <token>.',
      request_id: requestId,
    });
  }

  const token = authHeader.slice(7);

  try {
    const validated = await oauthService.validateAccessToken(token);
    if (!validated) {
      return res.status(401).json({
        code: 'PUBLIC_TOKEN_EXPIRED',
        message: 'Token expired or invalid.',
        request_id: requestId,
      });
    }

    req.oauthClientId = validated.client_id; // public opaque client_id (not internal app uuid)
    req.grantedScopes = validated.scopes || [];
    req.oauthWorkspaceId = validated.workspace_id || null;

    return next();
  } catch (err) {
    console.error(`[public-oauth] ${requestId} validation error`, err);
    return res.status(401).json({
      code: 'PUBLIC_TOKEN_INVALID',
      message: 'Token validation failed.',
      request_id: requestId,
    });
  }
}
