import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { QueryResult, QueryResultRow } from 'pg';
import { pool } from '../../db/client.js';
import type { FleetGraphQueryClient } from '../context.js';
import { loadFleetGraphConfig, type FleetGraphConfig } from '../config.js';
import {
  getDetectionQualityCases,
  type DetectionQualityCase,
} from '../evals/detection-quality-cases.js';
import {
  createAtRiskWeekCheckpointer,
  createAtRiskWeekTraceMetadata,
  createLangfuseAtRiskWeekTraceRunner,
  createOpenAIAtRiskWeekReasoner,
  evaluateAtRiskWeekPreFilter,
  passthroughAtRiskWeekTraceRunner,
  runAtRiskWeekGraph,
  type AtRiskWeekBranchPath,
  type AtRiskWeekGraphState,
} from '../detectors/at-risk-week.js';
import {
  shutdownFleetGraphLangfuseTracing,
  startFleetGraphLangfuseTracing,
} from '../langfuse.js';

export type QualityEvalMode = 'prefilter_only' | 'live_model';

export interface QualityEvalOptions {
  mode: QualityEvalMode;
  caseFilter: string | null;
  limit: number | null;
  strict: boolean;
  trace: boolean;
}

export function parseQualityEvalArgs(argv: string[]): QualityEvalOptions {
  let args = argv.slice(2); // skip node + script

  // Strip bare `--` separators (common with pnpm scripts: `pnpm ... -- --case DQ-R01`)
  args = args.filter((a) => a !== '--');

  let mode: QualityEvalMode = 'prefilter_only';
  let caseFilter: string | null = null;
  let limit: number | null = null;
  let strict = false;
  let trace = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg === '--live') {
      mode = 'live_model';
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--trace') {
      trace = true;
    } else if (arg === '--case') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --case. Usage: --case DQ-R01');
      }
      caseFilter = next;
      i++;
    } else if (arg === '--limit') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --limit. Usage: --limit 5');
      }
      const n = Number(next);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`Invalid --limit value: ${next}. Must be a positive integer.`);
      }
      limit = n;
      i++;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}. Supported: --live, --case, --limit, --strict, --trace`);
    }
  }

  if (trace && mode !== 'live_model') {
    throw new Error('--trace requires --live');
  }

  return { mode, caseFilter, limit, strict, trace };
}

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '../../../..');
const reportDir = path.join(repoRoot, 'docs/evals');

interface DetectionQualityCaseResult {
  id: string;
  name: string;
  description: string;
  executionTier: 'pre_filter' | 'live_model';
  expectedPreFilterShouldReason: boolean;
  expectedFinalShouldProduceFinding: boolean;
  observedPreFilterPassed: boolean | null;
  observedPreFilterReason: string | null;
  preFilterMatch: 'pass' | 'fail' | 'not_executed';
  observedFinalProducedFinding: boolean | null;
  observedBranchPath: AtRiskWeekBranchPath | null;
  observedSeverity: string | null;
  traceUrl: string | null;
  finalFindingMatch: 'pass' | 'fail' | 'not_executed';
  status: 'not_executed' | 'partial' | 'pass' | 'fail' | 'error';
  error?: string;
}

interface DetectionQualityReport {
  suiteName: string;
  generatedAt: string;
  mode: QualityEvalMode;
  flags: {
    live: boolean;
    caseFilter: string | null;
    limit: number | null;
    strict: boolean;
    trace: boolean;
  };
  status: 'not_implemented' | 'partial' | 'pass' | 'fail';
  summary: {
    totalCases: number;
    executedCases: number;
    passedCases: number;
    failedCases: number;
    pendingCases: number;
    errorCases: number;
  };
  cases: DetectionQualityCaseResult[];
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();

  try {
    const options = parseQualityEvalArgs(process.argv);

    let rawCases: DetectionQualityCase[] = getDetectionQualityCases();

    // Apply --case filter first
    if (options.caseFilter) {
      const filtered = rawCases.filter((c) => c.id === options.caseFilter);
      if (filtered.length === 0) {
        throw new Error(`No case found with id ${options.caseFilter}`);
      }
      rawCases = filtered;
    }

    // Apply --limit (after case filter)
    if (options.limit !== null) {
      rawCases = rawCases.slice(0, options.limit);
    }

    const liveConfig = options.mode === 'live_model'
      ? loadAndValidateLiveConfig(options)
      : null;
    if (liveConfig !== null) {
      startFleetGraphLangfuseTracing(liveConfig);
    }

    const cases: DetectionQualityCaseResult[] = [];
    for (const c of rawCases) {
      cases.push(await runDetectionQualityCase(c, options, liveConfig));
    }

    const executed = cases.length;
    const passed = cases.filter((c) => c.status === 'pass').length;
    const failed = cases.filter((c) => c.status === 'fail').length;
    const errorCases = cases.filter((c) => c.status === 'error').length;

    const report: DetectionQualityReport = {
      suiteName: 'FleetGraph Detection Quality Eval (v1)',
      generatedAt,
      mode: options.mode,
      flags: {
        live: options.mode === 'live_model',
        caseFilter: options.caseFilter,
        limit: options.limit,
        strict: options.strict,
        trace: options.trace,
      },
      status: failed === 0 && errorCases === 0 ? 'pass' : 'fail',
      summary: {
        totalCases: cases.length,
        executedCases: executed,
        passedCases: passed,
        failedCases: failed,
        pendingCases: 0,
        errorCases,
      },
      cases,
    };

    await mkdir(reportDir, { recursive: true });

    const markdown = formatReportMarkdown(report);
    const json = JSON.stringify(report, null, 2);

    const mdPath = path.join(reportDir, 'fleetgraph-detection-quality-eval.md');
    const jsonPath = path.join(reportDir, 'fleetgraph-detection-quality-eval.json');

    await writeFile(mdPath, `${markdown}\n`);
    await writeFile(jsonPath, `${json}\n`);

    console.log(markdown);
    console.log('');
    console.log(`FleetGraph detection quality report written to ${mdPath}`);
    console.log(`FleetGraph detection quality JSON written to ${jsonPath}`);
    console.log('');
    console.log(`Mode: ${options.mode} | live=${options.mode === 'live_model'} | trace=${options.trace} | strict=${options.strict}`);
    if (options.caseFilter) console.log(`Case filter: ${options.caseFilter}`);
    if (options.limit) console.log(`Limit: ${options.limit}`);
    console.log(`Loaded ${cases.length} golden cases (${options.mode}).`);

    const hasIssues = report.summary.failedCases > 0 || report.summary.errorCases > 0;
    process.exitCode = options.strict && hasIssues ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FleetGraph detection quality eval failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await shutdownFleetGraphLangfuseTracing();
    await pool.end();
  }
}

function loadAndValidateLiveConfig(options: QualityEvalOptions): FleetGraphConfig {
  const config = loadFleetGraphConfig();

  if (options.trace) {
    if (!config.publicTraceExportEnabled) {
      throw new Error('Live trace capture requires FLEETGRAPH_PUBLIC_TRACE_EXPORT=true');
    }

    if (config.langfuseProjectId === null) {
      throw new Error('Live trace capture requires LANGFUSE_PROJECT_ID so report rows can include public trace URLs');
    }
  }

  return config;
}

async function runDetectionQualityCase(
  qualityCase: DetectionQualityCase,
  options: QualityEvalOptions,
  config: FleetGraphConfig | null
): Promise<DetectionQualityCaseResult> {
  const preFilter = evaluateAtRiskWeekPreFilter(qualityCase.context);
  const preFilterMatch = preFilter.shouldReason === qualityCase.expected.preFilterShouldReason ? 'pass' : 'fail';

  if (options.mode === 'prefilter_only') {
    return {
      id: qualityCase.id,
      name: qualityCase.name,
      description: qualityCase.description,
      executionTier: 'pre_filter',
      expectedPreFilterShouldReason: qualityCase.expected.preFilterShouldReason,
      expectedFinalShouldProduceFinding: qualityCase.expected.finalShouldProduceFinding,
      observedPreFilterPassed: preFilter.shouldReason,
      observedPreFilterReason: preFilter.reason,
      preFilterMatch,
      observedFinalProducedFinding: null,
      observedBranchPath: null,
      observedSeverity: null,
      traceUrl: null,
      finalFindingMatch: 'not_executed',
      status: preFilterMatch === 'pass' ? 'pass' : 'fail',
    };
  }

  if (config === null) {
    throw new Error('Live quality eval requires FleetGraph config');
  }

  try {
    const graphState = await runLiveDetectionQualityCase(qualityCase, options, config);
    const metadata = createAtRiskWeekTraceMetadata(graphState, 'run');
    const observedFinalProducedFinding = graphState.persistence?.findingId !== undefined
      && graphState.persistence.findingId !== null;
    const finalFindingMatch = observedFinalProducedFinding === qualityCase.expected.finalShouldProduceFinding
      ? 'pass'
      : 'fail';
    const status = preFilterMatch === 'pass' && finalFindingMatch === 'pass' ? 'pass' : 'fail';

    return {
      id: qualityCase.id,
      name: qualityCase.name,
      description: qualityCase.description,
      executionTier: 'live_model',
      expectedPreFilterShouldReason: qualityCase.expected.preFilterShouldReason,
      expectedFinalShouldProduceFinding: qualityCase.expected.finalShouldProduceFinding,
      observedPreFilterPassed: preFilter.shouldReason,
      observedPreFilterReason: preFilter.reason,
      preFilterMatch,
      observedFinalProducedFinding,
      observedBranchPath: metadata.branchPath,
      observedSeverity: graphState.reasoning?.isAtRisk === true ? graphState.reasoning.severity : null,
      traceUrl: graphState.trace.langfuseTraceUrl,
      finalFindingMatch,
      status,
    };
  } catch (error) {
    return {
      id: qualityCase.id,
      name: qualityCase.name,
      description: qualityCase.description,
      executionTier: 'live_model',
      expectedPreFilterShouldReason: qualityCase.expected.preFilterShouldReason,
      expectedFinalShouldProduceFinding: qualityCase.expected.finalShouldProduceFinding,
      observedPreFilterPassed: preFilter.shouldReason,
      observedPreFilterReason: preFilter.reason,
      preFilterMatch,
      observedFinalProducedFinding: null,
      observedBranchPath: null,
      observedSeverity: null,
      traceUrl: null,
      finalFindingMatch: 'not_executed',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runLiveDetectionQualityCase(
  qualityCase: DetectionQualityCase,
  options: QualityEvalOptions,
  config: FleetGraphConfig
): Promise<AtRiskWeekGraphState> {
  const runId = randomUUID();
  const requestedAt = new Date().toISOString();
  const materialChangeKey = `v1:quality-eval:${qualityCase.id}:${runId}`;
  const client = createDetectionQualityEvalClient({
    workspaceId: qualityCase.context.week.workspaceId,
    scopedDocId: qualityCase.context.week.id,
  });

  return runAtRiskWeekGraph(
    {
      workspaceId: qualityCase.context.week.workspaceId,
      scopedDocId: qualityCase.context.week.id,
      runId,
      triggerSource: 'mutation',
      requestedAt,
    },
    {
      nodeDependencies: {
        client,
        buildWeekContext: async () => qualityCase.context,
        shouldRunDetector: async () => ({
          shouldRun: true,
          reason: `run_material_changed_no_suppression:${materialChangeKey}`,
          materialChangeKey,
        }),
        now: () => new Date().toISOString(),
      },
      reasonNodeDependencies: {
        reasoner: createOpenAIAtRiskWeekReasoner(config),
        retryPolicy: {
          maxAttempts: 2,
          delayMs: 500,
          sleep: async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        },
        logger: {
          warn: (message, fields) => console.warn(message, fields),
        },
        now: () => new Date().toISOString(),
      },
      outputNodeDependencies: {
        client,
        broadcastToUser: () => undefined,
        now: () => new Date().toISOString(),
      },
      traceRunner: options.trace
        ? createLangfuseAtRiskWeekTraceRunner(config)
        : passthroughAtRiskWeekTraceRunner,
      checkpointer: createAtRiskWeekCheckpointer(),
    }
  );
}

function createDetectionQualityEvalClient(input: {
  workspaceId: string;
  scopedDocId: string;
}): FleetGraphQueryClient {
  const findingId = randomUUID();
  const actionCandidateId = randomUUID();
  let lifecycleState = 'open';

  return {
    query: async <T extends QueryResultRow>(queryText: string, values: unknown[]): Promise<QueryResult<T>> => {
      const normalized = queryText.replace(/\s+/g, ' ').trim();

      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return createQueryResult<T>([]);
      }

      if (normalized.startsWith('SELECT d.id FROM documents d JOIN workspaces w')) {
        return createQueryResult<T>([{ id: input.scopedDocId }]);
      }

      if (normalized.startsWith('INSERT INTO fleetgraph_findings')) {
        lifecycleState = typeof values[6] === 'string' ? values[6] : 'open';
        return createQueryResult<T>([{ id: findingId }]);
      }

      if (normalized.startsWith('INSERT INTO fleetgraph_action_candidates')) {
        return createQueryResult<T>([{ id: actionCandidateId }]);
      }

      if (normalized.startsWith('UPDATE fleetgraph_findings SET lifecycle_state =') && normalized.includes("'executed'")) {
        lifecycleState = 'executed';
        return createQueryResult<T>([{ lifecycle_state: lifecycleState }]);
      }

      if (normalized.startsWith('UPDATE fleetgraph_findings SET lifecycle_state =') && normalized.includes("'pending_review'")) {
        lifecycleState = 'pending_review';
        return createQueryResult<T>([{ id: findingId }]);
      }

      if (normalized.startsWith('SELECT f.lifecycle_state FROM fleetgraph_findings f')) {
        return createQueryResult<T>([{ lifecycle_state: lifecycleState }]);
      }

      if (normalized.startsWith('INSERT INTO fleetgraph_usage')) {
        return createQueryResult<T>([]);
      }

      throw new Error(`Unsupported detection quality eval query: ${normalized}`);
    },
  };
}

function createQueryResult<T extends QueryResultRow>(rows: QueryResultRow[]): QueryResult<T> {
  return {
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows: rows as T[],
  };
}

function formatReportMarkdown(report: DetectionQualityReport): string {
  const caseRows = report.cases
    .map((c) => {
      const expectedPre = c.expectedPreFilterShouldReason ? 'yes' : 'no';
      const expectedFinal = c.expectedFinalShouldProduceFinding ? 'yes' : 'no';
      const observed = c.observedPreFilterPassed ? 'yes' : 'no';
      const reason = c.observedPreFilterReason ?? '—';
      const match = c.preFilterMatch;
      const tier = c.executionTier;
      const observedFinding = c.observedFinalProducedFinding === null ? '—' : c.observedFinalProducedFinding ? 'yes' : 'no';
      const branchPath = c.observedBranchPath ?? '—';
      const trace = c.traceUrl === null ? '—' : `[trace](${c.traceUrl})`;
      return `| ${c.id} | ${c.name} | ${tier} | ${expectedPre} | ${expectedFinal} | ${observed} | ${reason} | ${match} | ${observedFinding} | ${branchPath} | ${c.finalFindingMatch} | ${trace} | ${c.status} |`;
    })
    .join('\n');

  const flags = report.flags;
  const modeLine = `Mode: ${report.mode} | live=${flags.live} | trace=${flags.trace} | strict=${flags.strict}${flags.caseFilter ? ` | case=${flags.caseFilter}` : ''}${flags.limit ? ` | limit=${flags.limit}` : ''}`;

  return [
    `# ${report.suiteName}`,
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    modeLine,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Status | ${report.status} |`,
    `| Mode | ${report.mode} |`,
    `| Total cases | ${report.summary.totalCases} |`,
    `| Executed cases | ${report.summary.executedCases} |`,
    `| Passed cases | ${report.summary.passedCases} |`,
    `| Failed cases | ${report.summary.failedCases} |`,
    `| Error cases | ${report.summary.errorCases} |`,
    '',
    '## Cases',
    '',
    '| ID | Name | Tier | Exp Pre-Filter | Exp Final Finding | Pre-Filter Passed | Pre-Filter Reason | Pre Match | Final Finding | Branch Path | Final Match | Trace | Status |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    caseRows,
    '',
    '---',
    '',
    '**Note:** Default mode runs pre-filter only (cheap + deterministic).',
    'Use `--live` for full graph execution with real model calls (opt-in only).',
    'See `docs/plans/2026-05-29-003-feat-fleetgraph-detection-quality-eval-plan.md` for scope and roadmap.',
  ].join('\n');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
