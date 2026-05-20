#!/usr/bin/env node
/**
 * Phase 1 Cat 6 — normal-usage console baseline.
 *
 * The PRD asks for console errors/warnings emitted during *clean* usage of
 * the app — not the failure-mode scenarios captured in scenarios.mjs. This
 * script:
 *   1. Opens a fresh browser context (no cached cookies/storage).
 *   2. Logs in as dev@ship.local.
 *   3. Walks each core route once, plus a short interaction on a wiki doc.
 *   4. Per route: waits for network-idle, captures console errors/warnings
 *      and uncaught page errors emitted while on that route.
 *   5. Writes evidence/normal-usage-<slug>.md per route and
 *      evidence/normal-usage-summary.{json,md} aggregating counts.
 *
 * Run:  node orientation/baselines/runtime-errors/normal-usage.mjs
 *
 * Preconditions:
 *   - API on :3000, web on :5173 (matches `pnpm dev` defaults).
 *   - Database seeded with `dev@ship.local` / `admin123`.
 */

import { chromium } from '../../../node_modules/.pnpm/playwright@1.57.0/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.join(HERE, 'evidence');
const SHOTS = path.join(EVIDENCE, 'screenshots');
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const CREDS = { email: 'dev@ship.local', password: 'admin123' };

await fs.mkdir(SHOTS, { recursive: true });

// Each route definition:
//   slug:        used for evidence filename
//   path:        URL path (relative to WEB)
//   label:       human-readable name for the summary table
//   afterNav:    optional async fn(page) to run between nav and capture window
//   wait:        ms to dwell after network-idle before snapshotting (default 1500)
const ROUTES = [
  { slug: 'login', path: '/login', label: 'Login (unauth)', skipLogin: true },
  { slug: 'dashboard', path: '/dashboard', label: 'Dashboard' },
  { slug: 'my-week', path: '/my-week', label: 'My Week' },
  { slug: 'docs', path: '/docs', label: 'Docs list' },
  { slug: 'issues', path: '/issues', label: 'Issues list' },
  { slug: 'projects', path: '/projects', label: 'Projects list' },
  { slug: 'programs', path: '/programs', label: 'Programs list' },
  { slug: 'team-allocation', path: '/team/allocation', label: 'Team allocation' },
  { slug: 'team-directory', path: '/team/directory', label: 'Team directory' },
  { slug: 'settings', path: '/settings', label: 'Settings' },
  // Open a known wiki doc and let the editor mount + WS sync.
  {
    slug: 'doc-editor-wiki',
    path: '/documents/57895cfe-dcba-419a-8dbc-a919a846c0b7',
    label: 'Document editor (wiki)',
    wait: 3500,
    afterNav: async (page) => {
      // Light interaction: focus body, read mode (no edits)
      const body = page.locator('.ProseMirror, [contenteditable="true"]').first();
      if (await body.count()) {
        await body.click({ force: true }).catch(() => {});
      }
    },
  },
];

function newBucket() {
  return { errors: [], warnings: [], pageerrors: [] };
}

function attachLogger(page, bucket) {
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();
    const entry = {
      type,
      text,
      url: location?.url || '',
      line: location?.lineNumber ?? null,
    };
    if (type === 'error') bucket.errors.push(entry);
    else if (type === 'warning') bucket.warnings.push(entry);
  });
  page.on('pageerror', (err) => {
    bucket.pageerrors.push({ type: 'pageerror', text: err.message, stack: err.stack });
  });
}

function dedupe(items) {
  const seen = new Map();
  for (const m of items) {
    const key = `${m.type}${m.text}`;
    const prior = seen.get(key);
    if (prior) prior.count += 1;
    else seen.set(key, { ...m, count: 1 });
  }
  return [...seen.values()];
}

function fmtList(items) {
  if (!items.length) return '  (none)';
  return items
    .map((m) => {
      const head = m.count > 1 ? `[${m.type}] (×${m.count}) ` : `[${m.type}] `;
      const tail = m.url ? `  @ ${m.url.replace(WEB, '').replace(API, '')}:${m.line ?? '?'}` : '';
      return `  ${head}${m.text}${tail}`;
    })
    .join('\n');
}

async function dismissOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.locator('div[data-state="open"]').count().catch(() => 0);
    if (!open) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

async function login(page) {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', CREDS.email);
  await page.fill('input[type="password"]', CREDS.password);
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function captureRoute(page, route) {
  const bucket = newBucket();
  attachLogger(page, bucket);

  const target = `${WEB}${route.path}`;
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  // Wait for network idle (best effort — some pages keep a long-poll open).
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await dismissOverlays(page);
  if (route.afterNav) await route.afterNav(page);
  await page.waitForTimeout(route.wait ?? 1500);

  const finalUrl = page.url();
  const shotPath = path.join(SHOTS, `normal-usage-${route.slug}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });

  return {
    slug: route.slug,
    label: route.label,
    target,
    finalUrl,
    screenshot: path.relative(EVIDENCE, shotPath),
    errors: dedupe(bucket.errors),
    warnings: dedupe(bucket.warnings),
    pageerrors: dedupe(bucket.pageerrors),
  };
}

async function writeRouteEvidence(result) {
  const file = path.join(EVIDENCE, `normal-usage-${result.slug}.md`);
  const lines = [
    `# Normal usage: ${result.label}`,
    '',
    `**Captured:** ${new Date().toISOString()}`,
    `**Target:** \`${result.target}\``,
    `**Final URL:** \`${result.finalUrl}\``,
    `**Screenshot:** \`${result.screenshot}\``,
    '',
    `## Counts`,
    '',
    `- console.error:    ${result.errors.reduce((s, m) => s + m.count, 0)} (${result.errors.length} unique)`,
    `- console.warning:  ${result.warnings.reduce((s, m) => s + m.count, 0)} (${result.warnings.length} unique)`,
    `- page errors:      ${result.pageerrors.reduce((s, m) => s + m.count, 0)} (${result.pageerrors.length} unique)`,
    '',
    `## console.error`,
    '',
    fmtList(result.errors),
    '',
    `## console.warning`,
    '',
    fmtList(result.warnings),
    '',
    `## Uncaught page errors`,
    '',
    fmtList(result.pageerrors),
    '',
  ];
  await fs.writeFile(file, lines.join('\n'), 'utf8');
  return file;
}

async function writeSummary(results) {
  const json = {
    capturedAt: new Date().toISOString(),
    web: WEB,
    api: API,
    routes: results.map((r) => ({
      slug: r.slug,
      label: r.label,
      target: r.target,
      finalUrl: r.finalUrl,
      errorCount: r.errors.reduce((s, m) => s + m.count, 0),
      errorUnique: r.errors.length,
      warningCount: r.warnings.reduce((s, m) => s + m.count, 0),
      warningUnique: r.warnings.length,
      pageerrorCount: r.pageerrors.reduce((s, m) => s + m.count, 0),
      pageerrorUnique: r.pageerrors.length,
    })),
    totals: {
      errorCount: results.reduce((s, r) => s + r.errors.reduce((a, m) => a + m.count, 0), 0),
      warningCount: results.reduce((s, r) => s + r.warnings.reduce((a, m) => a + m.count, 0), 0),
      pageerrorCount: results.reduce((s, r) => s + r.pageerrors.reduce((a, m) => a + m.count, 0), 0),
    },
  };
  await fs.writeFile(
    path.join(EVIDENCE, 'normal-usage-summary.json'),
    JSON.stringify(json, null, 2),
    'utf8',
  );

  const md = [
    '# Normal-usage console baseline — Cat 6',
    '',
    `**Captured:** ${json.capturedAt}`,
    `**Web:** ${WEB}  **API:** ${API}`,
    `**Method:** clean browser context, login → walk routes → wait for network-idle → record errors/warnings/pageerrors per route.`,
    '',
    '## Totals',
    '',
    `- console.error:   ${json.totals.errorCount}`,
    `- console.warning: ${json.totals.warningCount}`,
    `- page errors:     ${json.totals.pageerrorCount}`,
    '',
    '## Per-route',
    '',
    '| Route | Errors | Warnings | Page errors |',
    '|---|---:|---:|---:|',
    ...json.routes.map(
      (r) =>
        `| ${r.label} (\`${r.target.replace(WEB, '')}\`) | ${r.errorCount} | ${r.warningCount} | ${r.pageerrorCount} |`,
    ),
    '',
    'See per-route detail files: `evidence/normal-usage-<slug>.md`.',
    '',
  ].join('\n');
  await fs.writeFile(path.join(EVIDENCE, 'normal-usage-summary.md'), md, 'utf8');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Login once on a dedicated page, then reuse the context cookies.
  const loginPage = await ctx.newPage();
  await login(loginPage);
  await loginPage.close();

  const results = [];
  for (const route of ROUTES) {
    if (route.skipLogin) {
      // Use a separate context so we don't carry the login cookie.
      const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await anonCtx.newPage();
      try {
        const r = await captureRoute(page, route);
        results.push(r);
        await writeRouteEvidence(r);
        console.log(`✓ ${route.label}  err=${r.errors.length} warn=${r.warnings.length} pe=${r.pageerrors.length}`);
      } catch (e) {
        console.error(`✗ ${route.label}: ${e.message}`);
      } finally {
        await anonCtx.close();
      }
      continue;
    }
    const page = await ctx.newPage();
    try {
      const r = await captureRoute(page, route);
      results.push(r);
      await writeRouteEvidence(r);
      console.log(`✓ ${route.label}  err=${r.errors.length} warn=${r.warnings.length} pe=${r.pageerrors.length}`);
    } catch (e) {
      console.error(`✗ ${route.label}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await writeSummary(results);
  await browser.close();
  console.log(`\nWrote ${results.length} route evidence files + summary to ${EVIDENCE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
