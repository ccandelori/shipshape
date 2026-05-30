import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { FleetGraphConfig } from '../config.js';
import { createFleetGraphLangfuseRunnableConfig } from '../langfuse.js';
import {
  evidenceItemSchema,
  fleetGraphEvidenceSourceTypeSchema,
  fleetGraphSeveritySchema,
  isoDateTimeSchema,
  recommendedActionSchema,
  uuidSchema,
} from '../types.js';
import {
  atRiskWeekDetectorType,
  atRiskWeekDetectorVersion,
  atRiskWeekReasoningModelName,
  atRiskWeekReasoningModelTemperature,
} from './at-risk-week-constants.js';
import {
  completeAtRiskWeekNode,
  recordAtRiskWeekEarlyExit,
  requireAtRiskWeekContext,
  requireAtRiskWeekGuard,
  requireAtRiskWeekPreFilter,
} from './at-risk-week-evaluator.js';
import { AtRiskWeekNodeContractError } from './at-risk-week-errors.js';
import {
  renderAtRiskWeekReasoningPromptFromContext,
  type AtRiskWeekReasoningPrompt,
} from './at-risk-week-prompt.js';
import type { AtRiskWeekGraphState } from './at-risk-week.js';

const atRiskWeekModelPricingByName = {
  'gpt-4o-mini': {
    inputUsdPerMillionTokens: 0.15,
    outputUsdPerMillionTokens: 0.60,
  },
} as const;

const atRiskWeekEvidenceItemSchema = evidenceItemSchema.extend({
  quote: z.string().min(1).max(600),
});

const atRiskWeekRecommendedActionSchema = recommendedActionSchema.extend({
  kind: z.literal('draft_comment'),
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(1_000),
});

export const atRiskWeekReasoningOutputSchema = z.discriminatedUnion('isAtRisk', [
  z.object({
    isAtRisk: z.literal(true),
    severity: fleetGraphSeveritySchema,
    evidence: z.array(atRiskWeekEvidenceItemSchema).min(1).max(6),
    recommendedAction: atRiskWeekRecommendedActionSchema,
    rationale: z.string().min(1).max(1_200),
  }),
  z.object({
    isAtRisk: z.literal(false),
    severity: z.null(),
    evidence: z.array(atRiskWeekEvidenceItemSchema).length(0),
    recommendedAction: z.null(),
    rationale: z.string().min(1).max(1_200),
  }),
]);
export type AtRiskWeekReasoningOutput = z.infer<typeof atRiskWeekReasoningOutputSchema>;

const atRiskWeekStructuredEvidenceItemSchema = z.object({
  sourceType: fleetGraphEvidenceSourceTypeSchema,
  sourceDocumentId: uuidSchema.nullable(),
  quote: z.string().min(1).max(600),
  observedAt: isoDateTimeSchema.nullable(),
});

const atRiskWeekStructuredRecommendedActionSchema = z.object({
  kind: z.literal('draft_comment'),
  title: z.string().min(1).max(120).nullable(),
  body: z.string().min(1).max(1_000),
});

export const atRiskWeekStructuredReasoningOutputSchema = z.object({
  isAtRisk: z.boolean(),
  severity: fleetGraphSeveritySchema.nullable(),
  evidence: z.array(atRiskWeekStructuredEvidenceItemSchema).max(6),
  recommendedAction: atRiskWeekStructuredRecommendedActionSchema.nullable(),
  rationale: z.string().min(1).max(1_200),
}).superRefine((value, context) => {
  if (value.isAtRisk) {
    if (value.severity === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['severity'],
        message: 'At-risk reasoning must include severity.',
      });
    }

    if (value.evidence.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidence'],
        message: 'At-risk reasoning must include evidence.',
      });
    }

    if (value.recommendedAction === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recommendedAction'],
        message: 'At-risk reasoning must include a recommended action.',
      });
    }

    return;
  }

  if (value.severity !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['severity'],
      message: 'Quiet reasoning must not include severity.',
    });
  }

  if (value.evidence.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidence'],
      message: 'Quiet reasoning must not include evidence.',
    });
  }

  if (value.recommendedAction !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recommendedAction'],
      message: 'Quiet reasoning must not include a recommended action.',
    });
  }
});
type AtRiskWeekStructuredReasoningOutput = z.infer<typeof atRiskWeekStructuredReasoningOutputSchema>;

export type AtRiskWeekModelUsage = {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};

export type AtRiskWeekModelMessage = {
  role: 'system' | 'user';
  content: string;
};

export type AtRiskWeekReasonerResult = {
  reasoning: AtRiskWeekReasoningOutput;
  modelUsage: AtRiskWeekModelUsage | null;
};

export type AtRiskWeekStructuredModelResult = {
  raw: BaseMessage;
  parsed: unknown;
};

export type AtRiskWeekStructuredModelInvoker = {
  invoke: (messages: BaseMessage[], config: Partial<RunnableConfig>) => Promise<AtRiskWeekStructuredModelResult>;
};

export type AtRiskWeekRunnableConfigFactory = () => Partial<RunnableConfig>;

export type AtRiskWeekStructuredReasoner = {
  modelName: string;
  invoke: (messages: AtRiskWeekModelMessage[]) => Promise<AtRiskWeekReasonerResult>;
};

export type AtRiskWeekRetryPolicy = {
  maxAttempts: number;
  delayMs: number;
  sleep: (delayMs: number) => Promise<void>;
};

export type AtRiskWeekReasonNodeLogger = {
  warn: (message: string, fields: Record<string, string | number | boolean | null>) => void;
};

export type AtRiskWeekReasonNodeDependencies = {
  reasoner: AtRiskWeekStructuredReasoner;
  retryPolicy: AtRiskWeekRetryPolicy;
  logger: AtRiskWeekReasonNodeLogger;
  now: () => string;
};

export async function reasonNode(
  state: AtRiskWeekGraphState,
  dependencies: AtRiskWeekReasonNodeDependencies
): Promise<AtRiskWeekGraphState> {
  if (state.status !== 'running') {
    return state;
  }

  requireAtRiskWeekContext(state, 'reason');
  const guard = requireAtRiskWeekGuard(state, 'reason');
  const preFilter = requireAtRiskWeekPreFilter(state, 'reason');

  if (!preFilter.shouldReason) {
    throw new AtRiskWeekNodeContractError('At-risk Week reason node requires a positive pre-filter decision');
  }

  const prompt = renderAtRiskWeekReasoningPrompt(state);
  const messages: AtRiskWeekModelMessage[] = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  const result = await invokeAtRiskWeekReasonerWithRetries(state, messages, dependencies);
  const reasoning = atRiskWeekReasoningOutputSchema.parse(result.reasoning);

  const reasonedState = completeAtRiskWeekNode(state, 'reason', 'policy', {
    reasoning,
    trace: {
      ...state.trace,
      modelUsage: result.modelUsage,
    },
  });

  if (!reasoning.isAtRisk) {
    return recordAtRiskWeekEarlyExit(
      reasonedState,
      {
        node: 'reason',
        reason: 'not_at_risk',
        message: reasoning.rationale,
        materialChangeKey: guard.materialChangeKey,
      },
      dependencies.now()
    );
  }

  return reasonedState;
}

export function createOpenAIAtRiskWeekReasoner(config: FleetGraphConfig): AtRiskWeekStructuredReasoner {
  const model = new ChatOpenAI({
    model: atRiskWeekReasoningModelName,
    temperature: atRiskWeekReasoningModelTemperature,
    maxRetries: 0,
    apiKey: config.openaiApiKey,
  });
  const structuredModel = model.withStructuredOutput(atRiskWeekStructuredReasoningOutputSchema, {
    name: 'at_risk_week_reasoning',
    method: 'jsonSchema',
    strict: true,
    includeRaw: true,
  });

  return createLangChainAtRiskWeekReasoner(
    atRiskWeekReasoningModelName,
    structuredModel,
    () => createFleetGraphLangfuseRunnableConfig({
      runName: 'fleetgraph.at_risk_week.reason.llm',
      tags: [
        'fleetgraph',
        `detector:${atRiskWeekDetectorType}`,
        `detector_version:${atRiskWeekDetectorVersion}`,
        'trace_node:reason',
        'llm',
      ],
      metadata: {
        detectorType: atRiskWeekDetectorType,
        detectorVersion: atRiskWeekDetectorVersion,
        traceNode: 'reason',
      },
      userId: null,
      sessionId: null,
    })
  );
}

export function createLangChainAtRiskWeekReasoner(
  modelName: string,
  structuredModel: AtRiskWeekStructuredModelInvoker,
  createRunnableConfig: AtRiskWeekRunnableConfigFactory
): AtRiskWeekStructuredReasoner {
  return {
    modelName,
    invoke: async (messages) => {
      const result = await structuredModel.invoke(messages.map(toLangChainMessage), createRunnableConfig());
      const reasoning = parseAtRiskWeekStructuredOutput(result.parsed, modelName);

      return {
        reasoning,
        modelUsage: extractAtRiskWeekModelUsage(result.raw, modelName),
      };
    },
  };
}

export function renderAtRiskWeekReasoningPrompt(state: AtRiskWeekGraphState): AtRiskWeekReasoningPrompt {
  const context = requireAtRiskWeekContext(state, 'reason');
  const guard = requireAtRiskWeekGuard(state, 'reason');
  const preFilter = requireAtRiskWeekPreFilter(state, 'reason');

  return renderAtRiskWeekReasoningPromptFromContext({
    detectorType: atRiskWeekDetectorType,
    workspaceId: state.scope.workspaceId,
    scopedDocId: state.scope.scopedDocId,
    runId: state.scope.runId,
    materialChangeKey: guard.materialChangeKey,
    context,
    preFilter,
  });
}

export function estimateAtRiskWeekModelCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (!Number.isInteger(inputTokens) || inputTokens < 0) {
    throw new AtRiskWeekNodeContractError(
      `At-risk Week model input token count must be a nonnegative integer: modelName=${modelName}, inputTokens=${inputTokens}`
    );
  }

  if (!Number.isInteger(outputTokens) || outputTokens < 0) {
    throw new AtRiskWeekNodeContractError(
      `At-risk Week model output token count must be a nonnegative integer: modelName=${modelName}, outputTokens=${outputTokens}`
    );
  }

  const pricing = atRiskWeekModelPricingByName[modelName as keyof typeof atRiskWeekModelPricingByName];

  if (!pricing) {
    return 0;
  }

  const cost = (
    inputTokens * pricing.inputUsdPerMillionTokens
    + outputTokens * pricing.outputUsdPerMillionTokens
  ) / 1_000_000;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

function parseAtRiskWeekStructuredOutput(parsed: unknown, modelName: string): AtRiskWeekReasoningOutput {
  try {
    return atRiskWeekReasoningOutputSchema.parse(
      normalizeAtRiskWeekStructuredOutput(atRiskWeekStructuredReasoningOutputSchema.parse(parsed))
    );
  } catch (error) {
    throw new AtRiskWeekStructuredOutputError({
      modelName,
      message: errorMessage(error),
      parsed,
    });
  }
}

function normalizeAtRiskWeekStructuredOutput(
  structured: AtRiskWeekStructuredReasoningOutput
): AtRiskWeekReasoningOutput {
  if (!structured.isAtRisk) {
    return {
      isAtRisk: false,
      severity: null,
      evidence: [],
      recommendedAction: null,
      rationale: structured.rationale,
    };
  }

  if (structured.severity === null || structured.recommendedAction === null) {
    throw new Error('At-risk structured output was parsed without required at-risk fields.');
  }

  const recommendedAction = {
    kind: structured.recommendedAction.kind,
    body: structured.recommendedAction.body,
    ...(structured.recommendedAction.title === null ? {} : { title: structured.recommendedAction.title }),
  };
  const normalized = {
    isAtRisk: true,
    severity: structured.severity,
    evidence: structured.evidence.map((item) => ({
      sourceType: item.sourceType,
      quote: item.quote,
      ...(item.sourceDocumentId === null ? {} : { sourceDocumentId: item.sourceDocumentId }),
      ...(item.observedAt === null ? {} : { observedAt: item.observedAt }),
    })),
    recommendedAction,
    rationale: structured.rationale,
  };

  return atRiskWeekReasoningOutputSchema.parse(normalized);
}

async function invokeAtRiskWeekReasonerWithRetries(
  state: AtRiskWeekGraphState,
  messages: AtRiskWeekModelMessage[],
  dependencies: AtRiskWeekReasonNodeDependencies
): Promise<AtRiskWeekReasonerResult> {
  const maxAttempts = dependencies.retryPolicy.maxAttempts;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await dependencies.reasoner.invoke(messages);
    } catch (error) {
      const errorDetails = describeAtRiskWeekReasonerError(error);

      if (attempt >= maxAttempts) {
        throw new AtRiskWeekModelInvocationError({
          modelName: dependencies.reasoner.modelName,
          attempts: maxAttempts,
          workspaceId: state.scope.workspaceId,
          scopedDocId: state.scope.scopedDocId,
          runId: state.scope.runId,
          statusCode: errorDetails.statusCode,
          responseBody: errorDetails.responseBody,
          causeMessage: errorDetails.errorMessage,
        });
      }

      dependencies.logger.warn('fleetgraph.at_risk_week.reason_retry', {
        attempt,
        maxAttempts,
        modelName: dependencies.reasoner.modelName,
        workspaceId: state.scope.workspaceId,
        scopedDocId: state.scope.scopedDocId,
        runId: state.scope.runId,
        statusCode: errorDetails.statusCode,
        errorMessage: errorDetails.errorMessage,
      });
      await dependencies.retryPolicy.sleep(dependencies.retryPolicy.delayMs);
    }
  }

  throw new AtRiskWeekNodeContractError('At-risk Week reason retry policy did not allow any model attempts');
}

type AtRiskWeekModelInvocationErrorInput = {
  modelName: string;
  attempts: number;
  workspaceId: string;
  scopedDocId: string;
  runId: string;
  statusCode: number | null;
  responseBody: string | null;
  causeMessage: string;
};

export class AtRiskWeekModelInvocationError extends Error {
  readonly modelName: string;
  readonly attempts: number;
  readonly workspaceId: string;
  readonly scopedDocId: string;
  readonly runId: string;
  readonly statusCode: number | null;
  readonly responseBody: string | null;

  constructor(input: AtRiskWeekModelInvocationErrorInput) {
    super([
      `At-risk Week reasoning failed after ${input.attempts} attempts`,
      `modelName=${input.modelName}`,
      `workspaceId=${input.workspaceId}`,
      `scopedDocId=${input.scopedDocId}`,
      `runId=${input.runId}`,
      `statusCode=${input.statusCode ?? 'unknown'}`,
      `responseBody=${input.responseBody ?? 'unavailable'}`,
      `errorMessage=${input.causeMessage}`,
    ].join(', '));
    this.name = 'AtRiskWeekModelInvocationError';
    this.modelName = input.modelName;
    this.attempts = input.attempts;
    this.workspaceId = input.workspaceId;
    this.scopedDocId = input.scopedDocId;
    this.runId = input.runId;
    this.statusCode = input.statusCode;
    this.responseBody = input.responseBody;
  }
}

type AtRiskWeekStructuredOutputErrorInput = {
  modelName: string;
  message: string;
  parsed: unknown;
};

export class AtRiskWeekStructuredOutputError extends Error {
  readonly modelName: string;
  readonly parsedOutput: string;

  constructor(input: AtRiskWeekStructuredOutputErrorInput) {
    const parsedOutput = stringifyAtRiskWeekErrorPayload(input.parsed);

    super([
      'At-risk Week structured output parse failed',
      `modelName=${input.modelName}`,
      `errorMessage=${input.message}`,
      `parsedOutput=${parsedOutput}`,
    ].join(', '));
    this.name = 'AtRiskWeekStructuredOutputError';
    this.modelName = input.modelName;
    this.parsedOutput = parsedOutput;
  }
}

type BaseMessageWithUsageMetadata = BaseMessage & {
  usage_metadata?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
};

function toLangChainMessage(message: AtRiskWeekModelMessage): BaseMessage {
  if (message.role === 'system') {
    return new SystemMessage(message.content);
  }

  return new HumanMessage(message.content);
}

function extractAtRiskWeekModelUsage(raw: BaseMessage, modelName: string): AtRiskWeekModelUsage | null {
  const usageMetadata = (raw as BaseMessageWithUsageMetadata).usage_metadata;
  const inputTokens = integerOrNull(usageMetadata?.input_tokens);
  const outputTokens = integerOrNull(usageMetadata?.output_tokens);

  if (inputTokens === null || outputTokens === null) {
    return null;
  }

  return {
    modelName,
    inputTokens,
    outputTokens,
    estimatedCost: estimateAtRiskWeekModelCost(modelName, inputTokens, outputTokens),
  };
}

function integerOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return null;
}

type AtRiskWeekReasonerErrorDetails = {
  statusCode: number | null;
  errorMessage: string;
  responseBody: string | null;
};

type AtRiskWeekReasonerErrorLike = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  body?: unknown;
  response?: {
    status?: unknown;
    body?: unknown;
    data?: unknown;
  };
};

function describeAtRiskWeekReasonerError(error: unknown): AtRiskWeekReasonerErrorDetails {
  const errorLike = toAtRiskWeekReasonerErrorLike(error);

  return {
    statusCode: numberOrNull(errorLike.statusCode)
      ?? numberOrNull(errorLike.status)
      ?? numberOrNull(errorLike.response?.status),
    errorMessage: stringOrFallback(errorLike.message, 'Unknown model invocation error'),
    responseBody: responseBodyOrNull(errorLike.response?.data)
      ?? responseBodyOrNull(errorLike.response?.body)
      ?? responseBodyOrNull(errorLike.body),
  };
}

function toAtRiskWeekReasonerErrorLike(error: unknown): AtRiskWeekReasonerErrorLike {
  if (typeof error === 'object' && error !== null) {
    return error;
  }

  return {
    message: String(error),
  };
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return fallback;
}

function responseBodyOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function stringifyAtRiskWeekErrorPayload(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return '[unserializable]';
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
