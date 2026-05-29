import { randomUUID } from 'node:crypto';
import { pool } from '../db/client.js';
import {
  buildFleetGraphChatPrompt,
  buildFleetGraphChatSources,
  createFleetGraphChatTraceContext,
  FLEETGRAPH_CHAT_CONTEXT_BOUNDARY,
  FleetGraphChatRequestSchema,
  type FleetGraphChatContextBuilders,
  type FleetGraphChatModel,
  type FleetGraphChatModelMessage,
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
import { passthroughAtRiskWeekTraceRunner } from './detectors/at-risk-week.js';
import {
  runFleetGraphDemoScenario,
  type FleetGraphDemoScenarioResult,
} from './demo-scenarios.js';
import { runFleetGraphGraph } from './graph.js';
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
  | 'latency_budget';

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

const fleetGraphEvalSuiteName = 'FleetGraph V1 deterministic evals';
const evalWorkspaceId = '11111111-1111-4111-8111-111111111111';
const evalWeekDocumentId = '22222222-2222-4222-8222-222222222222';
const evalIssueDocumentId = '33333333-3333-4333-8333-333333333333';
const evalStandupDocumentId = '44444444-4444-4444-8444-444444444444';
const evalUserId = '55555555-5555-4555-8555-555555555555';

export async function runFleetGraphDeterministicEvalSuite(
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
    suiteName: fleetGraphEvalSuiteName,
    generatedAt: input.generatedAt,
    observations,
  });
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
  };
}

function createEvalWeekContext(): WeekContext {
  const createdAt = new Date('2026-05-28T20:00:00.000Z');

  return {
    week: {
      id: evalWeekDocumentId,
      workspaceId: evalWorkspaceId,
      documentType: 'sprint',
      title: 'FleetGraph Eval Week',
      content: tipTapText('FleetGraph eval Week plan is current.'),
      parentId: null,
      properties: { owner_id: evalUserId },
      ticketNumber: null,
      createdAt,
      updatedAt: createdAt,
    },
    ownerUserId: evalUserId,
    projectId: null,
    programId: null,
    issues: [{
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
    }],
    standups: [{
      id: evalStandupDocumentId,
      workspaceId: evalWorkspaceId,
      documentType: 'standup',
      title: 'Tuesday standup',
      content: tipTapText('Procurement is still blocked.'),
      parentId: evalWeekDocumentId,
      properties: {},
      ticketNumber: null,
      createdAt,
      updatedAt: createdAt,
      authorUserId: evalUserId,
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
