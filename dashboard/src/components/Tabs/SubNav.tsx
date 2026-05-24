// Sticky pill-row sub-nav that scroll-jumps to in-tab sections.
// Used inside Categories, Evidence, Audit, Operations tabs.

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export interface SubNavItem {
  id: string;
  label: string;
  badge?: string;
}

interface Props {
  items: SubNavItem[];
  /** Pixel offset from the top of the viewport when a section is "active". */
  scrollOffset?: number;
}

export function SubNav({ items, scrollOffset = 100 }: Props) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '');
  const navRef = useRef<HTMLDivElement>(null);

  // Active-section detection via scroll position.
  useEffect(() => {
    function onScroll(): void {
      const scrollY = window.scrollY + scrollOffset;
      let candidate = items[0]?.id ?? '';
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (top <= scrollY) candidate = item.id;
      }
      setActiveId(candidate);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [items, scrollOffset]);

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  return (
    <div
      ref={navRef}
      className="sticky top-3 z-10 -mx-1 mb-6 no-print"
    >
      <div className="surface px-1.5 py-1.5 flex items-center gap-1 overflow-x-auto">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => jumpTo(item.id)}
              className={clsx(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-chip text-xs font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-ink-700 text-cream'
                  : 'text-ink-500 hover:text-ink-700 hover:bg-cream-soft'
              )}
            >
              {item.label}
              {item.badge && (
                <span
                  className={clsx(
                    'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono',
                    isActive ? 'bg-cream/20 text-cream' : 'bg-ink-100 text-ink-500'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
