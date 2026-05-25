// Reusable "open Categories tab and scroll to a specific category's panel"
// behavior. Used by the Overview's hero dials + the scoreboard cells.
//
// Implementation: encode the target in the URL hash (#tab=categories&panel=N).
// CategoriesTab reads that param on mount via usePendingPanelScroll() and
// performs the scroll itself once its panels exist. This avoids the polling
// race that plagued earlier attempts (CategoriesTab is lazy-loaded so the
// panel elements don't exist at click time). Bonus: the URL is now a
// shareable deep link.

import { useCallback } from 'react';
import { useTabState } from './useTabState';

export const PANEL_HASH_KEY = 'panel';

export function useDrillToCategory(): (category: number) => void {
  const { setActiveTab } = useTabState();
  return useCallback(
    (category: number) => {
      // Write the panel target into the URL hash BEFORE switching tabs so
      // CategoriesTab sees it on its very first render.
      const raw = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(raw);
      params.set(PANEL_HASH_KEY, String(category));
      params.set('tab', 'categories');
      window.history.replaceState(null, '', `#${params.toString()}`);

      setActiveTab('categories', { scrollToTop: false });
    },
    [setActiveTab]
  );
}

/** Read + drain the pending panel target from the URL hash. */
export function consumePendingPanelTarget(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(raw);
  const value = params.get(PANEL_HASH_KEY);
  if (!value) return null;
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return null;
  // Drain the param so a tab swap back doesn't re-scroll.
  params.delete(PANEL_HASH_KEY);
  const next = params.toString();
  window.history.replaceState(null, '', next ? `#${next}` : window.location.pathname);
  return n;
}
