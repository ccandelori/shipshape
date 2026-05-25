import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import type { DashboardSnapshot } from '../data/types';
import { AnimatedNumber } from './AnimatedNumber';
import { InfoTooltip } from './InfoTooltip';
import { RadialDial } from './RadialDial';
import { useDrillToCategory } from '../hooks/useDrillToCategory';

interface Props {
  snapshot: DashboardSnapshot;
}

export function HeroCard({ snapshot }: Props) {
  const drill = useDrillToCategory();
  const [hoveredCategory, setHoveredCategory] = useState<number | null>(null);

  const passing = snapshot.shipshape.results.filter((r) => r.status === 'pass').length;
  const total = snapshot.shipshape.results.length;
  const healthyPct = Math.round((passing / total) * 100);

  // Identify the tightest passing-margin category — the watch item.
  const tightest = useMemo(() => {
    const passingDetails = snapshot.categoryDetails.filter((d) => {
      const r = snapshot.shipshape.results.find((res) => res.category === d.category);
      return r?.status === 'pass' && d.marginPct !== null;
    });
    return [...passingDetails].sort(
      (a, b) => (a.marginPct ?? Infinity) - (b.marginPct ?? Infinity)
    )[0];
  }, [snapshot]);
  const tightestName = tightest
    ? snapshot.shipshape.results.find((r) => r.category === tightest.category)?.name
    : null;

  // Caption follows the hovered dial; falls back to the tightest watch item.
  const captionCat = hoveredCategory ?? tightest?.category;
  const captionDetail = captionCat
    ? snapshot.categoryDetails.find((d) => d.category === captionCat)
    : null;
  const captionResult = captionCat
    ? snapshot.shipshape.results.find((r) => r.category === captionCat)
    : null;

  return (
    <motion.div
      id="scoreboard"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="surface p-6 md:p-8 flex flex-col"
    >
      <header className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl bg-cream-ring grid place-items-center text-ink-600 shrink-0">
          <TrendingUp size={20} strokeWidth={2.2} />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-ink-700 tracking-tight leading-tight">
          Quality at a glance
        </h1>
        <InfoTooltip
          title="How to read these dials"
          body="Each dial's ring shows the headroom that category has below its threshold. A nearly-full ring means lots of safety. A short arc means close to breaching. The coral notch marks the tightest margin: the watch item."
        />
      </header>

      {/* Seven radial dials — one per category */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-2 gap-y-4 justify-items-center">
        {snapshot.shipshape.results.map((r, i) => {
          const detail = snapshot.categoryDetails.find((d) => d.category === r.category);
          return (
            <RadialDial
              key={r.category}
              category={r.category}
              name={r.name}
              status={r.status}
              marginPct={detail?.marginPct ?? null}
              isWatch={tightest?.category === r.category}
              index={i}
              onActivate={() => drill(r.category)}
              onHover={(hovered) => setHoveredCategory(hovered ? r.category : null)}
            />
          );
        })}
      </div>

      {/* Footer — primary stat + a live caption tied to the hovered dial */}
      <footer className="mt-6 pt-6 border-t hairline border-t flex items-baseline justify-between gap-6 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-mega leading-none text-ink-700">
            <AnimatedNumber value={passing} />
            <span className="text-ink-300">/{total}</span>
          </span>
          <span className="text-sm text-ink-500">
            categories healthy <span className="text-ink-400">({healthyPct}%)</span>
          </span>
        </div>
        {captionCat && captionDetail && captionResult && (
          <motion.div
            key={captionCat}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-xs text-ink-500 text-right whitespace-nowrap"
          >
            <span className="label-mono mr-1.5">
              {hoveredCategory === null ? 'Watch' : 'Hovered'}
            </span>
            {captionResult.name}
            {captionDetail.marginPct !== null && (
              <span
                className={
                  hoveredCategory === null
                    ? 'font-mono text-coral-500 ml-1'
                    : 'font-mono text-ink-700 ml-1'
                }
              >
                {captionDetail.marginPct.toFixed(1)}%
              </span>
            )}
          </motion.div>
        )}
        {!captionCat && tightestName && tightest && (
          <div className="text-xs text-ink-500 text-right whitespace-nowrap">
            <span className="label-mono mr-1.5">Watch</span>
            {tightestName}
            <span className="font-mono text-coral-500 ml-1">
              {(tightest.marginPct ?? 0).toFixed(1)}%
            </span>
          </div>
        )}
      </footer>
    </motion.div>
  );
}
