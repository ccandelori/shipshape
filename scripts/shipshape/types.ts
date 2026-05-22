// Shipshape — shared types for the per-category quality checks.
// Each check returns a uniform CheckResult so the orchestrator can build
// the markdown scoreboard without per-category branching.

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface CheckResult {
  category: number; // 1-7
  name: string; // human label, e.g. "Type Safety"
  target: string; // PRD threshold, e.g. ">= 25% reduction from 747"
  actual: string; // measured value, formatted for the report
  status: CheckStatus;
  evidence_path: string; // repo-relative path to backing artifact / writeup
  reproduction: string; // CLI command a human can run to re-derive `actual`
  notes?: string; // optional context (e.g. why a check skipped)
  durationMs: number; // wall-clock for the check
}

export interface ShipshapeContext {
  mode: 'full' | 'ci';
  repoRoot: string;
  startedAt: Date;
  gitSha: string;
  branch: string;
}

export interface CategoryCheck {
  (ctx: ShipshapeContext): Promise<CheckResult>;
}
