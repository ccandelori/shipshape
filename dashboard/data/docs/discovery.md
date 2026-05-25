# Discovery — Three Things Learned

> *"Find three things you didn't know."* — GFA Week 4 ShipShape Kickoff, page 12.

Three architectural discoveries surfaced during the orientation + Phase 1 audit, drawn from the [`orientation/deep-dives/`](deep-dives/) write-ups. Each follows the four-part structure: **what · file path + line range · why it matters · future application**.

---

## 1. Yjs dual-persistence: binary CRDT + JSON snapshot in the same row

### What

The Ship `documents` table persists every editable document **twice** in the same row: `yjs_state` is the authoritative binary CRDT state (`bytea`) that the collab server reads/writes during a real-time edit; `content` is a JSON snapshot (`jsonb`) updated alongside `yjs_state` after every persist debounce and consumed by every non-collab read path (REST API, search index, server-side renders, exports). One write, two read shapes.

### File path + line range

- `api/src/db/schema.sql` — the `documents` table definition with both columns.
- `api/src/collaboration/index.ts:111–178` — `persistDocument()` writes both columns in a single `UPDATE`, computing `content` via `yjsToJson(fragment)` on the in-memory `Y.Doc`.
- `api/src/utils/yjsConverter.ts:62–110` — `yjsToJson` walks the Yjs XmlFragment and emits TipTap JSON.
- `orientation/deep-dives/real-time-collaboration.md` — full deep-dive write-up.

### Why it matters

The textbook Yjs-on-Postgres pattern is "store the binary blob, hydrate to JSON in memory whenever you need to read." That works at toy scale and breaks at production scale: every REST request that wants document metadata has to instantiate a `Y.Doc`, apply the binary update, and serialise. Ship's authors decided the JSON cost was worth paying once on every persist to avoid paying it forever on every read — letting a small team run real-time collab on raw `pg` + a single Express process without Redis, a search service, or a separate collab cluster.

The cost: the dual-write path **must not silently fail**. Phase 1 (Cat 6 Critical #1) confirmed live that if `yjsToJson` returned `undefined`, `JSON.stringify(undefined)` resolved to the JS value `undefined` → `pg` coerced to SQL `NULL` → the JSON column nulled while the binary survived, and REST reads saw an empty document. The pattern's correctness depends entirely on the converter's failure mode being loud, not silent. Phase 2 fix wraps `yjsToJson` in `try/catch` and persists `yjs_state` only on failure rather than ever nulling the JSON column.

### Future application

Any time the instinct is "rebuild the view on every read" from a canonical binary format: pre-compute the view once at write time, store it next to the binary, and reckon explicitly with the dual-write failure modes (transactional vs eventual, what happens on partial failure, how the read path tolerates lag). Don't pay the deserialise-on-read cost forever to save one column.

---

## 2. Unified document model: ten types, one table, JSONB properties bag

### What

The `documents` table is the only place editable content lives in Ship — wikis, issues, projects, programs, sprints, weekly plans, weekly retros, standups, person profiles, and reviews are all rows in the same table, distinguished by a `document_type` enum and per-type `properties` JSONB. There is no separate `issues` table, no `projects` table. Everything has the same primary key shape, workspace + visibility + ACL pipeline, TipTap editor, Yjs collaboration room, and soft-delete semantics.

### File path + line range

- `api/src/db/schema.sql` — the `documents` table with `document_type` enum and `properties jsonb`.
- `shared/src/types/document.ts:1–345` — the `DocumentType` union (10 literals), the `Document` base interface, ten per-type `*Properties` interfaces with `[key: string]: unknown` index signatures, and ten per-type `*Document` discriminated-union variants.
- `api/src/db/migrations/017_weekly_plans.sql`, `018b_standups.sql` — recent additions that **didn't require structural schema migrations**, only an enum extension and a new `*Properties` interface.
- `docs/unified-document-model.md` — the team's own write-up.
- `orientation/deep-dives/unified-document-model.md`, `unified-document-model-explained.md` — deep-dive write-ups.

### Why it matters

The reflex when designing a project-management tool is to normalise: `issues` table, `projects` table, `sprints` table, separate join tables. Each becomes a separate ACL surface, ORM mapping, search index, audit log. Ship's authors picked the opposite tradeoff — one table that pays a small ergonomic cost (untyped JSONB on `properties`, application-level discrimination on `document_type`) to win a large maintenance cost: one ACL pipeline, one editor surface, one collab server, one search index. Adding a new document type costs an enum value and a TypeScript interface, not a migration. Migrations 017 and 018b prove this — they introduce significant new document types with zero new structural schema.

This pattern is high-leverage when the **operations** across types are identical (rich-text editing, ACL checks, collaboration, search). "Many similar things → many tables" is a learned reflex that's often wrong. The costs are real and bounded: untyped JSONB cascades into ~80 `as <Type>` casts in the web tree (Phase 1 audit Cat 1 #4) and JSONB hot-path predicates need expression indexes (Cat 4 #1). Both are addressable improvements, not architectural rewrites. Notion's data model is this; so is Ship's.

### Future application

Before defining a second table for a "kind of content" that shares editor surface, ACL, or collaboration with an existing table, ask: would a `kind` column + a per-kind property bag with a discriminated TypeScript union compose the same product surface with less infrastructure? If yes, use the bag and pay the typed-mapper cost.

---

## 3. OpenAPI registration as single source of truth for Swagger + MCP tools

### What

Ship registers every API route with `@asteasolutions/zod-to-openapi` using its existing Zod request/response schemas. The same registration drives **two** consumers automatically: Swagger UI at `/api/docs` (live, regenerates on every API restart) and the Model Context Protocol (MCP) tool surface (auto-generated tool definitions for every registered endpoint, callable by AI agents by tool name). Both come from the same `registry.registerPath(...)` calls in each route file — no separate "MCP definitions" file or "OpenAPI spec" YAML.

### File path + line range

- `api/src/routes/openapi-registry.ts` — the registry singleton.
- `api/src/routes/documents.ts`, `issues.ts`, `weeks.ts` (and every other route file) — `registry.registerPath({...})` calls sit next to each handler with the same Zod schemas used by `safeParse`.
- `api/src/mcp/` — the MCP server walks the registry at startup to derive tool definitions.
- `.claude/CLAUDE.md` — "Adding API Endpoints" section codifies the contract: *"All API routes must be registered with OpenAPI. Result: Swagger + MCP tools auto-generated."*

### Why it matters

Without this pattern, Ship would maintain three parallel sources of truth for "what this API does": Zod schemas for request/response validation, a hand-edited OpenAPI YAML for Swagger, and a separate MCP tool registry with its own JSON Schema. The three drift the moment anyone is in a hurry. The OpenAPI-as-registry pattern collapses them to one source — the Zod schema next to the handler — and amortises the cost: adding a new endpoint adds *one* schema, not three.

The MCP-from-registry derivation is the strategic bonus: Ship is already AI-tool-friendly without any AI-specific code, because the same registration the team writes for Swagger gives an LLM a structured tool surface for free. This is the kind of "single source of truth that lets all the consumers derive themselves" decision that avoids the entire class of code/spec/docs/tooling drift.

### Future application

Whenever there are N independent definitions of the same shape (validation schema + serialisation schema + docs + tool surface + test fixtures), pick the single most-information-rich form (usually the validation schema — Zod, Pydantic, etc.) and derive the rest. The marginal cost of registering a new endpoint should be one schema and one handler, nothing else.

---

## Other candidates surfaced (not chosen for the final 3)

These came up during orientation/audit and are noted here in case any of the above doesn't survive a later refinement pass:

- **USWDS icon glob via `import.meta.glob`** — `web/src/components/icons/uswds/Icon.tsx` does `import.meta.glob('/node_modules/@uswds/uswds/dist/img/usa-icons/*.svg', ...)` which materialises every USWDS icon as a separate Vite-managed JS chunk (247 of them in production). Effective per-icon code-split for free; surprising at build time.
- **Federal CAIA/PIV auth via a vendored OIDC SDK patch** — `api/src/auth/caia/` and the vendored `openid-client` patch implement Dynamic Client Registration (DCR) against a JWKS endpoint with mTLS. Almost no public Express examples of this; the patch is load-bearing. See `orientation/deep-dives/auth-providers.md`.
- **Empty `shared/src/types/auth.ts` by design** — single comment: *"All auth types are defined locally in api/ and web/ packages."* An architectural signal that auth is NOT shared across the boundary — a deliberate inversion of the usual "share the session type" instinct. Cost: drift risk between web's and api's local auth shapes.
- **15-minute idle + 12-hour absolute session timeout cites NIST SP 800-63B-4 AAL2** as the requirement — federal compliance trace in a `shared/` constants file. Most apps don't show the receipt.

---

## Audit-trail notes

| When | Note |
|---|---|
| 2026-05-18 | Orientation pass started; candidates 2 (unified model) and 3 (OpenAPI/MCP) surfaced from `docs/` reading and tracing `POST /api/documents` end-to-end. |
| 2026-05-19 | Candidate 1 (Yjs dual-persistence) surfaced during Cat 4 EXPLAIN ANALYZE work — saw `content` and `yjs_state` referenced in the same `UPDATE` in `persistDocument()`. Cat 6 critical #1 (silent NULL persist) confirmed the design tension live. |
| 2026-05-20 | Cross-checked against the Kickoff page-12 format; collected candidates into the running-notes file. |
| 2026-05-24 | Restructured to the four-part Discovery format (what · file path + line range · why it matters · future application) per submission feedback. |
