// Dashboard data shape — single source of truth.
// Mirrors scripts/shipshape/types.ts CheckResult, plus dashboard-curated enrichment.

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface CheckResult {
  category: number;
  name: string;
  target: string;
  actual: string;
  status: CheckStatus;
  evidence_path: string;
  reproduction: string;
  notes?: string;
  durationMs: number;
}

export interface ShipshapeRun {
  startedAt: string; // ISO
  branch: string;
  sha: string;
  mode: 'full' | 'ci';
  overallStatus: CheckStatus;
  durationMs: number;
  results: CheckResult[];
}

export interface BeforeAfter {
  label: string;
  before: number;
  after: number;
  unit: string;
  reductionPct: number;
  betterIs: 'lower' | 'higher';
}

export interface SeriesPoint {
  label: string;
  before: number;
  after: number;
}

export interface ArtifactLink {
  label: string;
  href: string; // repo-relative or external
  kind: 'markdown' | 'json' | 'html' | 'text' | 'image' | 'external';
}

/** Curated structured highlight for a category. When present, the
 *  CategoryPanel renders this scannable layout instead of dumping
 *  the full markdown narrative. The narrative stays available as a
 *  collapsed "Full remediation log" beneath. */
export interface CategoryHighlight {
  /** 3-4 big-number tiles shown at the top of the expanded panel. */
  outcomeStats: Array<{
    value: number;
    unit: string;
    label: string;
    tone?: 'pass' | 'fail' | 'neutral';
  }>;
  /** One-line elevator pitch — the headline outcome in plain English. */
  oneLineSummary: string;
  /** Per-change cards. Each represents a specific file or area touched. */
  notableChanges: Array<{
    file: string;
    metric: string;
    detail: string;
  }>;
  /** Shell command a reader can paste to re-derive the current value. */
  reproduceCommand: string;
}

export interface CategoryDetail {
  category: number;
  threshold: string;
  thresholdRationale: string;
  whatWeMonitor: string;
  whyItMatters: string;
  highlight?: CategoryHighlight;
  /**
   * Margin of safety as a percentage (0-100). How much headroom the category
   * has below its threshold. Higher = safer.
   *  - Numeric gates: (threshold - current) / threshold × 100
   *  - Binary gates (e.g. "0 failures"): 100 when passing, 0 when failing
   * Skipped categories: null (no current measurement).
   */
  marginPct: number | null;
  marginExplain: string;
  beforeAfter?: BeforeAfter;
  series?: SeriesPoint[];
  bullets?: string[];
  artifacts: ArtifactLink[];
}

export interface OperationalArtifact {
  label: string;
  href: string;
  description: string;
  category: 'handoff' | 'observability' | 'tooling' | 'deployment';
}

export type EvidenceGroup = 'api' | 'db' | 'bundle' | 'tests' | 'errors' | 'a11y' | 'type' | 'compliance';
export type EvidenceKind = 'json' | 'text' | 'log' | 'html' | 'markdown' | 'script' | 'image';

export interface EvidenceItem {
  /** Repo-relative path. */
  path: string;
  /** Display name (defaults to basename). */
  label: string;
  group: EvidenceGroup;
  kind: EvidenceKind;
  /** File size in bytes. */
  size: number;
  /** Short caption describing the file's purpose. */
  caption: string;
  /** First N lines of the file as a string. null for binary / HTML / heavy files. */
  preview: string | null;
  /** True if this file is best viewed in its own tab (e.g. interactive HTML). */
  external: boolean;
}

export interface EvidenceIndex {
  groups: Array<{
    id: EvidenceGroup;
    label: string;
    description: string;
    items: EvidenceItem[];
  }>;
}

export interface ComplianceFinding {
  source: 'fulltree' | 'phase2';
  ruleId: string;
  ruleDescription: string;
  file: string;
  startLine: number;
  endLine: number;
  /** Short rule-defined fingerprint string. Stable across scans. */
  fingerprint: string;
}

export interface ComplianceSummary {
  scans: Array<{
    source: 'fulltree' | 'phase2';
    label: string;
    description: string;
    totalFindings: number;
  }>;
  byRule: Array<{ ruleId: string; count: number }>;
  byFile: Array<{ file: string; count: number }>;
  findings: ComplianceFinding[];
}

export interface SnapshotMeta {
  generatedAt: string;
  source: 'snapshot' | 'live';
  liveUpdatedAt?: string;
  dashboardVersion: string;
  notes: string[];
}

export interface DashboardSnapshot {
  meta: SnapshotMeta;
  shipshape: ShipshapeRun;
  categoryDetails: CategoryDetail[];
  operations: OperationalArtifact[];
  evidence: EvidenceIndex;
  compliance: ComplianceSummary;
  deployedUrl: string;
  repoUrl: string;
}
