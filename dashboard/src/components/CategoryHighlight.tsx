// Structured per-category highlight panel. Replaces the wall-of-markdown
// remediation narrative with a scannable layout:
//   outcome tiles → one-line summary → notable changes → reproduce
// The full markdown narrative still lives at the bottom of the panel,
// collapsed by default for readers who want to dig in.

import { Sparkles, FileCode2, Terminal } from 'lucide-react';
import clsx from 'clsx';
import type { CategoryHighlight as Highlight } from '../data/types';
import { AnimatedNumber } from './AnimatedNumber';
import { CopyButton } from './CopyButton';

interface Props {
  highlight: Highlight;
}

export function CategoryHighlight({ highlight }: Props) {
  return (
    <div className="space-y-6">
      {/* Outcome strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {highlight.outcomeStats.map((stat, i) => (
          <StatTile key={i} stat={stat} />
        ))}
      </div>

      {/* One-line summary */}
      <div className="flex gap-3 items-start rounded-tile bg-coral-50 ring-1 ring-inset ring-coral-100 p-4">
        <Sparkles size={16} className="text-coral-500 shrink-0 mt-0.5" />
        <p className="text-ink-700 leading-relaxed text-[15px] flex-1">
          {highlight.oneLineSummary}
        </p>
      </div>

      {/* Notable changes */}
      {highlight.notableChanges.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 pb-2 border-b hairline border-b">
            <FileCode2 size={14} className="text-coral-500" />
            <h3 className="label-mono text-ink-600">Notable changes</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {highlight.notableChanges.map((c) => (
              <article
                key={c.file}
                className="rounded-tile bg-cream-soft p-4 ring-1 ring-inset ring-ink-100 flex flex-col gap-2"
              >
                <header className="flex items-baseline justify-between gap-3">
                  <code className="font-mono text-xs text-ink-700 truncate" title={c.file}>
                    {c.file}
                  </code>
                  <span className="pill pill-pass text-[10px] uppercase shrink-0">
                    {c.metric}
                  </span>
                </header>
                <p className="text-sm text-ink-500 leading-snug">{c.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Reproduce */}
      <section>
        <div className="flex items-center gap-2 mb-3 pb-2 border-b hairline border-b">
          <Terminal size={14} className="text-coral-500" />
          <h3 className="label-mono text-ink-600 flex-1">Reproduce the current value</h3>
          <CopyButton text={highlight.reproduceCommand} label="copy" />
        </div>
        <pre className="rounded-tile bg-ink-800 text-ink-100 p-4 ring-1 ring-inset ring-ink-700 overflow-x-auto">
          <code className="font-mono text-xs leading-relaxed">{highlight.reproduceCommand}</code>
        </pre>
      </section>
    </div>
  );
}

function StatTile({
  stat,
}: {
  stat: { value: number; unit: string; label: string; tone?: 'pass' | 'fail' | 'neutral' };
}) {
  const tone = stat.tone ?? 'neutral';
  return (
    <div
      className={clsx(
        'rounded-tile p-4 ring-1 ring-inset',
        tone === 'pass' && 'bg-ink-700 text-cream ring-ink-700',
        tone === 'fail' && 'bg-coral-100 text-coral-600 ring-coral-100',
        tone === 'neutral' && 'bg-cream-soft text-ink-700 ring-ink-100'
      )}
    >
      <div
        className={clsx(
          'label-mono mb-1',
          tone === 'pass' && 'text-cream-ring',
          tone === 'fail' && 'text-coral-600/70'
        )}
      >
        {stat.label}
      </div>
      <div className="font-bold text-3xl tabular-nums leading-none">
        <AnimatedNumber
          value={stat.value}
          decimals={stat.value % 1 === 0 ? 0 : 1}
        />
        {stat.unit && <span className="text-xl ml-0.5 opacity-80">{stat.unit}</span>}
      </div>
    </div>
  );
}
