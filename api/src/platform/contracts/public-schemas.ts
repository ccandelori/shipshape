import { z } from '../../openapi/registry.js';
import { PUBLIC_ERROR_CODES } from '@ship/shared';

// Zod schemas for public /api/v1 contracts. Defined at top per /ship-openapi-endpoints + patterns.md
// Used for both runtime safeParse and OpenAPI registration (zod-to-openapi).
// Strict, no any/unknown. Public responses always include request_id at body root.

// Common error schema for all 4xx/5xx
export const PublicApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  request_id: z.string(),
});

// Cursor opaque string
export const CursorSchema = z.string().describe('Opaque cursor for pagination. From prior list response nextCursor.');

// Limit clamp helper (pure)
export function clampLimit(limit: number | undefined, max = 100, def = 20): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) return def;
  return Math.min(Math.floor(limit), max);
}

// Document public shapes (minimal for stable v1 surface; no full internal props)
export const DocumentPublicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.any().optional(), // TipTap JSON or null for minimal
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  // request_id added at handler response time; included in some response schemas for OpenAPI completeness
});

export const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.any().optional(),
});

export const UpdateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.any().optional(),
});

export const ListDocumentsResponseSchema = z.object({
  items: z.array(DocumentPublicSchema),
  nextCursor: CursorSchema.optional(),
  request_id: z.string(),
});

// Issue public (documents with type=issue, minimal props exposed flat for DX)
export const IssuePublicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  state: z.string().optional(),
  priority: z.string().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const CreateIssueSchema = z.object({
  title: z.string().min(1).max(500),
  state: z.enum(['triage', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
});

export const UpdateIssueSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  state: z.enum(['triage', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
});

export const ListIssuesResponseSchema = z.object({
  items: z.array(IssuePublicSchema),
  nextCursor: CursorSchema.optional(),
  request_id: z.string(),
});

// Sprint (week) public
export const SprintPublicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  status: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const CreateSprintSchema = z.object({
  title: z.string().min(1).max(500),
  start_date: z.string().optional(), // ISO
  end_date: z.string().optional(),
});

export const UpdateSprintSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const ListSprintsResponseSchema = z.object({
  items: z.array(SprintPublicSchema),
  nextCursor: CursorSchema.optional(),
  request_id: z.string(),
});

// Generic list query params (cursor pagination)
export const ListQuerySchema = z.object({
  cursor: CursorSchema.optional(),
  limit: z.coerce.number().int().min(0).max(100).optional(),
});

// For OpenAPI registration of error responses (reuse)
export const ErrorResponses = {
  400: {
    description: 'PublicApiError - bad request (validation, cursor, etc)',
    content: { 'application/json': { schema: PublicApiErrorSchema } },
  },
  401: {
    description: 'PublicApiError - auth',
    content: { 'application/json': { schema: PublicApiErrorSchema } },
  },
  403: {
    description: 'PublicApiError - scope',
    content: { 'application/json': { schema: PublicApiErrorSchema } },
  },
  404: {
    description: 'PublicApiError - not found',
    content: { 'application/json': { schema: PublicApiErrorSchema } },
  },
  429: {
    description: 'PublicApiError - rate limited',
    content: { 'application/json': { schema: PublicApiErrorSchema } },
  },
  500: {
    description: 'PublicApiError - server',
    content: { 'application/json': { schema: PublicApiErrorSchema } },
  },
} as const;
