import { IEventBus, DomainEvent } from './IEventBus.js';

// Simple in-memory bus for tests and initial MVP.
// In production the deliverer will be the real consumer of publishes.
// This satisfies the "domain publishes, never routes" rule immediately.

const listeners: Array<(event: DomainEvent) => void> = [];

export class InMemoryEventBus implements IEventBus {
  async publish(event: DomainEvent): Promise<void> {
    // Fire and forget for now; real impl will be async with DLQ etc.
    // For tests we can synchronously capture via subscribe if needed.
    listeners.forEach(l => {
      try { l(event); } catch (e) { /* swallow for MVP */ }
    });
    // In real deliverer wiring, this would enqueue for HTTP delivery.
  }

  // Test helper — not part of the interface
  subscribe(fn: (event: DomainEvent) => void) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }
}

export const inMemoryBus = new InMemoryEventBus();
