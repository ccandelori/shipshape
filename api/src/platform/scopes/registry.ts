// Data-driven ScopeRegistry (OCP per plan and architecture.md)
// Scopes registered at module load. No editing middleware for new scopes.

export interface ScopeDefinition {
  name: string;
  description: string;
}

const SCOPES: Record<string, ScopeDefinition> = {
  'documents:read': { name: 'documents:read', description: 'Read documents' },
  'documents:write': { name: 'documents:write', description: 'Create/update documents' },
  'issues:read': { name: 'issues:read', description: 'Read issues' },
  'issues:write': { name: 'issues:write', description: 'Create/update issues' },
  'sprints:read': { name: 'sprints:read', description: 'Read sprints/weeks' },
  'sprints:write': { name: 'sprints:write', description: 'Manage sprints/weeks' },
  'webhooks:manage': { name: 'webhooks:manage', description: 'Manage webhook subscriptions and deliveries' },
};

export class ScopeRegistry {
  private scopes = SCOPES;

  list(): ScopeDefinition[] {
    return Object.values(this.scopes);
  }

  has(scope: string): boolean {
    return !!this.scopes[scope];
  }

  validate(required: string[], granted: string[]): string[] {
    return required.filter(s => !granted.includes(s));
  }
}

export const scopeRegistry = new ScopeRegistry();
