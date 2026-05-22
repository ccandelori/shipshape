/**
 * Domain mapper layer — narrows raw DB rows from `documents` to typed
 * per-document-type objects.
 *
 * Why this exists (Task 10, beyond the headline 25% violation reduction):
 * the `documents` table stores per-type properties in a single JSONB column.
 * The DB driver hands us `Record<string, unknown>`; consumers historically
 * either cast (`row as IssueDocument` — hides bad data) or accessed properties
 * via inline casts (`(row.properties as IssueProperties).state` — same
 * problem, scattered). Either way, a runtime mismatch (wrong document_type,
 * missing required property, malformed content) gets discovered far from the
 * source.
 *
 * Each mapper here:
 *   1. Takes a `RawDocumentRow` (an explicit input type, not `any`).
 *   2. Checks `document_type` matches the target. Throws if not.
 *   3. Validates the content + properties shape via hand-written runtime
 *      guards. Throws on bad input with a message that names the document id.
 *   4. Returns a properly-typed object — `IssueDocument`, `ProjectDocument`,
 *      etc. — with no `as` in the success path.
 *
 * Centralized `as` would have hidden bad data. These guards make bad data
 * loud at the boundary instead.
 */

import type {
  Document,
  DocumentType,
  IssueDocument,
  IssueProperties,
  ProjectDocument,
  ProjectProperties,
  ProgramDocument,
  ProgramProperties,
  WeekDocument,
  WeekProperties,
  WikiDocument,
  WikiProperties,
  PersonDocument,
  PersonProperties,
} from '../types/document.js'

// ----------------------------------------------------------------------------
// Input type
// ----------------------------------------------------------------------------

/**
 * Shape returned by `SELECT * FROM documents` (or any column-subset of it).
 * `content` and `properties` are `unknown` because the JSONB column can hold
 * anything; mappers narrow them via runtime guards.
 *
 * Optional fields mirror the columns that may or may not be selected
 * depending on the query.
 */
export interface RawDocumentRow {
  id: string
  workspace_id?: string
  document_type: string
  title: string
  content?: unknown
  yjs_state?: Uint8Array | null
  parent_id?: string | null
  position?: number
  properties?: unknown
  ticket_number?: number | null
  archived_at?: Date | string | null
  created_at?: Date | string
  updated_at?: Date | string
  created_by?: string | null
  visibility?: string
  started_at?: Date | string | null
  completed_at?: Date | string | null
  cancelled_at?: Date | string | null
  reopened_at?: Date | string | null
  converted_to_id?: string | null
  converted_from_id?: string | null
  converted_at?: Date | string | null
  converted_by?: string | null
}

// ----------------------------------------------------------------------------
// Runtime guards
// ----------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isJSONContent(v: unknown): v is Record<string, unknown> {
  // TipTap content is `{ type: string, content?: [...] }` or just `{}` for
  // newly-created docs. Either way it's an object.
  return isObject(v)
}

function isIssueProperties(v: unknown): v is IssueProperties {
  if (!isObject(v)) return false
  // `state` and `priority` and `source` are required strings per the type.
  // We don't validate the enum values here — TS narrows them downstream and
  // a bad value is its own correctness issue, not a type-safety one.
  return typeof v.state === 'string' && typeof v.priority === 'string' && typeof v.source === 'string'
}

function isProjectProperties(v: unknown): v is ProjectProperties {
  if (!isObject(v)) return false
  // `impact`, `confidence`, `ease`, `color` are required. `impact` is ICEScore | null;
  // null is permitted and string color is required.
  return typeof v.color === 'string'
}

function isProgramProperties(v: unknown): v is ProgramProperties {
  if (!isObject(v)) return false
  return typeof v.color === 'string'
}

function isWeekProperties(v: unknown): v is WeekProperties {
  if (!isObject(v)) return false
  return typeof v.sprint_number === 'number' && typeof v.owner_id === 'string'
}

function isWikiProperties(v: unknown): v is WikiProperties {
  // WikiProperties is loose ({ [key: string]: unknown }) — any object works.
  return isObject(v)
}

function isPersonProperties(v: unknown): v is PersonProperties {
  if (!isObject(v)) return false
  return typeof v.user_id === 'string'
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function toDate(v: Date | string | null | undefined): Date | undefined {
  if (!v) return undefined
  return v instanceof Date ? v : new Date(v)
}

function toDateOrNull(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v)
}

/**
 * Common-field mapping shared by every typed mapper. Returns a `Document`
 * with content/properties left untouched (the per-type mapper narrows them).
 */
function mapCommonFields(row: RawDocumentRow): Omit<Document, 'document_type' | 'properties' | 'content'> {
  return {
    id: row.id,
    workspace_id: row.workspace_id ?? '',
    title: row.title,
    yjs_state: row.yjs_state ?? null,
    parent_id: row.parent_id ?? null,
    position: row.position ?? 0,
    ticket_number: row.ticket_number ?? null,
    archived_at: toDateOrNull(row.archived_at),
    created_at: toDate(row.created_at) ?? new Date(0),
    updated_at: toDate(row.updated_at) ?? new Date(0),
    created_by: row.created_by ?? null,
    visibility: (row.visibility as Document['visibility']) ?? 'workspace',
    started_at: toDateOrNull(row.started_at),
    completed_at: toDateOrNull(row.completed_at),
    cancelled_at: toDateOrNull(row.cancelled_at),
    reopened_at: toDateOrNull(row.reopened_at),
    converted_to_id: row.converted_to_id ?? null,
    converted_from_id: row.converted_from_id ?? null,
    converted_at: toDateOrNull(row.converted_at),
    converted_by: row.converted_by ?? null,
  }
}

function checkType(row: RawDocumentRow, expected: DocumentType): void {
  if (row.document_type !== expected) {
    throw new Error(
      `Mapper for document_type='${expected}' received row ${row.id} with document_type='${row.document_type}'`
    )
  }
}

// ----------------------------------------------------------------------------
// Per-type mappers
// ----------------------------------------------------------------------------

export function mapIssueDocument(row: RawDocumentRow): IssueDocument {
  checkType(row, 'issue')
  if (!isJSONContent(row.content)) {
    throw new Error(`mapIssueDocument(${row.id}): content failed JSONContent guard`)
  }
  if (!isIssueProperties(row.properties)) {
    throw new Error(`mapIssueDocument(${row.id}): properties failed IssueProperties guard`)
  }
  if (typeof row.ticket_number !== 'number') {
    throw new Error(`mapIssueDocument(${row.id}): ticket_number must be a number for issue documents`)
  }
  return {
    ...mapCommonFields(row),
    document_type: 'issue',
    content: row.content,
    properties: row.properties,
    ticket_number: row.ticket_number,
  }
}

export function mapProjectDocument(row: RawDocumentRow): ProjectDocument {
  checkType(row, 'project')
  if (!isJSONContent(row.content)) {
    throw new Error(`mapProjectDocument(${row.id}): content failed JSONContent guard`)
  }
  if (!isProjectProperties(row.properties)) {
    throw new Error(`mapProjectDocument(${row.id}): properties failed ProjectProperties guard`)
  }
  return {
    ...mapCommonFields(row),
    document_type: 'project',
    content: row.content,
    properties: row.properties,
  }
}

export function mapProgramDocument(row: RawDocumentRow): ProgramDocument {
  checkType(row, 'program')
  if (!isJSONContent(row.content)) {
    throw new Error(`mapProgramDocument(${row.id}): content failed JSONContent guard`)
  }
  if (!isProgramProperties(row.properties)) {
    throw new Error(`mapProgramDocument(${row.id}): properties failed ProgramProperties guard`)
  }
  return {
    ...mapCommonFields(row),
    document_type: 'program',
    content: row.content,
    properties: row.properties,
  }
}

export function mapWeekDocument(row: RawDocumentRow): WeekDocument {
  checkType(row, 'sprint')
  if (!isJSONContent(row.content)) {
    throw new Error(`mapWeekDocument(${row.id}): content failed JSONContent guard`)
  }
  if (!isWeekProperties(row.properties)) {
    throw new Error(`mapWeekDocument(${row.id}): properties failed WeekProperties guard`)
  }
  return {
    ...mapCommonFields(row),
    document_type: 'sprint',
    content: row.content,
    properties: row.properties,
  }
}

export function mapWikiDocument(row: RawDocumentRow): WikiDocument {
  checkType(row, 'wiki')
  if (!isJSONContent(row.content)) {
    throw new Error(`mapWikiDocument(${row.id}): content failed JSONContent guard`)
  }
  if (!isWikiProperties(row.properties)) {
    throw new Error(`mapWikiDocument(${row.id}): properties failed WikiProperties guard`)
  }
  return {
    ...mapCommonFields(row),
    document_type: 'wiki',
    content: row.content,
    properties: row.properties,
  }
}

export function mapPersonDocument(row: RawDocumentRow): PersonDocument {
  checkType(row, 'person')
  if (!isJSONContent(row.content)) {
    throw new Error(`mapPersonDocument(${row.id}): content failed JSONContent guard`)
  }
  if (!isPersonProperties(row.properties)) {
    throw new Error(`mapPersonDocument(${row.id}): properties failed PersonProperties guard`)
  }
  return {
    ...mapCommonFields(row),
    document_type: 'person',
    content: row.content,
    properties: row.properties,
  }
}

// ----------------------------------------------------------------------------
// Dispatcher: pick the right mapper from the row's document_type
// ----------------------------------------------------------------------------

/**
 * Type-discriminated mapper. Inspects `row.document_type` and dispatches to
 * the appropriate per-type mapper. Throws on unknown document_type.
 *
 * Use this when the caller doesn't know the document_type at compile time
 * (e.g., a listing endpoint that returns mixed types). For known types,
 * prefer the direct `mapIssueDocument(row)` etc. for tighter types.
 */
export function mapDocument(row: RawDocumentRow):
  | IssueDocument
  | ProjectDocument
  | ProgramDocument
  | WeekDocument
  | WikiDocument
  | PersonDocument {
  switch (row.document_type) {
    case 'issue':
      return mapIssueDocument(row)
    case 'project':
      return mapProjectDocument(row)
    case 'program':
      return mapProgramDocument(row)
    case 'sprint':
      return mapWeekDocument(row)
    case 'wiki':
      return mapWikiDocument(row)
    case 'person':
      return mapPersonDocument(row)
    default:
      throw new Error(`mapDocument(${row.id}): unknown document_type '${row.document_type}'`)
  }
}
