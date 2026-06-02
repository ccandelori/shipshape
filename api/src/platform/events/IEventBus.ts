// IEventBus — narrow interface for DIP
// Domain services publish here after successful persistence.
// Implementations: in-memory (for tests and MVP), later queue-backed (LSP substitutable).

export interface DomainEvent {
  type: string; // e.g. 'document.created'
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

export interface IEventBus {
  publish(event: DomainEvent): Promise<void>;
  // Future: subscribe for testing / local delivery
}
