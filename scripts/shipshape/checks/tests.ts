// Cat 5 — Test Coverage / suite health
// Runs the full api test suite via vitest with --reporter=json and counts pass/fail.
// Writes the JSON to .cache/vitest-results.json so Cat 6 (errors) can read the same
// run without re-invoking vitest.
//
// Target: 0 test failures across the suite.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CategoryCheck } from '../types.ts';
import { CACHE_DIR, REPO_ROOT, safe, shTry } from '../util.ts';

const VITEST_CACHE = path.join(CACHE_DIR, 'vitest-results.json');

interface VitestSummary {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTotalTestSuites: number;
  numFailedTestSuites: number;
  success: boolean;
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

export async function runApiVitest(): Promise<VitestSummary> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  // vitest v4: with multiple reporters supported, --outputFile uses CAC's dot
  // notation to target a specific reporter (--outputFile.json=path). Plain
  // --outputFile is silently dropped. Pass an absolute path so cwd shifts
  // inside pnpm/vitest don't move the file.
  const cmd =
    `pnpm --filter @ship/api exec vitest run --reporter=json ` +
    `--outputFile.json=${JSON.stringify(VITEST_CACHE)}`;
  const { stdout, stderr, code } = shTry(cmd, { cwd: REPO_ROOT });

  // vitest writes the JSON regardless of exit code; only crash if file is missing.
  try {
    const raw = await fs.readFile(VITEST_CACHE, 'utf8');
    const summary = JSON.parse(raw) as VitestSummary;
    return summary;
  } catch (e) {
    throw new Error(
      `vitest did not write ${VITEST_CACHE} (exit=${code}). stdout tail: ${stdout.slice(-500)}; stderr tail: ${stderr.slice(-500)}`
    );
  }
}

const tests: CategoryCheck = (_ctx) =>
  safe(
    5,
    'Test Coverage',
    '0 test failures across api suite',
    'orientation/improvements/test-coverage.md',
    'pnpm --filter @ship/api test',
    async () => {
      const summary = await runApiVitest();
      const failed = summary.numFailedTests;
      const total = summary.numTotalTests;
      // testResults.length is the actual file count; numTotalTestSuites counts
      // every `describe` block as a suite (226 for ~35 files).
      const fileCount = summary.testResults.length;
      const pass = failed === 0;

      let failureSamples: string | undefined;
      if (failed > 0) {
        const failingNames = summary.testResults
          .flatMap((s) => s.assertionResults.filter((a) => a.status === 'failed').map((a) => a.fullName))
          .slice(0, 5);
        failureSamples = `First failures: ${failingNames.join(' | ')}`;
      }

      return {
        actual: `${summary.numPassedTests}/${total} tests pass across ${fileCount} files (vitest exit ${pass ? '0' : 'nonzero'})`,
        status: pass ? ('pass' as const) : ('fail' as const),
        notes: failureSamples,
      };
    }
  );

export default tests;
