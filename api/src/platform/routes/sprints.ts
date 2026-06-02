import { Router } from 'express';
import { requireScope } from '../middleware/scopeEnforcer.js';
import { registry, z } from '../../openapi/registry.js';
import { sprintPort } from '../ports/sprints.js';
import { CreateSprintSchema, UpdateSprintSchema, ListSprintsResponseSchema, SprintPublicSchema, ListQuerySchema, ErrorResponses, PublicApiErrorSchema } from '../contracts/public-schemas.js';
import { clampLimit } from '../contracts/public-schemas.js';

export const sprintsPublicRouter = Router();

registry.registerComponent('schemas', 'SprintPublic', SprintPublicSchema as any);

registry.registerPath({
  method: 'post',
  path: '/api/v1/sprints',
  description: 'Create sprint (public API)',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateSprintSchema } },
    },
  },
  responses: { 201: { description: 'Created', content: { 'application/json': { schema: z.object({ id: z.string().uuid(), title: z.string(), request_id: z.string() }) } } }, ...ErrorResponses },
});

sprintsPublicRouter.post('/', requireScope('sprints:write'), async (req, res) => {
  const parsed = CreateSprintSchema.safeParse(req.body);
  if (!parsed.success) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid', details: parsed.error.flatten(), request_id: rid }); }
  const ws = (req as any).oauthWorkspaceId; if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No ws', request_id: rid }); }
  try {
    const sp = await sprintPort.create({ title: parsed.data.title, workspaceId: ws, authorId: null, start_date: parsed.data.start_date, end_date: parsed.data.end_date });
    return res.status(201).json({ ...sp, request_id: (req as any).requestId });
  } catch (e: any) { const rid = (req as any).requestId || 'unknown'; return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Create failed', request_id: rid }); }
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/sprints',
  description: 'List sprints (public)',
  security: [{ bearerAuth: [] }],
  request: { query: ListQuerySchema },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: ListSprintsResponseSchema } } }, ...ErrorResponses },
});

sprintsPublicRouter.get('/', requireScope('sprints:read'), async (req, res) => {
  const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const p = ListQuerySchema.safeParse({ cursor: rawCursor, limit: rawLimit });
  if (!p.success) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Bad params', details: p.error.flatten(), request_id: rid }); }
  const ws = (req as any).oauthWorkspaceId; if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No ws', request_id: rid }); }
  const lim = clampLimit(p.data.limit);
  const r = await sprintPort.list({ workspaceId: ws, cursor: p.data.cursor, limit: lim });
  return res.json({ ...r, request_id: (req as any).requestId });
});

registry.registerPath({
  method: 'get', path: '/api/v1/sprints/{id}', description: 'Get sprint', security: [{ bearerAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ id: z.string().uuid(), title: z.string(), request_id: z.string() }) } } }, ...ErrorResponses },
});
sprintsPublicRouter.get('/:id', requireScope('sprints:read'), async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId || '';
  const ws = (req as any).oauthWorkspaceId; if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No ws', request_id: rid }); }
  if (!id) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing id', request_id: rid }); }
  const sp = await sprintPort.getById(id, ws);
  const rid = (req as any).requestId; if (!sp) return res.status(404).json({ code: 'NOT_FOUND', message: 'Not found', request_id: rid });
  return res.json({ ...sp, request_id: rid });
});

registry.registerPath({
  method: 'patch', path: '/api/v1/sprints/{id}', description: 'Update sprint', security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: UpdateSprintSchema } } } },
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ id: z.string(), title: z.string(), updated_at: z.string().optional(), request_id: z.string() }) } } }, ...ErrorResponses },
});
sprintsPublicRouter.patch('/:id', requireScope('sprints:write'), async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId || '';
  const p = UpdateSprintSchema.safeParse(req.body); if (!p.success) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Bad', details: p.error.flatten(), request_id: rid }); }
  const ws = (req as any).oauthWorkspaceId; if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No ws', request_id: rid }); }
  if (!id) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing id', request_id: rid }); }
  const u = await sprintPort.update(id, ws, p.data);
  const rid = (req as any).requestId; if (!u) return res.status(404).json({ code: 'NOT_FOUND', message: 'Not found', request_id: rid });
  return res.json({ ...u, request_id: rid });
});

registry.registerPath({
  method: 'delete', path: '/api/v1/sprints/{id}', description: 'Delete sprint', security: [{ bearerAuth: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: { 204: { description: 'No Content' }, ...ErrorResponses },
});
sprintsPublicRouter.delete('/:id', requireScope('sprints:write'), async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = rawId || '';
  const ws = (req as any).oauthWorkspaceId; if (!ws) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'No ws', request_id: rid }); }
  if (!id) { const rid = (req as any).requestId || 'unknown'; return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing id', request_id: rid }); }
  const ok = await sprintPort.delete(id, ws);
  const rid = (req as any).requestId; if (!ok) return res.status(404).json({ code: 'NOT_FOUND', message: 'Not found', request_id: rid });
  return res.status(204).send();
});

export default sprintsPublicRouter;
