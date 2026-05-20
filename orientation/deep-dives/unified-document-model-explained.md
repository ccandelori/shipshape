# The Unified Document Model

> Pedagogical walkthrough of Ship's single most important architectural decision.
> Companion to `unified-document-model.md` (which is structured as reference) — this file is structured as teaching.

## The decision in one sentence

Ship puts **every kind of user content — wikis, issues, projects, sprints, persons, weekly plans, weekly retros, standups, weekly reviews — into a single `documents` table**, distinguished by a `document_type` discriminator column. Type-specific fields live in a JSONB `properties` bag.

## What you'd naturally reach for, and why Ship rejected it

The obvious approach is one table per entity type:

```sql
CREATE TABLE issues   (id, title, status, priority, assignee_id, ...);
CREATE TABLE projects (id, title, color, ice_score, owner_id, ...);
CREATE TABLE sprints  (id, title, start_date, owner_id, ...);
CREATE TABLE wikis    (id, title, content, ...);
```

That gives you per-type integrity (an issue *must* have a status — Postgres enforces it), and per-type queries are simple.

What it *costs* is N parallel implementations of everything else: N editors, N search indexes, N sync protocols, N permission systems, N audit-log integrations, N soft-delete pipelines. And it makes "show me everything Cameron is working on across projects, sprints, and issues" a UNION across multiple tables.

Ship made the opposite bet: **the structural difference between types is the value of one column, not the shape of the table.**

## The actual schema

```sql
CREATE TABLE documents (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL,
  document_type   document_type NOT NULL,   -- enum: 'wiki' | 'issue' | 'project' | 'sprint' | 'person' | 'weekly_plan' | 'weekly_retro' | 'standup' | 'weekly_review'
  title           TEXT,
  content         JSONB,         -- TipTap editor state (same shape for all types)
  yjs_state       BYTEA,         -- Yjs CRDT state (same for all)
  properties      JSONB,         -- type-specific fields go here
  parent_id       UUID,          -- self-ref for hierarchies
  visibility      TEXT,          -- 'private' | 'workspace'
  archived_at     TIMESTAMPTZ,   -- soft archive
  deleted_at      TIMESTAMPTZ,   -- 30-day soft delete
  created_by      UUID,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  ...
);
```

Everything common-across-types is a column. Everything type-specific is a JSONB key inside `properties`.

## The discriminator pattern, at two levels

**SQL.** Every typed query begins by filtering on `document_type`:

```sql
SELECT * FROM documents
WHERE document_type = 'issue'
  AND (properties->>'state')::text = 'in_progress'
  AND (properties->>'assignee_id')::uuid = $1
  AND deleted_at IS NULL;
```

**TypeScript.** `shared/src/types/document.ts` mirrors the SQL enum as a discriminated union:

```ts
type DocumentType = 'wiki' | 'issue' | 'project' | 'sprint' | 'person' | ...;

interface IssueDocument   extends Document { document_type: 'issue';   properties: IssueProperties; }
interface ProjectDocument extends Document { document_type: 'project'; properties: ProjectProperties; }
// ... 8 more variants

type Doc = IssueDocument | ProjectDocument | SprintDocument | ...;
```

The compiler narrows the type when you switch on `document_type`. SQL and TS agree on the same discriminator. That coherence is the whole point.

## Relationships: the junction table

Since you can't have a typed FK to "the project document," cross-document relationships live in a separate table:

```sql
CREATE TABLE document_associations (
  document_id       UUID,   -- FK → documents
  related_id        UUID,   -- FK → documents
  relationship_type relationship_type,  -- 'parent' | 'program' | 'project' | 'sprint'
  metadata          JSONB
);
```

So "this issue belongs to project X in sprint Y" is *two rows* in `document_associations` rather than two FK columns on `issues`. Migrations 020, 027, 029 are the history of that cutover — legacy columns (`program_id`, `project_id`, `sprint_id`) used to live on `documents` directly and were dropped one by one.

## What this design buys

- **One editor.** The 4-panel layout in `web/src/` works for every type because every type has the same `content` + `properties` shape.
- **One sync protocol.** Yjs operates on `documents.yjs_state` and `documents.content`. The collab server (`api/src/collaboration/index.ts`) doesn't care what type the document is.
- **One search.** Full-text on `title` and `content` works uniformly across types.
- **One ACL.** The visibility model (`'private' | 'workspace'`) and the workspace-membership check apply identically to everything.
- **Adding a new type is nearly free.** `017_standup_sprint_review_types`, `018b_document_conversion`, and the late additions of `weekly_plan` / `weekly_retro` / `standup` / `weekly_review` each cost *one enum extension* + a TypeScript interface in `shared/`. No new tables. No new routes from scratch.
- **Cross-type queries are trivial.** "Everything Cameron created" is `WHERE created_by = $1`, period. Not a UNION across N tables.

## What this design costs

- **No DB-level schema validation on `properties`.** An issue with no `state` field is structurally valid in Postgres. TypeScript is the only line of defense, and it only catches violations in code paths that go through the typed interfaces. Raw `pg.query` results don't.
- **JSONB filters need expression indexes.** A query like `WHERE (properties->>'state') = 'open'` against the `documents` GIN index will likely sequential-scan-then-filter. Ship currently has expression indexes on *exactly one* JSONB path: `((properties->>'user_id'))` on person documents. Every other hot path — `state`, `assignee_id`, `sprint_number`, `owner_id` — is unindexed. **This is one of the highest-leverage findings for the DB-efficiency audit.**
- **Type assertions everywhere.** `content` and `properties` are typed as `Record<string, unknown>` in `shared/src/types/document.ts:241,247`. Every code path that reads them has to cast. **1,474 `as` assertions in the codebase trace back to this single design choice.** A domain-mapper layer between pg rows and TS variants collapses most of them.
- **Relationships are slightly more expensive.** Reading "the project this issue belongs to" needs a JOIN through `document_associations`. Two composite indexes (`(document_id, type)` + `(related_id, type)`) make it cheap, but it's two rows of work where one FK would do.
- **JSONB pointers have no referential integrity.** `properties->>'assignee_id'` is *not* a foreign key. If you archive the person document, references in other docs' properties go stale silently. There's no `ON DELETE` behavior.

## The five questions to ask while reading code

1. **Is the `WHERE` clause filtering on `document_type`?** If not, the query is implicitly polymorphic — probably a bug.
2. **Is `deleted_at IS NULL` (and usually `archived_at IS NULL`) in the WHERE?** If not, soft-deleted rows leak.
3. **Are JSONB property reads casting from `unknown`, or going through a typed mapper?** Usually the former. That's where type-safety improvements live.
4. **For inter-doc relationships, is the code reading `document_associations` or a legacy column?** Legacy columns were dropped in 027/029 but old code patterns can survive. The junction table is authoritative.
5. **When the document body is edited, does the property change?** `api/src/collaboration/index.ts:118` extracts `hypothesis`/`success_criteria`/`vision`/`goals` from the TipTap state and writes them to `properties`. A "body-only edit" can quietly rewrite columnar properties.

## Bottom line

The unified model is the strongest architectural decision in the codebase — it collapses N parallel implementations into one. The costs are concentrated in two places (JSONB index strategy + the type-assertion cascade from `Record<string, unknown>`), and both are *addressable* without touching the architecture itself. Those are exactly where the audit should focus.
