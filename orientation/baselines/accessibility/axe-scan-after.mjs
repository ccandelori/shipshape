#!/usr/bin/env node
/**
 * Phase 2 Cat 7 — axe-core deep scan AFTER the Task 16 fixes landed.
 *
 * Same shape as `axe-scan.mjs` but writes to `after-axe-<route>.json` so the
 * baseline JSONs are preserved for diffing.
 *
 * Run: node orientation/baselines/accessibility/axe-scan-after.mjs
 */

import { chromium } from '../../../node_modules/.pnpm/playwright@1.57.0/node_modules/playwright/index.mjs';
import { AxeBuilder } from '../../../node_modules/.pnpm/@axe-core+playwright@4.11.0_playwright-core@1.57.0/node_modules/@axe-core/playwright/dist/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.WEB || 'http://localhost:5173';
const CREDS = { email: 'dev@ship.local', password: 'admin123' };

const ROUTES = [
  { name: 'login', path: '/login', auth: false },
  { name: 'docs', path: '/docs', auth: true },
  { name: 'my-week', path: '/my-week', auth: true },
  { name: 'issues', path: '/issues', auth: true },
  { name: 'projects', path: '/projects', auth: true },
  { name: 'settings', path: '/settings', auth: true },
  { name: 'team_allocation', path: '/team-allocation', auth: true },
  { name: 'editor-wiki', path: '/documents/57895cfe-dcba-419a-8dbc-a919a846c0b7', auth: true },
];

async function login(page) {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', CREDS.email);
  await page.fill('input[type="password"]', CREDS.password);
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function dismissOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.locator('div[data-state="open"]').count().catch(() => 0);
    if (!open) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

function summarizeViolations(v) {
  return v.map((x) => ({
    id: x.id,
    impact: x.impact,
    description: x.description,
    helpUrl: x.helpUrl,
    nodes: x.nodes.length,
    sample: x.nodes.slice(0, 3).map((n) => ({
      target: n.target,
      html: n.html.slice(0, 200),
      failureSummary: n.failureSummary,
    })),
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await login(page);

  const summary = [];
  for (const r of ROUTES) {
    console.log(`-- axe ${r.name} ${r.path} ...`);
    const t0 = Date.now();
    try {
      if (!r.auth) {
        await ctx.clearCookies();
      }
      await page.goto(`${WEB}${r.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await dismissOverlays(page);

      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'section508'])
        .analyze();

      const counts = {
        critical: result.violations.filter((v) => v.impact === 'critical').length,
        serious: result.violations.filter((v) => v.impact === 'serious').length,
        moderate: result.violations.filter((v) => v.impact === 'moderate').length,
        minor: result.violations.filter((v) => v.impact === 'minor').length,
      };
      const violationsTotal = result.violations.length;

      const out = {
        capturedAt: new Date().toISOString(),
        route: r.path,
        url: page.url(),
        tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'section508'],
        counts,
        violationsTotal,
        violations: summarizeViolations(result.violations),
        passes: result.passes.length,
        incomplete: result.incomplete.length,
        inapplicable: result.inapplicable.length,
      };

      await fs.writeFile(
        path.join(HERE, `after-axe-${r.name}.json`),
        JSON.stringify(out, null, 2),
        'utf8'
      );
      summary.push({ name: r.name, path: r.path, ...counts, total: violationsTotal, ms: Date.now() - t0 });
      console.log(`   ✓ after-axe-${r.name}.json — crit=${counts.critical} ser=${counts.serious} mod=${counts.moderate} min=${counts.minor} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

      if (!r.auth) {
        await login(page);
      }
    } catch (e) {
      console.error(`   ✗ ${r.name}: ${e.message}`);
      summary.push({ name: r.name, path: r.path, error: e.message });
    }
  }

  await browser.close();

  await fs.writeFile(
    path.join(HERE, 'after-axe-summary.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), routes: summary }, null, 2),
    'utf8'
  );

  const md = [
    `# axe-core deep scan AFTER Task 16 fixes — ${new Date().toISOString()}`,
    ``,
    `Tags: \`wcag2a\`, \`wcag2aa\`, \`wcag21a\`, \`wcag21aa\`, \`section508\`.`,
    `Browser: chromium-1200 (playwright). Resolution: 1280×800. Auth: cookie reuse via login UI.`,
    ``,
    `| Route | URL | Critical | Serious | Moderate | Minor | Total |`,
    `|---|---|---:|---:|---:|---:|---:|`,
    ...summary.map((s) =>
      s.error
        ? `| ${s.name} | \`${s.path}\` | err | err | err | err | err — ${s.error} |`
        : `| ${s.name} | \`${s.path}\` | ${s.critical} | ${s.serious} | ${s.moderate} | ${s.minor} | ${s.total} |`
    ),
  ].join('\n');
  await fs.writeFile(path.join(HERE, 'after-axe-summary.md'), md + '\n', 'utf8');

  console.log('\nDone.');
})();
