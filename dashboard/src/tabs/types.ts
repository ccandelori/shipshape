// Tab IDs — single source of truth across hooks, components, and tab files.
// Adding a new tab? Add the id here, add an entry to TAB_REGISTRY in TabBar,
// and add the case to App.tsx.

export type TabId = 'overview' | 'categories' | 'evidence' | 'audit' | 'operations';

export const TAB_IDS: readonly TabId[] = [
  'overview',
  'categories',
  'evidence',
  'audit',
  'operations',
] as const;

export const DEFAULT_TAB: TabId = 'overview';

export function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value);
}
