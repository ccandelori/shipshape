import { randomUUID } from 'crypto';

// Pure function, strict typing, no side effects.
export function generateRequestId(): string {
  return randomUUID();
}
