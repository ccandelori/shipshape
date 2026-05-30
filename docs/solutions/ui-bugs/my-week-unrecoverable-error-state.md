---
title: "Recover from my-week dashboard load failures"
date: 2026-05-30
category: ui-bugs
module: dashboard
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - "The /my-week route could show only \"Failed to load week data\""
  - "Users had no retry, navigation, or login recovery path from the error state"
  - "The error screen did not expose HTTP status or account-linking context"
root_cause: missing_workflow_step
resolution_type: code_fix
severity: high
related_components:
  - "authentication"
  - "development_workflow"
  - "testing_framework"
tags:
  - my-week
  - dashboard
  - error-state
  - recovery-ui
  - demo-safety
---

# Recover from my-week dashboard load failures

## Problem

The `/my-week` page could leave users stranded behind a terse failure message when `/api/dashboard/my-week` failed or returned no data. This was especially risky for demo and submission flows because the dashboard icon could route directly into a dead-end state with no obvious way back to working parts of the app.

## Symptoms

- The page rendered only `Failed to load week data`.
- There was no retry button, fallback navigation, or login recovery action.
- A missing person link, stale session, transient server failure, or bad workspace state all looked like the same opaque app failure.
- The UI did not show HTTP status, so a recoverable 404 looked indistinguishable from a network or server problem.

Session history confirmed the same product failure mode: the backend `/api/dashboard/my-week` path could return valid Week 14 data for a seeded demo user, but the browser failure state gave the user no way to diagnose or escape the problem (session history).

## What Didn't Work

- Treating this as only a backend data issue was too narrow. A live smoke check showed the API could succeed for `dev@ship.local`, and there were no matching recent server-side `Get my-week error` logs in that path.
- Leaving the old one-line error state in place made every transient or account-specific failure feel catastrophic.
- Relying on the sidebar alone was not enough. The error page occupied the main surface, and the user needed a visible path to a known-good route.

## Solution

Make the `/my-week` error state recoverable and diagnosable. The page now classifies known `HttpError` failures, exposes the status when available, and renders concrete recovery actions.

```tsx
interface MyWeekErrorDetails {
  statusLabel: string | null;
  description: string;
}

function getMyWeekErrorDetails(error: unknown): MyWeekErrorDetails {
  if (error instanceof HttpError) {
    if (error.status === 404) {
      return {
        statusLabel: `HTTP ${error.status}`,
        description: 'This account is signed in, but it is not linked to a person record for this workspace. Return to login if you meant to use a seeded demo user.',
      };
    }

    return {
      statusLabel: `HTTP ${error.status}`,
      description: 'The server rejected the week request. Try again, or open Documents to keep working while the week dashboard is unavailable.',
    };
  }

  return {
    statusLabel: null,
    description: 'The browser could not complete the week request. Try again, or open Documents to keep working while the week dashboard is unavailable.',
  };
}
```

The render path now gives the user three exits instead of a dead end:

```tsx
if (error || !data) {
  const errorDetails = getMyWeekErrorDetails(error);

  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <section className="max-w-md rounded-lg border border-border bg-surface px-5 py-5 shadow-lg">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Week data could not be loaded</h2>
          {errorDetails.statusLabel && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300">
              {errorDetails.statusLabel}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-muted">{errorDetails.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => { void refetch(); }}>
            Try again
          </button>
          <Link to="/docs">Open Documents</Link>
          <button type="button" onClick={() => navigate('/login', { replace: true })}>
            Return to login
          </button>
        </div>
      </section>
    </div>
  );
}
```

Add a regression test that simulates the important 404 case. The test verifies that the page shows the status and all recovery controls.

```tsx
it('shows recovery actions when week data cannot be loaded', async () => {
  global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
    error: 'Person not found for current user',
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  }))) as typeof fetch;

  render(<MyWeekPage />, { wrapper: createWrapper(createQueryClient()) });

  expect(await screen.findByRole('heading', { name: 'Week data could not be loaded' })).toBeInTheDocument();
  expect(screen.getByText('HTTP 404')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Documents' })).toHaveAttribute('href', '/docs');
  expect(screen.getByRole('button', { name: 'Return to login' })).toBeInTheDocument();
});
```

## Why This Works

The backend route can legitimately fail for account-state reasons: for example, an authenticated user without a linked person document gets a 404 from the dashboard route. That condition is not the same as the entire app being unusable.

By distinguishing `HttpError` statuses from generic browser failures, the UI can give the user a useful explanation without hiding the underlying failure. The fallback actions cover the three practical recovery paths:

- retry the request after a transient failure
- move to `/docs`, which is a known-good workspace route
- return to login when the current session or account is wrong for the demo workspace

This turns a submission-risk dead end into a bounded error state. The app may still fail to load week data, but the user is no longer trapped inside that failure.

## Prevention

- Error states on top-level navigation routes must include an escape hatch to a known-good route.
- Account-scoped 404s should say what relationship is missing when the UI can infer it from the endpoint.
- Tests for dashboard pages should cover failure states, not only populated happy paths.
- Demo smoke tests should include recovery behavior for the first route a sidebar or icon can open.

Relevant tests:

- `web/src/pages/MyWeekPage.test.tsx` verifies the `/my-week` 404 recovery UI.

Verification performed:

- `pnpm --filter @ship/web exec vitest run src/pages/MyWeekPage.test.tsx`
- `pnpm --filter @ship/web type-check`
- `pnpm --filter @ship/web exec vitest run src/pages/MyWeekPage.test.tsx src/components/FleetGraph/FindingsInbox.test.tsx`
- Droplet deploy release `20260530-172513`
- Browser smoke: login as `dev@ship.local`, open `/my-week`, confirm Week 14 loads, open FleetGraph inbox, confirm the removed Pulse tab stays removed.

## Related Issues

- Changed files: `web/src/pages/MyWeekPage.tsx` and `web/src/pages/MyWeekPage.test.tsx`.
- Related solution: `docs/solutions/ui-bugs/fleetgraph-inbox-chat-controls-polish.md`.
- Related workflow: `docs/solutions/workflow-issues/fleetgraph-demo-health-reset-workflow.md`.
- Frontmatter validation script was unavailable in this checkout (`scripts/validate-frontmatter.py` was not present), so YAML safety was checked against the schema rules manually.
