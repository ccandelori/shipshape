import { z } from 'zod';

export const FLEETGRAPH_CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT = 10;
export const FLEETGRAPH_CHAT_REQUEST_HISTORY_MESSAGE_LIMIT = 50;
export const FLEETGRAPH_CHAT_QUESTION_MAX_LENGTH = 4_000;
export const FLEETGRAPH_CHAT_MESSAGE_MAX_LENGTH = 8_000;

export const FLEETGRAPH_CHAT_SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const satisfies Record<string, string>;

export const FleetGraphChatDocumentTypeSchema = z.enum(['sprint', 'project', 'issue']);

export const FleetGraphChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(FLEETGRAPH_CHAT_MESSAGE_MAX_LENGTH),
}).strict();

export const FleetGraphChatRequestSchema = z.object({
  documentId: z.string().uuid(),
  documentType: FleetGraphChatDocumentTypeSchema,
  question: z.string().trim().min(1).max(FLEETGRAPH_CHAT_QUESTION_MAX_LENGTH),
  conversationHistory: z.array(FleetGraphChatMessageSchema).max(FLEETGRAPH_CHAT_REQUEST_HISTORY_MESSAGE_LIMIT),
}).strict();

export type FleetGraphChatDocumentType = z.infer<typeof FleetGraphChatDocumentTypeSchema>;
export type FleetGraphChatMessage = z.infer<typeof FleetGraphChatMessageSchema>;
export type FleetGraphChatRequest = z.infer<typeof FleetGraphChatRequestSchema>;

export type FleetGraphChatUsage = {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type FleetGraphChatSseEvent =
  | {
      event: 'token';
      data: {
        token: string;
      };
    }
  | {
      event: 'final';
      data: {
        response: string;
        usage: FleetGraphChatUsage;
      };
    }
  | {
      event: 'error';
      data: {
        error: string;
      };
    }
  | {
      event: 'heartbeat';
      data: {
        sentAt: string;
      };
    };

export function formatFleetGraphChatSseEvent(event: FleetGraphChatSseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
