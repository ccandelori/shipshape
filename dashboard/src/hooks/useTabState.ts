// Active-tab state with URL-hash sync.
// Hash format: #tab=<id>  (e.g. #tab=evidence)
// Why hash and not router: keeps the SPA single-page, browser back/forward
// works, deep links work, and there's no router dependency to pull in.

import { useCallback, useEffect, useState } from 'react';
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
  // Preserve other hash params if any.
  const next = `#${params.toString()}`;
  if (next !== window.location.hash) {
    window.history.replaceState(null, '', next);
  }
}

export function useTabState(): {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
} {
  const [activeTab, setActive] = useState<TabId>(() => readTabFromHash());

  // External hash changes (back/forward, manual edit, link click).
  useEffect(() => {
    function onHashChange(): void {
      setActive(readTabFromHash());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setActiveTab = useCallback((tab: TabId) => {
    setActive(tab);
    writeTabToHash(tab);
    // Scroll back to top on tab change — content can be tall.
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return { activeTab, setActiveTab };
}
