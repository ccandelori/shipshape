#!/usr/bin/env node
/**
 * Cat 7 VoiceOver walk — automated.
 *
 * Drives Playwright (headed Chromium) to login and navigate, then uses
 * guidepup to start VoiceOver, walk the page with VO+→ keystrokes, and
 * capture the actual spoken-phrase log.
 *
 * Output:
 *   orientation/baselines/accessibility/voiceover-results-<YYYY-MM-DD>.md
 *   orientation/baselines/accessibility/voiceover-results-<YYYY-MM-DD>.json
 *
 * Prereqs:
 *   - macOS with VoiceOver installed (built in).
 *   - iTerm (or whatever runs this) has Accessibility + Automation
 *     permissions in System Settings → Privacy & Security.
 *   - VoiceOver "Allow VoiceOver to be controlled with AppleScript" must
 *     be ON. We set the defaults key automatically; if guidepup still
 *     reports "VoiceOver not supported," open VoiceOver Utility manually
 *     (VO+F8 once VO is on) → General → tick the AppleScript checkbox.
 *   - Local dev stack running (web :5173, api :3000), docker DB up.
 *
 * Run:
 *   node orientation/baselines/accessibility/voiceover-walk.mjs
 */

import { chromium } from '../../../node_modules/.pnpm/playwright@1.57.0/node_modules/playwright/index.mjs';
import { voiceOver } from '../../../node_modules/.pnpm/@guidepup+guidepup@0.24.1/node_modules/@guidepup/guidepup/lib/index.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Point at vite preview (4173) by default — production build, no dev-mode
// widgets like Tanstack query devtools that snag the VO cursor. Override
// with WEB=http://localhost:5173 for dev-stack capture.
const WEB = process.env.WEB || 'http://localhost:4173';
const CREDS = { email: 'dev@ship.local', password: 'admin123' };
const WIKI_DOC_ID = '57895cfe-dcba-419a-8dbc-a919a846c0b7';

// How many VO+→ moves to walk on each route. Real users don't tab through
// 200 items, so cap at 30 — that's enough to cover the top nav, main
// content, and the first card or two of the page.
const STEPS_PER_ROUTE = 30;

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function focusChromium() {
  // Bring the Chromium-for-Playwright window to the foreground so VO
  // reads it. Playwright's "Chromium" identifies as "Chromium" in the app
  // menu; if that fails, fall back to clicking the window center via
  // AppleScript "System Events"-driven activation.
  try {
    execSync(`osascript -e 'tell application "Chromium" to activate'`, { stdio: 'pipe' });
    return;
  } catch {
    // best effort fallback
  }
  try {
    execSync(
      `osascript -e 'tell application "System Events" to set frontmost of first process whose name contains "Chromium" to true'`,
      { stdio: 'pipe' },
    );
  } catch {
    // give up — caller will continue regardless
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

async function dismissOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.locator('div[data-state="open"]').count().catch(() => 0);
    if (!open) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

async function walkRoute(page, route) {
  console.log(`[walk] navigating to ${route.path}`);
  await page.goto(`${WEB}${route.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await dismissOverlays(page);
  if (route.afterNav) await route.afterNav(page);
  await page.waitForTimeout(2000);

  await focusChromium();
  await new Promise((r) => setTimeout(r, 600));

  // Reset VO's spoken-phrase log so this route's capture is clean.
  // (guidepup's lastSpokenPhraseLog accumulates across calls.)
  const baselineLogLen = (await voiceOver.spokenPhraseLog()).length;

  // Best-effort: jump to the top of the page so the walk is deterministic.
  // Cmd+Up Arrow is a browser-level scroll-to-top. VO will then start the
  // next() sequence from whatever element gains focus on the top.
  await voiceOver.press('Command+Up').catch(() => {});
  await new Promise((r) => setTimeout(r, 600));

  const stepCount = route.steps ?? STEPS_PER_ROUTE;
  const transcript = [];
  for (let i = 0; i < stepCount; i++) {
    await voiceOver.next();
    await new Promise((r) => setTimeout(r, 350));
    const phrase = await voiceOver.lastSpokenPhrase();
    transcript.push({ step: i + 1, phrase });
  }

  // Route-specific extra actions (e.g. typing into the editor).
  if (route.extra) {
    transcript.push({ step: 'extra-marker', phrase: `--- begin extra: ${route.extra.label} ---` });
    await route.extra.run({ page, voiceOver, record: (phrase) => transcript.push({ step: 'extra', phrase }) });
    transcript.push({ step: 'extra-marker', phrase: `--- end extra: ${route.extra.label} ---` });
  }

  return { slug: route.slug, label: route.label, path: route.path, transcript };
}

async function writeResults(results, fullLog) {
  const date = todayIso();
  const jsonPath = path.join(HERE, `voiceover-results-${date}.json`);
  const mdPath = path.join(HERE, `voiceover-results-${date}.md`);

  await fs.writeFile(
    jsonPath,
    JSON.stringify({ capturedAt: new Date().toISOString(), web: WEB, results, fullSpokenLog: fullLog }, null, 2),
    'utf8',
  );

  const md = [
    `# Cat 7 — VoiceOver walk transcript (${date})`,
    '',
    `**Captured:** ${new Date().toISOString()}`,
    `**Driver:** \`orientation/baselines/accessibility/voiceover-walk.mjs\` — guidepup + Playwright (Chromium, headed)`,
    `**Stack:** ${WEB}, docker postgres`,
    '',
    'This is an actual VoiceOver spoken-phrase log (not a proxy). guidepup',
    'reads VO\'s speech-log facility, so every `phrase` below is what VO',
    'literally said as it walked the page with VO+→.',
    '',
    '## Routes covered',
    '',
    ...results.map((r) => `- **${r.label}** — \`${r.path}\``),
    '',
    ...results.flatMap((r) => [
      `## ${r.label} (\`${r.path}\`)`,
      '',
      'Step | What VoiceOver said',
      '---:|---',
      ...r.transcript.map((t) => `${t.step} | ${t.phrase.replace(/\n/g, ' ').replace(/\|/g, '\\|')}`),
      '',
    ]),
    '## Notes',
    '',
    '- Step labels `extra` denote scripted post-walk actions (e.g. typing into the editor body) included for editor-interaction coverage.',
    '- guidepup occasionally captures very long compound phrases when VO surfaces system context (e.g. iTerm window state). These appear as the first step of a route and can be safely ignored when assessing the route\'s own a11y.',
    '- For findings, scan for phrases that say `button` or `group` with NO descriptive name preceding them, or focus moves to elements VO can\'t name. Those are the Phase 2 candidates.',
    '',
  ].join('\n');
  await fs.writeFile(mdPath, md, 'utf8');

  console.log(`[walk] wrote ${jsonPath}`);
  console.log(`[walk] wrote ${mdPath}`);
}

async function main() {
  // 1. Ensure AppleScript control of VoiceOver is enabled (idempotent).
  try {
    execSync(`defaults write com.apple.VoiceOver4/default SCREnableAppleScript -bool true`);
  } catch (e) {
    console.warn('[walk] could not set SCREnableAppleScript:', e.message);
  }

  // 2. Confirm guidepup can detect VO before launching browser.
  const detected = await voiceOver.detect();
  if (!detected) {
    console.error(
      '[walk] guidepup says VoiceOver is not controllable via AppleScript.\n' +
        'Open VoiceOver Utility (cmd+F5 to start VO, then VO+F8) → General →\n' +
        'tick "Allow VoiceOver to be controlled with AppleScript".',
    );
    process.exit(2);
  }

  // 3. Launch Playwright (headed) and login.
  console.log('[walk] launching Chromium (headed)');
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  try {
    console.log('[walk] logging in');
    await login(page);

    // 4. Bring the browser window to the foreground and start VO.
    await focusChromium();
    await new Promise((r) => setTimeout(r, 1500));
    console.log('[walk] starting VoiceOver');
    await voiceOver.start();
    await new Promise((r) => setTimeout(r, 2500));

    // 5. Walk the PRD-required routes.
    //    PRD: "Test with VoiceOver (macOS) on the dashboard and a document edit page."
    //    `/my-week` is the actual default landing (and the original audit's
    //    interpretation of "dashboard"). `/dashboard` is the literal PRD path —
    //    walked separately so the PRD-literal compliance gap is closed.
    const routes = [
      { slug: 'dashboard', label: 'Dashboard (/dashboard) — PRD-literal', path: '/dashboard' },
      { slug: 'my-week', label: 'Default landing (/my-week)', path: '/my-week' },
      {
        slug: 'doc-editor-wiki',
        label: 'Document editor (wiki)',
        path: `/documents/${WIKI_DOC_ID}`,
        // Fewer steps for the editor — the page has fewer landmark
        // elements than the dashboard. 20 covers properties sidebar +
        // some of the editor body.
        steps: 20,
        afterNav: async (p) => {
          const body = p.locator('.ProseMirror, [contenteditable="true"]').first();
          if (await body.count()) await body.click({ force: true }).catch(() => {});
        },
        extra: {
          label: 'focus editor body via Playwright, then type and capture echo',
          run: async ({ page, voiceOver: vo, record }) => {
            // Use Playwright (not VO) to put the caret in the editor body.
            // This sidesteps cases where the VO cursor got stuck on a sidebar
            // widget; we land focus directly on the contenteditable.
            const body = page.locator('.ProseMirror, [contenteditable="true"]').first();
            if (await body.count()) {
              await body.click({ force: true }).catch(() => {});
              await new Promise((r) => setTimeout(r, 500));
              record(`(playwright) editor body focused`);
              record(await vo.lastSpokenPhrase());
            } else {
              record(`(playwright) editor body not found — skipping type`);
              return;
            }

            const sentence = 'The quick brown fox.';
            for (const ch of sentence) {
              await vo.type(ch);
              await new Promise((r) => setTimeout(r, 140));
              record(await vo.lastSpokenPhrase());
            }
            // Select previous word and Cmd+B
            await vo.press('Option+Shift+Left');
            await new Promise((r) => setTimeout(r, 300));
            record(await vo.lastSpokenPhrase());
            await vo.press('Command+b');
            await new Promise((r) => setTimeout(r, 400));
            record(await vo.lastSpokenPhrase());
          },
        },
      },
    ];

    const results = [];
    for (const route of routes) {
      const r = await walkRoute(page, route);
      results.push(r);
    }

    const fullLog = await voiceOver.spokenPhraseLog();
    await writeResults(results, fullLog);
  } finally {
    console.log('[walk] stopping VoiceOver');
    await voiceOver.stop().catch((e) => console.warn('[walk] VO stop failed:', e.message));
    await browser.close();
  }
}

main().catch((e) => {
  console.error('[walk] failed:', e.message);
  console.error(e);
  process.exit(1);
});
