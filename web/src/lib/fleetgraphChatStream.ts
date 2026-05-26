import {
  type FleetGraphChatUsage,
  type FleetGraphChatSseEvent,
} from '@/lib/fleetgraphChatState';

export class FleetGraphChatStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetGraphChatStreamError';
  }
}

type FleetGraphChatUsageCandidate = {
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | null | undefined;

export async function readFleetGraphChatSseStream(
  response: Response,
  onEvent: (event: FleetGraphChatSseEvent) => void
): Promise<void> {
  if (!response.body) {
    throw new FleetGraphChatStreamError('FleetGraph chat response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const readResult = await reader.read();

    if (readResult.done) {
      break;
    }

    buffer += decoder.decode(readResult.value, { stream: true });
    const parsed = drainFleetGraphSseBuffer(buffer);
    buffer = parsed.remaining;

    for (const event of parsed.events) {
      onEvent(event);
    }
  }

  buffer += decoder.decode();
  const parsed = drainFleetGraphSseBuffer(buffer);

  if (parsed.remaining.trim().length > 0) {
    throw new FleetGraphChatStreamError(`Incomplete FleetGraph chat SSE event: ${parsed.remaining}`);
  }

  for (const event of parsed.events) {
    onEvent(event);
  }
}

function drainFleetGraphSseBuffer(buffer: string): {
  events: FleetGraphChatSseEvent[];
  remaining: string;
} {
  const events: FleetGraphChatSseEvent[] = [];
  let remaining = buffer;
  let boundaryIndex = remaining.indexOf('\n\n');

  while (boundaryIndex >= 0) {
    const rawEvent = remaining.slice(0, boundaryIndex);
    remaining = remaining.slice(boundaryIndex + 2);

    if (rawEvent.trim().length > 0) {
      events.push(parseFleetGraphSseEvent(rawEvent));
    }

    boundaryIndex = remaining.indexOf('\n\n');
  }

  return { events, remaining };
}

function parseFleetGraphSseEvent(rawEvent: string): FleetGraphChatSseEvent {
  const lines = rawEvent.split(/\r?\n/);
  const eventLine = lines.find((line) => line.startsWith('event: '));
  const dataLines = lines
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length));

  if (!eventLine) {
    throw new FleetGraphChatStreamError(`FleetGraph chat SSE event is missing event type: ${rawEvent}`);
  }

  if (dataLines.length === 0) {
    throw new FleetGraphChatStreamError(`FleetGraph chat SSE event is missing data: ${rawEvent}`);
  }

  const eventType = eventLine.slice('event: '.length);
  const dataText = dataLines.join('\n');

  if (eventType === 'token') {
    const data = JSON.parse(dataText) as { token: string };
    if (typeof data.token !== 'string') {
      throw new FleetGraphChatStreamError(`FleetGraph token event has invalid data: ${dataText}`);
    }
    return { event: 'token', data };
  }

  if (eventType === 'final') {
    const data = JSON.parse(dataText) as {
      response: string;
      usage: FleetGraphChatUsageCandidate;
    };
    const usage = data.usage;
    if (typeof data.response !== 'string' || !isFleetGraphChatUsage(usage)) {
      throw new FleetGraphChatStreamError(`FleetGraph final event has invalid data: ${dataText}`);
    }
    return {
      event: 'final',
      data: {
        response: data.response,
        usage,
      },
    };
  }

  if (eventType === 'error') {
    const data = JSON.parse(dataText) as { error: string };
    if (typeof data.error !== 'string') {
      throw new FleetGraphChatStreamError(`FleetGraph error event has invalid data: ${dataText}`);
    }
    return { event: 'error', data };
  }

  if (eventType === 'heartbeat') {
    const data = JSON.parse(dataText) as { sentAt: string };
    if (typeof data.sentAt !== 'string') {
      throw new FleetGraphChatStreamError(`FleetGraph heartbeat event has invalid data: ${dataText}`);
    }
    return { event: 'heartbeat', data };
  }

  throw new FleetGraphChatStreamError(`Unknown FleetGraph chat SSE event type: ${eventType}`);
}

function isFleetGraphChatUsage(value: FleetGraphChatUsageCandidate): value is FleetGraphChatUsage {
  return (
    typeof value === 'object'
    && value !== null
    && typeof value.modelName === 'string'
    && typeof value.inputTokens === 'number'
    && typeof value.outputTokens === 'number'
    && typeof value.totalTokens === 'number'
  );
}
