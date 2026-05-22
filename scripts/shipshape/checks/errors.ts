// Cat 6 — Runtime Error Handling (critical-path regression subset)
// Reads the JSON output from Cat 5's vitest run (no second vitest invocation)
// and filters to the Task 14 + phase2-regressions + document-mappers files.
//
// Target: 0 failures in the filtered subset.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CategoryCheck } from '../types.ts';
import { CACHE_DIR, REPO_ROOT, safe } from '../util.ts';

const VITEST_CACHE = path.join(CACHE_DIR, 'vitest-results.json');

// Source-of-truth list — the critical-path tests that prove the Phase 2 fixes hold.
// Path matching uses .endsWith() so the file moving inside api/src/ is tolerated.
const CRITICAL_PATH_SUFFIXES = [
  'api/src/__tests__/phase2-regressions.test.ts',
  'api/src/__tests__/cascade-delete.test.ts',
  'api/src/__tests__/document-sync.test.ts',
  'api/src/__tests__/document-mappers.test.ts',
  'api/src/collaboration/__tests__/session-timeout.test.ts',
] as const;

interface VitestSummary {
  testResults: Array<{
    name: string;
    status: string;
    assertionResults: Array<{
      title: string;
      fullName: string;
      status: 'passed' | 'failed' | 'pending' | 'skipped' | 'todo';
      failureMessages?: string[];
    }>;
  }>;
}

const errors: CategoryCheck = (_ctx) =>
  safe(
    6,
    'Runtime Error Handling',
    '0 failures in critical-path regression subset',
    'orientation/improvements/runtime-error-handling.md',
    'pnpm --filter @ship/api test (filtered subset; runs piggyback on Cat 5 output)',
    async () => {
      let raw: string;
      try {
        raw = await fs.readFile(VITEST_CACHE, 'utf8');
      } catch {
        return {
          actual: 'no vitest cache found',
          status: 'skip' as const,
          notes: `Cat 5 (tests) must run first to populate ${path.relative(REPO_ROOT, VITEST_CACHE)}.`,
        };
      }

      const summary = JSON.parse(raw) as VitestSummary;

      const matched = summary.testResults.filter((s) =>
        CRITICAL_PATH_SUFFIXES.some((sfx) => s.name.endsWith(sfx))
      );

      if (matched.length === 0) {
        return {
          actual: 'no critical-path files matched in vitest output',
          status: 'fail' as const,
          notes: `Expected to find ${CRITICAL_PATH_SUFFIXES.length} critical-path files; matched 0. Did the file paths move?`,
        };
      }

      const missingFiles = CRITICAL_PATH_SUFFIXES.filter(
        (sfx) => !matched.some((m) => m.name.endsWith(sfx))
      );

      let passed = 0;
      let failed = 0;
      const failingNames: string[] = [];
      for (const file of matched) {
        for (const a of file.assertionResults) {
          if (a.status === 'passed') passed++;
          else if (a.status === 'failed') {
            failed++;
            failingNames.push(a.fullName);
          }
        }
      }
      const pass = failed === 0 && missingFiles.length === 0;

      const notes: string[] = [];
      if (missingFiles.length > 0) {
        notes.push(`Missing critical-path files: ${missingFiles.join(', ')}`);
      }
      if (failingNames.length > 0) {
        notes.push(`First failures: ${failingNames.slice(0, 5).join(' | ')}`);
      }

      return {
        actual: `${passed} pass / ${failed} fail across ${matched.length}/${CRITICAL_PATH_SUFFIXES.length} critical-path files`,
        status: pass ? ('pass' as const) : ('fail' as const),
        notes: notes.length > 0 ? notes.join(' — ') : undefined,
      };
    }
  );

export default errors;
