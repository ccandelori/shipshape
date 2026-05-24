# Discovery — Running Notes

> *"Find three things you didn't know."* — GFA Week 4 ShipShape Kickoff, page 12.

> *"Start collecting candidates now — the best ones tend to show up during orientation, not during the audit."* — `orientation/README.md`, end of §8.

This is the running notes file the Kickoff says to keep "all week." Three candidates surfaced from the orientation + Phase 1 audit work, each captured in the Kickoff page-12 format (**WHAT · WHERE · WHY · THE POINT · THEN**). The final-submission Discovery write-up will refine from this list.

---

## Candidate 1 — Yjs dual-persistence: binary CRDT + JSON snapshot in the same row

### WHAT

An architectural pattern, not a TypeScript feature. The Ship `documents` table persists every editable document **twice**:

- `yjs_state` — the authoritative binary CRDT state (`bytea`), the only thing the collab server reads/writes during a real-time edit session.
- `content` — a JSON snapshot (`jsonb`) updated alongside `yjs_state` after every persist debounce. This is what every non-collab read path consumes (REST API, search index, server-side renders, exports).

### WHERE

- `api/src/db/schema.sql` — the `documents` table definition with both columns.
- `api/src/collaboration/index.ts:111–178` — `persistDocument()` writes both columns in one `UPDATE`, after computing `content` via `yjsToJson(fragment)` on the in-memory `Y.Doc`.
- `api/src/utils/yjsConverter.ts:62–110` — `yjsToJson` walks the Yjs XmlFragment and emits TipTap JSON.
- `orientation/deep-dives/real-time-collaboration.md` — full deep-dive write-up.

### WHY

The standard Yjs-on-Postgres tutorial says "store the binary blob, hydrate it to JSON in memory whenever you need to read." That works at toy scale and breaks at production scale: every REST request that wants to show document metadata has to instantiate a `Y.Doc`, apply the binary update, and serialise.

Ship's authors decided the JSON cost was worth paying once (on every persist) to avoid paying it forever (on every read). It's an "eventual consistency at the JSON layer" pattern — the JSON snapshot can briefly lag the binary state under burst writes, but for the read paths that consume it (search, list views, exports), that's fine.

The cost: the dual-write path **must** never silently fail. The Phase 1 audit (Cat 6 Critical #1) confirmed live that if `yjsToJson` returns `undefined`, `JSON.stringify(undefined)` resolves to the JS value `undefined` → `pg` coerces to SQL NULL → the JSON column is nulled while the binary survives, and REST reads see an empty document. Phase 2 fix: wrap `yjsToJson` in `try/catch` and persist `yjs_state` only on failure (never silently NULL the JSON column).

### THE POINT

The "two columns, two read paths" decision is unglamorous database-design wisdom. It's the kind of choice that lets a small team run real-time collab on raw `pg` + a single Express process — boring tech, deliberately chosen — without ever needing Redis, a search service, or a separate collab cluster. The bug that fell out of it (silent NULL persist) is the kind of bug that only matters at scale; until then it looks like the system is "fine."

### THEN — how I'd apply this next time

Any time I'm tempted to "rebuild the JSON view on every read" from a canonical binary format: pre-compute the view once at write-time, store it next to the binary, and reckon explicitly with the dual-write failure modes (transactional vs eventual, what happens on partial failure, how the read path tolerates lag). Don't pay the deserialise-on-read cost forever to save one column.

---

## Candidate 2 — Unified document model: ten types, one table, JSONB properties bag

### WHAT

An architectural pattern. The `documents` table is the *only* place editable content lives in Ship — wikis, issues, projects, programs, sprints, weekly plans, weekly retros, standups, person profiles, and reviews are all rows in the same table, distinguished by a `document_type` enum and per-type `properties` JSONB.

There's no separate `issues` table, no `projects` table. Everything has the same primary key shape, the same workspace + visibility + ACL pipeline, the same TipTap rich-text editor, the same Yjs collaboration room, the same soft-delete and archive semantics.

### WHERE

- `api/src/db/schema.sql` — the `documents` table with `document_type` enum and `properties jsonb`.
- `shared/src/types/document.ts:1–345` — the `DocumentType` union (10 literal values), the `Document` base interface, ten per-type `*Properties` interfaces with `[key: string]: unknown` index signatures, and ten per-type `*Document` discriminated-union variants.
- `api/src/db/migrations/017_weekly_plans.sql`, `018b_standups.sql` — recent additions that **didn't require structural schema migrations**, only an enum extension and a new `*Properties` interface.
- `docs/unified-document-model.md` — the team's own write-up of the pattern.
- `orientation/deep-dives/unified-document-model.md` and `unified-document-model-explained.md` — my deep-dive write-ups.

### WHY

The first instinct for a project-management tool is to normalize: `issues` table, `projects` table, `sprints` table, separate join tables for each relationship. Each of those becomes a separate ACL surface, a separate ORM mapping, a separate search index, a separate audit log.

Ship's authors picked a different tradeoff: one table that pays a small ergonomic cost (untyped JSONB on the properties column, application-level discrimination on `document_type`) to win a huge maintenance cost (one ACL pipeline, one editor surface, one collab server, one search index). Adding a new document type costs an enum value and a TypeScript interface, not a migration. Migrations 017 and 018b *prove* this — they introduce significant new document types with zero new structural schema.

The cost is real: untyped JSONB cascades into ~80 `as <Type>` casts on `document.properties` in the web tree (Phase 1 audit Cat 1 finding #4) and JSONB hot-path predicates that need expression indexes (Cat 4 finding #1). Both are addressable improvements, not architectural rewrites.

### THE POINT

"Many similar things → many tables" is a learned reflex. It's often wrong. When the **operations** on a set of types are identical (rich-text editing, ACL checks, collaboration, search), unifying the table and discriminating on a column is a deliberate, high-leverage simplification. Notion's data model is this; so is Ship's.

### THEN — how I'd apply this next time

Before defining a second table for a "kind of content" that shares editor surface, ACL, or collaboration with an existing table, ask: would a `kind` column + a per-kind property bag with a discriminated TypeScript union compose the same product surface with less infrastructure? If yes, use the bag and pay the typed-mapper cost.

---

## Candidate 3 — OpenAPI registration as a single source of truth for both Swagger AND MCP tools

### WHAT

A library / engineering practice. Ship registers every API route with `@asteasolutions/zod-to-openapi` using its existing Zod request/response schemas. The same registration drives **two** consumers automatically:

1. **Swagger UI** — `/api/docs` is a live OpenAPI viewer; the schema regenerates on every API restart from the route registrations.
2. **MCP tool surface** — Ship auto-generates a Model Context Protocol tool definition for every registered endpoint, so an AI agent (like the one writing this) can call the API by tool name without ever seeing the raw `fetch`.

Both come from the *same* `extendZodWithOpenApi(z)` + `registry.registerPath(...)` calls in each route file. There is no separate "MCP definitions" file or "OpenAPI spec" YAML.

### WHERE

- `api/src/routes/openapi-registry.ts` — the registry singleton.
- `api/src/routes/documents.ts`, `issues.ts`, `weeks.ts`, etc. — route files call `registry.registerPath({...})` next to the actual handler with the same Zod schemas used by `safeParse`.
- `api/src/mcp/` — the MCP server walks the registry at startup to derive tool definitions.
- `.claude/CLAUDE.md` "Adding API Endpoints" section — the team's contract: *"All API routes must be registered with OpenAPI. Result: Swagger + MCP tools auto-generated."*

### WHY

Without this pattern, Ship would maintain three parallel sources of truth for "what this API does":

- Zod schemas for request/response validation (because every POST/PATCH uses `safeParse`).
- An OpenAPI spec for Swagger (typically a hand-edited YAML).
- A separate MCP tool registry (with its own JSON Schema definitions).

These three drift the moment anyone is in a hurry. The OpenAPI-as-registry pattern collapses them to one source — the Zod schema next to the handler — and amortizes the cost. Adding a new endpoint adds *one* schema, not three.

The MCP-from-registry derivation is the bonus that makes this strategically important: Ship is already AI-tool-friendly without any AI-specific code, because the same registration the team writes for Swagger gives an LLM a structured tool surface for free.

### THE POINT

When a code/spec/docs/tooling drift is going to bite you (and it always does), look for the single source of truth that lets *all the consumers* derive themselves. Don't write the OpenAPI spec by hand; don't write the MCP tools by hand; don't write the validation schema by hand. Write *one* description in code, and have the other artifacts fall out automatically.

### THEN — how I'd apply this next time

Whenever I have N independent definitions of the same shape (validation schema + serialisation schema + docs + tool surface + test fixtures), pick the single most-information-rich form (usually the validation schema — Zod, Pydantic, etc.) and derive the rest. The marginal cost of registering one new endpoint should be one schema and one handler — nothing else.

---

## Other candidates surfaced (not chosen for the final 3)

These showed up during orientation/audit and are worth noting in case any of the above doesn't survive the final write-up:

- **USWDS icon glob via `import.meta.glob`** — `web/src/components/icons/uswds/Icon.tsx` does `import.meta.glob('/node_modules/@uswds/uswds/dist/img/usa-icons/*.svg', ...)` which materialises every USWDS icon as a separate Vite-managed JS chunk (247 of them in production). Effective per-icon code-split for free; surprising at build time.
- **Federal CAIA/PIV auth via a vendored OIDC SDK patch** — `api/src/auth/caia/` and the vendored `openid-client` patch implement Dynamic Client Registration (DCR) against a JWKS endpoint with mTLS. Almost no public Express examples of this; the patch is load-bearing. See `orientation/deep-dives/auth-providers.md`.
- **Empty `shared/src/types/auth.ts` by design** — single comment: *"All auth types are defined locally in api/ and web/ packages."* This is an architectural signal that auth is NOT shared across the boundary, a deliberate inversion of the usual "share the session type" instinct. Cost: drift risk between web's and api's local auth shapes.
- **15-minute idle + 12-hour absolute session timeout cites NIST SP 800-63B-4 AAL2** as the requirement — federal compliance trace in a `shared/` constants file. Most apps don't show the receipt.

---

## Audit-trail notes

| When | Note |
|---|---|
| 2026-05-18 | Orientation pass started; candidates 2 (unified model) and 3 (OpenAPI/MCP) surfaced from `docs/` reading and tracing `POST /api/documents` end-to-end. |
| 2026-05-19 | Candidate 1 (Yjs dual-persistence) surfaced during Cat 4 EXPLAIN ANALYZE work — saw `content` and `yjs_state` referenced in the same UPDATE in `persistDocument()`. Cat 6 critical #1 (silent NULL persist) confirmed the design tension live. |
| 2026-05-20 | Cross-check against PDF Kickoff page 12 — created this running-notes file in the prescribed WHAT · WHERE · WHY · THE POINT · THEN format. |
