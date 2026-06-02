import { Request, Response, NextFunction } from 'express';

// Extends the request with public API context.
// This is the public equivalent of what authMiddleware does for internal.
declare global {
  namespace Express {
    interface Request {
      isPublicApiRequest?: boolean;
      oauthClientId?: string;
      grantedScopes?: string[];
      oauthWorkspaceId?: string | null;
      requestId?: string;
    }
  }
}

export function publicContext(req: Request, res: Response, next: NextFunction) {
  req.isPublicApiRequest = true;
  // requestId is set earlier in the sub-app
  req.requestId = (req as any).requestId;
  next();
}
