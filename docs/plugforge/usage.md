# Plugforge Public Platform Usage

Stable /api/v1 surface for Agent (Epic 7), CLIs, and third-parties. Dedicated Bearer (no session/CSRF mix). Cursor pagination, rate headers, PublicApiError + request_id, exact webhook t/v1 + idempotency + replay.

## OAuth (all grants supported for Agent + devs)

- Client Credentials (Agent primary): `clientCredentials({clientId, clientSecret})` -> token for public CRUD.
- Device (CLI): `deviceLogin({onUserCode})` poll.
- PKCE: authorizationCodeFlow.

System app (is_system) seeded on `pnpm db:seed` (or prod SSM); narrow scopes only.

Example (Agent / MCP):

```ts
import { ShipClient } from '@ship/sdk';
const client = await ShipClient.clientCredentials({
  clientId: process.env.SHIP_AGENT_CLIENT_ID!,
  clientSecret: process.env.SHIP_AGENT_CLIENT_SECRET!,
  baseUrl: 'https://.../api/v1',
});
const doc = await client.documents.create({ title: 'From Agent' });
// audit row has client_id
```

## Public resources (minimal stable surface)

documents, issues, sprints (weeks). All use same unified model.

See OpenAPI: GET /api/v1/openapi.json (3.1, public paths only, bearerAuth).

SDK clients: .documents.* .issues.* .sprints.* (create/list/get/update/delete + cursor).

Errors always PublicApiError {code, message, details?, request_id}.

## Webhooks (exact contract)

- Subscribe via portal (internal) or future public.
- Delivery: POST with Idempotency-Key + Ship-Signature: t=...,v1=...
- verifyWebhook(headers, rawBody, secret, 300) -> bool (timingSafe, tolerance).
- Replay: uses original key + secret *at signing time*.
- Backoff exact: 1s/4s/16s/1m/5m/30m (6 attempts -> DLQ).
- 4xx permanent fail; 5xx retry.

Subscriber must be idempotent on key.

## Portal (minimal dogfood)

In-app Developer section (session + workspaceAdmin): reg app, rotate secret (shown once), manage subs (PUBLIC_EVENT_TYPES), delivery log + replay (audited, re-uses key + current secret snapshot).

Dogfoods SDK verify in "test publish" button.

## Agent prep

System app + CC + public paths. Full rewire in Epic 7 follow-up.

See also: docs/architecture.md (contracts, webhook pipeline), presearch.md (decisions).

TTFE gate (CI): exercises full (login->create->verified receipt <60s).
