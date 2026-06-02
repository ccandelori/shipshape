import { Router, Request, Response } from 'express';
import { registry, z } from '../../openapi/registry.js';
import oauthRouter from '../oauth/routes.js';
import documentsPublicRouter from './documents.js';
import issuesPublicRouter from './issues.js';
import sprintsPublicRouter from './sprints.js';
import { generateOpenAPIDocument } from '../../openapi/registry.js';

// Public v1 surface router. All routes registered with OpenAPI per /ship-openapi-endpoints skill.
// Sub-routers for resources (documents, issues, sprints) keep files focused.
// /api/v1/openapi.json serves the public contract (paths under /api/v1 only; 3.1 flavor).

export const v1Router = Router();

// OAuth issuance endpoints (Device, PKCE Auth Code, Client Credentials)
v1Router.use('/oauth', oauthRouter);

// Health (no auth required for discovery)
registry.registerPath({
  method: 'get',
  path: '/api/v1/health',
  description: 'Public surface health check',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({ status: z.string(), surface: z.string(), request_id: z.string() }),
        },
      },
    },
  },
});
v1Router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', surface: 'public', request_id: (req as any).requestId });
});

// Me (client identity + granted scopes)
registry.registerPath({
  method: 'get',
  path: '/api/v1/me',
  description: 'Current authenticated public client (app + scopes)',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({ client_id: z.string(), scopes: z.array(z.string()), workspace_id: z.string().nullable().optional(), request_id: z.string() }) } } },
    401: { description: 'PublicApiError' },
    403: { description: 'PublicApiError' },
  },
});
v1Router.get('/me', (req: Request, res: Response) => {
  // No scope required for /me itself (identity); callers use specific scopes for resources.
  res.json({
    client_id: (req as any).oauthClientId,
    scopes: (req as any).grantedScopes || [],
    workspace_id: (req as any).oauthWorkspaceId || null,
    request_id: (req as any).requestId,
  });
});

// Mount resource routers (they register their own paths)
v1Router.use('/documents', documentsPublicRouter);
v1Router.use('/issues', issuesPublicRouter);
v1Router.use('/sprints', sprintsPublicRouter);

// Public OpenAPI spec (filtered to v1 surface, 3.1)
registry.registerPath({
  method: 'get',
  path: '/api/v1/openapi.json',
  description: 'OpenAPI 3.1 document for the public /api/v1 surface only',
  responses: {
    200: {
      description: 'OpenAPI document',
      content: { 'application/json': { schema: z.any() } },
    },
  },
});

v1Router.get('/openapi.json', (req: Request, res: Response) => {
  const full = generateOpenAPIDocument();
  // Parallel public-only: filter to /api/v1 paths + oauth under v1; force 3.1 flavor for contract.
  const publicPaths: any = {};
  if (full.paths) {
    for (const [p, methods] of Object.entries(full.paths)) {
      if (p.startsWith('/api/v1')) {
        publicPaths[p] = methods;
      }
    }
  }
  const publicDoc = {
    ...full,
    openapi: '3.1.0',
    info: {
      ...full.info,
      title: 'Ship Public API (Plugforge /api/v1)',
      description: 'Stable public contract for documents, issues, sprints, OAuth, webhooks. See docs/plugforge/usage.md',
    },
    paths: publicPaths,
    // components stay (includes bearerAuth, schemas we registered)
  };
  res.setHeader('content-type', 'application/json');
  res.json(publicDoc);
});

export default v1Router;
