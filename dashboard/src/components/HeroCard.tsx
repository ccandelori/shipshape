import { motion } from 'framer-motion';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import type { DashboardSnapshot } from '../data/types';
import { LollipopChart } from './LollipopChart';
import { AnimatedNumber } from './AnimatedNumber';

interface Props {
  snapshot: DashboardSnapshot;
}

export function HeroCard({ snapshot }: Props) {
  const passing = snapshot.shipshape.results.filter((r) => r.status === 'pass').length;
  const total = snapshot.shipshape.results.length;
  const healthyPct = Math.round((passing / total) * 100);

  // Find the tightest margin among passing categories — the one closest to
  // breaching. That's the watch-item the dashboard should surface.
  const passingDetails = snapshot.categoryDetails.filter((d) => {
    const result = snapshot.shipshape.results.find((r) => r.category === d.category);
    return result?.status === 'pass' && d.marginPct !== null;
  });
  const tightest = [...passingDetails].sort(
    (a, b) => (a.marginPct ?? Infinity) - (b.marginPct ?? Infinity)
  )[0];
  const tightestName = tightest
    ? snapshot.shipshape.results.find((r) => r.category === tightest.category)?.name
    : null;

  return (
    <motion.div
      id="scoreboard"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="surface p-6 md:p-8 h-full flex flex-col"
    >
      <header className="flex items-start gap-4 mb-4">
        <div className="w-11 h-11 rounded-xl bg-cream-ring grid place-items-center text-ink-600">
          <TrendingUp size={20} strokeWidth={2.2} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-ink-700 tracking-tight leading-tight">
            Quality at a glance
          </h1>
          <p className="text-sm md:text-base text-ink-400 mt-1 leading-relaxed max-w-lg">
            Bar height = % headroom below threshold. Taller bar means more safety; shorter bar means
            closer to breaching. Highlighted dot is the tightest margin.
          </p>
        </div>
        <div className="hidden md:block pill pill-muted font-mono">Snapshot</div>
      </header>

      <div className="flex-1 min-h-[260px] mt-2">
        <LollipopChart snapshot={snapshot} highlightCategory={tightest?.category} />
      </div>

      <footer className="flex items-end justify-between mt-6 pt-6 border-t hairline border-t gap-6">
        <div>
          <div className="text-mega leading-none text-ink-700">
            <AnimatedNumber value={passing} />
            <span className="text-ink-300">/{total}</span>
          </div>
          <div className="text-sm text-ink-400 mt-2 max-w-[16ch] leading-snug">
            Categories healthy ({healthyPct}% of monitored gates).
          </div>
        </div>
        {tightest && (
          <div className="text-right">
            <div className="label-mono mb-1 flex items-center gap-1.5 justify-end">
              <AlertTriangle size={11} className="text-coral-500" />
              Tightest margin
            </div>
            <div className="font-bold text-3xl text-coral-500 tabular-nums">
              <AnimatedNumber value={tightest.marginPct ?? 0} decimals={1} />
              <span className="text-2xl">%</span>
            </div>
            <div className="text-xs text-ink-400 mt-1 max-w-[22ch] leading-snug">
              {tightestName} — closest to breaching its threshold
            </div>
          </div>
        )}
      </footer>
    </motion.div>
  );
}
