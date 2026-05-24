import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import type { DashboardSnapshot, CheckResult } from '../data/types';
import { StatusPill } from './StatusPill';

const CATEGORY_ICONS: Record<number, string> = {
  1: 'Aa',  // Type
  2: '◧',   // Bundle
  3: '⇄',   // API
  4: '◐',   // DB
  5: '✓',   // Tests
  6: '⚠',   // Errors
  7: '⌖',   // A11y
};

const ICON_BG: Record<number, string> = {
  1: 'bg-coral-100 text-coral-600',
  2: 'bg-sky-100 text-sky-600',
  3: 'bg-slate-100 text-ink-600',
  4: 'bg-ink-700 text-cream',
  5: 'bg-coral-100 text-coral-600',
  6: 'bg-sky-100 text-sky-600',
  7: 'bg-slate-100 text-ink-600',
};

interface Props {
  snapshot: DashboardSnapshot;
}

export function CategoryList({ snapshot }: Props) {
  return (
    <div className="surface p-6 md:p-8 h-full flex flex-col">
      <header className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-ink-700 tracking-tight">Categories</h2>
        <a
          href="#deep-dives"
          data-print-hide
          className="text-sm text-ink-400 hover:text-ink-700 transition-colors"
        >
          See all detail →
        </a>
      </header>

      <div className="flex-1 divide-y divide-ink-100">
        {snapshot.shipshape.results.map((r, i) => (
          <CategoryRow key={r.category} result={r} index={i} />
        ))}
      </div>
    </div>
  );
}

function CategoryRow({ result, index }: { result: CheckResult; index: number }) {
  const [open, setOpen] = useState(false);
  const Icon = CATEGORY_ICONS[result.category] ?? '·';
  const iconBg = ICON_BG[result.category] ?? 'bg-slate-100 text-ink-600';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 + index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className="py-3"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left hover:bg-cream-soft -mx-2 px-2 py-2 rounded-tile transition-colors"
        aria-expanded={open}
      >
        <div className={clsx('w-10 h-10 rounded-xl grid place-items-center font-bold shrink-0', iconBg)}>
          <span className="text-base">{Icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink-700 leading-tight">{result.name}</div>
          <div className="text-xs text-ink-400 mt-0.5 font-mono">CAT {result.category}</div>
        </div>
        <StatusPill status={result.status} />
        {open ? (
          <ChevronUp size={16} data-print-hide className="text-ink-400 shrink-0" />
        ) : (
          <ChevronDown size={16} data-print-hide className="text-ink-400 shrink-0" />
        )}
      </button>
      <div className={clsx(!open && 'collapsed-on-screen')}>
        <div className="pl-13 pt-3 pb-1 space-y-2">
          <div>
            <div className="label-mono mb-1">Threshold</div>
            <p className="text-sm text-ink-600 leading-relaxed">{result.target}</p>
          </div>
          <div>
            <div className="label-mono mb-1">Current</div>
            <p
              className={clsx(
                'text-sm font-mono leading-relaxed',
                result.status === 'pass' && 'text-ink-700',
                result.status === 'fail' && 'text-coral-600',
                result.status === 'skip' && 'text-slate-700'
              )}
            >
              {result.actual}
            </p>
          </div>
          <a
            href={`#cat-${result.category}-detail`}
            data-print-hide
            className="inline-block text-xs text-coral-500 hover:text-coral-600 mt-1"
          >
            Open full detail →
          </a>
        </div>
      </div>
    </motion.div>
  );
}
