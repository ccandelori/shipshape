// Interactive inline bundle treemap. Embeds the rollup-plugin-visualizer
// HTML output served from /dashboard/treemaps/ — toggle baseline vs after.
// Click "Expand" to enlarge to a full-viewport overlay (Esc or X to exit).

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Maximize2, Minimize2, X, ExternalLink } from 'lucide-react';
import { repoLink } from '../lib/repo';

type View = 'baseline' | 'after';

const VIEWS: Array<{ id: View; label: string; subtitle: string; src: string; sourcePath: string }> = [
  {
    id: 'baseline',
    label: 'Baseline',
    subtitle: '587 KB gzip entry chunk',
    src: '/dashboard/treemaps/bundle-baseline.html',
    sourcePath: 'orientation/baselines/bundle/bundle-baseline.html',
  },
  {
    id: 'after',
    label: 'Post-remediation',
    subtitle: '142 KB gzip entry chunk',
    src: '/dashboard/treemaps/bundle-after.html',
    sourcePath: 'orientation/baselines/bundle/after-bundle.html',
  },
];

export function BundleEmbed() {
  const [view, setView] = useState<View>('after');
  const [expanded, setExpanded] = useState(false);
  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[1]!;

  // Esc to close the expanded overlay. Also disable body scroll while open.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  return (
    <div className="rounded-tile p-4 bg-cream-soft ring-1 ring-inset ring-ink-100">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="label-mono px-1">Interactive bundle composition</div>
        <div className="flex items-center gap-2 no-print">
          {/* Toggle between baseline / after */}
          <div className="inline-flex rounded-chip bg-ink-100 p-0.5 ring-1 ring-inset ring-ink-200">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={clsx(
                  'px-3 py-1 rounded-chip text-xs font-medium transition-colors',
                  view === v.id ? 'bg-ink-700 text-cream' : 'text-ink-500 hover:text-ink-700'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700"
            title="Expand to full screen"
          >
            <Maximize2 size={11} />
            Expand
          </button>
        </div>
      </div>

      {/* Inline iframe — sized for the panel. */}
      <div className="rounded-tile overflow-hidden bg-white ring-1 ring-inset ring-ink-100">
        <iframe
          key={active.id /* force re-mount on toggle so the embedded D3 re-runs sizing */}
          src={active.src}
          title={`Bundle treemap — ${active.label}`}
          className="block w-full"
          style={{ height: 520, border: 'none' }}
        />
      </div>

      <p className="text-xs text-ink-500 mt-3 px-1 leading-snug">
        <strong className="text-ink-700">{active.label}:</strong> {active.subtitle}. Hover any
        rectangle for chunk size + gzip; click a parent to zoom in. Treemap source:{' '}
        <a
          href={repoLink(active.sourcePath)}
          target="_blank"
          rel="noreferrer"
          className="text-coral-500 hover:text-coral-600 underline decoration-coral-200 underline-offset-2"
        >
          {active.sourcePath}
        </a>
        .
      </p>

      {/* Expanded overlay — covers the viewport with the iframe big.
          Esc, backdrop click, or X all close it. */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-ink-900/70 backdrop-blur-sm p-4 md:p-8 flex flex-col"
          onClick={(e) => {
            if (e.target === e.currentTarget) setExpanded(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Bundle treemap expanded view"
        >
          <div className="bg-cream rounded-card shadow-tile w-full max-w-[1600px] mx-auto flex-1 flex flex-col overflow-hidden">
            {/* Overlay header */}
            <header className="flex items-center justify-between gap-3 px-5 py-3 border-b hairline border-b">
              <div className="flex items-center gap-3 min-w-0">
                <span className="label-mono">Bundle treemap</span>
                <div className="inline-flex rounded-chip bg-ink-100 p-0.5 ring-1 ring-inset ring-ink-200">
                  {VIEWS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setView(v.id)}
                      className={clsx(
                        'px-3 py-1 rounded-chip text-xs font-medium transition-colors',
                        view === v.id ? 'bg-ink-700 text-cream' : 'text-ink-500 hover:text-ink-700'
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-ink-500 hidden md:inline truncate">
                  {active.subtitle}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={active.src}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-ink-500 hover:bg-cream-soft hover:text-ink-700"
                  title="Open in a new tab"
                >
                  <ExternalLink size={11} />
                  New tab
                </a>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-ink-500 hover:bg-cream-soft hover:text-ink-700"
                  title="Collapse"
                >
                  <Minimize2 size={11} />
                  Collapse
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded text-ink-500 hover:bg-cream-soft hover:text-ink-700"
                  title="Close (Esc)"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </header>

            {/* Big iframe */}
            <iframe
              key={`expanded-${active.id}`}
              src={active.src}
              title={`Bundle treemap — ${active.label} (expanded)`}
              className="block w-full flex-1"
              style={{ border: 'none' }}
            />

            {/* Footer hint */}
            <div className="px-5 py-2 border-t hairline border-t text-xs text-ink-400 flex items-center justify-between">
              <span>Press <kbd className="font-mono px-1 py-0.5 rounded bg-ink-100 text-ink-600 text-[10px]">Esc</kbd> or click outside to close.</span>
              <span className="hidden md:inline">{active.subtitle}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
