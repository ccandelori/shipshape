// Public API types for Plugforge /api/v1 surface
// Strict typing, no any/unknown

export interface PublicApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

export type Cursor = string;

export interface CursorPayload {
  id: string;
  ts: string; // ISO timestamp for stability
}

export const PUBLIC_ERROR_CODES = {
  PUBLIC_TOKEN_EXPIRED: 'PUBLIC_TOKEN_EXPIRED',
  PUBLIC_TOKEN_INVALID: 'PUBLIC_TOKEN_INVALID',
  PUBLIC_SCOPE_INSUFFICIENT: 'PUBLIC_SCOPE_INSUFFICIENT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_CURSOR: 'INVALID_CURSOR',
} as const;

export type PublicErrorCode = typeof PUBLIC_ERROR_CODES[keyof typeof PUBLIC_ERROR_CODES];

// Public event types (data-driven, will be expanded in platform/events)
export const PUBLIC_EVENT_TYPES = {
  DOCUMENT_CREATED: 'document.created',
  DOCUMENT_UPDATED: 'document.updated',
  DOCUMENT_DELETED: 'document.deleted',
  ISSUE_CREATED: 'issue.created',
  ISSUE_ASSIGNED: 'issue.assigned',
  ISSUE_STATUS_CHANGED: 'issue.status_changed',
  SPRINT_STARTED: 'sprint.started',
  SPRINT_COMPLETED: 'sprint.completed',
} as const;

export type PublicEventType = typeof PUBLIC_EVENT_TYPES[keyof typeof PUBLIC_EVENT_TYPES];
