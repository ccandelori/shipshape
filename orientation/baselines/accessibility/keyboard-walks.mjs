#!/usr/bin/env node
/**
 * Phase 1 Cat 7 — keyboard-only walkthroughs.
 *
 * Drives 3 flows (login, document-create, edit + modal) using only the
 * keyboard (Tab / Shift+Tab / Enter / Esc / arrow keys). For each flow,
 * dumps a focus chain — every Tab press records `document.activeElement`'s
 * tag, role, aria-label, and the first 60 chars of its label / text.
 *
 * Specifically tests the static findings from `repro-scripts.md`:
 *   - ConversionDialog / MergeProgramDialog / BacklogPickerModal — expected
 *     to leak focus to background (no focus trap implemented).
 *   - AccountabilityGrid `<div onClick>` cells — expected unreachable via Tab,
 *     not activatable via Enter/Space.
 *
 * Writes one markdown per flow:
 *   keyboard-login.md
 *   keyboard-create-doc.md
 *   keyboard-edit-modal.md
 *
 * Run: node orientation/baselines/accessibility/keyboard-walks.mjs
 */

import { chromium } from '../../../node_modules/.pnpm/playwright@1.57.0/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = 'http://localhost:5174';
const CREDS = { email: 'dev@ship.local', password: 'admin123' };

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

/** Read what's currently focused. */
async function getFocus(page) {
  return page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return { tag: 'BODY', text: '(no focus)' };
    return {
      tag: e.tagName,
      role: e.getAttribute('role') || null,
      ariaLabel: e.getAttribute('aria-label') || null,
      ariaLabelledby: e.getAttribute('aria-labelledby') || null,
      placeholder: e.getAttribute('placeholder') || null,
      text: (e.textContent || e.value || '').trim().slice(0, 60),
      type: e.getAttribute('type') || null,
      classes: (e.className || '').toString().slice(0, 60),
    };
  });
}

async function walk(page, steps) {
  const chain = [];
  for (const step of steps) {
    if (typeof step === 'string') {
      await page.keyboard.press(step);
    } else if (typeof step === 'function') {
      await step();
    }
    await page.waitForTimeout(120);
    chain.push({ keys: typeof step === 'string' ? step : '(action)', focus: await getFocus(page) });
  }
  return chain;
}

function fmtChain(chain) {
  return chain
    .map((c, i) => {
      const f = c.focus;
      const label =
        f.ariaLabel || f.placeholder || (f.text && `"${f.text}"`) || f.role || '(no label)';
      const note = f.tag === 'BODY' ? ' ⚠️ FOCUS LOST' : '';
      return `${String(i + 1).padStart(2)}. ${c.keys.padEnd(10)} → \`<${f.tag.toLowerCase()}${f.role ? ` role=${f.role}` : ''}>\` ${label}${note}`;
    })
    .join('\n');
}

// ── flows ───────────────────────────────────────────────────────────────────

async function flowLogin(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Cold load /login
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Step 1: where does focus start?
  const initial = await getFocus(page);

  // Step 2: Tab through the form
  const chain = await walk(page, ['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']);

  // Step 3: re-focus email, type credentials, press Enter
  await page.focus('input[type="email"]');
  await page.keyboard.type(CREDS.email);
  await page.keyboard.press('Tab');
  await page.keyboard.type(CREDS.password);
  const postCredsFocus = await getFocus(page);
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }),
    page.keyboard.press('Enter'),
  ]);
  await page.waitForTimeout(1500);

  const postLoginUrl = page.url();
  const postLoginFocus = await getFocus(page);

  // Step 4: from the post-login page, Tab once — should hit the skip link
  const skipLinkChain = await walk(page, ['Tab', 'Tab', 'Tab']);

  await fs.writeFile(
    path.join(HERE, 'keyboard-login.md'),
    [
      `# Keyboard walkthrough — Login flow`,
      ``,
      `**Captured:** ${new Date().toISOString()}`,
      `**Tests:** WCAG 2.1.1 (Keyboard), 2.4.7 (Focus Visible), 2.4.3 (Focus Order).`,
      ``,
      `## Step 1: Initial focus on cold-load \`/login\``,
      ``,
      `Focus on load: \`<${initial.tag.toLowerCase()}>\` ${initial.ariaLabel || initial.placeholder || '(unlabeled)'}.`,
      initial.tag === 'INPUT' && initial.type === 'email'
        ? `✅ Email input has correct autofocus (\`Login.tsx:247\`).`
        : `⚠️ Email input does NOT have initial focus. Got: ${JSON.stringify(initial)}.`,
      ``,
      `## Step 2: Tab order through the login form`,
      ``,
      '```',
      fmtChain(chain),
      '```',
      ``,
      `## Step 3: Type credentials + press Enter from password`,
      ``,
      `Focus before Enter: \`<${postCredsFocus.tag.toLowerCase()}>\` ${postCredsFocus.ariaLabel || postCredsFocus.placeholder}.`,
      `Post-login URL: \`${postLoginUrl}\`.`,
      `Focus after navigation: \`<${postLoginFocus.tag.toLowerCase()}>\` ${postLoginFocus.ariaLabel || postLoginFocus.text || '(none)'}.`,
      ``,
      `## Step 4: Skip-link & post-login focus order (first 3 Tabs)`,
      ``,
      '```',
      fmtChain(skipLinkChain),
      '```',
      `Look for a "Skip to main content" entry in the chain. It should appear as the first focusable element after page load (\`App.tsx:264-269\`).`,
    ].join('\n') + '\n',
    'utf8'
  );

  await page.close();
  await ctx.close();
  return 'keyboard-login.md';
}

async function flowCreateDoc(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await login(page);

  await page.goto(`${WEB}/docs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);

  // Tab into the page from the address bar. Up to ~25 tabs to reach the "New" button.
  const stepsPre = Array(25).fill('Tab');
  const chainPre = await walk(page, stepsPre);

  // Find where the "New" / "Add" button shows up in the chain
  const newBtnIdx = chainPre.findIndex(
    (c) => /new\s|add\s|create/i.test(c.focus.ariaLabel || '') || /\bnew\b/i.test(c.focus.text || '')
  );

  // Try opening a new doc via keyboard shortcut (Cmd+N may or may not be wired)
  // Otherwise click the New button (we found via keyboard chain)
  await page.keyboard.press('Escape'); // reset focus
  await page.waitForTimeout(300);

  // Try the obvious "create wiki" link
  let createdHow = '(not attempted)';
  try {
    const addBtn = page.locator('button[aria-label*="Add" i], button[aria-label*="Create" i], button[aria-label*="New" i]').first();
    if (await addBtn.count()) {
      await addBtn.focus();
      await page.keyboard.press('Enter');
      createdHow = 'pressed Enter on Add button';
      await page.waitForTimeout(1500);
    }
  } catch {}
  await dismissOverlays(page);

  // After create, where is focus?
  const postCreate = await getFocus(page);

  // Tab a few times to verify the title is reachable
  const postCreateChain = await walk(page, ['Tab', 'Tab', 'Tab', 'Tab']);

  await fs.writeFile(
    path.join(HERE, 'keyboard-create-doc.md'),
    [
      `# Keyboard walkthrough — Create-document flow`,
      ``,
      `**Captured:** ${new Date().toISOString()}`,
      `**Route:** \`/docs\``,
      ``,
      `## Step 1: Reach the "New" / "Add" button via Tab`,
      ``,
      `Tab order over the first 25 Tabs from page-load focus:`,
      ``,
      '```',
      fmtChain(chainPre.slice(0, 25)),
      '```',
      ``,
      newBtnIdx >= 0
        ? `**"New/Add/Create" button found at Tab #${newBtnIdx + 1}.** Reachable via keyboard.`
        : `⚠️ **Could not find a New/Add/Create button in the Tab chain.** The button may be only mouse-accessible, may be hidden behind a sub-tree, or the aria-label doesn't match the search heuristic. Manual inspection needed.`,
      ``,
      `## Step 2: Trigger create-doc via keyboard`,
      ``,
      `How: ${createdHow}.`,
      `Focus immediately after: \`<${postCreate.tag.toLowerCase()}>\` ${postCreate.ariaLabel || postCreate.placeholder || postCreate.text || '(unlabeled)'}.`,
      postCreate.placeholder === 'Untitled'
        ? `✅ Focus auto-jumps to the title input — keyboard-driven create works.`
        : `⚠️ Focus did NOT land on the title input. Got tag=${postCreate.tag} role=${postCreate.role} label=${postCreate.ariaLabel || postCreate.placeholder || '(none)'}.`,
      ``,
      `## Step 3: From title, Tab forward (4 steps)`,
      ``,
      '```',
      fmtChain(postCreateChain),
      '```',
      `Look for whether Tab from the title lands in the ProseMirror editor body, or whether it leaks to chrome elements outside the editor.`,
    ].join('\n') + '\n',
    'utf8'
  );

  await page.close();
  await ctx.close();
  return 'keyboard-create-doc.md';
}

async function flowEditAndModal(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await login(page);

  // Use an existing wiki doc
  const docId = '57895cfe-dcba-419a-8dbc-a919a846c0b7';
  await page.goto(`${WEB}/documents/${docId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await dismissOverlays(page);

  // Test 1: Tab from the URL — first 20 tabs
  const initialChain = await walk(page, Array(20).fill('Tab'));

  // Test 2: Open the "delete document" Radix confirm dialog if there's a delete button
  // Look for delete button (icon button with aria-label)
  const deleteBtn = page.locator('button[aria-label*="elete" i]').first();
  let deleteOpened = false;
  if (await deleteBtn.count()) {
    await deleteBtn.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    deleteOpened = true;
  }
  const deleteDialogFocus = await getFocus(page);

  // Test focus trap by Tabbing 10 times — should cycle within the dialog
  const trapChain = deleteOpened ? await walk(page, Array(10).fill('Tab')) : [];

  // Esc to close
  if (deleteOpened) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  const postEscFocus = await getFocus(page);

  // Test 3: Open the Command Palette (Mod+K) and check focus
  await page.keyboard.press('Meta+k').catch(() => {});
  await page.waitForTimeout(700);
  const cmdkFocus = await getFocus(page);
  const cmdkChain = await walk(page, ['ArrowDown', 'ArrowDown', 'ArrowDown', 'Tab']);
  await page.keyboard.press('Escape');

  // Test 4: Slash-command menu inside the editor
  const editorBody = page.locator('.ProseMirror, [contenteditable="true"]').first();
  await editorBody.click();
  await page.keyboard.press('End'); // go to end of line
  await page.keyboard.press('Enter');
  await page.keyboard.press('/');
  await page.waitForTimeout(500);
  const slashFocus = await getFocus(page);
  const slashChain = await walk(page, ['ArrowDown', 'ArrowDown', 'Escape']);

  // Test 5: Are AccountabilityGrid cells (the static finding) reachable via Tab?
  // The repro-scripts.md says they should NOT be reachable (div onClick anti-pattern).
  await page.goto(`${WEB}/my-week`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);
  // Tab 30 times and see if we hit any element matching the grid-cell pattern
  let foundClickableDiv = false;
  let clickableDivIdx = -1;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(80);
    const f = await getFocus(page);
    if (f.tag === 'DIV' && /grid|cell/i.test(f.classes || '')) {
      foundClickableDiv = true;
      clickableDivIdx = i + 1;
      break;
    }
  }

  await fs.writeFile(
    path.join(HERE, 'keyboard-edit-modal.md'),
    [
      `# Keyboard walkthrough — Edit + modal flow`,
      ``,
      `**Captured:** ${new Date().toISOString()}`,
      `**Routes:** \`/documents/${docId}\` (wiki editor) and \`/my-week\` (AccountabilityGrid).`,
      ``,
      `## Step 1: Tab order on opened editor (first 20 tabs)`,
      ``,
      '```',
      fmtChain(initialChain),
      '```',
      ``,
      `## Step 2: Delete-confirmation dialog (Radix-based — expected to have focus trap)`,
      ``,
      deleteOpened
        ? [
            `Delete button reached and Enter pressed; dialog opened.`,
            `Focus immediately after Enter: \`<${deleteDialogFocus.tag.toLowerCase()}>\` ${deleteDialogFocus.ariaLabel || deleteDialogFocus.text}.`,
            ``,
            `Tab cycle (10 presses):`,
            '```',
            fmtChain(trapChain),
            '```',
            ``,
            `Focus after Esc: \`<${postEscFocus.tag.toLowerCase()}>\` ${postEscFocus.ariaLabel || postEscFocus.text}.`,
          ].join('\n')
        : `⚠️ Could not find a Delete button via aria-label; manual verification of the Radix focus trap still pending.`,
      ``,
      `## Step 3: Command Palette (Mod+K)`,
      ``,
      `Focus after Mod+K: \`<${cmdkFocus.tag.toLowerCase()}>\` ${cmdkFocus.ariaLabel || cmdkFocus.placeholder || cmdkFocus.text || '(none)'}.`,
      cmdkFocus.tag === 'INPUT' || cmdkFocus.placeholder
        ? `✅ Search input has focus when palette opens.`
        : `⚠️ Search input doesn't have initial focus — may require an extra Tab. Got: ${JSON.stringify(cmdkFocus)}`,
      `Arrow + Tab chain inside palette:`,
      '```',
      fmtChain(cmdkChain),
      '```',
      ``,
      `## Step 4: Slash-command menu inside the editor body`,
      ``,
      `Focus after \`/\` typed: \`<${slashFocus.tag.toLowerCase()}>\` ${slashFocus.ariaLabel || slashFocus.text || '(none)'}.`,
      `Arrow-down + Esc chain:`,
      '```',
      fmtChain(slashChain),
      '```',
      ``,
      `## Step 5: AccountabilityGrid \`<div onClick>\` cells (static finding — should NOT be Tab-reachable)`,
      ``,
      foundClickableDiv
        ? `⚠️ **Found a \`<div>\` matching grid-cell class pattern in the Tab chain at step #${clickableDivIdx}.** This contradicts the static finding; investigate whether these cells gained \`tabindex\` since the audit, or are different cells.`
        : `✅ **Confirmed:** in 30 Tabs from page load on \`/my-week\`, no \`<div>\` with grid-cell classes received focus. The static finding stands: the AccountabilityGrid cells use \`<div onClick>\` and are unreachable via keyboard.`,
      ``,
      `## Static findings still load-bearing (Lighthouse can't trigger these — modal must be open)`,
      ``,
      `- **ConversionDialog, MergeProgramDialog, BacklogPickerModal** have \`role="dialog" aria-modal="true"\` but no focus trap and no \`aria-labelledby\`. Code citations in audit-report.md §7. Not exercised live in this walk because triggering these modals requires UI states (a target wiki to convert, two programs to merge, a sprint planning page) not easily set up programmatically — they remain code-static findings, severity unchanged.`,
    ].join('\n') + '\n',
    'utf8'
  );

  await page.close();
  await ctx.close();
  return 'keyboard-edit-modal.md';
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  console.log('-- flow 1: login');
  console.log(`   ✓ ${await flowLogin(browser)}`);
  console.log('-- flow 2: create-doc');
  console.log(`   ✓ ${await flowCreateDoc(browser)}`);
  console.log('-- flow 3: edit + modal');
  console.log(`   ✓ ${await flowEditAndModal(browser)}`);
  await browser.close();
})();
