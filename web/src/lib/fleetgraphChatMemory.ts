export type FleetGraphChatMemoryDocumentType = 'sprint' | 'project' | 'issue';
export type FleetGraphChatMemoryRole = 'user' | 'assistant';
export type FleetGraphChatMemoryStatus = 'sent' | 'streaming' | 'completed' | 'failed';

export interface FleetGraphChatMemoryMessage {
  id: string;
  role: FleetGraphChatMemoryRole;
  content: string;
  status: FleetGraphChatMemoryStatus;
  sources?: FleetGraphChatMemorySource[];
}

export interface FleetGraphChatMemorySource {
  label: string;
  documentId: string;
  documentType: string;
  kind: 'scope' | 'related';
}

interface FleetGraphChatMemoryKeyInput {
  documentType: FleetGraphChatMemoryDocumentType;
  documentId: string;
  workspaceId?: string | null;
  userId?: string | null;
}

export const FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT = 50;

const persistableStatuses: readonly FleetGraphChatMemoryStatus[] = ['sent', 'completed', 'failed'];

export function buildFleetGraphChatMemoryKey(input: FleetGraphChatMemoryKeyInput): string {
  if (input.workspaceId && input.userId) {
    return `fleetgraph.chat:${input.workspaceId}:${input.userId}:${input.documentType}:${input.documentId}`;
  }

  return `fleetgraph.chat:${input.documentType}:${input.documentId}`;
}

export function getFleetGraphChatMemoryStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.warn('FleetGraph chat memory storage unavailable', { error });
    return null;
  }
}

export function loadFleetGraphChatMemory(
  storage: Storage | null,
  memoryKey: string
): FleetGraphChatMemoryMessage[] {
  if (!storage) {
    return [];
  }

  try {
    const rawValue = storage.getItem(memoryKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(isFleetGraphChatMemoryMessage);
  } catch (error) {
    console.warn('FleetGraph chat memory load failed', { error, memoryKey });
    return [];
  }
}

export function saveFleetGraphChatMemory(
  storage: Storage | null,
  memoryKey: string,
  messages: readonly FleetGraphChatMemoryMessage[]
): void {
  if (!storage) {
    return;
  }

  const persistableMessages = messages
    .filter((message) => (
      persistableStatuses.includes(message.status)
      && message.content.trim().length > 0
    ))
    .slice(-FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT);

  try {
    if (persistableMessages.length === 0) {
      storage.removeItem(memoryKey);
      return;
    }

    storage.setItem(memoryKey, JSON.stringify(persistableMessages));
  } catch (error) {
    console.warn('FleetGraph chat memory save failed', { error, memoryKey });
    return;
  }
}

function isFleetGraphChatMemoryMessage(value: unknown): value is FleetGraphChatMemoryMessage {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === 'string'
    && (value.role === 'user' || value.role === 'assistant')
    && typeof value.content === 'string'
    && isFleetGraphChatMemoryStatus(value.status)
    && (value.sources === undefined || isFleetGraphChatMemorySources(value.sources));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFleetGraphChatMemoryStatus(value: unknown): value is FleetGraphChatMemoryStatus {
  return typeof value === 'string'
    && persistableStatuses.some((status) => status === value);
}

function isFleetGraphChatMemorySources(value: unknown): value is FleetGraphChatMemorySource[] {
  return Array.isArray(value) && value.every((source) => (
    isRecord(source)
    && typeof source.label === 'string'
    && typeof source.documentId === 'string'
    && typeof source.documentType === 'string'
    && (source.kind === 'scope' || source.kind === 'related')
  ));
}
