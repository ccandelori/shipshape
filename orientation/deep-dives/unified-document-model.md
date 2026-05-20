# Deep Dive — The Unified Document Model

> Companion to `orientation/README.md §2 Data Model`.
> Source of truth: `docs/unified-document-model.md`, `docs/document-model-conventions.md`, and the migrations in `api/src/db/migrations/`.

## The one-sentence mental model

**Every piece of user content — wiki page, issue, project, sprint, person profile — is a row in `documents`, distinguished only by a `document_type` discriminator column.** Type-specific data lives in JSON (`properties` / `content`), and inter-document relationships live in a separate junction table.

Notion popularized this design. It's not the obvious choice — most apps would
make `issues`, `projects`, `sprints` separate tables — so it's worth
understanding *why* this team chose it and what it costs.

## Why one table instead of N

| Tradeoff | One table (Ship) | One table per type (the usual) |
|---|---|---|
| Adding a new document type | Add a value to the `document_type` enum, optionally add a JSON property convention. **Zero schema change.** | Migration: new table, new indexes, new FKs, new repository code. |
| Querying "everything by a person" / "everything in a project" | One query against `documents` + `document_associations`. | UNION across N tables, or N separate queries. |
| Full-text search across all content | One index on one table. | Search engine or N indexes. |
| Per-type integrity (e.g., an Issue *must* have a status) | Enforced in application code or as `CHECK` constraints on JSON properties. Easy to violate. | Enforced by columns and NOT NULL. Hard to violate. |
| Migration safety | Adding a column adds it to *every* document, including ones that don't logically have that field. | Adding a column affects only one type. |
| Query optimizer | One big hot table — index strategy is critical. | Smaller tables, often easier to keep in cache. |

The team has chosen flexibility-of-modeling and search/relationship simplicity
over per-type integrity. That choice colors the entire audit: the database
category is going to live or die on how well the indexes on `documents`
support the discriminator + JSON property patterns the app actually uses.

## The three pieces that make it work

### 1. The `documents` table

A single row holds: `id`, `document_type`, `title`, `content` (TipTap JSON for
the editor body), `yjs_state` (binary CRDT state — see the real-time deep
dive), `properties` (JSONB for type-specific fields), audit columns
(`created_at`, `updated_at`, `archived_at`, `deleted_at`), and a few legacy
columns surviving from earlier modeling (`program_id`, `project_id`).

The `document_type` enum acts as a **discriminator** — both at the SQL level
(every typed query filters on it) and at the TypeScript level (the shared
types use it for a discriminated union; see `typescript-patterns.md`).

### 2. The `properties` JSONB column

Type-specific fields live here. An issue might have
`{ status: "open", priority: "p1", assignee_id: "..." }`. A sprint might have
`{ start_date: "...", end_date: "...", goals: [...] }`. The structure isn't
enforced by the database — it's enforced by the TypeScript types in
`shared/src/types/` and validated at the API boundary.

**Audit implications:**
- Index strategy on JSONB is non-obvious. A GIN index covers a lot, but a
  query like `WHERE document_type = 'issue' AND properties->>'status' = 'open'`
  is much faster with an expression index on `(document_type, (properties->>'status'))`.
- N+1 patterns sneak in when a list view reads properties for each row
  separately instead of in a batch.

### 3. The `document_associations` junction table

Inter-document relationships are stored here, not as foreign keys on
`documents`. The known relationship types (per `CLAUDE.md`):

- `parent` — parent/child hierarchy
- `project` — "this document belongs to this project"
- `sprint` — "this issue is in this sprint"
- `program` — "this project rolls up to this program"

A row in `document_associations` is roughly `{ from_document_id, to_document_id, relationship_type, ...metadata }`.

**Note the historical mess.** Per `CLAUDE.md`:
> Legacy columns `program_id` and `project_id` still exist; `sprint_id` was dropped by migration 027.

So for *some* relationships you'll see both a legacy column on `documents`
and a row in `document_associations`. When reading code, always assume the
junction table is authoritative. When writing queries during the audit, check
which form the surrounding code uses.

## Failure modes the audit should look for

These are the patterns this design tends to produce, ranked by how often they
appear in similar systems:

1. **N+1 over the junction table.** A page renders a project's issues, then
   for each issue fetches its sprint via a separate `document_associations`
   query. Fix: a single JOIN.
2. **JSONB scans without expression indexes.** Filtering by
   `properties->>'status'` on a 10k-row `documents` table without a matching
   index = sequential scan every time.
3. **Forgotten `document_type` in WHERE clauses.** A query that means "all
   open issues" but is missing `AND document_type = 'issue'` will silently
   pull in matching rows of other types if any happen to share property keys.
4. **Hot-table contention.** Every write hits the same table. Watch for
   places where the same row is updated repeatedly (e.g., a counter cached on
   the document instead of in a separate table).
5. **Soft-delete leaks.** `deleted_at IS NULL` needs to be in *every* read
   path, or deleted documents reappear in lists. Grep for the constant.

## What "Everything is a document" buys the rest of the app

Beyond the database, this decision propagates:

- **One editor.** The 4-panel layout described in `CLAUDE.md` works for every
  type because all types share the same content shape. There is one `Editor`
  component — no `IssueEditor`, no `ProjectEditor`. The philosophy reviewer
  enforces this.
- **One sync protocol.** Yjs operates on `documents.yjs_state` and
  `documents.content`. The collaboration server doesn't care what type it is.
- **One search.** Full-text indexing across `title` and `content` works
  uniformly.
- **One ACL model.** Visibility middleware (`api/src/middleware/visibility.ts`)
  is uniform across types.

When you draft the architecture-assessment section, the unified model is
almost certainly one of the three strongest decisions. Be specific about
*why*: it collapses what would otherwise be N parallel implementations of
edit, sync, search, and ACL into one.

## Audit prompts (use these during the database-efficiency category)

- Pick one list view (e.g., the issues list). With `log_statement = 'all'`
  enabled in Postgres, count the queries it executes. Is it one query, or one
  per row?
- Run `EXPLAIN ANALYZE` on the slowest query. Is the planner using an index
  on `(document_type, ...)` or doing a sequential scan + filter?
- List every JSONB property that's used in a `WHERE` clause anywhere in
  `api/src/routes/`. For each, check whether a matching expression index
  exists.
- Find any place that selects from `documents` without filtering by
  `deleted_at IS NULL`. That's a soft-delete leak.

## Cross-references

- The TipTap content shape lives in `documents.content`; the CRDT state lives
  in `documents.yjs_state`. They are *two representations of the same
  document body*, and keeping them consistent is non-trivial — see
  `real-time-collaboration.md`.
- The discriminated union in TypeScript that mirrors `document_type` lives in
  `shared/src/types/` — see `typescript-patterns.md` §Discriminated
  Unions.
- Authorization on documents (private/team/org/public) is enforced in
  `api/src/middleware/visibility.ts` — see
  `request-flow-and-auth.md` §Middleware Chain.
