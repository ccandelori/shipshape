import { Router } from 'express';
import { requireScope } from '../middleware/scopeEnforcer.js';
import { registry, z } from '../../openapi/registry.js';
import { documentPort } from '../ports/documents.js';
import {
  CreateDocumentSchema,
  UpdateDocumentSchema,
  ListDocumentsResponseSchema,
  DocumentPublicSchema,
  ListQuerySchema,
  ErrorResponses,
  PublicApiErrorSchema,
} from '../contracts/public-schemas.js';
import { clampLimit } from '../contracts/public-schemas.js';

// Public documents router (mounted under /documents in v1)
// All registerPath BEFORE handlers per /ship-openapi-endpoints skill.
// Uses narrow port (txn + publish inside). Workspace from oauth token/app.

export const documentsPublicRouter = Router();

// Register schemas for OpenAPI reuse
registry.registerComponent('schemas', 'DocumentPublic', DocumentPublicSchema as any);
registry.registerComponent('schemas', 'PublicApiError', PublicApiErrorSchema as any);

// POST /api/v1/documents
registry.registerPath({
  method: 'post',
  path: '/api/v1/documents',
  description: 'Create a new document (public API)',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateDocumentSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({ id: z.string().uuid(), title: z.string(), request_id: z.string() }),
        },
      },
    },
    ...ErrorResponses,
  },
});

documentsPublicRouter.post('/', requireScope('documents:write'), async (req, res) => {
  const parsed = CreateDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid document create payload',
      details: parsed.error.flatten(),
      request_id: requestId,
    });
  }

  const workspaceId = (req as any).oauthWorkspaceId;
  if (!workspaceId) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'No workspace associated with this client. Use an app registered to a workspace or system app seed.',
      request_id: requestId,
    });
  }

  try {
    const doc = await documentPort.create({
      title: parsed.data.title,
      content: parsed.data.content,
      workspaceId,
      authorId: null,
    });
    const requestId = (req as any).requestId;
    return res.status(201).json({ ...doc, request_id: requestId });
  } catch (e: any) {
    const requestId = (req as any).requestId || 'unknown';
    console.error('[public docs create error]', e);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create document',
      details: { error: e.message, stack: e.stack?.split('\n').slice(0,3) },
      request_id: requestId,
    });
  }
});

// GET /api/v1/documents
registry.registerPath({
  method: 'get',
  path: '/api/v1/documents',
  description: 'List documents with cursor pagination (public API)',
  security: [{ bearerAuth: [] }],
  request: {
    query: ListQuerySchema,
  },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: ListDocumentsResponseSchema } },
    },
    ...ErrorResponses,
  },
});

documentsPublicRouter.get('/', requireScope('documents:read'), async (req, res) => {
  const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const parsed = ListQuerySchema.safeParse({ cursor: rawCursor, limit: rawLimit });
  if (!parsed.success) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_CURSOR', message: 'Bad pagination params', details: parsed.error.flatten(), request_id: requestId });
  }

  const workspaceId = (req as any).oauthWorkspaceId;
  if (!workspaceId) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'No workspace for client', request_id: requestId });
  }

  try {
    const limit = clampLimit(parsed.data.limit);
    const result = await documentPort.list({ workspaceId, cursor: parsed.data.cursor, limit });
    const requestId = (req as any).requestId;
    return res.json({ ...result, request_id: requestId });
  } catch (e: any) {
    if (e.code === 'INVALID_CURSOR') {
      const requestId = (req as any).requestId || 'unknown';
      return res.status(400).json({ code: 'INVALID_CURSOR', message: e.message, details: e.details, request_id: requestId });
    }
    const requestId = (req as any).requestId || 'unknown';
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'List failed', request_id: requestId });
  }
});

// GET /api/v1/documents/:id
registry.registerPath({
  method: 'get',
  path: '/api/v1/documents/{id}',
  description: 'Get document by id (public API)',
  security: [{ bearerAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({ id: z.string().uuid(), title: z.string(), request_id: z.string() }) } } },
    ...ErrorResponses,
  },
});

documentsPublicRouter.get('/:id', requireScope('documents:read'), async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId || '';
  const workspaceId = (req as any).oauthWorkspaceId;
  if (!workspaceId) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'No workspace', request_id: requestId });
  }
  if (!id) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing id', request_id: requestId });
  }
  try {
    const doc = await documentPort.getById(id, workspaceId);
    const requestId = (req as any).requestId;
    if (!doc) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Document not found', request_id: requestId });
    }
    return res.json({ ...doc, request_id: requestId });
  } catch (e) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Get failed', request_id: requestId });
  }
});

// PATCH /api/v1/documents/:id
registry.registerPath({
  method: 'patch',
  path: '/api/v1/documents/{id}',
  description: 'Update document (public API)',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: UpdateDocumentSchema },
      },
    },
  },
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({ id: z.string(), title: z.string(), updated_at: z.string().optional(), request_id: z.string() }) } } },
    ...ErrorResponses,
  },
});

documentsPublicRouter.patch('/:id', requireScope('documents:write'), async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId || '';
  const parsed = UpdateDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid update', details: parsed.error.flatten(), request_id: requestId });
  }
  const workspaceId = (req as any).oauthWorkspaceId;
  if (!workspaceId) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'No workspace', request_id: requestId });
  }
  if (!id) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing id', request_id: requestId });
  }
  try {
    const doc = await documentPort.update(id, workspaceId, parsed.data);
    const requestId = (req as any).requestId;
    if (!doc) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Document not found or deleted', request_id: requestId });
    }
    return res.json({ ...doc, request_id: requestId });
  } catch (e) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Update failed', request_id: requestId });
  }
});

// DELETE /api/v1/documents/:id
registry.registerPath({
  method: 'delete',
  path: '/api/v1/documents/{id}',
  description: 'Delete document (soft, public API)',
  security: [{ bearerAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: {
    204: { description: 'No Content' },
    ...ErrorResponses,
  },
});

documentsPublicRouter.delete('/:id', requireScope('documents:write'), async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId || '';
  const workspaceId = (req as any).oauthWorkspaceId;
  if (!workspaceId) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'No workspace', request_id: requestId });
  }
  if (!id) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing id', request_id: requestId });
  }
  try {
    const ok = await documentPort.delete(id, workspaceId);
    const requestId = (req as any).requestId;
    if (!ok) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Document not found', request_id: requestId });
    }
    return res.status(204).send();
  } catch (e) {
    const requestId = (req as any).requestId || 'unknown';
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Delete failed', request_id: requestId });
  }
});

export default documentsPublicRouter;
