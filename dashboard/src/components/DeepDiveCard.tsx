import { useState } from 'react';
import { ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import type { CategoryDetail, CheckResult } from '../data/types';
import { StatusPill } from './StatusPill';
import { ArtifactLink } from './ArtifactLink';
import { CopyButton } from './CopyButton';
import { AnimatedNumber } from './AnimatedNumber';
import { BeforeAfterChart } from './BeforeAfterChart';
import { BundleEmbed } from './BundleEmbed';
import { formatDuration } from '../lib/format';

interface Props {
  detail: CategoryDetail;
  result: CheckResult;
}

export function DeepDiveCard({ detail, result }: Props) {
  const [open, setOpen] = useState(detail.category === 1 || detail.category === 2);
  const Trend = detail.beforeAfter?.betterIs === 'lower' ? TrendingDown : TrendingUp;
  const trendGood =
    detail.beforeAfter &&
    ((detail.beforeAfter.betterIs === 'lower' && detail.beforeAfter.after < detail.beforeAfter.before) ||
      (detail.beforeAfter.betterIs === 'higher' && detail.beforeAfter.after > detail.beforeAfter.before));

  return (
    <div id={`cat-${detail.category}-detail`} className="surface overflow-hidden scroll-mt-24">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-5 flex items-start justify-between gap-4 hover:bg-cream-soft transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="label-mono">CAT {detail.category}</span>
            <StatusPill status={result.status} />
          </div>
          <h3 className="text-xl font-bold text-ink-700 leading-tight mb-2">{result.name}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <div className="label-mono">Threshold</div>
              <p className="text-sm text-ink-600 leading-snug">{detail.threshold}</p>
            </div>
            <div>
              <div className="label-mono">Rationale</div>
              <p className="text-sm text-ink-500 leading-snug">{detail.thresholdRationale}</p>
            </div>
          </div>
        </div>
        {detail.beforeAfter && (
          <div className="flex items-center gap-2 shrink-0 px-3 py-2 rounded-tile bg-cream-soft">
            <Trend size={16} className={trendGood ? 'text-ink-700' : 'text-coral-500'} />
            <span className={clsx('font-bold text-2xl tabular-nums', trendGood ? 'text-ink-700' : 'text-coral-500')}>
              <AnimatedNumber value={detail.beforeAfter.reductionPct} decimals={1} suffix="%" />
            </span>
          </div>
        )}
        <ChevronDown
          size={20}
          data-print-hide
          className={clsx('text-ink-400 transition-transform shrink-0 mt-1', open && 'rotate-180')}
        />
      </button>

      <div
        className={clsx(
          'px-6 pb-6 pt-1 space-y-5 border-t hairline border-t',
          !open && 'collapsed-on-screen'
        )}
      >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
            <div>
              <div className="label-mono mb-2">What we monitor</div>
              <p className="text-sm text-ink-600 leading-relaxed">{detail.whatWeMonitor}</p>
            </div>
            <div>
              <div className="label-mono mb-2">Why it matters</div>
              <p className="text-sm text-ink-600 leading-relaxed">{detail.whyItMatters}</p>
            </div>
          </div>

          {detail.beforeAfter && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Stat label="Before" value={detail.beforeAfter.before} unit={detail.beforeAfter.unit} muted />
              <Stat
                label="After"
                value={detail.beforeAfter.after}
                unit={detail.beforeAfter.unit}
                accent={trendGood ? 'pass' : 'fail'}
              />
              <Stat
                label={detail.beforeAfter.betterIs === 'lower' ? 'Reduction' : 'Improvement'}
                value={detail.beforeAfter.reductionPct}
                unit="%"
                accent={trendGood ? 'pass' : 'fail'}
              />
            </div>
          )}

          {detail.series && detail.series.length > 0 && (
            <BeforeAfterChart series={detail.series} betterIs={detail.beforeAfter?.betterIs ?? 'lower'} />
          )}

          {detail.category === 2 && <BundleEmbed />}

          {detail.bullets && detail.bullets.length > 0 && (
            <ul className="space-y-2">
              {detail.bullets.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm text-ink-600">
                  <span className="text-coral-500 mt-1.5 shrink-0">▸</span>
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <div className="label-mono mb-3">Evidence</div>
            <div className="flex flex-wrap gap-2">
              {detail.artifacts.map((a) => (
                <ArtifactLink key={a.href} artifact={a} />
              ))}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-xs">
            <span className="font-mono text-ink-400">took {formatDuration(result.durationMs)}</span>
            <CopyButton text={result.reproduction} label="reproduce" />
          </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  muted,
  accent,
}: {
  label: string;
  value: number;
  unit: string;
  muted?: boolean;
  accent?: 'pass' | 'fail';
}) {
  return (
    <div
      className={clsx(
        'rounded-tile p-4',
        muted
          ? 'bg-cream-soft ring-1 ring-inset ring-ink-100'
          : accent === 'pass'
            ? 'bg-ink-700 text-cream'
            : 'bg-coral-100 text-coral-600 ring-1 ring-inset ring-coral-100'
      )}
    >
      <div className={clsx('label-mono mb-1', accent === 'pass' && 'text-cream-ring')}>{label}</div>
      <div className={clsx('font-sans text-2xl font-bold tabular-nums', muted && 'text-ink-700')}>
        <AnimatedNumber value={value} decimals={value >= 100 ? 0 : 2} />
        <span className={clsx('text-base ml-1', muted ? 'text-ink-400' : 'opacity-70')}>{unit}</span>
      </div>
    </div>
  );
}
