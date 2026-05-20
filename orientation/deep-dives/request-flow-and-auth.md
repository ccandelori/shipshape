# Deep Dive — Request Flow & Authentication

> Companion to `orientation/README.md §3 Request Flow`.
> Code to read: `api/src/app.ts`, `api/src/middleware/auth.ts`, `api/src/middleware/visibility.ts`, `api/src/routes/auth.ts`, `api/src/routes/documents.ts`, `api/src/db/client.ts`.

## The one-sentence mental model

**A request enters Express, passes through an ordered chain of middleware (auth, then visibility, then route-specific), reaches a route handler that runs raw SQL via `pg`, and returns JSON. There is no ORM and no service-class indirection — the route handler is where the logic lives.**

Once you can trace one request end-to-end, every other request is the same
shape with different details. Pick "create an issue" and burn it into memory.

## Why this layer matters for the audit

Four of the seven audit categories depend on understanding request flow:

- **API Response Time** — you can't profile what you can't trace.
- **Database Query Efficiency** — N+1s and missing indexes both live in
  route handlers.
- **Runtime Error Handling** — error boundaries, unhandled rejections, and
  network-failure recovery happen at this layer.
- **Type Safety** — the API boundary is where untyped data enters the
  system; it's where type guards earn their keep.

## The architectural shape

```
Browser  ──HTTP──▶  Express (api/src/app.ts)
                       │
                       ▼
                  Middleware chain
                  (auth → visibility → route-specific)
                       │
                       ▼
                  Route handler  ──SQL via pg──▶  Postgres
                       │                              │
                       ◀──────────rows──────────────────
                       │
                       ▼
                  JSON response
```

WebSocket connections share the auth model but skip the rest:

```
Browser  ──WS upgrade──▶  Express upgrade handler
                                   │
                                   ▼
                          api/src/collaboration/index.ts
                                   │
                                   ▼
                          Yjs sync loop + persistence
```

## The middleware chain — the order is the contract

Open `api/src/app.ts`. You'll see Express middleware mounted in a specific
order. **Order matters absolutely.** Common shape:

1. `express.json()` and friends — parse the body.
2. `cookie-parser` or equivalent — parse cookies.
3. Session/auth middleware — read the session cookie, attach `req.user`.
4. Visibility middleware — runs only on document routes; checks the
   requesting user can see this document.
5. Route handlers — `app.use('/api/documents', documentsRouter)` etc.
6. Error-handler middleware — last.

**Audit hooks:**

- Anything before `cookie-parser` can't see cookies, including the auth
  middleware. If you find an auth check in the wrong place, that's a finding.
- Anything before the JSON parser can't see `req.body`.
- Error handlers must come last and must take 4 args `(err, req, res, next)`.

## Authentication — what `CLAUDE.md` told us, and what to verify

The CLAUDE.md summary:

> "Auth uses session cookies with 15-minute timeout."

This is *almost* enough but not quite. Read `api/src/middleware/auth.ts`
to confirm:

- **What's in the session?** Probably `userId` + maybe role/team membership.
- **Where is the session stored?** Two common shapes: signed cookie containing
  the whole session (stateless, no DB lookup per request), or session ID in a
  cookie + state in Postgres (`sessions` table). The audit cares about the
  difference — stateful sessions add a DB read to *every* request.
- **What does the 15-minute timeout mean?** Likely *inactivity* timeout
  (`maxAge` reset on every request) vs *absolute* timeout (issued-at-based).
  The CLAUDE.md reference doc mentions a "12hr absolute" alongside the 15min
  inactivity — verify in code.
- **What happens to an unauthenticated request?** 401 with what body? A
  redirect? Some routes are unauthenticated by design (login, health) — find
  the allowlist.

Ship also has multiple auth providers visible in routes: `auth.ts`,
`caia-auth.ts`, `api-tokens.ts`, plus `admin-credentials.ts`. There are
likely multiple paths into the session middleware — local password, an
external CAIA SSO, and API tokens for programmatic clients. Worth a
half-page in your orientation notes once you read those files.

## Visibility — the second checkpoint

After auth establishes *who* the user is, `api/src/middleware/visibility.ts`
establishes *what they can see*. Ship's documents have visibility levels
(private / team / org / public per the model). The visibility middleware
either filters list queries by visibility or rejects access to specific
documents.

**Common patterns and pitfalls:**

- **Pattern: filter the query, don't filter the results in memory.** If the
  middleware fetches all documents and then drops the ones the user can't
  see, that's an N+1-adjacent perf bug. Verify the SQL applies the visibility
  rules.
- **Pattern: visibility check on writes, not just reads.** A user can read a
  shared doc but not edit it? The middleware needs to know the HTTP method.
- **Pitfall: bypassed on internal routes.** Routes that take a `documentId`
  as a path param need explicit checks; the middleware can't help if the
  route isn't mounted under a path it intercepts.

The audit's accessibility-of-data findings often live here — too restrictive,
or too lax, or inconsistent across endpoints. Compare `GET /api/documents/:id`
to `PUT /api/documents/:id` to `DELETE /api/documents/:id` and confirm they
all run the same check.

## The route handler — where the logic actually is

Open `api/src/routes/documents.ts`. The pattern (raw `pg`, no ORM, no
repository class) means a typical handler looks like:

```ts
router.post('/', authRequired, async (req, res) => {
  const { title, type, properties } = req.body;
  // ... validation ...
  const result = await pool.query(
    `INSERT INTO documents (title, document_type, properties, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [title, type, properties, req.user.id]
  );
  res.json(result.rows[0]);
});
```

**What to look for during the audit:**

- **SQL injection.** Parameterized via `$1, $2, ...` is safe; string-concatenated
  is not. Grep for `${` inside template literals passed to `pool.query`.
- **N+1 inside a handler.** A handler that runs a query, then for each row
  runs another query, is the canonical N+1. Look in handlers that return
  lists of documents with their associations.
- **Missing `await`.** A forgotten `await` on a query returns a Promise that
  serializes to `{}` in JSON. Hard to spot at runtime.
- **Error handling at the boundary.** Throw inside a handler → caught where?
  Most Express setups need an explicit `.catch(next)` or `try/catch`. Modern
  Express handles async errors in handlers automatically only if you're on
  v5+ — verify the Express version in `api/package.json`.

## DTOs at the boundary

The route handler reads `req.body` (untyped — `any` or `unknown`) and writes
a JSON response. Both directions deserve attention:

- **Inbound:** every `req.body.x` access should be guarded by validation. If
  the codebase has Zod or similar, it'll show up here. If it doesn't, that's
  a finding: hand-validated JSON is brittle.
- **Outbound:** OpenAPI schema in `api/src/openapi/` defines response shapes.
  If responses drift from the schema, the auto-generated MCP tools (per
  `CLAUDE.md` "Adding API Endpoints") will misbehave.

The audit's type-safety category overlaps with this layer significantly —
see `typescript-patterns.md` §Type Guards.

## WebSocket auth — the asymmetric case

The HTTP upgrade to a WebSocket is *one* request, but it's special:

- Cookies are sent on the upgrade — the auth middleware can read them.
- After the upgrade succeeds, no more HTTP requests happen — the connection
  is open. The user's session can expire mid-connection.
- The server has to choose: hard-close on expiry, soft-expire on next write,
  or trust the connection for its lifetime.

Read `api/src/collaboration/index.ts` to see which Ship chose. Almost
certainly the upgrade calls into the same `auth.ts` logic. The post-upgrade
expiry behavior is a likely audit finding either way — there is no obviously
correct choice, just consistency.

## A canonical request — fill this in during orientation

Pick "create an issue" (POST to documents with `type: 'issue'`). Trace it:

| Step | File | Line range |
|---|---|---|
| User clicks "New Issue" in UI | `web/src/components/...` | |
| Component calls hook | `web/src/hooks/...` or `web/src/services/...` | |
| Hook fires `fetch('/api/documents', {...})` | | |
| Cookie sent automatically (same-origin) | (browser) | |
| Express receives request | `api/src/app.ts` | |
| JSON parser runs | `api/src/app.ts` | |
| Cookie parser runs | `api/src/app.ts` | |
| Auth middleware reads session, attaches `req.user` | `api/src/middleware/auth.ts` | |
| Documents router matches `POST /` | `api/src/routes/documents.ts` | |
| Handler validates body | `api/src/routes/documents.ts` | |
| Handler runs INSERT | `api/src/routes/documents.ts` | |
| pg pool returns inserted row | `api/src/db/client.ts` | |
| Handler responds with JSON | `api/src/routes/documents.ts` | |
| Hook receives response, updates client state | `web/src/...` | |
| Component re-renders with new issue | (React) | |

Filling in the file-and-line column is the orientation exercise. Once it's
filled in, you have a *map* you can refer to during the audit instead of
re-tracing every time.

## Audit prompts (use these during API response time + DB efficiency)

- Pick the 5 most-frequent endpoints (DevTools → Network on common flows).
  For each: which middleware runs? How many SQL queries? Which JSON parses?
- Run `EXPLAIN ANALYZE` on the single slowest query you found. What does the
  plan say? Sequential scan = a missing index, almost always.
- Enable `log_statement = 'all'` in Postgres. Reload the main page. Count
  queries. If it's > 10, you have an N+1.
- Look for response-shape inconsistency: same endpoint returning slightly
  different fields across cases. That's a type-safety smell.

## Cross-references

- The visibility middleware enforces document ACL on top of the unified
  model — see `unified-document-model.md` §What "Everything is a
  document" buys.
- The WebSocket auth path lives at the seam between this layer and the
  collaboration server — see `real-time-collaboration.md` §Server.
- The DTO shapes at the boundary use discriminated unions and utility types
  — see `typescript-patterns.md` §Discriminated Unions and §Utility
  Types.
