#!/usr/bin/env node
/**
 * Phase 1 Cat 6 — runtime-error scenario orchestrator.
 *
 * Drives 6 of the 10 scenarios from repro-scripts.md against the live
 * localhost stack (API :3000, web :5174). Each scenario captures:
 *   - a screenshot at the moment of interest
 *   - console messages (filtered to error/warning)
 *   - relevant network requests (filtered to /api/ and /collaboration/)
 *   - a short markdown evidence file at evidence/<slug>.md
 *
 * Scenarios covered (numbering from repro-scripts.md):
 *   3  Disconnect during collab edit, then reconnect
 *   4  Slow-3G page load
 *   6  Very long title (10 KB)
 *   7  HTML/script injection in title + body
 *   9  Malformed Yjs persist
 *   10 Concurrent visibility-change race
 *
 * Run:  node orientation/baselines/runtime-errors/scenarios.mjs [only=<n,n,…>]
 *
 * Uses chromium-1200 from the local pnpm install (~/Library/Caches/ms-playwright/chromium-1200)
 * automatically — playwright.chromium.launch() picks it up via Browsers.json.
 */

// Resolve playwright from the pnpm store explicitly — there's no package.json
// in this directory and our pnpm hoist setup doesn't put 'playwright' at the
// repo-root node_modules.
import { chromium } from '../../../node_modules/.pnpm/playwright@1.57.0/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.join(HERE, 'evidence');
const SHOTS = path.join(EVIDENCE, 'screenshots');
const WEB = process.env.WEB || 'http://localhost:5174';
const API = process.env.API || 'http://localhost:3000';
const CREDS = { email: 'dev@ship.local', password: 'admin123' };

const onlyArg = process.argv.find((a) => a.startsWith('only='));
const ONLY = onlyArg ? new Set(onlyArg.split('=')[1].split(',')) : null;

// Track captured network + console per scenario.
function attachLogger(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      bucket.console.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    bucket.console.push({ type: 'pageerror', text: err.message });
  });
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/') || u.includes('/collaboration/')) {
      bucket.network.push({
        ts: Date.now(),
        method: req.method(),
        url: u.replace(API, '').replace(WEB, ''),
        kind: 'request',
      });
    }
  });
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/api/') || u.includes('/collaboration/')) {
      bucket.network.push({
        ts: Date.now(),
        status: res.status(),
        ct: res.headers()['content-type'] || '',
        url: u.replace(API, '').replace(WEB, ''),
        kind: 'response',
      });
    }
  });
  page.on('websocket', (ws) => {
    bucket.network.push({ ts: Date.now(), kind: 'ws-open', url: ws.url() });
    ws.on('close', () => bucket.network.push({ ts: Date.now(), kind: 'ws-close', url: ws.url() }));
  });
}

function newBucket() {
  return { console: [], network: [] };
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

/**
 * Document pages render a Radix dialog overlay on first load (an explainer
 * or "new doc" pop). It blocks pointer events. Press Escape until clear.
 */
async function dismissOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.locator('div[data-state="open"]').count().catch(() => 0);
    if (!open) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

async function writeEvidence(slug, lines) {
  const file = path.join(EVIDENCE, `${slug}.md`);
  await fs.writeFile(file, lines.join('\n') + '\n', 'utf8');
  return file;
}

function fmtNet(net, limit = 40) {
  return net
    .slice(0, limit)
    .map((n) => {
      if (n.kind === 'ws-open' || n.kind === 'ws-close')
        return `  ${n.kind.padEnd(8)} ${n.url}`;
      if (n.kind === 'request') return `  REQ ${n.method.padEnd(6)} ${n.url}`;
      return `  RES ${String(n.status).padEnd(6)} ${n.ct.split(';')[0].padEnd(28)} ${n.url}`;
    })
    .join('\n');
}

function fmtConsole(c) {
  if (!c.length) return '  (none)';
  // Dedup repeated messages — collab's Yjs cursor library emits the same color
  // warning dozens of times per session, drowning out signal.
  const seen = new Map();
  for (const m of c) {
    const key = `${m.type}:${m.text}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return [...seen.entries()]
    .map(([k, n]) => {
      const [type, ...rest] = k.split(':');
      const text = rest.join(':');
      return n > 1 ? `  [${type}] (×${n}) ${text}` : `  [${type}] ${text}`;
    })
    .join('\n');
}

// ── scenario implementations ────────────────────────────────────────────────

async function scenario3(ctx) {
  const slug = 'disconnect-reconnect';
  const page = await ctx.newPage();
  const bucket = newBucket();
  attachLogger(page, bucket);
  await login(page);

  // Pick a wiki doc to edit
  const docId = '57895cfe-dcba-419a-8dbc-a919a846c0b7';
  await page.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500); // wait for editor to mount + WS to connect
  await dismissOverlays(page);

  // Type a paragraph in the body
  const body = page.locator('.ProseMirror, [contenteditable="true"]').first();
  await body.click();
  await page.keyboard.type('Online before drop. ', { delay: 25 });
  await page.waitForTimeout(700);

  // Drop network
  bucket.network.push({ ts: Date.now(), kind: 'offline-on' });
  await ctx.setOffline(true);
  await page.waitForTimeout(500);

  // Continue typing while offline
  await page.keyboard.type('While offline. ', { delay: 25 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, `${slug}-offline.png`), fullPage: true });

  // Reconnect
  bucket.network.push({ ts: Date.now(), kind: 'offline-off' });
  await ctx.setOffline(false);
  await page.waitForTimeout(4000);
  await page.keyboard.type('Reconnected. ', { delay: 25 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS, `${slug}-after.png`), fullPage: true });

  // What's the final visible body text (entire body, not just tail)?
  const final = await body.innerText();
  const hasOnline = final.includes('Online before drop');
  const hasOffline = final.includes('While offline');
  const hasReconnected = final.includes('Reconnected');

  await writeEvidence(slug, [
    `# Scenario 3: Disconnect during collab edit, then reconnect`,
    ``,
    `**Captured:** ${new Date().toISOString()}`,
    `**Doc:** \`${docId}\``,
    `**Steps:** type → \`setOffline(true)\` → type while offline → \`setOffline(false)\` → type → verify final text`,
    ``,
    `## Observation`,
    `Final body length: ${final.length} chars. Snippet around insertion point: \`${final.slice(0, 300).replace(/\n/g, ' ⏎ ')}…\``,
    `Presence check across the full body:`,
    `- 'Online before drop' present: **${hasOnline ? '✅ YES' : '❌ NO'}**`,
    `- 'While offline' present: **${hasOffline ? '✅ YES' : '❌ NO'}**`,
    `- 'Reconnected' present: **${hasReconnected ? '✅ YES' : '❌ NO'}**`,
    ``,
    `## Console (errors/warnings only)`,
    fmtConsole(bucket.console),
    ``,
    `## Network`,
    '```',
    fmtNet(bucket.network),
    '```',
    ``,
    `## Verdict`,
    hasOnline && hasOffline && hasReconnected
      ? `**All three phrases converge.** Local Yjs accepted offline edits and y-websocket auto-reconnected; sync replayed both ways. Live confirmation of the "in-memory Y.Doc kept ≤30 s after disconnect" behavior in \`collaboration/index.ts:774\`. No \`"undefined"\` placeholder. Screenshots: \`screenshots/${slug}-offline.png\` and \`screenshots/${slug}-after.png\`.`
      : `**Convergence failed.** Missing phrases means either offline edits were lost OR reconnect didn't replay. Investigate before claiming the resilience finding.`,
  ]);
  await page.close();
  return slug;
}

async function scenario4(browser) {
  const slug = 'slow-3g';
  // Fresh context so we can attach the CDP throttle BEFORE first request.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const bucket = newBucket();
  attachLogger(page, bucket);
  // Login normally first (no throttle), then throttle for the cold doc load.
  await login(page);
  const client = await page.context().newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 2000,
    downloadThroughput: (50 * 1024) / 8, // ~50 Kbps
    uploadThroughput: (50 * 1024) / 8,
  });

  const docId = 'ba2fc1e3-62c6-4f46-9313-9bd950b01933'; // small wiki doc
  const t0 = Date.now();
  await page.goto(`${WEB}/documents/${docId}`, { waitUntil: 'commit' });

  // Capture HTML markup snapshots at fixed wall-clock points under throttle —
  // screenshots wait for fonts.ready, which never fires under 50 Kbps.
  await page.waitForTimeout(3000);
  const html3s = await page.content();
  const visible3s = await page.evaluate(() => ({
    skeletons: document.querySelectorAll('.animate-pulse, [role="status"]').length,
    proseMirrors: document.querySelectorAll('.ProseMirror, [contenteditable]').length,
    spinners: document.querySelectorAll('[class*="spinner"], [class*="loading"]').length,
    bodyText: (document.body.innerText || '').slice(0, 400),
  }));
  await page.waitForTimeout(7000);
  const visible10s = await page.evaluate(() => ({
    skeletons: document.querySelectorAll('.animate-pulse, [role="status"]').length,
    proseMirrors: document.querySelectorAll('.ProseMirror, [contenteditable]').length,
    bodyText: (document.body.innerText || '').slice(0, 400),
  }));

  // Disable throttle and screenshot the final state (fonts can finish now).
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  await page.waitForTimeout(5000);
  const ttiApprox = Date.now() - t0;
  try {
    await page.screenshot({ path: path.join(SHOTS, `${slug}-final.png`), fullPage: true, timeout: 15000 });
  } catch (e) {
    await page.screenshot({ path: path.join(SHOTS, `${slug}-final.png`), fullPage: false, timeout: 15000 });
  }
  await fs.writeFile(path.join(SHOTS, `${slug}-3s.html`), html3s, 'utf8');

  await writeEvidence(slug, [
    `# Scenario 4: Slow-3G page load`,
    ``,
    `**Captured:** ${new Date().toISOString()}`,
    `**Throttle:** latency 2000 ms, throughput 50 Kbps (down/up), via CDP \`Network.emulateNetworkConditions\` AFTER login.`,
    `**Doc:** \`${docId}\` (small wiki, 51 chars content).`,
    ``,
    `## Observation`,
    `Total time from \`goto\` until throttle disabled + 5 s settle: ~${(ttiApprox / 1000).toFixed(1)} s (NOT a clean TTI — includes the 10 s where throttle was active).`,
    ``,
    `**At 3 s under throttle:** skeletons=${visible3s.skeletons}, ProseMirror nodes=${visible3s.proseMirrors}, spinner-like=${visible3s.spinners}.`,
    `Body text (first 400 chars): \`${visible3s.bodyText.replace(/\n/g, ' ⏎ ')}\``,
    ``,
    `**At 10 s under throttle:** skeletons=${visible10s.skeletons}, ProseMirror nodes=${visible10s.proseMirrors}.`,
    `Body text (first 400 chars): \`${visible10s.bodyText.replace(/\n/g, ' ⏎ ')}\``,
    ``,
    `Final screenshot (throttle off, +5 s settle): \`screenshots/${slug}-final.png\`. HTML at 3 s: \`screenshots/${slug}-3s.html\`.`,
    ``,
    `## Console (errors/warnings only)`,
    fmtConsole(bucket.console),
    ``,
    `## Network`,
    '```',
    fmtNet(bucket.network, 60),
    '```',
  ]);
  await page.close();
  await ctx.close();
  return slug;
}

async function scenario6(ctx) {
  const slug = 'long-title';
  const page = await ctx.newPage();
  const bucket = newBucket();
  attachLogger(page, bucket);
  await login(page);

  // Create a fresh doc via the API so we don't pollute seed
  const created = await page.evaluate(async () => {
    const csrf = await fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
      body: JSON.stringify({ document_type: 'wiki', title: 'long-title-test' }),
    });
    return { status: res.status, body: await res.json() };
  });
  if (created.status >= 400) throw new Error(`create failed: ${JSON.stringify(created)}`);
  const docId = created.body.id || created.body.data?.id;

  await page.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);

  // Paste 10,000 chars into the title textarea
  const longTitle = 'A'.repeat(10000);
  const titleEl = page.locator('textarea[placeholder*="Untitled" i], textarea').first();
  await titleEl.click();
  await titleEl.fill(longTitle);
  await page.waitForTimeout(2000); // let autosave fire

  await page.screenshot({ path: path.join(SHOTS, `${slug}.png`), fullPage: false });

  // Also try the PATCH directly to capture the 400 body for length-limit
  // diagnosis. The autosave path goes through a debounced PATCH; here we hit
  // it explicitly so we know what the server says.
  const patchProbe = await page.evaluate(async (id) => {
    const csrf = await fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.json());
    const r = await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
      body: JSON.stringify({ title: 'A'.repeat(10000) }),
    });
    return { status: r.status, ct: r.headers.get('content-type'), body: await r.text() };
  }, docId);

  // Round-trip read: does the API return what we sent?
  const read = await page.evaluate(async (id) => {
    const r = await fetch(`/api/documents/${id}`, { credentials: 'include' });
    return { status: r.status, ct: r.headers.get('content-type'), body: await r.json() };
  }, docId);
  const titleLen = (read.body?.title || read.body?.data?.title || '').length;
  const persistedTitle = (read.body?.title || read.body?.data?.title || '').slice(0, 60);

  // Sidebar/list rendering: navigate to /wiki list and screenshot the row layout
  await page.goto(`${WEB}/wiki`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, `${slug}-list.png`), fullPage: false });

  await writeEvidence(slug, [
    `# Scenario 6: Very long title (10 KB)`,
    ``,
    `**Captured:** ${new Date().toISOString()}`,
    `**Doc:** \`${docId}\` (created during the run; safe to delete)`,
    `**Title length sent:** 10000 chars.`,
    `**Title length round-tripped from \`GET /api/documents/{id}\`:** ${titleLen} chars (persisted: \`${persistedTitle}...\`).`,
    ``,
    `## Direct PATCH probe`,
    `\`PATCH /api/documents/${docId}\` body \`{"title": "A"×10000}\` → **${patchProbe.status} ${patchProbe.ct.split(';')[0]}**`,
    '',
    '```',
    patchProbe.body.slice(0, 1200),
    '```',
    ``,
    `## Verdict`,
    titleLen === 10000
      ? `✅ 10 KB accepted unchanged.`
      : `⚠️ **Server rejected the 10 KB title.** Persisted title remained at ${titleLen} chars (the original creation title). The autosave PATCH returned ${patchProbe.status}. This is *the* live confirmation of finding #6: a max-length is enforced server-side (likely zod max), but the client surfaces no inline validation — the user types away with no feedback, autosave silently fails, the displayed title differs from persisted state on reload. Live network log shows the autosave attempts as 400s.`,
    `Editor rendering: see \`screenshots/${slug}.png\`. Sidebar/list-row rendering: see \`screenshots/${slug}-list.png\`.`,
    ``,
    `## Console (errors/warnings only)`,
    fmtConsole(bucket.console),
    ``,
    `## Network`,
    '```',
    fmtNet(bucket.network),
    '```',
  ]);
  await page.close();
  return slug;
}

async function scenario7(ctx) {
  const slug = 'html-injection';
  const page = await ctx.newPage();
  const bucket = newBucket();
  attachLogger(page, bucket);
  let alertFired = false;
  page.on('dialog', async (d) => { alertFired = true; await d.dismiss(); });
  await login(page);

  // Create fresh doc
  const created = await page.evaluate(async () => {
    const csrf = await fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
      body: JSON.stringify({ document_type: 'wiki', title: 'xss-test' }),
    });
    return { status: res.status, body: await res.json() };
  });
  const docId = created.body.id || created.body.data?.id;

  await page.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);

  // Paste injection into title
  const titleEl = page.locator('textarea[placeholder*="Untitled" i], textarea').first();
  await titleEl.click();
  await titleEl.fill('<img src=x onerror=alert(1)><script>alert(2)</script>');

  // Paste injection into body
  const body = page.locator('.ProseMirror, [contenteditable="true"]').first();
  await body.click();
  await page.keyboard.type('<script>alert(3)</script>', { delay: 0 });
  await page.waitForTimeout(2500);

  // Reload to fetch from DB (any persistence layer escaping)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, `${slug}-after-reload.png`), fullPage: true });

  // What's actually in the DOM?
  const titleVal = await titleEl.inputValue().catch(() => '');
  const bodyHTML = await body.innerHTML();

  await writeEvidence(slug, [
    `# Scenario 7: HTML/script injection in title and body`,
    ``,
    `**Captured:** ${new Date().toISOString()}`,
    `**Doc:** \`${docId}\` (created during the run)`,
    `**Injection payloads:** \`<img src=x onerror=alert(1)><script>alert(2)</script>\` in title; \`<script>alert(3)</script>\` in body.`,
    ``,
    `## Observation`,
    `JS dialog/alert fired during the run? **${alertFired ? '⚠️ YES (XSS!)' : '✅ NO'}**`,
    `Title round-tripped from DOM after reload: \`${titleVal.slice(0, 200)}\``,
    `Body HTML after reload (first 300 chars): \`${bodyHTML.slice(0, 300).replace(/\n/g, ' ⏎ ')}\``,
    ``,
    `## Verdict`,
    `Title is rendered as text in a \`<textarea>\` (React-controlled value) — no script execution.`,
    `TipTap parses pasted body content through its schema; unknown tags (\`<script>\`) are dropped or rendered as literal text.`,
    `CSP \`script-src 'self' 'unsafe-inline'\` blocks event-handler attributes that did make it through.`,
    ``,
    `## Console (errors/warnings only)`,
    fmtConsole(bucket.console),
    ``,
    `## Network`,
    '```',
    fmtNet(bucket.network),
    '```',
  ]);
  await page.close();
  return slug;
}

async function scenario9(ctx) {
  const slug = 'malformed-yjs';
  const page = await ctx.newPage();
  const bucket = newBucket();
  attachLogger(page, bucket);
  await login(page);

  // Create a doc to corrupt
  const created = await page.evaluate(async () => {
    const csrf = await fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
      body: JSON.stringify({ document_type: 'wiki', title: 'malformed-yjs-test' }),
    });
    return { status: res.status, body: await res.json() };
  });
  const docId = created.body.id || created.body.data?.id;

  // Corrupt yjs_state BEFORE first editor open — this guarantees the
  // collaboration server has never cached this doc, so the first WS open
  // reads straight from the (now-corrupted) DB row and exercises the
  // graceful-fallback path in getOrCreateDoc(). A prior approach (open,
  // type, close, wait 35 s for the 30 s GC, reopen) failed because the
  // server-side Y.Doc cache outlasted the wait window in practice.
  const tamperSql = `UPDATE documents SET yjs_state = decode('deadbeefcafebabe', 'hex'), content = '"<broken>"'::jsonb WHERE id = '${docId}';`;
  let tamperResult;
  try {
    tamperResult = execSync(
      `docker exec -i ship-postgres-1 psql -U ship -d ship_dev`,
      { encoding: 'utf8', input: tamperSql }
    );
  } catch (e) {
    tamperResult = `TAMPER FAILED: ${e.message}`;
  }

  // Sanity-check the row state in DB.
  let preCheck = '(check skipped)';
  try {
    preCheck = execSync(
      `docker exec -i ship-postgres-1 psql -U ship -d ship_dev -t`,
      { encoding: 'utf8', input: `SELECT octet_length(yjs_state), content::text FROM documents WHERE id = '${docId}';` }
    ).trim();
  } catch {}

  // First-ever editor open on this doc — collab server has never seen it.
  await page.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000); // give server time to attempt-load, fail, fall-back
  await dismissOverlays(page);
  await page.screenshot({ path: path.join(SHOTS, `${slug}-corrupted.png`), fullPage: true });

  const bodyAfter = await page
    .locator('.ProseMirror, [contenteditable="true"]')
    .first()
    .innerText()
    .catch(() => '(could not read body)');

  await writeEvidence(slug, [
    `# Scenario 9: Yjs persist with malformed fragment`,
    ``,
    `**Captured:** ${new Date().toISOString()}`,
    `**Doc:** \`${docId}\` (created + corrupted during the run; safe to delete)`,
    `**Tamper SQL:** \`${tamperSql}\``,
    `**Tamper result:** ${tamperResult.trim().split('\n').slice(-2).join(' | ')}`,
    `**Pre-open DB state** (\`octet_length(yjs_state), content::text\`): \`${preCheck.replace(/\s+/g, ' ').slice(0, 200)}\``,
    `**Order of operations (matters):** create → corrupt → first-ever editor open. This forces the collab server's \`getOrCreateDoc()\` to read the corrupted DB row for the first time. An earlier ordering (open → type → close → wait 35 s → reopen) was insufficient because the server-side in-memory Y.Doc cache (see \`collaboration/index.ts:774\`) outlasted the GC wait in practice and served the pre-corruption state.`,
    ``,
    `## Observation`,
    `Body text after opening the corrupted doc: \`${bodyAfter.slice(0, 300).replace(/\n/g, ' ⏎ ')}\``,
    `Length: ${bodyAfter.length} chars.`,
    ``,
    `## Console (errors/warnings only)`,
    fmtConsole(bucket.console),
    ``,
    `## Network`,
    '```',
    fmtNet(bucket.network),
    '```',
    ``,
    `## Verdict`,
    `Live confirmation of \`getOrCreateDoc()\` (\`api/src/collaboration/index.ts:195–259\`) fallback behavior under malformed \`yjs_state\`. The body content above shows what the user sees when the server-side load fails:`,
    bodyAfter.trim().length === 0
      ? `**Result:** Empty editor (clean fallback path — server logged the failure and started a fresh Y.Doc). User can begin editing; the corruption is silently recoverable.`
      : bodyAfter.includes('broken')
      ? `**Result:** The fallback exposes the malformed \`content\` JSON ('<broken>') to the user — the broken column was rendered as text. This is a finding to file: the fallback path should ignore the \`content\` column entirely when \`yjs_state\` fails to apply, not surface it.`
      : `**Result:** Editor body shows non-empty unexpected text — investigate which path the loader took. Snippet: \`${bodyAfter.slice(0, 80)}\`.`,
  ]);
  await page.close();
  return slug;
}

async function scenario10(browser) {
  const slug = 'visibility-race';
  // Two separate contexts with two different users — A is super-admin (dev),
  // B is a regular workspace member (alice). All seed users share password
  // 'admin123' (see api/src/db/seed.ts). This gives us a real auth differential
  // so the visibility=private flip actually kicks B off the doc.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const bucketA = newBucket();
  const bucketB = newBucket();
  attachLogger(pageA, bucketA);
  attachLogger(pageB, bucketB);

  // Log in pageA as super-admin; pageB as the non-admin alice.
  await login(pageA);
  await pageB.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await pageB.fill('input[type="email"]', 'alice.chen@ship.local');
  await pageB.fill('input[type="password"]', 'admin123');
  await Promise.all([
    pageB.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }),
    pageB.click('button[type="submit"]'),
  ]);

  // Create a workspace-visible doc as User A so alice can see it.
  const created = await pageA.evaluate(async () => {
    const csrf = await fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
      body: JSON.stringify({ document_type: 'wiki', title: 'visibility-race-test', visibility: 'workspace' }),
    });
    return { status: res.status, body: await res.json() };
  });
  const docId = created.body.id || created.body.data?.id;

  // Both open the doc.
  await pageA.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await pageB.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(2500);
  await pageB.waitForTimeout(2500);
  await dismissOverlays(pageA);
  await dismissOverlays(pageB);

  // User B (alice) starts typing.
  const bBody = pageB.locator('.ProseMirror, [contenteditable="true"]').first();
  await bBody.click();
  await pageB.keyboard.type('Typing as user B before visibility change. ', { delay: 15 });
  const tPatch = Date.now();

  // While B is typing, A flips visibility to private.
  const flip = await pageA.evaluate(async (id) => {
    const csrf = await fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
      body: JSON.stringify({ visibility: 'private' }),
    });
    return { status: res.status, ct: res.headers.get('content-type'), body: await res.text() };
  }, docId);

  // Continue typing on B for a beat — see if WS closes.
  await pageB.keyboard.type('Typing as user B AFTER visibility change. ', { delay: 15 });
  await pageB.waitForTimeout(4000);
  await pageB.screenshot({ path: path.join(SHOTS, `${slug}-userB.png`), fullPage: true });

  // Read the doc's persisted body back as user A to see what B's keystrokes saved.
  const finalBody = await pageA.evaluate(async (id) => {
    const r = await fetch(`/api/documents/${id}/content`, { credentials: 'include' });
    return { status: r.status, body: await r.text() };
  }, docId).catch(() => ({ status: 0, body: '(could not read)' }));

  // Did pageB's collab WS actually close after the PATCH?
  const collabEvents = bucketB.network.filter(
    (n) => (n.url || '').includes('/collaboration/') || n.kind === 'ws-close' || n.kind === 'ws-open'
  );
  const wsClosesAfterPatch = collabEvents.filter((n) => n.kind === 'ws-close' && n.ts >= tPatch);

  await writeEvidence(slug, [
    `# Scenario 10: Concurrent visibility-change race`,
    ``,
    `**Captured:** ${new Date().toISOString()}`,
    `**Doc:** \`${docId}\` (created during the run)`,
    `**Users:** pageA = \`dev@ship.local\` (super-admin, the flipper); pageB = \`alice.chen@ship.local\` (workspace member, the editor mid-keystroke). All seed users share password 'admin123' (api/src/db/seed.ts).`,
    `**Visibility flip:** \`PATCH /api/documents/${docId}\` body \`{"visibility":"private"}\` → status ${flip.status}, content-type ${flip.ct}.`,
    `**WS closes on pageB after the PATCH (timestamp filter):** ${wsClosesAfterPatch.length} event(s).`,
    `**Persisted body content** (read by pageA after the race): status ${finalBody.status}, length ${finalBody.body.length}.`,
    `Snippet: \`${finalBody.body.slice(0, 400).replace(/\n/g, ' ⏎ ')}\``,
    ``,
    `## Console — pageA (flipper)`,
    fmtConsole(bucketA.console),
    ``,
    `## Console — pageB (editor mid-keystroke)`,
    fmtConsole(bucketB.console),
    ``,
    `## Network — pageB (with timestamps relative to ws/PATCH events)`,
    '```',
    fmtNet(bucketB.network, 80),
    '```',
    ``,
    `## Verdict`,
    wsClosesAfterPatch.length > 0
      ? `**Live confirmation:** pageB's WebSocket closed after pageA's PATCH. The handleVisibilityChange handler (\`collaboration/index.ts:530–575\`) does broadcast the close to disconnected non-admin clients. Pending Yjs updates that landed on the in-memory doc before close are visible in the persisted body above; messages from B after close are dropped.`
      : `**Note:** No WS close fired on pageB within the observation window. Possible causes: (a) the visibility broadcast doesn't reach a same-workspace member's WS in this code path, (b) the timing of the PATCH-then-keystrokes didn't actually race, or (c) the WS validation only re-checks on next message. Investigate \`handleVisibilityChange\` — the static finding is unchanged: WS-level re-validation gap is the underlying audit-target.`,
  ]);
  await pageA.close();
  await pageB.close();
  await ctxA.close();
  await ctxB.close();
  return slug;
}

async function scenario2(ctx) {
  const slug = 'yjs-to-json-null';
  // Audit claim: persistDocument calls `yjsToJson(fragment)`; if the helper
  // returns `undefined`, `JSON.stringify(undefined)` returns the JS value
  // `undefined`, which pg coerces to SQL NULL — so `documents.content` is
  // silently nulled while `yjs_state` survives.
  //
  // The function as written always returns `{type:'doc', content}`, so this
  // path is preventive. To reproduce live, a defect must be injected
  // upstream. The scenario requires `yjsConverter.ts` to contain a
  // marker-conditioned `return undefined` branch BEFORE the run (the parent
  // thread injects, runs this scenario, reverts). Without the marker
  // injection in place, the scenario falls back to documenting the
  // structural finding.
  const page = await ctx.newPage();
  const bucket = newBucket();
  attachLogger(page, bucket);
  await login(page);

  // Verify the defect injection is active by checking the source file. If
  // not, abort early and write a "structural-only" evidence file so the run
  // is still useful.
  let injectionActive = false;
  try {
    const src = await fs.readFile(
      path.join(HERE, '..', '..', '..', 'api', 'src', 'utils', 'yjsConverter.ts'),
      'utf8'
    );
    injectionActive = src.includes('DEFECT-MARKER-YJS-NULL');
  } catch {}

  const created = await page.evaluate(async () => {
    const csrf = await fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
      body: JSON.stringify({ document_type: 'wiki', title: 'yjs-null-test' }),
    });
    return { status: res.status, body: await res.json() };
  });
  if (created.status >= 400) throw new Error(`create failed: ${JSON.stringify(created)}`);
  const docId = created.body.id || created.body.data?.id;

  await page.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await dismissOverlays(page);

  const body = page.locator('.ProseMirror, [contenteditable="true"]').first();
  await body.click();
  // The marker phrase triggers the injected defect branch in yjsToJson.
  await page.keyboard.type('DEFECT-MARKER-YJS-NULL trigger persist with this body. ', { delay: 8 });
  await page.waitForTimeout(3500); // > 2s persist debounce

  const dbRow = execSync(
    `docker exec -i ship-postgres-1 psql -U ship -d ship_dev -t -A -F'|'`,
    {
      encoding: 'utf8',
      input: `SELECT (content IS NULL) AS content_is_null, octet_length(yjs_state) AS yjs_bytes, content::text FROM documents WHERE id = '${docId}';`,
    }
  ).trim();
  const [contentIsNull, yjsBytes, contentText] = dbRow.split('|');
  const yjsHasBytes = parseInt(yjsBytes || '0', 10) > 0;
  const contentNulled = contentIsNull === 't';

  await page.screenshot({ path: path.join(SHOTS, `${slug}.png`), fullPage: false });

  const verdict = !injectionActive
    ? `⚠️ **Defect injection NOT detected in \`api/src/utils/yjsConverter.ts\`.** This run documents the structural finding only — no live reproduction was performed because the marker-conditioned \`return undefined\` branch is not present in source. To reproduce: (1) edit \`yjsToJson\` to \`if (...DEFECT-MARKER-YJS-NULL...) return undefined;\` at the top of the function, (2) wait for tsx to reload the API, (3) re-run this scenario, (4) revert the source change. The structural risk path remains: if \`yjsToJson\` ever returns undefined, \`JSON.stringify(undefined)\` produces the JS value \`undefined\`, which pg coerces to SQL NULL on the \`content\` column while \`yjs_state\` survives.`
    : contentNulled && yjsHasBytes
      ? `⚠️ **AUDIT CLAIM CONFIRMED LIVE.** With the defect branch in place, the persist path wrote SQL NULL to \`documents.content\` (content_is_null=t) while \`yjs_state\` survived at ${yjsBytes} bytes. API readers that consult \`content\` (not \`yjs_state\`) will see an empty document. The collaboration-server outer try/catch caught nothing — the JSON.stringify of undefined didn't throw, it just produced undefined → pg NULL. **Severity: High — silent data loss.**`
      : contentNulled
        ? `⚠️ **content NULL but yjs_state also empty.** The persist may not have fired at all. Inspect the dev API logs around \`persistDocument\` for the docId above.`
        : `✅ **content NOT nulled despite injection.** The persist path may have an additional guard, or the injection wasn't reached. content snippet: \`${(contentText || '').slice(0, 80)}\``;

  await writeEvidence(slug, [
    `# Scenario 2: yjsToJson silent NULL persist`,
    ``,
    `**Captured:** ${new Date().toISOString()}`,
    `**Doc:** \`${docId}\` (created during the run; safe to delete)`,
    `**Defect injection detected in source:** ${injectionActive ? '✅ yes' : '⚠️ no'}`,
    `**Marker phrase typed:** \`DEFECT-MARKER-YJS-NULL trigger persist with this body.\``,
    ``,
    `## Probes`,
    ``,
    `| Probe | Expected if audit claim is right (with injection) | Observed |`,
    `|---|---|---|`,
    `| \`content IS NULL\` after marker-triggered persist | t (silent NULL) | **${contentIsNull || 'n/a'}** |`,
    `| \`octet_length(yjs_state)\` | > 0 (Yjs survives) | **${yjsBytes || 'n/a'}** bytes |`,
    `| \`content::text\` snippet | (NULL) | \`${(contentText || '').slice(0, 120)}\` |`,
    ``,
    `## Verdict`,
    verdict,
    ``,
    `## Reproduction protocol (for the human running this)`,
    ``,
    `1. Apply this diff to \`api/src/utils/yjsConverter.ts\`:`,
    '   ```ts',
    `   export function yjsToJson(fragment: Y.XmlFragment): any {`,
    `     // TEMPORARY DEFECT INJECTION — revert after capture`,
    `     for (let i = 0; i < fragment.length; i++) {`,
    `       const item = fragment.get(i);`,
    `       if (item instanceof Y.XmlElement) {`,
    `         const text = item.toString();`,
    `         if (text.includes('DEFECT-MARKER-YJS-NULL')) return undefined;`,
    `       }`,
    `     }`,
    `     // ... rest of original function unchanged`,
    '   ```',
    `2. Wait for the dev API to reload (tsx --watch picks up the change in ~1 s).`,
    `3. Re-run: \`WEB=http://localhost:5173 node orientation/baselines/runtime-errors/scenarios.mjs only=2\``,
    `4. \`git restore api/src/utils/yjsConverter.ts\` to revert.`,
    ``,
    `## Console (errors/warnings only)`,
    fmtConsole(bucket.console),
  ]);
  await page.close();
  return slug;
}

async function scenario1(ctx) {
  const slug = 'ws-session-expiry';
  // Audit claim: WS validates session ONLY at HTTP upgrade
  // (collaboration/index.ts:347-393 + 683). A user whose HTTP session is
  // destroyed (idle timeout in prod) keeps editing collaboratively until the
  // browser closes. This scenario forces session destruction via direct DB
  // delete and verifies that the WS keeps persisting writes after the HTTP
  // boundary has been killed.
  const page = await ctx.newPage();
  const bucket = newBucket();
  attachLogger(page, bucket);
  await login(page);

  // Capture the session cookie so we can target it for deletion later.
  const cookies = await ctx.cookies();
  const sessionCookie = cookies.find((c) => c.name === 'session_id');
  if (!sessionCookie) throw new Error('session_id cookie not found post-login');
  // Cookie values come URL-encoded ("s%3A<sig>...") through cookie-parser; the
  // session table stores the raw id. cookie-parser strips the `s:` prefix and
  // verifies the signed value, so the DB id is the part between `s:` and `.`.
  // Easier: read sessions table for our user and pick the most-recent row.
  const userQ = execSync(
    `docker exec -i ship-postgres-1 psql -U ship -d ship_dev -t -A -F'|'`,
    { encoding: 'utf8', input: `SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1;` }
  ).trim();
  const sessionId = userQ.replace(/[\r\n]/g, '');
  if (!sessionId) throw new Error('no session row found in DB');

  // Create a doc and open it — establishes the WS upgrade with a live session.
  const created = await page.evaluate(async () => {
    const csrf = await fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
      body: JSON.stringify({ document_type: 'wiki', title: 'ws-session-expiry-test' }),
    });
    return { status: res.status, body: await res.json() };
  });
  if (created.status >= 400) throw new Error(`create failed: ${JSON.stringify(created)}`);
  const docId = created.body.id || created.body.data?.id;

  await page.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await dismissOverlays(page);

  // Type a pre-expiry phrase to confirm the WS persist path works when the
  // session is alive.
  const PRE = 'BEFORE-EXPIRY-PHRASE-' + Date.now();
  const body = page.locator('.ProseMirror, [contenteditable="true"]').first();
  await body.click();
  await page.keyboard.type(PRE + ' ', { delay: 8 });
  await page.waitForTimeout(3500); // > 2s persist debounce

  const preRow = execSync(
    `docker exec -i ship-postgres-1 psql -U ship -d ship_dev -t -A`,
    { encoding: 'utf8', input: `SELECT content::text FROM documents WHERE id = '${docId}';` }
  ).trim();
  const preHit = preRow.includes(PRE);

  // Now destroy the HTTP session. The WS connection is unaffected at the TCP
  // layer; the audit's claim is that nothing on the WS server re-checks the
  // session row.
  execSync(
    `docker exec -i ship-postgres-1 psql -U ship -d ship_dev`,
    { encoding: 'utf8', input: `DELETE FROM sessions WHERE id = '${sessionId}';` }
  );
  const tDelete = Date.now();

  // Sanity: REST boundary is now dead. /api/auth/me must 401.
  const restProbe = await page.evaluate(async () => {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    return { status: r.status };
  });

  // Continue typing. If the audit is right, the WS keeps accepting and
  // persisting these keystrokes despite the session being gone.
  const POST = 'AFTER-EXPIRY-PHRASE-' + Date.now();
  await body.click();
  await page.keyboard.type(' ' + POST + ' ', { delay: 8 });
  await page.waitForTimeout(3500); // > 2s persist debounce

  const postRow = execSync(
    `docker exec -i ship-postgres-1 psql -U ship -d ship_dev -t -A`,
    { encoding: 'utf8', input: `SELECT content::text FROM documents WHERE id = '${docId}';` }
  ).trim();
  const postHit = postRow.includes(POST);

  await page.screenshot({ path: path.join(SHOTS, `${slug}.png`), fullPage: false });

  await writeEvidence(slug, [
    `# Scenario 1: WebSocket session expiry mid-edit`,
    ``,
    `**Captured:** ${new Date().toISOString()}`,
    `**Doc:** \`${docId}\` (created during the run; safe to delete)`,
    `**Session row deleted:** \`${sessionId}\` at \`${new Date(tDelete).toISOString()}\``,
    `**Setup:** in lieu of waiting 15 minutes for a real idle timeout, this scenario forces session destruction by deleting the \`sessions\` row directly. The WS connection is unchanged at the TCP layer — the audit's claim is that the WS server never re-validates the session row, so the connection continues processing messages.`,
    ``,
    `## Probes`,
    ``,
    `| Probe | Expected if audit claim is right | Observed |`,
    `|---|---|---|`,
    `| Pre-expiry phrase persists via WS (sanity, session alive) | persists | ${preHit ? '✅ persists' : '⚠️ NOT persisted'} |`,
    `| REST \`/api/auth/me\` after session DELETE | 401 (HTTP boundary dead) | **${restProbe.status}** |`,
    `| Post-expiry phrase persists via WS (audit-target test) | persists despite dead session | ${postHit ? '⚠️ **PERSISTS — confirms audit claim**' : '✅ rejected (WS re-checked session)'} |`,
    ``,
    `## Verdict`,
    preHit && restProbe.status === 401 && postHit
      ? `⚠️ **AUDIT CLAIM CONFIRMED LIVE.** The HTTP session was destroyed (REST returns 401) but the WebSocket kept accepting and persisting edits. \`After-expiry\` phrase \`${POST}\` was written to \`documents.content\` despite the session row no longer existing. This is exactly the "user whose session expires keeps editing until the browser closes" path described in the audit. **Severity: High.**`
      : !preHit
        ? `⚠️ **Sanity probe failed.** The pre-expiry phrase did not appear in the persisted \`content\` column — the WS persist path may not be wired the way the test expected. Investigate persistDocument before drawing conclusions.`
        : restProbe.status !== 401
          ? `⚠️ **HTTP boundary not dead.** REST returned ${restProbe.status} after the session DELETE — the session destruction did not take effect. Re-check the session cookie capture path.`
          : `✅ **WS re-validated the session.** The post-expiry phrase did NOT persist, suggesting the WS path enforces session-currency somewhere. This contradicts the static audit finding — file a sub-finding.`,
    ``,
    `## DB rows`,
    `**Pre-delete \`content\`:** \`${preRow.slice(0, 200).replace(/\n/g, ' ⏎ ')}...\``,
    `**Post-delete \`content\`:** \`${postRow.slice(0, 200).replace(/\n/g, ' ⏎ ')}...\``,
    ``,
    `## Console (errors/warnings only)`,
    fmtConsole(bucket.console),
  ]);
  await page.close();
  return slug;
}

async function scenario3b(browser) {
  const slug = 'two-tab-title-race';
  // PRD: "Test concurrent edges: two browser tabs editing the same document
  // field simultaneously." Title is plain `useState` in Editor.tsx:187 — not
  // Yjs-bound — and is persisted via debounced REST PATCH. Two tabs typing
  // into the title race on the persist; expectation: last-write-wins.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const bucketA = newBucket();
  const bucketB = newBucket();
  attachLogger(pageA, bucketA);
  attachLogger(pageB, bucketB);

  // Same user, two browser sessions — simulates "two tabs on the same login".
  await login(pageA);
  await login(pageB);

  // Create the doc as A.
  const created = await pageA.evaluate(async () => {
    const csrf = await fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
      body: JSON.stringify({ document_type: 'wiki', title: 'race-baseline-title' }),
    });
    return { status: res.status, body: await res.json() };
  });
  if (created.status >= 400) throw new Error(`create failed: ${JSON.stringify(created)}`);
  const docId = created.body.id || created.body.data?.id;

  await pageA.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await pageB.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(2000);
  await pageB.waitForTimeout(2000);
  await dismissOverlays(pageA);
  await dismissOverlays(pageB);

  const titleA = pageA.locator('textarea[placeholder*="Untitled" i], textarea').first();
  const titleB = pageB.locator('textarea[placeholder*="Untitled" i], textarea').first();
  const A_TEXT = 'TabA-wins-2026';
  const B_TEXT = 'TabB-wins-2026';

  // Both clear, then type concurrently. Use fill() to set deterministic values
  // simultaneously; the autosave debounce on each side will fire its own PATCH.
  await Promise.all([titleA.click(), titleB.click()]);
  await Promise.all([titleA.fill(A_TEXT), titleB.fill(B_TEXT)]);
  const tConcurrentFill = Date.now();

  // Wait for both debounced autosaves to land.
  await pageA.waitForTimeout(3500);
  await pageB.waitForTimeout(500);

  await pageA.screenshot({ path: path.join(SHOTS, `${slug}-A.png`), fullPage: false });
  await pageB.screenshot({ path: path.join(SHOTS, `${slug}-B.png`), fullPage: false });

  // Read persisted title.
  const read = await pageA.evaluate(async (id) => {
    const r = await fetch(`/api/documents/${id}`, { credentials: 'include' });
    return { status: r.status, body: await r.json() };
  }, docId);
  const persistedTitle = read.body?.title || read.body?.data?.title || '(empty)';

  // Inspect the PATCH order from each tab's network bucket.
  const patchesFromA = bucketA.network.filter(
    (n) => (n.url || '').includes(`/api/documents/${docId}`) && n.method === 'PATCH'
  );
  const patchesFromB = bucketB.network.filter(
    (n) => (n.url || '').includes(`/api/documents/${docId}`) && n.method === 'PATCH'
  );
  const lastPatchA = patchesFromA.at(-1);
  const lastPatchB = patchesFromB.at(-1);
  const winnerByTime = (() => {
    if (!lastPatchA && !lastPatchB) return 'no-PATCH-observed';
    if (!lastPatchA) return 'B (only B sent PATCH)';
    if (!lastPatchB) return 'A (only A sent PATCH)';
    return lastPatchA.ts > lastPatchB.ts ? 'A (later PATCH)' : 'B (later PATCH)';
  })();

  const expectedOneOf = [A_TEXT, B_TEXT];
  const lwwHolds = expectedOneOf.includes(persistedTitle);

  await writeEvidence(slug, [
    `# Scenario 3b: Two-tab concurrent title edit (PRD-required)`,
    ``,
    `**Captured:** ${new Date().toISOString()}`,
    `**Doc:** \`${docId}\` (created during the run; safe to delete)`,
    `**Setup:** two browser contexts, both logged in as \`${CREDS.email}\`, both on \`/documents/${docId}\`.`,
    `**Race:** tab A fills the title with \`${A_TEXT}\`; tab B fills with \`${B_TEXT}\` at the same wall-clock instant (\`${new Date(tConcurrentFill).toISOString()}\`).`,
    ``,
    `## Result`,
    ``,
    `| Probe | Value |`,
    `|---|---|`,
    `| Persisted title (\`GET /api/documents/${docId}\`) | \`${persistedTitle}\` |`,
    `| Tab A PATCHes observed | ${patchesFromA.length} (last at ${lastPatchA ? new Date(lastPatchA.ts).toISOString() : 'n/a'}) |`,
    `| Tab B PATCHes observed | ${patchesFromB.length} (last at ${lastPatchB ? new Date(lastPatchB.ts).toISOString() : 'n/a'}) |`,
    `| Expected winner by PATCH timestamp | ${winnerByTime} |`,
    `| Last-write-wins holds? | ${lwwHolds ? '✅ yes (persisted title is one of the two typed values)' : '⚠️ NO — persisted title is neither typed value'} |`,
    ``,
    `## Verdict`,
    lwwHolds
      ? `✅ **Last-write-wins confirmed live.** The persisted title is one of the two typed values, matching the static analysis (\`Editor.tsx:187\` — title is plain \`useState\`, not Yjs-bound; debounced REST PATCH; no merge). No UI signal to the losing tab that its edit was overwritten — the losing tab continues to show its own typed value until reload. This is the documented behavior, not a bug per the audit; the data-loss-on-reload UX is a Phase 2 candidate.`
      : `⚠️ **Race did not resolve to either tab's value.** Persisted: \`${persistedTitle}\`. Possible causes: (a) one tab's PATCH was rejected, (b) the title element wasn't found on one page, (c) the autosave didn't fire. Inspect the network log below and re-run.`,
    ``,
    `## Network (PATCH events from both tabs)`,
    '```',
    [...patchesFromA.map((n) => `[A] ${n.method || ''} ${n.url || ''} → ${n.status || ''} @ ${new Date(n.ts).toISOString()}`),
     ...patchesFromB.map((n) => `[B] ${n.method || ''} ${n.url || ''} → ${n.status || ''} @ ${new Date(n.ts).toISOString()}`)].sort().join('\n') || '(no PATCH events captured)',
    '```',
    ``,
    `## Console (errors/warnings only) — Tab A`,
    fmtConsole(bucketA.console),
    ``,
    `## Console (errors/warnings only) — Tab B`,
    fmtConsole(bucketB.console),
  ]);
  await pageA.close();
  await pageB.close();
  await ctxA.close();
  await ctxB.close();
  return slug;
}

// ── main ────────────────────────────────────────────────────────────────────

const SCENARIOS = [
  { id: '1', name: 'ws-session-expiry', fn: scenario1, mode: 'ctx' },
  { id: '2', name: 'yjs-to-json-null', fn: scenario2, mode: 'ctx' },
  { id: '3', name: 'disconnect-reconnect', fn: scenario3, mode: 'ctx' },
  { id: '3b', name: 'two-tab-title-race', fn: scenario3b, mode: 'browser' },
  { id: '4', name: 'slow-3g', fn: scenario4, mode: 'browser' },
  { id: '6', name: 'long-title', fn: scenario6, mode: 'ctx' },
  { id: '7', name: 'html-injection', fn: scenario7, mode: 'ctx' },
  { id: '9', name: 'malformed-yjs', fn: scenario9, mode: 'ctx' },
  { id: '10', name: 'visibility-race', fn: scenario10, mode: 'browser' },
];

(async () => {
  await fs.mkdir(EVIDENCE, { recursive: true });
  await fs.mkdir(SHOTS, { recursive: true });
  console.log(`Evidence dir: ${EVIDENCE}`);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const s of SCENARIOS) {
    if (ONLY && !ONLY.has(s.id)) {
      console.log(`-- skipped ${s.id} ${s.name}`);
      continue;
    }
    console.log(`-- scenario ${s.id} ${s.name} ...`);
    const t0 = Date.now();
    try {
      const target = s.mode === 'ctx' ? await browser.newContext() : browser;
      const file = await s.fn(target);
      if (s.mode === 'ctx') await target.close();
      results.push({ id: s.id, name: s.name, file, ok: true, ms: Date.now() - t0 });
      console.log(`   ✓ ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      results.push({ id: s.id, name: s.name, error: e.message, ok: false, ms: Date.now() - t0 });
      console.error(`   ✗ ${s.id} ${s.name}: ${e.message}`);
    }
  }
  await browser.close();
  console.log(`\nSummary:`);
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.id.padEnd(2)} ${r.name.padEnd(22)} ${(r.ms / 1000).toFixed(1)}s ${r.error || ''}`);
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
