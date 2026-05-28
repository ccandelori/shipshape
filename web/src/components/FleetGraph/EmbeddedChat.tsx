import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { apiPost } from '@/lib/api';
import { cn } from '@/lib/cn';
import { createId } from '@/lib/createId';
import {
  FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT,
  buildFleetGraphChatMemoryKey,
  getFleetGraphChatMemoryStorage,
  loadFleetGraphChatMemory,
  saveFleetGraphChatMemory,
  type FleetGraphChatMemoryDocumentType,
  type FleetGraphChatMemoryMessage,
  type FleetGraphChatMemoryRole,
  type FleetGraphChatMemoryStatus,
} from '@/lib/fleetgraphChatMemory';
import {
  createFleetGraphChatStreamState,
  reduceFleetGraphChatStreamEvent,
  type FleetGraphChatSource,
  type FleetGraphChatSseEvent,
  type FleetGraphChatStreamState,
} from '@/lib/fleetgraphChatState';
import { readFleetGraphChatSseStream } from '@/lib/fleetgraphChatStream';

export type FleetGraphChatDocumentType = FleetGraphChatMemoryDocumentType;

interface EmbeddedChatProps {
  documentId: string;
  documentType: FleetGraphChatDocumentType;
  memoryScope?: EmbeddedChatMemoryScope | null;
  className?: string;
}

interface EmbeddedChatMemoryScope {
  workspaceId: string;
  userId: string;
}

type EmbeddedChatRole = FleetGraphChatMemoryRole;
type EmbeddedChatMessageStatus = FleetGraphChatMemoryStatus;

interface EmbeddedChatMessage {
  id: string;
  role: EmbeddedChatRole;
  content: string;
  status: EmbeddedChatMessageStatus;
  sources: FleetGraphChatSource[];
}

interface EmbeddedChatState {
  memoryKey: string;
  messages: EmbeddedChatMessage[];
}

interface FleetGraphChatRequestMessage {
  role: EmbeddedChatRole;
  content: string;
}

interface FleetGraphChatRequestBody {
  documentId: string;
  documentType: FleetGraphChatDocumentType;
  question: string;
  conversationHistory: FleetGraphChatRequestMessage[];
}

interface FleetGraphChatErrorResponse {
  error?: string;
  retry_after_seconds?: number;
}

const suggestedPrompts = [
  'What is blocking this?',
  'Who owns the next step?',
  'What changed this week?',
] as const;

export function EmbeddedChat({ documentId, documentType, memoryScope, className }: EmbeddedChatProps) {
  const memoryKey = buildFleetGraphChatMemoryKey({
    documentId,
    documentType,
    workspaceId: memoryScope?.workspaceId,
    userId: memoryScope?.userId,
  });
  const [chatState, setChatState] = useState<EmbeddedChatState>(() => ({
    memoryKey,
    messages: toEmbeddedChatMessages(loadFleetGraphChatMemory(getFleetGraphChatMemoryStorage(), memoryKey)),
  }));
  const [question, setQuestion] = useState('');
  const [streamState, setStreamState] = useState<FleetGraphChatStreamState>(
    createFleetGraphChatStreamState()
  );
  const requestIdRef = useRef(0);
  const messages = chatState.messages;
  const isStreaming = streamState.status === 'streaming';

  const setMessages = (action: SetStateAction<EmbeddedChatMessage[]>) => {
    setChatState((currentState) => ({
      ...currentState,
      messages: resolveMessageStateAction(action, currentState.messages),
    }));
  };

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (chatState.memoryKey === memoryKey) {
      return;
    }

    requestIdRef.current += 1;
    setQuestion('');
    setStreamState(createFleetGraphChatStreamState());
    setChatState({
      memoryKey,
      messages: toEmbeddedChatMessages(loadFleetGraphChatMemory(getFleetGraphChatMemoryStorage(), memoryKey)),
    });
  }, [chatState.memoryKey, memoryKey]);

  useEffect(() => {
    saveFleetGraphChatMemory(
      getFleetGraphChatMemoryStorage(),
      chatState.memoryKey,
      toFleetGraphChatMemoryMessages(chatState.messages)
    );
  }, [chatState]);

  const submitQuestion = () => {
    submitQuestionText(question);
  };

  const startNewChat = () => {
    requestIdRef.current += 1;
    setQuestion('');
    setStreamState(createFleetGraphChatStreamState());
    setMessages([]);
  };

  const submitQuestionText = (rawQuestion: string) => {
    const trimmedQuestion = rawQuestion.trim();

    if (trimmedQuestion.length === 0 || isStreaming) {
      return;
    }

    try {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const userMessage: EmbeddedChatMessage = {
        id: createId('user'),
        role: 'user',
        content: trimmedQuestion,
        status: 'sent',
        sources: [],
      };
      const assistantMessageId = createId('assistant');
      const assistantMessage: EmbeddedChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        sources: [],
      };
      const conversationHistory = buildConversationHistory(messages);

      setQuestion('');
      setStreamState(createFleetGraphChatStreamState());
      setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);

      void sendFleetGraphChatRequest({
        requestId,
        assistantMessageId,
        body: {
          documentId,
          documentType,
          question: trimmedQuestion,
          conversationHistory,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FleetGraph chat could not start';
      setStreamState({
        ...createFleetGraphChatStreamState(),
        status: 'failed',
        error: message,
      });
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuestion();
  };

  const sendFleetGraphChatRequest = async (input: {
    requestId: number;
    assistantMessageId: string;
    body: FleetGraphChatRequestBody;
  }): Promise<void> => {
    try {
      const response = await apiPost('/api/fleetgraph/chat', input.body);

      if (!response.ok) {
        const message = await readFleetGraphChatErrorMessage(response);
        applyStreamFailure(input.requestId, input.assistantMessageId, message);
        return;
      }

      await readFleetGraphChatSseStream(response, (event) => {
        applyStreamEvent(input.requestId, input.assistantMessageId, event);
      });
      finalizeStreamIfNeeded(input.requestId, input.assistantMessageId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FleetGraph chat request failed';
      applyStreamFailure(input.requestId, input.assistantMessageId, message);
    }
  };

  const applyStreamEvent = (
    requestId: number,
    assistantMessageId: string,
    event: FleetGraphChatSseEvent
  ) => {
    if (requestIdRef.current !== requestId) {
      return;
    }

    setStreamState((currentState) => reduceFleetGraphChatStreamEvent(currentState, event));

    if (event.event === 'token') {
      setMessages((currentMessages) => currentMessages.map((message) => (
        message.id === assistantMessageId
          ? { ...message, content: message.content + event.data.token, status: 'streaming' }
          : message
      )));
    }

    if (event.event === 'final') {
      setMessages((currentMessages) => currentMessages.map((message) => (
        message.id === assistantMessageId
          ? {
              ...message,
              content: event.data.response,
              status: 'completed',
              sources: event.data.sources,
            }
          : message
      )));
    }

    if (event.event === 'error') {
      setMessages((currentMessages) => currentMessages.map((message) => (
        message.id === assistantMessageId
          ? { ...message, status: 'failed' }
          : message
      )));
    }
  };

  const finalizeStreamIfNeeded = (requestId: number, assistantMessageId: string) => {
    if (requestIdRef.current !== requestId) {
      return;
    }

    setStreamState((currentState) => {
      if (currentState.status !== 'streaming') {
        return currentState;
      }

      return {
        ...currentState,
        status: 'completed',
        error: null,
      };
    });

    setMessages((currentMessages) => currentMessages.map((chatMessage) => (
      chatMessage.id === assistantMessageId && chatMessage.status === 'streaming'
        ? { ...chatMessage, status: 'completed' }
        : chatMessage
    )));
  };

  const applyStreamFailure = (
    requestId: number,
    assistantMessageId: string,
    message: string
  ) => {
    if (requestIdRef.current !== requestId) {
      return;
    }

    setStreamState({
      ...createFleetGraphChatStreamState(),
      status: 'failed',
      error: message,
    });
    setMessages((currentMessages) => currentMessages.map((chatMessage) => (
      chatMessage.id === assistantMessageId
        ? { ...chatMessage, content: message, status: 'failed' }
        : chatMessage
    )));
  };

  return (
    <section
      id="fleetgraph-chat-panel"
      className={cn('flex h-full min-h-0 flex-col border-l border-border bg-background', className)}
      aria-label="FleetGraph chat"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">FleetGraph Chat</h2>
          <p className="mt-0.5 text-xs text-muted">{formatDocumentType(documentType)} context</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            aria-label="Start new FleetGraph chat"
            onClick={startNewChat}
            className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-foreground"
          >
            New chat
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-border bg-border/10 px-3 py-4 text-sm text-muted">
            <p>Ask about risks, blockers, ownership, or likely next actions.</p>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested FleetGraph prompts">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submitQuestionText(prompt)}
                  disabled={isStreaming}
                  className="rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} />
        ))}
      </div>

      {streamState.error && (
        <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300" role="alert">
          {streamState.error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-border p-3">
        <label className="mb-2 block text-xs font-medium text-muted" htmlFor="fleetgraph-chat-question">
          Ask FleetGraph
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="fleetgraph-chat-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            disabled={isStreaming}
            className="min-h-[72px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-60"
            placeholder="What changed this week?"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={question.trim().length === 0 || isStreaming}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {isStreaming ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}

function ChatMessageBubble({ message }: { message: EmbeddedChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm',
          isUser
            ? 'bg-accent text-white'
            : 'border border-border bg-border/10 text-foreground',
          message.status === 'failed' && 'border-red-500/30 bg-red-500/10 text-red-300'
        )}
      >
        <p className="whitespace-pre-wrap">{message.content || (message.status === 'streaming' ? '...' : '')}</p>
        {!isUser && message.sources.length > 0 && (
          <SourceChips sources={message.sources} />
        )}
      </div>
    </div>
  );
}

function SourceChips({ sources }: { sources: readonly FleetGraphChatSource[] }) {
  return (
    <div className="mt-3 border-t border-border/70 pt-2">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Sources</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <SourceChip key={`${source.documentId}-${source.kind}`} source={source} />
        ))}
      </div>
    </div>
  );
}

function SourceChip({ source }: { source: FleetGraphChatSource }) {
  const className = cn(
    'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
    source.kind === 'scope'
      ? 'border-accent/40 bg-accent/10 text-accent'
      : 'border-border bg-background/70 text-muted hover:text-foreground'
  );

  return (
    <a className={className} href={`/documents/${source.documentId}`}>
      <span className="truncate">{source.label}</span>
    </a>
  );
}

function buildConversationHistory(messages: EmbeddedChatMessage[]): FleetGraphChatRequestMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0 && message.status !== 'failed')
    .slice(-FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function resolveMessageStateAction(
  action: SetStateAction<EmbeddedChatMessage[]>,
  currentMessages: EmbeddedChatMessage[]
): EmbeddedChatMessage[] {
  if (typeof action === 'function') {
    return action(currentMessages);
  }

  return action;
}

function toFleetGraphChatMemoryMessages(
  messages: readonly EmbeddedChatMessage[]
): FleetGraphChatMemoryMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    sources: message.sources,
  }));
}

function toEmbeddedChatMessages(
  messages: readonly FleetGraphChatMemoryMessage[]
): EmbeddedChatMessage[] {
  return messages.map((message) => ({
    ...message,
    sources: message.sources ?? [],
  }));
}

async function readFleetGraphChatErrorMessage(response: Response): Promise<string> {
  const body = await response.text();

  if (body.length === 0) {
    return `FleetGraph chat request failed with status ${response.status}`;
  }

  try {
    const data = JSON.parse(body) as FleetGraphChatErrorResponse;
    if (response.status === 429 && data.retry_after_seconds !== undefined) {
      return `FleetGraph chat rate limit exceeded. Try again in ${data.retry_after_seconds} seconds.`;
    }
    return data.error ?? `FleetGraph chat request failed with status ${response.status}`;
  } catch {
    return `FleetGraph chat request failed with status ${response.status}: ${body}`;
  }
}

function formatDocumentType(documentType: FleetGraphChatDocumentType): string {
  if (documentType === 'sprint') return 'Week';
  if (documentType === 'project') return 'Project';
  return 'Issue';
}
