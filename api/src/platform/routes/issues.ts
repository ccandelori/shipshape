import { Router } from 'express';
import { requireScope } from '../middleware/scopeEnforcer.js';
import { registry, z } from '../../openapi/registry.js';
import { issuePort } from '../ports/issues.js';
import { CreateIssueSchema, UpdateIssueSchema, ListIssuesResponseSchema, IssuePublicSchema, ListQuerySchema, ErrorResponses, PublicApiErrorSchema } from '../contracts/public-schemas.js';
import { clampLimit } from '../contracts/public-schemas.js';

export const issuesPublicRouter = Router();

registry.registerComponent('schemas', 'IssuePublic', IssuePublicSchema as any);

registry.registerPath({
  method: 'post',
  path: '/api/v1/issues',
  description: 'Create issue (public API)',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateIssueSchema } },
    },
  },
  responses: { 201: { description: 'Created', content: { 'application/json': { schema: z.object({ id: z.string().uuid(), title: z.string(), request_id: z.string() }) } } }, ...ErrorResponses },
});

issuesPublicRouter.post('/', requireScope('issues:write'), async (req, res) => {
  const parsed = CreateIssueSchema.safeParse(req.body);
  if (!parsed.success) {
    const rid = (req as any).requestId || 'unknown';
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid issue', details: parsed.error.flatten(), request_id: rid });
  }
  const ws = (req as any).oauthWorkspaceId;
  if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No workspace', request_id: rid }); }
  try {
    const issue = await issuePort.create({ title: parsed.data.title, workspaceId: ws, authorId: null, state: parsed.data.state, priority: parsed.data.priority, assignee_id: parsed.data.assignee_id || null });
    return res.status(201).json({ ...issue, request_id: (req as any).requestId });
  } catch (e: any) { const rid = (req as any).requestId || 'unknown'; console.error('[public issues create error]', e); return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Create failed', details: { error: e.message }, request_id: rid }); }
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/issues',
  description: 'List issues (public)',
  security: [{ bearerAuth: [] }],
  request: { query: ListQuerySchema },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: ListIssuesResponseSchema } } }, ...ErrorResponses },
});

issuesPublicRouter.get('/', requireScope('issues:read'), async (req, res) => {
  const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const p = ListQuerySchema.safeParse({ cursor: rawCursor, limit: rawLimit });
  if (!p.success) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Bad params', details: p.error.flatten(), request_id: rid }); }
  const ws = (req as any).oauthWorkspaceId; if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No ws', request_id: rid }); }
  const lim = clampLimit(p.data.limit);
  const r = await issuePort.list({ workspaceId: ws, cursor: p.data.cursor, limit: lim });
  return res.json({ ...r, request_id: (req as any).requestId });
});

registry.registerPath({
  method: 'get', path: '/api/v1/issues/{id}', description: 'Get issue', security: [{ bearerAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ id: z.string().uuid(), title: z.string(), request_id: z.string() }) } } }, ...ErrorResponses },
});
issuesPublicRouter.get('/:id', requireScope('issues:read'), async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId || '';
  const ws = (req as any).oauthWorkspaceId; if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No ws', request_id: rid }); }
  if (!id) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing id', request_id: rid }); }
  const issue = await issuePort.getById(id, ws);
  const rid = (req as any).requestId; if (!issue) return res.status(404).json({ code: 'NOT_FOUND', message: 'Not found', request_id: rid });
  return res.json({ ...issue, request_id: rid });
});

registry.registerPath({
  method: 'patch', path: '/api/v1/issues/{id}', description: 'Update issue', security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: UpdateIssueSchema } } } },
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ id: z.string(), title: z.string(), updated_at: z.string().optional(), request_id: z.string() }) } } }, ...ErrorResponses },
});
issuesPublicRouter.patch('/:id', requireScope('issues:write'), async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId || '';
  const p = UpdateIssueSchema.safeParse(req.body); if (!p.success) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Bad', details: p.error.flatten(), request_id: rid }); }
  const ws = (req as any).oauthWorkspaceId; if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No ws', request_id: rid }); }
  if (!id) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing id', request_id: rid }); }
  const u = await issuePort.update(id, ws, p.data);
  const rid = (req as any).requestId; if (!u) return res.status(404).json({ code: 'NOT_FOUND', message: 'Not found', request_id: rid });
  return res.json({ ...u, request_id: rid });
});

registry.registerPath({
  method: 'delete', path: '/api/v1/issues/{id}', description: 'Delete issue', security: [{ bearerAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: { 204: { description: 'No Content' }, ...ErrorResponses },
});
issuesPublicRouter.delete('/:id', requireScope('issues:write'), async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId || '';
  const ws = (req as any).oauthWorkspaceId; if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No ws', request_id: rid }); }
  if (!id) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing id', request_id: rid }); }
  const ok = await issuePort.delete(id, ws);
  const rid = (req as any).requestId; if (!ok) return res.status(404).json({ code: 'NOT_FOUND', message: 'Not found', request_id: rid });
  return res.status(204).send();
});

export default issuesPublicRouter;
