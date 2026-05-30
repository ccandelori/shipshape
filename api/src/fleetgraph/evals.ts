import { randomUUID } from 'node:crypto';
import { pool } from '../db/client.js';
import {
  buildFleetGraphChatPrompt,
  buildFleetGraphChatSources,
  createFleetGraphChatTraceContext,
  evaluateFleetGraphChatRateLimit,
  FLEETGRAPH_CHAT_CONTEXT_BOUNDARY,
  FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT,
  FLEETGRAPH_CHAT_RATE_LIMIT_MAX_REQUESTS,
  FleetGraphChatRequestSchema,
  selectFleetGraphChatContextHistory,
  type FleetGraphChatContextBuilders,
  type FleetGraphChatMessage,
  type FleetGraphChatModel,
  type FleetGraphChatModelMessage,
  type FleetGraphChatRateLimitState,
} from './chat.js';
import type {
  FleetGraphQueryClient,
  IssueContextResult,
  ProjectContext,
  WeekContext,
} from './context.js';
import type {
  AtRiskWeekGraphDependencies,
  AtRiskWeekGraphInput,
  AtRiskWeekGraphState,
} from './detectors/at-risk-week.js';
import { passthroughAtRiskWeekTraceRunner } from './detectors/at-risk-week-tracing.js';
import {
  runFleetGraphDemoScenario,
  type FleetGraphDemoScenarioResult,
} from './demo-scenarios.js';
import { runFleetGraphGraph } from './graph.js';
import {
  acquireAdvisoryLock,
  generateMaterialChangeKey,
  releaseAdvisoryLock,
  shouldRunDetector,
} from './guards.js';
import {
  createDisabledFleetGraphPublicTracePolicy,
  createFleetGraphLangfuseTraceUrl,
  maskSensitiveLangfuseValue,
  publishFleetGraphTraceIfEnabled,
  sanitizeLangfuseMetadata,
  type FleetGraphPublicTracePolicy,
  type FleetGraphTracePublicationLogger,
} from './langfuse.js';
import { classifyFleetGraphPolicy } from './policy.js';

export type FleetGraphEvalStatus = 'pass' | 'fail';

export type FleetGraphEvalCategory =
  | 'proactive'
  | 'chat'
  | 'policy'
  | 'scope'
  | 'observability';

export type FleetGraphEvalMetric =
  | 'branch_path'
  | 'finding_presence'
  | 'action_candidate'
  | 'approval_policy'
  | 'chat_sources'
  | 'chat_response'
  | 'scope_guard'
  | 'trace_metadata'
  | 'latency_budget'
  | 'material_change'
  | 'concurrency_guard'
  | 'trace_export'
  | 'redaction'
  | 'history_window'
  | 'rate_limit';

export interface FleetGraphEvalAssertionObservation {
  metric: FleetGraphEvalMetric;
  name: string;
  expected: string;
  observed: string;
}

export interface FleetGraphEvalObservation {
  id: string;
  name: string;
  category: FleetGraphEvalCategory;
  assertions: FleetGraphEvalAssertionObservation[];
}

export interface FleetGraphEvalAssertionResult extends FleetGraphEvalAssertionObservation {
  status: FleetGraphEvalStatus;
}

export interface FleetGraphEvalCaseResult {
  id: string;
  name: string;
  category: FleetGraphEvalCategory;
  status: FleetGraphEvalStatus;
  assertions: FleetGraphEvalAssertionResult[];
}

export interface FleetGraphEvalSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  passRate: number;
}

export interface FleetGraphEvalReport {
  suiteName: string;
  generatedAt: string;
  status: FleetGraphEvalStatus;
  summary: FleetGraphEvalSummary;
  cases: FleetGraphEvalCaseResult[];
}

export interface FleetGraphEvalScoringInput {
  suiteName: string;
  generatedAt: string;
  observations: FleetGraphEvalObservation[];
}

export interface FleetGraphDeterministicEvalSuiteInput {
  generatedAt: string;
}

type IdRow = {
  id: string;
};

type EvalTracePublishState = {
  observation: Parameters<typeof publishFleetGraphTraceIfEnabled>[0]['observation'];
  setPublicCount: number;
  publishCount: number;
};

const fleetGraphV1EvalSuiteName = 'FleetGraph V1 deterministic evals';
const fleetGraphV2EvalSuiteName = 'FleetGraph V2 deterministic evals';
const evalWorkspaceId = '11111111-1111-4111-8111-111111111111';
const evalWeekDocumentId = '22222222-2222-4222-8222-222222222222';
const evalIssueDocumentId = '33333333-3333-4333-8333-333333333333';
const evalStandupDocumentId = '44444444-4444-4444-8444-444444444444';
const evalUserId = '55555555-5555-4555-8555-555555555555';

export async function runFleetGraphDeterministicEvalSuite(
  input: FleetGraphDeterministicEvalSuiteInput
): Promise<FleetGraphEvalReport> {
  return runFleetGraphV1EvalSuite(input);
}

export async function runFleetGraphV1EvalSuite(
  input: FleetGraphDeterministicEvalSuiteInput
): Promise<FleetGraphEvalReport> {
  const observations = [
    ...await runProactiveScenarioObservations(),
    await runOnDemandChatGraphObservation(),
    await runChatSourceGroundingObservation(),
    runNotifyPolicyObservation(),
    runVisibleWritePolicyObservation(),
    await runProactiveGraphParityObservation(),
    runUnsupportedChatScopeObservation(),
  ];

  return scoreFleetGraphEvalObservations({
    suiteName: fleetGraphV1EvalSuiteName,
    generatedAt: input.generatedAt,
    observations,
  });
}

export async function runFleetGraphV2EvalSuite(
  input: FleetGraphDeterministicEvalSuiteInput
): Promise<FleetGraphEvalReport> {
  const observations = [
    runMaterialChangeGuardObservation(),
    await runSuppressionDedupObservation(),
    await runAdvisoryLockObservation(),
    await runPublicTraceExportGateObservation(),
    runLangfuseRedactionObservation(),
    runChatHistoryWindowObservation(),
    runChatRateLimitObservation(),
    runTraceUrlConstructionObservation(),
  ];

  return scoreFleetGraphEvalObservations({
    suiteName: fleetGraphV2EvalSuiteName,
    generatedAt: input.generatedAt,
    observations,
  });
}

export async function runFleetGraphAllEvalSuites(
  input: FleetGraphDeterministicEvalSuiteInput
): Promise<FleetGraphEvalReport[]> {
  return [
    await runFleetGraphV1EvalSuite(input),
    await runFleetGraphV2EvalSuite(input),
  ];
}

export function scoreFleetGraphEvalObservations(input: FleetGraphEvalScoringInput): FleetGraphEvalReport {
  const cases = input.observations.map(scoreFleetGraphEvalCase);
  const totalCases = cases.length;
  const passedCases = cases.filter((result) => result.status === 'pass').length;
  const totalAssertions = cases.reduce((sum, result) => sum + result.assertions.length, 0);
  const passedAssertions = cases.reduce((sum, result) => (
    sum + result.assertions.filter((assertion) => assertion.status === 'pass').length
  ), 0);
  const failedCases = totalCases - passedCases;
  const failedAssertions = totalAssertions - passedAssertions;

  return {
    suiteName: input.suiteName,
    generatedAt: input.generatedAt,
    status: failedCases === 0 && failedAssertions === 0 ? 'pass' : 'fail',
    summary: {
      totalCases,
      passedCases,
      failedCases,
      totalAssertions,
      passedAssertions,
      failedAssertions,
      passRate: calculatePassRate(passedAssertions, totalAssertions),
    },
    cases,
  };
}

export function createFleetGraphEvalExitCode(report: FleetGraphEvalReport): number {
  return report.status === 'pass' ? 0 : 1;
}

export function formatFleetGraphEvalReportMarkdown(report: FleetGraphEvalReport): string {
  return [
    `# ${report.suiteName}`,
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Status | ${report.status} |`,
    `| Total cases | ${report.summary.totalCases} |`,
    `| Passed cases | ${report.summary.passedCases} |`,
    `| Failed cases | ${report.summary.failedCases} |`,
    `| Total assertions | ${report.summary.totalAssertions} |`,
    `| Passed assertions | ${report.summary.passedAssertions} |`,
    `| Failed assertions | ${report.summary.failedAssertions} |`,
    `| Pass rate | ${formatPercent(report.summary.passRate)} |`,
    '',
    '## Cases',
    '',
    '| ID | Name | Category | Status | Assertions |',
    '|---|---|---|---|---:|',
    ...report.cases.map(formatCaseRow),
    '',
    '## Assertions',
    '',
    ...report.cases.flatMap(formatCaseAssertions),
  ].join('\n');
}

function scoreFleetGraphEvalCase(observation: FleetGraphEvalObservation): FleetGraphEvalCaseResult {
  const assertions = observation.assertions.map(scoreFleetGraphEvalAssertion);
  const status = assertions.every((assertion) => assertion.status === 'pass') ? 'pass' : 'fail';

  return {
    id: observation.id,
    name: observation.name,
    category: observation.category,
    status,
    assertions,
  };
}

function scoreFleetGraphEvalAssertion(
  assertion: FleetGraphEvalAssertionObservation
): FleetGraphEvalAssertionResult {
  return {
    ...assertion,
    status: assertion.observed === assertion.expected ? 'pass' : 'fail',
  };
}

function calculatePassRate(passedAssertions: number, totalAssertions: number): number {
  if (totalAssertions === 0) {
    return 0;
  }

  return Number((passedAssertions / totalAssertions).toFixed(4));
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function formatCaseRow(result: FleetGraphEvalCaseResult): string {
  return [
    '|',
    result.id,
    '|',
    result.name,
    '|',
    result.category,
    '|',
    result.status,
    '|',
    `${countPassedAssertions(result)}/${result.assertions.length}`,
    '|',
  ].join(' ');
}

function formatCaseAssertions(result: FleetGraphEvalCaseResult): string[] {
  return [
    `### ${result.id}: ${result.name}`,
    '',
    '| Metric | Assertion | Status | Expected | Observed |',
    '|---|---|---|---|---|',
    ...result.assertions.map((assertion) => [
      '|',
      assertion.metric,
      '|',
      assertion.name,
      '|',
      assertion.status,
      '|',
      formatTableCell(assertion.expected),
      '|',
      formatTableCell(assertion.observed),
      '|',
    ].join(' ')),
    '',
  ];
}

function countPassedAssertions(result: FleetGraphEvalCaseResult): number {
  return result.assertions.filter((assertion) => assertion.status === 'pass').length;
}

function formatTableCell(value: string): string {
  return value.replaceAll('|', '\\|');
}

async function runProactiveScenarioObservations(): Promise<FleetGraphEvalObservation[]> {
  const runNonce = randomUUID();
  const workspaceId = await createEvalWorkspace(runNonce);
  const ownerUserId = await createEvalUser(runNonce);
  const scopedDocId = await createEvalWeek(workspaceId, ownerUserId);
  const client = await pool.connect();
  const quietRunId = randomUUID();
  const findingRunId = randomUUID();

  try {
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceId, ownerUserId]
    );

    const quietResult = await runFleetGraphDemoScenario({
      scenarioName: 'quiet_prefilter',
      client,
      workspaceId,
      scopedDocId,
      ownerUserId,
      runId: quietRunId,
      requestedAt: '2026-05-28T20:00:00.000Z',
      completedAt: '2026-05-28T20:00:45.000Z',
      traceRunner: passthroughAtRiskWeekTraceRunner,
      broadcastToUser: async () => undefined,
    });
    const findingResult = await runFleetGraphDemoScenario({
      scenarioName: 'finding_pending_action',
      client,
      workspaceId,
      scopedDocId,
      ownerUserId,
      runId: findingRunId,
      requestedAt: '2026-05-28T20:01:00.000Z',
      completedAt: '2026-05-28T20:01:45.000Z',
      traceRunner: passthroughAtRiskWeekTraceRunner,
      broadcastToUser: async () => undefined,
    });

    return [
      createQuietProactiveObservation(quietResult),
      createFindingProactiveObservation(findingResult),
    ];
  } finally {
    client.release();
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id = $1', [ownerUserId]);
  }
}

async function runOnDemandChatGraphObservation(): Promise<FleetGraphEvalObservation> {
  const abortController = new AbortController();
  const observedTokens: string[] = [];
  const messages: FleetGraphChatModelMessage[] = [
    { role: 'system', content: 'You are FleetGraph.' },
    { role: 'user', content: 'What is blocking this week?' },
  ];
  const graphState = await runFleetGraphGraph({
    mode: 'ondemand_chat',
    chat: {
      model: createEvalChatModel(),
      messages,
      abortSignal: abortController.signal,
      traceContext: createFleetGraphChatTraceContext({
        userId: evalUserId,
        workspaceId: evalWorkspaceId,
        scope: {
          workspaceId: evalWorkspaceId,
          documentId: evalWeekDocumentId,
          documentType: 'sprint',
          title: 'FleetGraph Eval Week',
        },
        request: {
          documentId: evalWeekDocumentId,
          documentType: 'sprint',
          question: 'What is blocking this week?',
          conversationHistory: [],
        },
      }),
      onToken: async (token) => {
        observedTokens.push(token);
      },
    },
  }, {});

  return {
    id: 'FG-EVAL-003',
    name: 'On-demand chat uses the compiled FleetGraph graph branch',
    category: 'chat',
    assertions: [
      assertion('branch_path', 'Graph branch', 'ondemand_chat', graphState.branch ?? 'null'),
      assertion('chat_response', 'Streamed response', 'Procurement blocker is still blocked.', observedTokens.join('')),
      assertion('trace_metadata', 'Usage metadata', '12/5/17', [
        graphState.chat?.completion.usage.inputTokens,
        graphState.chat?.completion.usage.outputTokens,
        graphState.chat?.completion.usage.totalTokens,
      ].join('/')),
    ],
  };
}

async function runChatSourceGroundingObservation(): Promise<FleetGraphEvalObservation> {
  const prompt = await buildFleetGraphChatPrompt({
    client: createUnusedQueryClient(),
    workspaceId: evalWorkspaceId,
    request: {
      documentId: evalWeekDocumentId,
      documentType: 'sprint',
      question: 'What is blocking this week?',
      conversationHistory: [],
    },
    contextBuilders: createEvalContextBuilders(),
  });
  const sources = buildFleetGraphChatSources(prompt.loadedContext);
  const sourceLabels = sources.map((source) => source.label).join('|');
  const sourceKinds = sources.map((source) => source.kind).join('|');
  const promptHasBoundary = prompt.messages.some((message) => (
    message.content.includes(FLEETGRAPH_CHAT_CONTEXT_BOUNDARY.open)
      && message.content.includes(FLEETGRAPH_CHAT_CONTEXT_BOUNDARY.close)
  ));

  return {
    id: 'FG-EVAL-004',
    name: 'Week chat prompt stays grounded in scoped Ship sources',
    category: 'chat',
    assertions: [
      assertion(
        'chat_sources',
        'Source labels',
        'FleetGraph Eval Week|Procurement blocker|Tuesday standup',
        sourceLabels
      ),
      assertion('chat_sources', 'Source kinds', 'scope|related|related', sourceKinds),
      assertion('scope_guard', 'Untrusted context boundary', 'present', promptHasBoundary ? 'present' : 'missing'),
    ],
  };
}

function runNotifyPolicyObservation(): FleetGraphEvalObservation {
  const decision = classifyFleetGraphPolicy({
    targetDocumentId: evalWeekDocumentId,
    ownerUserId: evalUserId,
    roleReason: 'week owner',
    severity: 'medium',
    evidence: [{
      sourceType: 'issue',
      sourceDocumentId: evalIssueDocumentId,
      quote: 'Procurement blocker is visible.',
    }],
    recommendedAction: {
      kind: 'notify',
      title: 'Notify owner',
      body: 'Procurement blocker needs attention.',
    },
  });

  return {
    id: 'FG-EVAL-005',
    name: 'Notify-only recommendations do not create pending actions',
    category: 'policy',
    assertions: [
      assertion('approval_policy', 'Lifecycle state', 'open', decision.lifecycleState),
      assertion('approval_policy', 'Approval level', 'notify_only', decision.approvalLevel),
      assertion('action_candidate', 'Action candidate', 'none', decision.actionCandidate === null ? 'none' : 'present'),
    ],
  };
}

function runVisibleWritePolicyObservation(): FleetGraphEvalObservation {
  const decision = classifyFleetGraphPolicy({
    targetDocumentId: evalWeekDocumentId,
    ownerUserId: evalUserId,
    roleReason: 'week owner',
    severity: 'high',
    evidence: [{
      sourceType: 'standup',
      sourceDocumentId: evalStandupDocumentId,
      quote: 'No owner has taken the blocker.',
    }],
    recommendedAction: {
      kind: 'draft_comment',
      title: 'Ask for owner update',
      body: 'Please post the blocker owner and next step before standup.',
    },
  });

  return {
    id: 'FG-EVAL-006',
    name: 'Visible writes require explicit HITL approval',
    category: 'policy',
    assertions: [
      assertion('approval_policy', 'Lifecycle state', 'pending_review', decision.lifecycleState),
      assertion('approval_policy', 'Approval level', 'approval_required', decision.approvalLevel),
      assertion('action_candidate', 'Action candidate', 'present', decision.actionCandidate === null ? 'none' : 'present'),
    ],
  };
}

async function runProactiveGraphParityObservation(): Promise<FleetGraphEvalObservation> {
  const graphInput: AtRiskWeekGraphInput = {
    workspaceId: evalWorkspaceId,
    scopedDocId: evalWeekDocumentId,
    runId: randomUUID(),
    triggerSource: 'mutation',
    requestedAt: '2026-05-28T20:02:00.000Z',
  };
  const atRiskWeekState = createEvalAtRiskWeekState(graphInput);
  const dependencies = {} as AtRiskWeekGraphDependencies;
  const graphState = await runFleetGraphGraph({
    mode: 'proactive_at_risk_week',
    atRiskWeek: {
      input: graphInput,
    },
  }, {
    proactiveAtRiskWeek: {
      runGraph: async () => atRiskWeekState,
      dependencies,
    },
  });

  return {
    id: 'FG-EVAL-007',
    name: 'Proactive detector enters the compiled FleetGraph graph branch',
    category: 'proactive',
    assertions: [
      assertion('branch_path', 'Graph branch', 'proactive_at_risk_week', graphState.branch ?? 'null'),
      assertion('trace_metadata', 'Completed nodes', 'branch|proactive_at_risk_week', graphState.completedNodes.join('|')),
      assertion('finding_presence', 'Nested detector state', 'completed', graphState.proactiveAtRiskWeek?.status ?? 'missing'),
    ],
  };
}

function runUnsupportedChatScopeObservation(): FleetGraphEvalObservation {
  const parsed = FleetGraphChatRequestSchema.safeParse({
    documentId: evalStandupDocumentId,
    documentType: 'standup',
    question: 'What is blocked?',
    conversationHistory: [],
  });

  return {
    id: 'FG-EVAL-008',
    name: 'Unsupported chat scopes fail closed before model execution',
    category: 'scope',
    assertions: [
      assertion('scope_guard', 'Unsupported document type', 'rejected', parsed.success ? 'accepted' : 'rejected'),
    ],
  };
}

function runMaterialChangeGuardObservation(): FleetGraphEvalObservation {
  const canonicalKey = generateMaterialChangeKey(createEvalWeekContextWithStandupText({
    workspaceId: evalWorkspaceId,
    weekId: evalWeekDocumentId,
    ownerUserId: evalUserId,
    standupText: 'Blocked by Vendor Response.',
  }));
  const noisyKey = generateMaterialChangeKey(createEvalWeekContextWithStandupText({
    workspaceId: evalWorkspaceId,
    weekId: evalWeekDocumentId,
    ownerUserId: evalUserId,
    standupText: ' blocked   by vendor response. ',
  }));
  const changedKey = generateMaterialChangeKey(createEvalWeekContextWithStandupText({
    workspaceId: evalWorkspaceId,
    weekId: evalWeekDocumentId,
    ownerUserId: evalUserId,
    standupText: 'Blocked by security review.',
  }));

  return {
    id: 'FG-EVAL-009',
    name: 'Material-change guard ignores cosmetic churn and catches blocker changes',
    category: 'proactive',
    assertions: [
      assertion('material_change', 'Cosmetic text churn', 'same', noisyKey === canonicalKey ? 'same' : 'changed'),
      assertion('material_change', 'Blocker content change', 'changed', changedKey === canonicalKey ? 'same' : 'changed'),
    ],
  };
}

async function runSuppressionDedupObservation(): Promise<FleetGraphEvalObservation> {
  const runNonce = randomUUID();
  const workspaceId = await createEvalWorkspace(runNonce);
  const ownerUserId = await createEvalUser(runNonce);
  const scopedDocId = await createEvalWeek(workspaceId, ownerUserId);

  try {
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceId, ownerUserId]
    );

    const context = createEvalWeekContextWithStandupText({
      workspaceId,
      weekId: scopedDocId,
      ownerUserId,
      standupText: 'Blocked by procurement escalation.',
    });
    const materialChangeKey = generateMaterialChangeKey(context);
    const findingId = await insertEvalFinding({
      workspaceId,
      scopedDocId,
      ownerUserId,
      lifecycleState: 'open',
      materialChangeKey,
    });
    const decision = await shouldRunDetector(pool, workspaceId, scopedDocId, context);

    return {
      id: 'FG-EVAL-010',
      name: 'Open finding suppresses duplicate proactive detector work',
      category: 'proactive',
      assertions: [
        assertion(
          'material_change',
          'Material key match',
          'same',
          decision.materialChangeKey === materialChangeKey ? 'same' : 'changed'
        ),
        assertion('finding_presence', 'Existing finding', 'present', findingId.length > 0 ? 'present' : 'none'),
        assertion('action_candidate', 'Detector decision', 'skip', decision.shouldRun ? 'run' : 'skip'),
        assertion(
          'scope_guard',
          'Suppression reason',
          'suppressed_open_finding',
          decision.reason.startsWith('suppressed_open_finding:') ? 'suppressed_open_finding' : decision.reason
        ),
      ],
    };
  } finally {
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id = $1', [ownerUserId]);
  }
}

async function runAdvisoryLockObservation(): Promise<FleetGraphEvalObservation> {
  const firstClient = await pool.connect();
  const secondClient = await pool.connect();

  try {
    const firstAcquire = await acquireAdvisoryLock(firstClient, evalWorkspaceId, evalWeekDocumentId);
    const secondAcquireWhileHeld = await acquireAdvisoryLock(secondClient, evalWorkspaceId, evalWeekDocumentId);
    const firstRelease = await releaseAdvisoryLock(firstClient, evalWorkspaceId, evalWeekDocumentId);
    const secondAcquireAfterRelease = await acquireAdvisoryLock(secondClient, evalWorkspaceId, evalWeekDocumentId);
    const secondRelease = await releaseAdvisoryLock(secondClient, evalWorkspaceId, evalWeekDocumentId);

    return {
      id: 'FG-EVAL-011',
      name: 'Advisory locks serialize concurrent proactive runs for one scope',
      category: 'proactive',
      assertions: [
        assertion('concurrency_guard', 'Acquire sequence', 'true,false,true', [
          firstAcquire.acquired,
          secondAcquireWhileHeld.acquired,
          secondAcquireAfterRelease.acquired,
        ].join(',')),
        assertion('concurrency_guard', 'Release sequence', 'true,true', [firstRelease, secondRelease].join(',')),
        assertion(
          'concurrency_guard',
          'Shared lock key',
          firstAcquire.lockKey,
          secondAcquireWhileHeld.lockKey
        ),
      ],
    };
  } finally {
    await firstClient.query('SELECT pg_advisory_unlock_all()');
    await secondClient.query('SELECT pg_advisory_unlock_all()');
    firstClient.release();
    secondClient.release();
  }
}

async function runPublicTraceExportGateObservation(): Promise<FleetGraphEvalObservation> {
  const disabledPublication = await publishFleetGraphTraceIfEnabled({
    observation: createEvalTraceObservation('trace-disabled', () => undefined),
    policy: createDisabledFleetGraphPublicTracePolicy(),
    traceName: 'fleetgraph.eval.disabled',
    tags: ['fleetgraph'],
    logger: noopTraceLogger,
  });
  const nonFleetGraphState = createTracePublishState();
  const nonFleetGraphPublication = await publishFleetGraphTraceIfEnabled({
    observation: nonFleetGraphState.observation,
    policy: createEvalPublicTracePolicy(nonFleetGraphState),
    traceName: 'other.trace',
    tags: ['not-fleetgraph'],
    logger: noopTraceLogger,
  });
  const fleetGraphState = createTracePublishState();
  const fleetGraphPublication = await publishFleetGraphTraceIfEnabled({
    observation: fleetGraphState.observation,
    policy: createEvalPublicTracePolicy(fleetGraphState),
    traceName: 'fleetgraph.eval.public',
    tags: ['fleetgraph', 'eval'],
    logger: noopTraceLogger,
  });

  return {
    id: 'FG-EVAL-012',
    name: 'Public trace export is opt-in and FleetGraph-tag gated',
    category: 'observability',
    assertions: [
      assertion('trace_export', 'Disabled export', 'not_published', disabledPublication.published ? 'published' : 'not_published'),
      assertion('trace_export', 'Non-FleetGraph tag', 'not_published', nonFleetGraphPublication.published ? 'published' : 'not_published'),
      assertion('trace_export', 'FleetGraph tag', 'published', fleetGraphPublication.published ? 'published' : 'not_published'),
      assertion('trace_export', 'Set public call count', '1', String(fleetGraphState.setPublicCount)),
      assertion('trace_export', 'Publisher call count', '1', String(fleetGraphState.publishCount)),
    ],
  };
}

function runLangfuseRedactionObservation(): FleetGraphEvalObservation {
  const masked = String(maskSensitiveLangfuseValue(
    'dev@ship.local pk-lf-abcdefghi sk-lf-abcdefghi sk-1234567890 lsv2_abcdefghi'
  ));
  const sanitized = sanitizeLangfuseMetadata({
    'bad-key!': 'x'.repeat(250),
    safe_key: 'ok',
  });

  return {
    id: 'FG-EVAL-013',
    name: 'Langfuse metadata redacts secrets and normalizes exported fields',
    category: 'observability',
    assertions: [
      assertion('redaction', 'Email redaction', 'redacted', masked.includes('dev@ship.local') ? 'visible' : 'redacted'),
      assertion('redaction', 'Secret redaction', 'redacted', masked.includes('sk-1234567890') ? 'visible' : 'redacted'),
      assertion('redaction', 'Metadata key normalization', 'bad_key_', Object.keys(sanitized).find((key) => key === 'bad_key_') ?? 'missing'),
      assertion('redaction', 'Metadata value truncation', '200', String(sanitized.bad_key_?.length ?? 0)),
    ],
  };
}

function runChatHistoryWindowObservation(): FleetGraphEvalObservation {
  const history = Array.from({ length: FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT + 2 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message-${index + 1}`,
  })) satisfies FleetGraphChatMessage[];
  const selected = selectFleetGraphChatContextHistory(history);

  return {
    id: 'FG-EVAL-014',
    name: 'On-demand chat sends only the bounded recent history window',
    category: 'chat',
    assertions: [
      assertion('history_window', 'Selected history count', String(FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT), String(selected.length)),
      assertion('history_window', 'Oldest selected message', 'message-3', selected[0]?.content ?? 'missing'),
      assertion('history_window', 'Newest selected message', 'message-12', selected[selected.length - 1]?.content ?? 'missing'),
    ],
  };
}

function runChatRateLimitObservation(): FleetGraphEvalObservation {
  let state: FleetGraphChatRateLimitState = new Map<string, readonly number[]>();
  const userId = evalUserId;
  const nowMs = Date.parse('2026-05-28T20:00:00.000Z');
  const decisions: string[] = [];

  for (let index = 0; index < FLEETGRAPH_CHAT_RATE_LIMIT_MAX_REQUESTS + 1; index += 1) {
    const result = evaluateFleetGraphChatRateLimit({
      state,
      userId,
      nowMs,
    });
    state = result.state;
    decisions.push(result.decision.allowed ? 'allowed' : 'blocked');
  }

  const blockedCount = decisions.filter((decision) => decision === 'blocked').length;
  const lastDecision = evaluateFleetGraphChatRateLimit({
    state,
    userId,
    nowMs,
  }).decision;

  return {
    id: 'FG-EVAL-015',
    name: 'Chat rate limit blocks requests after the configured hourly budget',
    category: 'chat',
    assertions: [
      assertion('rate_limit', 'Allowed request count', String(FLEETGRAPH_CHAT_RATE_LIMIT_MAX_REQUESTS), String(decisions.length - blockedCount)),
      assertion('rate_limit', 'Blocked request count', '1', String(blockedCount)),
      assertion('rate_limit', 'Retry-after seconds', '3600', 'retryAfterSeconds' in lastDecision ? String(lastDecision.retryAfterSeconds) : 'allowed'),
    ],
  };
}

function runTraceUrlConstructionObservation(): FleetGraphEvalObservation {
  const traceUrl = createFleetGraphLangfuseTraceUrl({
    baseUrl: 'https://us.cloud.langfuse.com/',
    projectId: 'project 123',
    traceId: 'trace/abc',
  });
  const missingTraceUrl = createFleetGraphLangfuseTraceUrl({
    baseUrl: 'https://us.cloud.langfuse.com/',
    projectId: null,
    traceId: 'trace/abc',
  });

  return {
    id: 'FG-EVAL-016',
    name: 'Trace URL construction produces safe share targets only with complete IDs',
    category: 'observability',
    assertions: [
      assertion(
        'trace_metadata',
        'Encoded trace URL',
        'https://us.cloud.langfuse.com/project/project%20123/traces/trace%2Fabc',
        traceUrl ?? 'null'
      ),
      assertion('trace_metadata', 'Missing project id', 'null', missingTraceUrl ?? 'null'),
    ],
  };
}

function createQuietProactiveObservation(result: FleetGraphDemoScenarioResult): FleetGraphEvalObservation {
  return {
    id: 'FG-EVAL-001',
    name: 'Healthy Week exits quietly before model reasoning',
    category: 'proactive',
    assertions: [
      assertion('branch_path', 'Branch path', 'prefilter-exit', result.branchPath ?? 'null'),
      assertion('finding_presence', 'Finding presence', 'none', result.findingId === null ? 'none' : 'present'),
      assertion('action_candidate', 'Action candidate', 'none', result.actionCandidateId === null ? 'none' : 'present'),
      assertion('trace_metadata', 'Token spend', '0/0/$0.000000', formatUsage(result)),
    ],
  };
}

function createFindingProactiveObservation(result: FleetGraphDemoScenarioResult): FleetGraphEvalObservation {
  return {
    id: 'FG-EVAL-002',
    name: 'Blocked Week produces finding and pending action',
    category: 'proactive',
    assertions: [
      assertion('branch_path', 'Branch path', 'output', result.branchPath ?? 'null'),
      assertion('finding_presence', 'Finding presence', 'present', result.findingId === null ? 'none' : 'present'),
      assertion('action_candidate', 'Action candidate', 'present', result.actionCandidateId === null ? 'none' : 'present'),
      assertion('trace_metadata', 'Token spend', '850/172/$0.000231', formatUsage(result)),
    ],
  };
}

function assertion(
  metric: FleetGraphEvalMetric,
  name: string,
  expected: string,
  observed: string
): FleetGraphEvalAssertionObservation {
  return {
    metric,
    name,
    expected,
    observed,
  };
}

function formatUsage(result: FleetGraphDemoScenarioResult): string {
  return [
    result.inputTokens,
    result.outputTokens,
    `$${result.estimatedCost.toFixed(6)}`,
  ].join('/');
}

async function createEvalWorkspace(runNonce: string): Promise<string> {
  const result = await pool.query<IdRow>(
    `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
    [`FleetGraph Eval ${runNonce}`]
  );

  return requireId(result.rows[0], 'FleetGraph eval workspace');
}

async function createEvalUser(runNonce: string): Promise<string> {
  const result = await pool.query<IdRow>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, 'test-hash', 'FleetGraph Eval Owner') RETURNING id`,
    [`fleetgraph-eval-${runNonce}@test.local`]
  );

  return requireId(result.rows[0], 'FleetGraph eval user');
}

async function createEvalWeek(workspaceId: string, ownerUserId: string): Promise<string> {
  const result = await pool.query<IdRow>(
    `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
     VALUES ($1, 'sprint', 'FleetGraph Eval Week', 'workspace', $2::uuid,
             jsonb_build_object('owner_id', $2::text))
     RETURNING id`,
    [workspaceId, ownerUserId]
  );

  return requireId(result.rows[0], 'FleetGraph eval Week');
}

async function insertEvalFinding(input: {
  workspaceId: string;
  scopedDocId: string;
  ownerUserId: string;
  lifecycleState: string;
  materialChangeKey: string;
}): Promise<string> {
  const result = await pool.query<IdRow>(
    `INSERT INTO fleetgraph_findings (
       workspace_id, scoped_document_id, detector_type, severity, evidence,
       recipient_user_id, lifecycle_state, material_change_key
     )
     VALUES (
       $1, $2, 'at_risk_week', 'high',
       '[{"sourceType":"issue","quote":"Still blocked."}]'::jsonb,
       $3, $4, $5
     )
     RETURNING id`,
    [
      input.workspaceId,
      input.scopedDocId,
      input.ownerUserId,
      input.lifecycleState,
      input.materialChangeKey,
    ]
  );

  return requireId(result.rows[0], 'FleetGraph eval finding');
}

function requireId(row: IdRow | undefined, label: string): string {
  if (!row) {
    throw new Error(`FleetGraph eval could not create ${label}`);
  }

  return row.id;
}

function createEvalChatModel(): FleetGraphChatModel {
  return {
    modelName: 'fleetgraph-eval-chat-model',
    stream: async function* () {
      yield { token: 'Procurement ', usage: null };
      yield { token: 'blocker ', usage: null };
      yield { token: 'is still blocked.', usage: null };
      yield {
        token: '',
        usage: {
          modelName: 'fleetgraph-eval-chat-model',
          inputTokens: 12,
          outputTokens: 5,
          totalTokens: 17,
        },
      };
    },
  };
}

function createEvalContextBuilders(): FleetGraphChatContextBuilders {
  return {
    buildWeekContext: async () => createEvalWeekContext(),
    buildProjectContext: async () => createEvalProjectContext(),
    buildIssueContext: async () => createEvalIssueContext(),
    resolvePersonNames: async () => ({}),
  };
}

function createEvalWeekContext(): WeekContext {
  return createEvalWeekContextWithStandupText({
    workspaceId: evalWorkspaceId,
    weekId: evalWeekDocumentId,
    ownerUserId: evalUserId,
    standupText: 'Procurement is still blocked.',
  });
}

function createEvalWeekContextWithStandupText(input: {
  workspaceId: string;
  weekId: string;
  ownerUserId: string;
  standupText: string;
}): WeekContext {
  const createdAt = new Date('2026-05-28T20:00:00.000Z');

  return {
    week: {
      id: input.weekId,
      workspaceId: input.workspaceId,
      documentType: 'sprint',
      title: 'FleetGraph Eval Week',
      content: tipTapText('FleetGraph eval Week plan is current.'),
      parentId: null,
      properties: { owner_id: input.ownerUserId },
      ticketNumber: null,
      createdAt,
      updatedAt: createdAt,
    },
    ownerUserId: input.ownerUserId,
    projectId: null,
    programId: null,
    issues: [{
      id: evalIssueDocumentId,
      workspaceId: input.workspaceId,
      documentType: 'issue',
      title: 'Procurement blocker',
      content: tipTapText('Blocked by vendor approval.'),
      parentId: null,
      properties: { state: 'blocked', priority: 'high' },
      ticketNumber: 42,
      createdAt,
      updatedAt: createdAt,
      state: 'blocked',
      priority: 'high',
      assigneeUserId: input.ownerUserId,
    }],
    standups: [{
      id: evalStandupDocumentId,
      workspaceId: input.workspaceId,
      documentType: 'standup',
      title: 'Tuesday standup',
      content: tipTapText(input.standupText),
      parentId: input.weekId,
      properties: {},
      ticketNumber: null,
      createdAt,
      updatedAt: createdAt,
      authorUserId: input.ownerUserId,
    }],
    sprintIterations: [],
    accountability: {
      weeklyPlan: { exists: true, documentIds: [] },
      weeklyRetro: { exists: false, documentIds: [] },
    },
  };
}

function createEvalProjectContext(): ProjectContext {
  const createdAt = new Date('2026-05-28T20:00:00.000Z');

  return {
    project: {
      id: '66666666-6666-4666-8666-666666666666',
      workspaceId: evalWorkspaceId,
      documentType: 'project',
      title: 'FleetGraph Eval Project',
      content: tipTapText('Project context.'),
      parentId: null,
      properties: {},
      ticketNumber: null,
      createdAt,
      updatedAt: createdAt,
    },
    ownerUserId: evalUserId,
    programId: null,
    activeIssues: [],
    weeks: [],
  };
}

function createEvalIssueContext(): IssueContextResult {
  const createdAt = new Date('2026-05-28T20:00:00.000Z');

  return {
    issue: {
      id: evalIssueDocumentId,
      workspaceId: evalWorkspaceId,
      documentType: 'issue',
      title: 'Procurement blocker',
      content: tipTapText('Blocked by vendor approval.'),
      parentId: null,
      properties: { state: 'blocked', priority: 'high' },
      ticketNumber: 42,
      createdAt,
      updatedAt: createdAt,
      state: 'blocked',
      priority: 'high',
      assigneeUserId: evalUserId,
    },
    assigneeUserId: evalUserId,
    parentIssueId: null,
    weekId: evalWeekDocumentId,
    projectId: null,
    programId: null,
    blockerStandups: [],
  };
}

function createUnusedQueryClient(): FleetGraphQueryClient {
  return {
    query: async () => {
      throw new Error('Unexpected query in FleetGraph deterministic eval');
    },
  };
}

const noopTraceLogger: FleetGraphTracePublicationLogger = {
  info: () => undefined,
};

function createTracePublishState(): EvalTracePublishState {
  const state = {
    observation: createEvalTraceObservation('trace-v2-public', () => undefined),
    setPublicCount: 0,
    publishCount: 0,
  };

  state.observation = createEvalTraceObservation('trace-v2-public', () => {
    state.setPublicCount += 1;
  });

  return state;
}

function createEvalPublicTracePolicy(state: EvalTracePublishState): FleetGraphPublicTracePolicy {
  return {
    enabled: true,
    langfuseBaseUrl: 'https://us.cloud.langfuse.com',
    langfuseProjectId: 'project-v2',
    langfusePublicKey: 'pk-lf-evalpublic',
    langfuseSecretKey: 'sk-lf-evalsecret',
    publishTrace: async () => {
      state.publishCount += 1;
    },
  };
}

function createEvalTraceObservation(
  traceId: string,
  onSetTraceAsPublic: () => void
): Parameters<typeof publishFleetGraphTraceIfEnabled>[0]['observation'] {
  return {
    traceId,
    setTraceAsPublic: onSetTraceAsPublic,
  } as Parameters<typeof publishFleetGraphTraceIfEnabled>[0]['observation'];
}

function createEvalAtRiskWeekState(input: AtRiskWeekGraphInput): AtRiskWeekGraphState {
  return {
    input,
    status: 'completed',
    activeNode: null,
    completedNodes: ['scope', 'context', 'guard', 'preFilter'],
    scope: {
      workspaceId: input.workspaceId,
      scopedDocId: input.scopedDocId,
      runId: input.runId,
      detectorType: 'at_risk_week',
      materialChangeKey: 'fleetgraph-eval-material-change',
      checkpointThreadId: `fleetgraph:at_risk_week:${input.workspaceId}:${input.scopedDocId}:${input.runId}`,
      checkpointNamespace: `fleetgraph:at_risk_week:${input.workspaceId}:${input.scopedDocId}`,
    },
    context: null,
    guard: null,
    preFilter: null,
    reasoning: null,
    policy: null,
    persistence: null,
    earlyExit: {
      node: 'preFilter',
      reason: 'pre_filter_safe',
      message: 'No current risk signals.',
      materialChangeKey: 'fleetgraph-eval-material-change',
    },
    errors: [],
    trace: {
      detector: 'at_risk_week',
      triggerSource: input.triggerSource,
      workspaceId: input.workspaceId,
      scopedDocId: input.scopedDocId,
      runId: input.runId,
      materialChangeKey: 'fleetgraph-eval-material-change',
      langfuseTraceId: null,
      langfuseTraceUrl: null,
      langfuseTracePublic: false,
      branchDecisions: [],
      modelUsage: null,
      timings: [],
    },
    requestedAt: input.requestedAt,
    completedAt: '2026-05-28T20:02:45.000Z',
  };
}

function tipTapText(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text }],
    }],
  };
}
