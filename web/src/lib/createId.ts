/**
 * Generate a unique id for client-side entities.
 * Uses crypto.randomUUID when available (secure context). Falls back for HTTP deploys
 * where randomUUID is undefined or throws (e.g. http://143.198.163.184 without TLS).
 */
export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Secure-context requirement or other runtime restriction.
    }
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
