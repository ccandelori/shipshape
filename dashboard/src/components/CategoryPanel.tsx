// Per-category deep panel for the Categories tab. Collapsible.
// Collapsed = compact header strip + key numbers at a glance.
// Expanded = full remediation narrative + audit slice + artifacts + reproduce.

import { useState } from 'react';
import { ChevronDown, BookOpen, FileSearch, TrendingDown, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import type { CategoryDetail, CheckResult, TrajectoryPoint } from '../data/types';
import { StatusPill } from './StatusPill';
import { ArtifactLink } from './ArtifactLink';
import { CopyButton } from './CopyButton';
import { AnimatedNumber } from './AnimatedNumber';
import { MarkdownDocument } from './Markdown/MarkdownDocument';
import { CategoryHighlight } from './CategoryHighlight';
import { Sparkline } from './Sparkline';
import { BundleEmbed } from './BundleEmbed';
import { DbPlans } from './DbPlans';
import { formatDuration } from '../lib/format';

interface Props {
  detail: CategoryDetail;
  result: CheckResult;
  improvementSource: string;
  auditSource: string | null;
  trajectory: TrajectoryPoint[];
  /** External control. If provided, overrides the local toggle state. */
  forcedOpen?: boolean;
}

export function CategoryPanel({ detail, result, improvementSource, auditSource, trajectory, forcedOpen }: Props) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = forcedOpen !== undefined ? forcedOpen : localOpen;

  const [auditOpen, setAuditOpen] = useState(false);
  const [fullNarrativeOpen, setFullNarrativeOpen] = useState(false);
  const hasHighlight = !!detail.highlight;

  const trendBefore = detail.beforeAfter?.before;
  const trendAfter = detail.beforeAfter?.after;
  const trendPct = detail.beforeAfter?.reductionPct;
  const Trend = detail.beforeAfter?.betterIs === 'lower' ? TrendingDown : TrendingUp;
  const trendGood =
    detail.beforeAfter &&
    ((detail.beforeAfter.betterIs === 'lower' && (trendAfter ?? 0) < (trendBefore ?? 0)) ||
      (detail.beforeAfter.betterIs === 'higher' && (trendAfter ?? 0) > (trendBefore ?? 0)));

  return (
    <article id={`cat-${detail.category}-panel`} className="surface overflow-hidden scroll-mt-24">
      {/* Collapsed header strip — always visible. Click anywhere to toggle. */}
      <button
        type="button"
        onClick={() => setLocalOpen((v) => !v)}
        className="w-full p-5 md:p-6 flex items-center gap-4 text-left hover:bg-cream-soft transition-colors group"
        aria-expanded={open}
      >
        {/* Category number badge */}
        <div
          className={clsx(
            'shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-tile grid place-items-center font-bold text-lg ring-1 ring-inset',
            result.status === 'pass'
              ? 'bg-ink-700 text-cream ring-ink-700'
              : result.status === 'fail'
                ? 'bg-coral-500 text-cream ring-coral-500'
                : 'bg-slate-200 text-slate-700 ring-slate-300'
          )}
        >
          {detail.category}
        </div>

        {/* Name + threshold one-liner */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h2 className="text-lg md:text-xl font-bold text-ink-700 tracking-tight truncate">
              {result.name}
            </h2>
            <StatusPill status={result.status} />
          </div>
          <p className="text-sm text-ink-500 leading-snug line-clamp-1">
            {detail.thresholdRationale}
          </p>
        </div>

        {/* Eye-catching metric — trend, headroom, and a sparkline of margin
            over time so the reader sees both the current value and where it
            sits in the recent history. */}
        <div className="hidden md:flex items-center gap-5 shrink-0">
          {detail.beforeAfter && trendPct !== undefined && (
            <div className="text-right">
              <div className="label-mono mb-0.5">Reduction</div>
              <div
                className={clsx(
                  'inline-flex items-center gap-1.5 font-bold text-xl tabular-nums',
                  trendGood ? 'text-ink-700' : 'text-coral-500'
                )}
              >
                <Trend size={16} />
                <AnimatedNumber value={trendPct} decimals={1} suffix="%" />
              </div>
            </div>
          )}
          {detail.marginPct !== null && (
            <div className="text-right">
              <div className="label-mono mb-0.5">Headroom</div>
              <div className="font-bold text-xl tabular-nums text-ink-700">
                <AnimatedNumber value={detail.marginPct} decimals={1} suffix="%" />
              </div>
            </div>
          )}
          {trajectory.length > 0 && (
            <div className="text-right">
              <div className="label-mono mb-0.5">Trend</div>
              <Sparkline points={trajectory} width={80} height={26} />
            </div>
          )}
        </div>

        <ChevronDown
          size={20}
          data-print-hide
          className={clsx(
            'text-ink-400 shrink-0 transition-transform group-hover:text-ink-700',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded body — hidden on screen when collapsed, always rendered for
          print + for snappier toggle (no remount). */}
      <div className={clsx(!open && 'collapsed-on-screen')}>
        <div className="px-6 md:px-8 pb-6 md:pb-8 pt-2 space-y-6 border-t hairline border-t">
          {/* Threshold + current — key reading at a glance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-tile bg-cream-soft p-4 ring-1 ring-inset ring-ink-100">
              <div className="label-mono mb-1">Threshold</div>
              <p className="text-sm text-ink-700 leading-snug">{detail.threshold}</p>
            </div>
            <div
              className={clsx(
                'rounded-tile p-4 ring-1 ring-inset',
                result.status === 'pass'
                  ? 'bg-ink-700 text-cream ring-ink-700'
                  : result.status === 'fail'
                    ? 'bg-coral-100 text-coral-600 ring-coral-100'
                    : 'bg-slate-100 ring-slate-200'
              )}
            >
              <div
                className={clsx(
                  'label-mono mb-1',
                  result.status === 'pass' && 'text-cream-ring'
                )}
              >
                Current
              </div>
              <p className="text-sm font-mono leading-snug">{result.actual}</p>
            </div>
          </div>

          {/* Domain-specific deep dives — one viz per category that warrants it. */}
          {detail.category === 2 && <BundleEmbed />}
          {detail.category === 4 && <DbPlans />}

          {/* Structured highlight (preferred) OR fall through to the full
              markdown narrative directly. */}
          {hasHighlight && detail.highlight ? (
            <>
              <CategoryHighlight highlight={detail.highlight} />

              {/* Full narrative — collapsed by default when the highlight
                  is present. Click to expand for the deep narrative. */}
              <section>
                <button
                  type="button"
                  onClick={() => setFullNarrativeOpen((v) => !v)}
                  className="w-full flex items-center gap-2 pb-2 border-b hairline border-b text-left hover:bg-cream-soft -mx-2 px-2 rounded transition-colors"
                >
                  <BookOpen size={14} className="text-coral-500" />
                  <h3 className="label-mono text-ink-600 flex-1">Full remediation log</h3>
                  <span className="text-xs text-ink-400 no-print">
                    {fullNarrativeOpen ? 'Collapse' : 'Expand'}
                  </span>
                  <ChevronDown
                    size={16}
                    data-print-hide
                    className={clsx('text-ink-400 transition-transform', fullNarrativeOpen && 'rotate-180')}
                  />
                </button>
                <div className={clsx(!fullNarrativeOpen && 'collapsed-on-screen', 'mt-4')}>
                  <MarkdownDocument source={improvementSource} stripFirstH1 />
                </div>
              </section>
            </>
          ) : (
            <section>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b hairline border-b">
                <BookOpen size={14} className="text-coral-500" />
                <h3 className="label-mono text-ink-600">Remediation narrative</h3>
              </div>
              <MarkdownDocument source={improvementSource} stripFirstH1 />
            </section>
          )}

          {/* Audit findings (nested collapsible — it's long even when the
              category is open) */}
          {auditSource && (
            <section>
              <button
                type="button"
                onClick={() => setAuditOpen((v) => !v)}
                className="w-full flex items-center gap-2 pb-2 border-b hairline border-b text-left hover:bg-cream-soft -mx-2 px-2 rounded transition-colors"
              >
                <FileSearch size={14} className="text-coral-500" />
                <h3 className="label-mono text-ink-600 flex-1">Original audit findings</h3>
                <span className="text-xs text-ink-400 no-print">{auditOpen ? 'Collapse' : 'Expand'}</span>
                <ChevronDown
                  size={16}
                  data-print-hide
                  className={clsx('text-ink-400 transition-transform', auditOpen && 'rotate-180')}
                />
              </button>
              <div className={clsx(!auditOpen && 'collapsed-on-screen', 'mt-4')}>
                <MarkdownDocument source={auditSource} stripFirstH1 />
              </div>
            </section>
          )}

          {/* Artifacts */}
          {detail.artifacts.length > 0 && (
            <section>
              <div className="label-mono mb-3">Evidence</div>
              <div className="flex flex-wrap gap-2">
                {detail.artifacts.map((a) => (
                  <ArtifactLink key={a.href} artifact={a} />
                ))}
              </div>
            </section>
          )}

          {/* Reproduce + duration */}
          <footer className="flex items-center justify-between text-xs pt-4 border-t hairline border-t">
            <span className="font-mono text-ink-400">took {formatDuration(result.durationMs)}</span>
            <CopyButton text={result.reproduction} label="reproduce" />
          </footer>
        </div>
      </div>
    </article>
  );
}
