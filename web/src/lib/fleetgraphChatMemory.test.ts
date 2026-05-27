import { describe, expect, it, vi } from 'vitest';
import {
  FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT,
  buildFleetGraphChatMemoryKey,
  loadFleetGraphChatMemory,
  saveFleetGraphChatMemory,
  type FleetGraphChatMemoryMessage,
} from './fleetgraphChatMemory';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingStorage extends MemoryStorage {
  override removeItem(_key: string): void {
    throw new Error('removeItem failed');
  }

  override setItem(_key: string, _value: string): void {
    throw new Error('setItem failed');
  }
}

describe('fleetgraphChatMemory', () => {
  it('keys memory by document type and document id', () => {
    expect(buildFleetGraphChatMemoryKey({
      documentType: 'sprint',
      documentId: 'week-1',
    })).toBe('fleetgraph.chat:sprint:week-1');
    expect(buildFleetGraphChatMemoryKey({
      documentType: 'issue',
      documentId: 'week-1',
    })).toBe('fleetgraph.chat:issue:week-1');
    expect(buildFleetGraphChatMemoryKey({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      documentType: 'sprint',
      documentId: 'week-1',
    })).toBe('fleetgraph.chat:workspace-1:user-1:sprint:week-1');
  });

  it('loads an empty conversation when storage is absent or malformed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const storage = new MemoryStorage();
      storage.setItem('bad-json', '{not json');
      storage.setItem('bad-shape', JSON.stringify([{ role: 'assistant' }]));

      expect(loadFleetGraphChatMemory(null, 'any-key')).toEqual([]);
      expect(loadFleetGraphChatMemory(storage, 'missing')).toEqual([]);
      expect(loadFleetGraphChatMemory(storage, 'bad-json')).toEqual([]);
      expect(loadFleetGraphChatMemory(storage, 'bad-shape')).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        'FleetGraph chat memory load failed',
        expect.objectContaining({ memoryKey: 'bad-json' })
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('saves only non-streaming messages that have content', () => {
    const storage = new MemoryStorage();
    const messages: FleetGraphChatMemoryMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'What is blocked?',
        status: 'sent',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        status: 'streaming',
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'FleetGraph chat rate limit exceeded.',
        status: 'failed',
      },
    ];

    saveFleetGraphChatMemory(storage, 'week-key', messages);

    expect(loadFleetGraphChatMemory(storage, 'week-key')).toEqual([
      messages[0],
      messages[2],
    ]);
  });

  it('keeps only the latest bounded chat messages', () => {
    const storage = new MemoryStorage();
    const messages: FleetGraphChatMemoryMessage[] = Array.from(
      { length: FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT + 2 },
      (_value, index) => ({
        id: `message-${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${index}`,
        status: index % 2 === 0 ? 'sent' : 'completed',
      })
    );

    saveFleetGraphChatMemory(storage, 'week-key', messages);

    const savedMessages = loadFleetGraphChatMemory(storage, 'week-key');
    expect(savedMessages).toHaveLength(FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT);
    expect(savedMessages[0]?.id).toBe('message-2');
    expect(savedMessages.at(-1)?.id).toBe(`message-${FLEETGRAPH_CHAT_MEMORY_MESSAGE_LIMIT + 1}`);
  });

  it('logs and keeps chat usable when storage save throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const messages: FleetGraphChatMemoryMessage[] = [
        {
          id: 'user-1',
          role: 'user',
          content: 'What is blocked?',
          status: 'sent',
        },
      ];

      expect(() => saveFleetGraphChatMemory(new ThrowingStorage(), 'week-key', messages)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        'FleetGraph chat memory save failed',
        expect.objectContaining({ memoryKey: 'week-key' })
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
