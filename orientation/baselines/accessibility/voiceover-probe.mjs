#!/usr/bin/env node
/**
 * VoiceOver capture probe — confirms guidepup can actually drive VO and
 * capture spoken phrases on this machine. Run this first before the
 * full Cat 7 walk; if it fails, the full walk has no chance.
 *
 *   node orientation/baselines/accessibility/voiceover-probe.mjs
 *
 * Expected good outcome:
 *   - VoiceOver turns on (you'll hear it).
 *   - Safari opens to /login.
 *   - A few VO+→ moves run; phrases are captured.
 *   - VoiceOver turns off.
 *   - This file prints the captured phrase log.
 */

import { voiceOver } from '../../../node_modules/.pnpm/@guidepup+guidepup@0.24.1/node_modules/@guidepup/guidepup/lib/index.js';
import { execSync } from 'node:child_process';

const WEB = 'http://localhost:5173';

async function main() {
  console.log('[probe] opening Safari to /login');
  execSync(`open -a Safari "${WEB}/login"`);

  // Give Safari a moment to come to the foreground.
  await new Promise((r) => setTimeout(r, 1500));

  console.log('[probe] starting VoiceOver (you should hear it speak)');
  await voiceOver.start();

  try {
    // Wait for VO to settle on the page.
    await new Promise((r) => setTimeout(r, 2500));
    console.log('[probe] after start, last phrase:', await voiceOver.lastSpokenPhrase());

    // Walk 5 elements with VO+→
    for (let i = 0; i < 5; i++) {
      await voiceOver.next();
      await new Promise((r) => setTimeout(r, 600));
      console.log(`[probe] step ${i + 1}: ${await voiceOver.lastSpokenPhrase()}`);
    }

    console.log('[probe] full phrase log:');
    const log = await voiceOver.spokenPhraseLog();
    for (const [i, p] of log.entries()) console.log(`  ${i + 1}. ${p}`);
  } finally {
    console.log('[probe] stopping VoiceOver');
    await voiceOver.stop();
  }
}

main()
  .then(() => {
    console.log('[probe] done — guidepup works on this machine');
    process.exit(0);
  })
  .catch((e) => {
    console.error('[probe] FAILED:', e.message);
    console.error(e);
    process.exit(1);
  });
