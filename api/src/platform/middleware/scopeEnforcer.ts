import { Request, Response, NextFunction } from 'express';
import { scopeRegistry } from '../scopes/registry.js';

// Scope enforcer using the data-driven registry (OCP).
// Returns specific PUBLIC_SCOPE_INSUFFICIENT with missing scopes.

export function scopeEnforcer(requiredScopes: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    const granted = req.grantedScopes || [];
    const missing = scopeRegistry.validate(requiredScopes, granted);

    if (missing.length > 0) {
      const requestId = (req as any).requestId || 'unknown';
      return res.status(403).json({
        code: 'PUBLIC_SCOPE_INSUFFICIENT',
        message: `Insufficient scope. Missing: ${missing.join(', ')}`,
        details: { missing_scopes: missing },
        request_id: requestId,
      });
    }

    return next();
  };
}

// Convenience for single scope (used in routes)
export function requireScope(scope: string) {
  return scopeEnforcer([scope]);
}
