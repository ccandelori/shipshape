// Remediation Impact — a transformation ledger. One row per audit category,
// each showing the headline metric before the audit and after Phase 2. A
// proportional rail encodes the change: ink is the stable/base portion, coral
// is the magnitude of the change (removed for reductions and eliminations,
// added for increases). Longer coral always means a bigger win, so the eye can
// rank the wins by scanning coral lengths. Click any row to drill into that
// category's panel.

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { DashboardSnapshot, BeforeAfter } from '../data/types';
import { useDrillToCategory } from '../hooks/useDrillToCategory';

type Mode = 'reduce' | 'eliminate' | 'increase';

function modeOf(ba: BeforeAfter): Mode {
  if (ba.after === 0 && ba.before > 0) return 'eliminate';
  if (ba.betterIs === 'higher') return 'increase';
  return 'reduce';
}

// Compact numeric format: integers as-is, sub-1 values to 3 sig decimals
// (trailing zeros trimmed), everything else to 1 decimal under 10 / 0 above.
function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) < 1) return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return n < 10 ? n.toFixed(1) : n.toFixed(0);
}

// Units short enough to sit inline beside the number (kB, ms). Word units
// (markers) and empty units are carried by the caption instead.
function inlineUnit(unit: string): string {
  return unit.length > 0 && unit.length <= 3 ? ` ${unit}` : '';
}

function deltaLabel(ba: BeforeAfter, mode: Mode): string {
  if (mode === 'increase') return `+${fmt(ba.after - ba.before)}`;
  if (mode === 'eliminate') return '−100%';
  return `−${Math.round(ba.reductionPct)}%`;
}

interface Props {
  snapshot: DashboardSnapshot;
}

export function RemediationImpact({ snapshot }: Props) {
  const drill = useDrillToCategory();

  const rows = snapshot.shipshape.results
    .map((r) => {
      const detail = snapshot.categoryDetails.find((d) => d.category === r.category);
      return detail?.beforeAfter ? { category: r.category, name: r.name, ba: detail.beforeAfter } : null;
    })
    .filter((row): row is { category: number; name: string; ba: BeforeAfter } => row !== null);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="surface p-6 md:p-8"
      aria-label="Remediation impact by category"
    >
      <header className="flex items-end justify-between gap-6 flex-wrap mb-6">
        <div>
          <div className="label-mono mb-1">Audited &rarr; remediated</div>
          <h2 className="text-2xl md:text-3xl font-bold text-ink-700 tracking-tight leading-tight">
            Remediation impact
          </h2>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed max-w-[20rem] text-right">
          Each category&apos;s headline metric, before the audit and after Phase 2.
          <span className="block mt-0.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-coral-500 align-middle mr-1" />
            <span className="align-middle">marks the size of the change.</span>
          </span>
        </p>
      </header>

      <div className="divide-y hairline">
        {rows.map((row, i) => {
          const { ba } = row;
          const mode = modeOf(ba);
          const max = Math.max(ba.before, ba.after);
          const min = Math.min(ba.before, ba.after);
          const inkPct = max > 0 ? (min / max) * 100 : 0;
          const coralPct = 100 - inkPct;
          const u = inlineUnit(ba.unit);
          const ease = [0.16, 1, 0.3, 1] as const;
          const delay = 0.12 + i * 0.06;

          return (
            <button
              key={row.category}
              type="button"
              onClick={() => drill(row.category)}
              title={`Open ${row.name} in Categories tab`}
              className="group w-full grid grid-cols-[1fr_auto] sm:grid-cols-[14rem_1fr_auto] items-center gap-x-4 gap-y-1 py-3.5 text-left -mx-2 px-2 rounded-tile hover:bg-cream-soft transition-colors"
            >
              {/* Category + metric caption */}
              <div className="min-w-0 row-start-1 col-start-1">
                <div className="label-mono mb-0.5">Cat {row.category}</div>
                <div className="font-semibold text-ink-700 text-sm leading-tight">{row.name}</div>
                <div className="text-xs text-ink-400 leading-tight truncate mt-0.5">{ba.label}</div>
              </div>

              {/* Transformation rail */}
              <div className="hidden sm:flex items-center row-start-1 col-start-2 self-center">
                <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-cream ring-1 ring-inset ring-ink-100">
                  <motion.div
                    className="h-full bg-ink-700"
                    style={{ width: `${inkPct}%`, transformOrigin: 'left' }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.6, delay, ease }}
                  />
                  <motion.div
                    className="h-full bg-coral-500"
                    style={{ width: `${coralPct}%`, transformOrigin: 'left' }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.6, delay: delay + 0.08, ease }}
                  />
                </div>
              </div>

              {/* Before -> after values + delta chip */}
              <div className="flex items-center justify-end gap-3 row-start-1 col-start-2 sm:col-start-3 whitespace-nowrap">
                <div className="tabular-nums text-sm">
                  <span className="text-ink-400">
                    {fmt(ba.before)}
                    {u}
                  </span>
                  <span className="text-ink-300 mx-1.5" aria-hidden>
                    &rarr;
                  </span>
                  <span className="text-ink-800 font-semibold">
                    {fmt(ba.after)}
                    {u}
                  </span>
                </div>
                <span
                  className={clsx(
                    'inline-flex items-center justify-center min-w-[3.25rem] px-2 py-0.5 rounded-chip font-mono text-xs font-semibold tabular-nums',
                    mode === 'increase'
                      ? 'bg-ink-700/[0.06] text-ink-700'
                      : 'bg-coral-500/10 text-coral-600'
                  )}
                >
                  {deltaLabel(ba, mode)}
                </span>
                <ChevronRight
                  size={14}
                  className="text-ink-300 group-hover:text-coral-500 transition-colors shrink-0 no-print"
                />
              </div>
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}
