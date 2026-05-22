# Deployment — ShipShape improved fork

The GFA Week 4 brief requires a deployed, publicly accessible URL of the improved fork as one of the submission deliverables.

## Status

🟡 **Pending — Cameron is deploying; URL to be pasted into `SUBMISSION.md` once live.**

## Hosted URL

[FILL IN ONCE LIVE]

## Health check / smoke test

```bash
# Backend health
curl -sf <BACKEND_URL>/health
# Expected: {"status":"ok"}

# Frontend smoke test (200, returns HTML)
curl -sIf <FRONTEND_URL>/ | head -1
# Expected: HTTP/2 200 OK
```

## Deployment workflow used

Per `CLAUDE.md`, the canonical deploy commands are:

```bash
./scripts/deploy.sh prod           # Backend → Elastic Beanstalk
./scripts/deploy-frontend.sh prod  # Frontend → S3/CloudFront
```

If you used a different hosting target (Vercel / Railway / Cloudflare Pages / personal AWS), note it here:

- Hosting target: [FILL IN]
- Deploy command(s): [FILL IN]
- DNS configuration: [FILL IN]
- HTTPS / TLS: [FILL IN]

## What graders should verify on the deployed instance

1. `GET /health` returns `{"status":"ok"}`
2. `/login` page loads (Lighthouse a11y still 100 on this route)
3. Login with seeded credentials shows the dashboard at `/my-week`
4. Open Network DevTools and confirm the entry bundle is **~142 KB gzipped** (the Cat 2 measurement holds in prod)
5. Open the issues list page; the JSONB hot-path indexes from migration 038 should make this query sub-50ms (visible in Network panel)

## Migration check

Migration 038 (the JSONB hot-path expression indexes) must have been applied to the deployed Postgres. Verify with:

```bash
psql <deployed_db_url> -c "SELECT indexname FROM pg_indexes WHERE tablename='documents' AND indexname LIKE 'idx_documents_%';"
```

Should list at minimum:
- `idx_documents_issue_state`
- `idx_documents_issue_assignee_id`
- `idx_documents_sprint_number`
- `idx_documents_project_owner_id`

## Demo notes

The deployed instance is the seed that `pnpm db:seed` produces: dev user `dev@ship.local` / `admin123`, 35 weeks, 104 issues, 20+ projects. Same dataset the Phase 2 benchmarks ran against.
