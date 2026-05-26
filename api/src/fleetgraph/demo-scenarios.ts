import type { FleetGraphQueryClient, WeekContext } from './context.js';
import {
  createAtRiskWeekCheckpointer,
  createAtRiskWeekTraceMetadata,
  runAtRiskWeekGraph,
  type AtRiskWeekBranchPath,
  type AtRiskWeekGraphInput,
  type AtRiskWeekOutputNodeDependencies,
  type AtRiskWeekReasoningOutput,
  type AtRiskWeekRunStatus,
  type AtRiskWeekTraceRunner,
} from './detectors/at-risk-week.js';

export const fleetGraphDemoScenarioNames = ['quiet_prefilter', 'finding_pending_action'] as const;
export type FleetGraphDemoScenarioName = typeof fleetGraphDemoScenarioNames[number];

export type FleetGraphDemoScenarioResult = {
  scenarioName: FleetGraphDemoScenarioName;
  runId: string;
  status: AtRiskWeekRunStatus;
  branchPath: AtRiskWeekBranchPath | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  findingId: string | null;
  actionCandidateId: string | null;
};

export type FleetGraphDemoScenarioInput = {
  scenarioName: FleetGraphDemoScenarioName;
  client: FleetGraphQueryClient;
  workspaceId: string;
  scopedDocId: string;
  ownerUserId: string;
  runId: string;
  requestedAt: string;
  completedAt: string;
  traceRunner: AtRiskWeekTraceRunner;
  broadcastToUser: AtRiskWeekOutputNodeDependencies['broadcastToUser'];
};

type FleetGraphDemoScenarioDefinition = {
  name: FleetGraphDemoScenarioName;
  materialChangeKey: string;
  weekContext: WeekContext;
  reasoning: AtRiskWeekReasoningOutput;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};

type FleetGraphDemoScenarioDefinitionInput = Pick<
  FleetGraphDemoScenarioInput,
  'scenarioName' | 'workspaceId' | 'scopedDocId' | 'ownerUserId' | 'runId'
>;

export async function runFleetGraphDemoScenario(
  input: FleetGraphDemoScenarioInput
): Promise<FleetGraphDemoScenarioResult> {
  const definition = createFleetGraphDemoScenarioDefinition(input);
  const graphInput: AtRiskWeekGraphInput = {
    workspaceId: input.workspaceId,
    scopedDocId: input.scopedDocId,
    runId: input.runId,
    triggerSource: 'poll',
    requestedAt: input.requestedAt,
  };

  const graphState = await runAtRiskWeekGraph(graphInput, {
    nodeDependencies: {
      client: input.client,
      buildWeekContext: async () => definition.weekContext,
      shouldRunDetector: async () => ({
        shouldRun: true,
        reason: `run_material_changed_no_suppression:${definition.materialChangeKey}`,
        materialChangeKey: definition.materialChangeKey,
      }),
      now: () => input.completedAt,
    },
    reasonNodeDependencies: {
      reasoner: {
        modelName: 'gpt-4o-mini',
        invoke: async () => createFleetGraphDemoReasonerResult(definition),
      },
      retryPolicy: {
        maxAttempts: 1,
        delayMs: 0,
        sleep: async () => undefined,
      },
      logger: {
        warn: () => undefined,
      },
      now: () => input.completedAt,
    },
    outputNodeDependencies: {
      client: input.client,
      broadcastToUser: input.broadcastToUser,
      now: () => input.completedAt,
    },
    traceRunner: input.traceRunner,
    checkpointer: createAtRiskWeekCheckpointer(),
  });
  const metadata = createAtRiskWeekTraceMetadata(graphState, 'run');

  return {
    scenarioName: input.scenarioName,
    runId: input.runId,
    status: graphState.status,
    branchPath: metadata.branchPath,
    inputTokens: metadata.inputTokens ?? 0,
    outputTokens: metadata.outputTokens ?? 0,
    estimatedCost: metadata.estimatedCost ?? 0,
    findingId: graphState.persistence?.findingId ?? null,
    actionCandidateId: graphState.persistence?.actionCandidateId ?? null,
  };
}

function createFleetGraphDemoScenarioDefinition(
  input: FleetGraphDemoScenarioDefinitionInput
): FleetGraphDemoScenarioDefinition {
  if (input.scenarioName === 'quiet_prefilter') {
    return {
      name: input.scenarioName,
      materialChangeKey: `v1:demo:${input.scenarioName}:${input.runId}`,
      weekContext: createFleetGraphDemoWeekContext(input, []),
      reasoning: createFleetGraphDemoFindingReasoning(input.scopedDocId),
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    };
  }

  if (input.scenarioName === 'finding_pending_action') {
    return {
      name: input.scenarioName,
      materialChangeKey: `v1:demo:${input.scenarioName}:${input.runId}`,
      weekContext: createFleetGraphDemoWeekContext(input, [createFleetGraphDemoBlockedIssue(input)]),
      reasoning: createFleetGraphDemoFindingReasoning(input.scopedDocId),
      inputTokens: 850,
      outputTokens: 172,
      estimatedCost: 0.000231,
    };
  }

  throw new Error(`Unsupported FleetGraph demo scenario: scenarioName=${input.scenarioName}`);
}

function createFleetGraphDemoWeekContext(
  input: FleetGraphDemoScenarioDefinitionInput,
  issues: WeekContext['issues']
): WeekContext {
  return {
    week: {
      id: input.scopedDocId,
      workspaceId: input.workspaceId,
      documentType: 'sprint',
      title: 'FleetGraph Demo Week',
      content: createTextDocument('Demo Week plan is current and owner-reviewed.'),
      parentId: null,
      properties: {
        owner_id: input.ownerUserId,
      },
      ticketNumber: null,
      createdAt: new Date('2026-05-20T05:00:00.000Z'),
      updatedAt: new Date('2026-05-26T05:00:00.000Z'),
    },
    ownerUserId: input.ownerUserId,
    projectId: null,
    programId: null,
    issues,
    standups: input.scenarioName === 'finding_pending_action'
      ? [createFleetGraphDemoBlockerStandup(input)]
      : [],
    sprintIterations: [],
    accountability: {
      weeklyPlan: {
        exists: true,
        documentIds: [],
      },
      weeklyRetro: {
        exists: false,
        documentIds: [],
      },
    },
  };
}

function createFleetGraphDemoBlockedIssue(
  input: FleetGraphDemoScenarioDefinitionInput
): WeekContext['issues'][number] {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    workspaceId: input.workspaceId,
    documentType: 'issue',
    title: 'Launch approval blocked',
    content: createTextDocument('Launch approval is blocked waiting on security review.'),
    parentId: null,
    properties: {
      state: 'blocked',
      priority: 'high',
    },
    ticketNumber: 42,
    createdAt: new Date('2026-05-20T05:00:00.000Z'),
    updatedAt: new Date('2026-05-26T05:00:00.000Z'),
    state: 'blocked',
    priority: 'high',
    assigneeUserId: input.ownerUserId,
  };
}

function createFleetGraphDemoBlockerStandup(
  input: FleetGraphDemoScenarioDefinitionInput
): WeekContext['standups'][number] {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    workspaceId: input.workspaceId,
    documentType: 'standup',
    title: 'Launch blocker standup',
    content: createTextDocument('Blocked on security review; no current owner update has landed.'),
    parentId: null,
    properties: {},
    ticketNumber: null,
    createdAt: new Date('2026-05-26T04:30:00.000Z'),
    updatedAt: new Date('2026-05-26T04:30:00.000Z'),
    authorUserId: input.ownerUserId,
  };
}

function createFleetGraphDemoFindingReasoning(scopedDocId: string): AtRiskWeekReasoningOutput {
  return {
    isAtRisk: true,
    severity: 'high',
    evidence: [{
      sourceType: 'issue',
      sourceDocumentId: scopedDocId,
      quote: 'Launch approval blocked',
      observedAt: '2026-05-26T05:00:00.000Z',
    }],
    recommendedAction: {
      kind: 'draft_comment',
      title: 'Ask for blocker update',
      body: 'Please post the blocker owner and next step before standup.',
    },
    rationale: 'A high-priority launch approval issue is blocked and lacks a fresh owner update.',
  };
}

function createFleetGraphDemoReasonerResult(
  definition: FleetGraphDemoScenarioDefinition
): {
  reasoning: AtRiskWeekReasoningOutput;
  modelUsage: {
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
} {
  if (definition.name === 'quiet_prefilter') {
    throw new Error('Quiet FleetGraph demo scenario should exit before model reasoning');
  }

  return {
    reasoning: definition.reasoning,
    modelUsage: {
      modelName: 'gpt-4o-mini',
      inputTokens: definition.inputTokens,
      outputTokens: definition.outputTokens,
      estimatedCost: definition.estimatedCost,
    },
  };
}

function createTextDocument(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text,
      }],
    }],
  };
}
