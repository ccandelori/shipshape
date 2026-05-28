---
title: "FleetGraph demo health and reset workflow"
date: 2026-05-28
category: workflow-issues
module: fleetgraph
problem_type: workflow_issue
component: tooling
severity: medium
applies_when:
  - "Preparing repeatable FleetGraph demos or dry runs"
  - "Resetting seeded FleetGraph findings after rehearsal actions"
  - "Verifying deployed app health against the database that owns demo document IDs"
  - "Avoiding local database and remote app URL mismatches"
related_components:
  - "development_workflow"
  - "documentation"
  - "testing_framework"
tags:
  - fleetgraph
  - demo-health
  - demo-reset
  - deploy-verification
  - environment-safety
  - dry-run
---

# FleetGraph demo health and reset workflow

## Context

FleetGraph demos depend on a small set of seeded findings, action candidates, comments, read receipts, and trace evidence. Normal rehearsal actions change that state: dismissing or snoozing clears the open inbox card, approving and resuming the HITL finding writes a comment, and opening the inbox marks findings read.

Before the health script existed, dry runs could start from an unknown state. Worse, a local command could combine local database IDs with the public droplet URL and print document links that looked valid but pointed at documents that did not exist in the deployed app. That made demo preparation fragile at exactly the moment it needed to be boring.

## Guidance

Create a scoped demo health script that verifies the required environment, database tables, seeded FleetGraph rows, and app health. Give it a reset mode that only restores demo artifacts, not the whole workspace.

The root command wraps the API package script:

```bash
pnpm fleetgraph:demo-health
```

Use the local form when rehearsing against the local Docker database and local Vite app:

```bash
cd /Users/sheep/Desktop/Gauntlet/ship
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev \
  pnpm fleetgraph:demo-health -- --reset --app-url http://localhost:5173
```

Use the droplet form when rehearsing or recording the public demo:

```bash
ssh ship@143.198.163.184 "sudo -n bash -lc 'set -a; source /etc/ship/env; set +a; cd /opt/ship/current/api; node dist/fleetgraph/scripts/demo-health.js --reset --app-url https://143.198.163.184.nip.io'"
```

The reset should be deliberately narrow. In FleetGraph it:

- restores the seeded open inbox finding to `open`
- restores the seeded HITL finding to `pending_review`
- clears suppressions, approvals, executions, and read receipts for the seeded findings
- deletes only the exact seeded FleetGraph comment body from the HITL target issue
- leaves the rest of the workspace intact

The script should print the demo accounts and browser links after checks pass:

```text
Demo accounts:
- Dev User: dev@ship.local / admin123
- Henry Patel: henry.patel@ship.local / admin123

Demo links:
- App: https://143.198.163.184.nip.io
- Week chat document: https://143.198.163.184.nip.io/documents/<week-id>
- Issue with FleetGraph comment: https://143.198.163.184.nip.io/documents/<issue-id>
```

Add an app/database pairing check before printing document links. A local database paired with a deployed app URL is a failure because the links are built from database IDs. Production is allowed to use a local database host when `NODE_ENV=production` and the app host is remote, because `localhost` is then local to the server, not the developer's laptop.

## Why This Matters

Demo state is mutable product state. Treating it as disposable seed data is not enough once the demo exercises real workflows like snooze, read tracking, approval, resume, comments, chat, and observability. A scoped reset gives the presenter a repeatable starting point without wiping useful workspace data or re-running a full seed.

The health check also catches hidden environment problems before the recording starts:

- missing `DATABASE_URL`
- missing or intentionally disabled OpenAI and Langfuse variables
- missing FleetGraph tables or migrations
- missing seed documents, findings, action candidates, or usage evidence
- `/health` failures on the app being recorded
- local/deployed environment mismatches that would generate misleading links

This keeps demo recovery mechanical. If the inbox says "No open findings" after rehearsal, run the reset and continue instead of debugging SQL live.

## When to Apply

- Before recording a submission or walkthrough against seeded demo data.
- After any rehearsal that dismisses, snoozes, approves, resumes, or opens FleetGraph findings.
- After deploying a new build to the public droplet.
- When a runbook includes hard-coded document links that are derived from database state.
- When local and deployed environments share similar seed data but not identical document IDs.

## Examples

The core pairing guard is intentionally simple and visible:

```ts
export function createAppDatabasePairingCheck(
  env: NodeJS.ProcessEnv,
  appUrl: string
): DemoHealthCheck {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    return {
      status: 'fail',
      name: 'App and database pairing',
      detail: 'DATABASE_URL is missing; document links cannot be trusted.',
    };
  }

  const databaseHost = new URL(databaseUrl).hostname;
  const appHost = new URL(appUrl).hostname;
  const databaseIsLocal = isLocalHost(databaseHost);
  const appIsLocal = isLocalHost(appHost);
  const productionServerWithLocalDatabase = env.NODE_ENV === 'production' && databaseIsLocal && !appIsLocal;

  if (productionServerWithLocalDatabase) {
    return {
      status: 'pass',
      name: 'App and database pairing',
      detail: `DATABASE_URL host ${databaseHost} is local to the production app host ${appHost}`,
    };
  }

  if (databaseIsLocal !== appIsLocal) {
    return {
      status: 'fail',
      name: 'App and database pairing',
      detail: `DATABASE_URL host ${databaseHost} and app host ${appHost} appear to be different environments; document links use database IDs and may not exist in that app.`,
    };
  }

  return {
    status: 'pass',
    name: 'App and database pairing',
    detail: `DATABASE_URL host ${databaseHost} matches app host class ${appIsLocal ? 'local' : 'remote'}`,
  };
}
```

The test coverage should encode the two important edge cases:

```ts
expect(createAppDatabasePairingCheck(
  { DATABASE_URL: 'postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev' },
  'https://143.198.163.184.nip.io'
)).toMatchObject({
  status: 'fail',
  name: 'App and database pairing',
});

expect(createAppDatabasePairingCheck(
  {
    DATABASE_URL: 'postgresql://ship:ship_prod_password@127.0.0.1:5432/ship_prod',
    NODE_ENV: 'production',
  },
  'https://143.198.163.184.nip.io'
)).toMatchObject({
  status: 'pass',
  name: 'App and database pairing',
});
```

## Related

- `api/src/fleetgraph/scripts/demo-health.ts`
- `api/src/fleetgraph/scripts/demo-health.test.ts`
- `docs/fleetgraph-5-minute-demo-script.md`
- `docs/fleetgraph-agent-exercise-guide.md`
- `docs/fleetgraph-user-manual.md`
- `docs/solutions/ui-bugs/fleetgraph-inbox-chat-controls-polish.md`
