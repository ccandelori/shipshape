export type FleetGraphChatStreamStatus =
  | 'idle'
  | 'streaming'
  | 'completed'
  | 'failed';

export interface FleetGraphChatUsage {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface FleetGraphChatSource {
  label: string;
  documentId: string;
  documentType: string;
  kind: 'scope' | 'related';
}

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
        sources: FleetGraphChatSource[];
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

export interface FleetGraphChatStreamState {
  status: FleetGraphChatStreamStatus;
  response: string;
  usage: FleetGraphChatUsage | null;
  sources: FleetGraphChatSource[];
  error: string | null;
  lastHeartbeatAt: string | null;
}

export function createFleetGraphChatStreamState(): FleetGraphChatStreamState {
  return {
    status: 'idle',
    response: '',
    usage: null,
    sources: [],
    error: null,
    lastHeartbeatAt: null,
  };
}

export function reduceFleetGraphChatStreamEvent(
  state: FleetGraphChatStreamState,
  event: FleetGraphChatSseEvent
): FleetGraphChatStreamState {
  switch (event.event) {
    case 'heartbeat':
      return {
        ...state,
        lastHeartbeatAt: event.data.sentAt,
      };
    case 'token':
      return {
        ...state,
        status: 'streaming',
        response: state.response + event.data.token,
        error: null,
      };
    case 'final':
      return {
        ...state,
        status: 'completed',
        response: event.data.response,
        usage: event.data.usage,
        sources: event.data.sources,
        error: null,
      };
    case 'error':
      return {
        ...state,
        status: 'failed',
        error: event.data.error,
      };
    default:
      return assertNever(event);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled FleetGraph chat stream event: ${JSON.stringify(value)}`);
}
