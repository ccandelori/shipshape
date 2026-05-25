// Active-tab state with URL-hash sync.
// Hash format: #tab=<id>  (e.g. #tab=evidence)
//
// Why a module-level store rather than per-component useState: this hook is
// called from BOTH App.tsx (the consumer that renders the active tab) AND
// from useDrillToCategory (called inside HeroCard's dials and the
// CategoryScoreboard). With useState, each call site got its own state
// instance, and updating one didn't update the other — clicking a dial
// would write the hash but App.tsx wouldn't re-render. The shared store
// guarantees one source of truth for every consumer.

import { useEffect, useState } from 'react';
import { DEFAULT_TAB, isTabId, type TabId } from '../tabs/types';

const HASH_KEY = 'tab';

function readTabFromHash(): TabId {
  if (typeof window === 'undefined') return DEFAULT_TAB;
  const raw = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(raw);
  const candidate = params.get(HASH_KEY);
  return candidate && isTabId(candidate) ? candidate : DEFAULT_TAB;
}

function writeTabToHash(tab: TabId): void {
  const raw = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(raw);
  params.set(HASH_KEY, tab);
  const next = `#${params.toString()}`;
  if (next !== window.location.hash) {
    window.history.replaceState(null, '', next);
  }
}

interface SetActiveTabOptions {
  /** When true (default), scroll the window to the top on tab change. */
  scrollToTop?: boolean;
}

// --- module-level store ----------------------------------------------------
// Shared across every useTabState() call site so a tab change propagates
// to all consumers in the same render pass.

let currentTab: TabId =
  typeof window !== 'undefined' ? readTabFromHash() : DEFAULT_TAB;
const listeners = new Set<(tab: TabId) => void>();

function setStoreTab(tab: TabId): void {
  if (tab === currentTab) return;
  currentTab = tab;
  for (const listener of listeners) listener(tab);
}

// One window-level hashchange listener serves all hook instances.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    setStoreTab(readTabFromHash());
  });
}

export function setActiveTabImperative(
  tab: TabId,
  options?: SetActiveTabOptions
): void {
  writeTabToHash(tab);
  setStoreTab(tab);
  if (options?.scrollToTop !== false) {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

// --- hook ------------------------------------------------------------------

export function useTabState(): {
  activeTab: TabId;
  setActiveTab: (tab: TabId, options?: SetActiveTabOptions) => void;
} {
  const [activeTab, setLocal] = useState<TabId>(currentTab);

  useEffect(() => {
    const listener = (tab: TabId): void => setLocal(tab);
    listeners.add(listener);
    // Sync at mount in case the module state changed before this hook
    // subscribed (e.g. another component called setActiveTabImperative
    // during the same render).
    if (currentTab !== activeTab) setLocal(currentTab);
    return () => {
      listeners.delete(listener);
    };
    // activeTab intentionally omitted — the sync-at-mount is one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { activeTab, setActiveTab: setActiveTabImperative };
}
