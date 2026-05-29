import { describe, expect, it } from 'vitest';
import {
  buildFleetGraphNodeTelemetryCase,
  extractTraceIdFromLangfuseTraceUrl,
  formatFleetGraphNodeTelemetryMarkdown,
  parseLangfuseObservationsResponse,
  type FleetGraphNodeTelemetryReport,
  type LangfuseObservationApiRow,
} from './telemetry.js';

describe('FleetGraph node telemetry export', () => {
  it('extracts trace ids from public Langfuse trace URLs', () => {
    expect(extractTraceIdFromLangfuseTraceUrl(
      'https://us.cloud.langfuse.com/project/project-123/traces/trace-456'
    )).toBe('trace-456');
  });

  it('normalizes FleetGraph observation rows into ordered node telemetry', () => {
    const observations: LangfuseObservationApiRow[] = [
      createObservation({
        id: 'obs-output',
        name: 'fleetgraph.at_risk_week.output',
        traceNode: 'output',
        branchPath: 'output',
        lifecycleState: 'pending_review',
        latency: 0.002,
      }),
      createObservation({
        id: 'obs-run',
        name: 'fleetgraph.at_risk_week.run',
        traceNode: 'run',
        branchPath: 'output',
        inputUsage: 12,
        outputUsage: 3,
        totalUsage: 15,
        totalCost: '0.000021',
        public: true,
      }),
      createObservation({
        id: 'obs-external',
        name: 'unrelated.middleware',
        traceNode: null,
      }),
      createObservation({
        id: 'obs-pre-filter',
        name: 'fleetgraph.at_risk_week.preFilter',
        traceNode: 'preFilter',
        branchPath: 'model-reason',
        preFilterShouldReason: true,
      }),
    ];

    const telemetryCase = buildFleetGraphNodeTelemetryCase({
      traceCase: {
        id: 'DQ-R01',
        name: 'Classic high-priority blocker with standup signal',
        traceUrl: 'https://us.cloud.langfuse.com/project/project-123/traces/trace-456',
      },
      observations,
    });

    expect(telemetryCase.observations.map((observation) => observation.id)).toEqual([
      'obs-run',
      'obs-pre-filter',
      'obs-output',
    ]);
    expect(telemetryCase.observations[0]).toMatchObject({
      public: true,
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
      totalCost: 0.000021,
    });
    expect(telemetryCase.observations[2]).toMatchObject({
      latencyMs: 2,
      lifecycleState: 'pending_review',
    });
  });

  it('parses Langfuse observation API responses and renders markdown evidence', () => {
    const rows = parseLangfuseObservationsResponse({
      data: [
        createObservation({
          id: 'obs-chat',
          name: 'fleetgraph.chat.response',
          traceNode: 'chat',
          branchPath: null,
          totalUsage: 20,
          public: true,
        }),
      ],
      meta: {},
    });
    const telemetryCase = buildFleetGraphNodeTelemetryCase({
      traceCase: {
        id: 'CHAT-01',
        name: 'Week chat',
        traceUrl: 'https://us.cloud.langfuse.com/project/project-123/traces/chat-trace',
      },
      observations: rows,
    });
    const report: FleetGraphNodeTelemetryReport = {
      generatedAt: '2026-05-29T20:30:00.000Z',
      sourceReport: 'docs/evals/fleetgraph-detection-quality-eval.json',
      cases: [telemetryCase],
    };

    expect(formatFleetGraphNodeTelemetryMarkdown(report)).toContain(
      '| fleetgraph.chat.response | CHAIN | `obs-chat` | — | `chat` | — | — | — | — | 20 | — | — | yes |'
    );
  });
});

function createObservation(input: {
  id: string;
  name: string;
  traceNode: string | null;
  branchPath?: string | null;
  guardDecision?: string | null;
  preFilterShouldReason?: boolean | null;
  lifecycleState?: string | null;
  inputUsage?: number;
  outputUsage?: number;
  totalUsage?: number;
  totalCost?: number | string | null;
  latency?: number | null;
  public?: boolean;
}): LangfuseObservationApiRow {
  return {
    id: input.id,
    traceId: 'trace-456',
    parentObservationId: null,
    type: 'CHAIN',
    name: input.name,
    public: input.public ?? false,
    latency: input.latency ?? null,
    inputUsage: input.inputUsage ?? 0,
    outputUsage: input.outputUsage ?? 0,
    totalUsage: input.totalUsage ?? 0,
    totalCost: input.totalCost ?? null,
    metadata: {
      traceNode: input.traceNode,
      branchPath: input.branchPath ?? null,
      guardDecision: input.guardDecision ?? null,
      preFilterShouldReason: input.preFilterShouldReason ?? null,
      lifecycleState: input.lifecycleState ?? null,
    },
  };
}
