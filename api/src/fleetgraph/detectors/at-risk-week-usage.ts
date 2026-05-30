import type { FleetGraphTrigger } from '../types.js';
import {
  atRiskWeekDetectorType,
  atRiskWeekReasoningModelName,
} from './at-risk-week-constants.js';
import { createAtRiskWeekTraceMetadata } from './at-risk-week-tracing.js';
import type {
  AtRiskWeekGraphState,
  AtRiskWeekTriggerSource,
} from './at-risk-week.js';
import type { AtRiskWeekUsageRecord } from './at-risk-week-usage-repository.js';

export class AtRiskWeekUsageRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtRiskWeekUsageRecordError';
  }
}

export function createAtRiskWeekUsageRecord(state: AtRiskWeekGraphState): AtRiskWeekUsageRecord {
  const modelUsage = state.trace.modelUsage ?? {
    modelName: atRiskWeekReasoningModelName,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
  };

  return {
    runId: state.scope.runId,
    workspaceId: state.scope.workspaceId,
    trigger: toFleetGraphUsageTrigger(state.trace.triggerSource),
    detector: atRiskWeekDetectorType,
    modelName: modelUsage.modelName,
    inputTokens: modelUsage.inputTokens,
    outputTokens: modelUsage.outputTokens,
    estimatedCost: modelUsage.estimatedCost,
    traceMetadata: createAtRiskWeekTraceMetadata(state, 'run'),
  };
}

function toFleetGraphUsageTrigger(triggerSource: AtRiskWeekTriggerSource): FleetGraphTrigger {
  if (triggerSource === 'poll' || triggerSource === 'mutation') {
    return 'proactive';
  }

  if (triggerSource === 'ondemand') {
    return 'ondemand';
  }

  if (triggerSource === 'resume') {
    return 'resume';
  }

  throw new AtRiskWeekUsageRecordError(`Unsupported at-risk Week trigger source: triggerSource=${triggerSource}`);
}
