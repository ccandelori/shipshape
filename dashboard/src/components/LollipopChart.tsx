// Lollipop chart — each category's bar height encodes margin of safety
// (% headroom below threshold). Higher = more safety. Hover any bar to
// inspect its headroom; the default-highlighted bar is the tightest margin.

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { DashboardSnapshot, CheckStatus } from '../data/types';

interface Props {
  snapshot: DashboardSnapshot;
  highlightCategory?: number;
}

function chartValue(status: CheckStatus, margin: number | null): number {
  if (status === 'fail') return 5;
  if (status === 'skip' || margin === null) return 30;
  return 8 + (Math.min(margin, 100) / 100) * 87;
}

function tooltipLabel(status: CheckStatus, margin: number | null): string {
  if (status === 'fail') return 'BREACHED';
  if (status === 'skip' || margin === null) return 'no signal';
  return `${margin.toFixed(1)}% headroom`;
}

export function LollipopChart({ snapshot, highlightCategory }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const activeCategory = hovered ?? highlightCategory;

  const data = snapshot.shipshape.results.map((r) => {
    const detail = snapshot.categoryDetails.find((d) => d.category === r.category);
    const margin = detail?.marginPct ?? null;
    return {
      category: r.category,
      name: r.name,
      status: r.status,
      margin,
      value: chartValue(r.status, margin),
    };
  });

  const width = 700;
  const height = 280;
  const padX = 36;
  const padTop = 50;
  const padBottom = 60;
  const chartH = height - padTop - padBottom;
  const baselineY = height - padBottom;
  const stepX = (width - padX * 2) / Math.max(data.length - 1, 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="Per-category margin of safety. Hover or tap a bar to see its headroom."
      className="block touch-manipulation"
      onMouseLeave={() => setHovered(null)}
    >
      {/* Baseline rule */}
      <line
        x1={padX - 8}
        x2={width - padX + 8}
        y1={baselineY}
        y2={baselineY}
        stroke="#D5DAE6"
        strokeWidth={1}
      />

      {data.map((d, i) => {
        const x = padX + i * stepX;
        const y = baselineY - (d.value / 100) * chartH;
        const isActive = d.category === activeCategory;

        const dotFill =
          d.status === 'fail'
            ? '#FF6E52'
            : d.status === 'skip'
              ? '#A8AFC2'
              : isActive
                ? '#1B2030'
                : '#5E9AD8';

        return (
          <g key={d.category}>
            {/* Stem */}
            <motion.line
              x1={x}
              x2={x}
              initial={{ y1: baselineY, y2: baselineY }}
              animate={{ y1: baselineY, y2: y }}
              transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              stroke={isActive ? '#1B2030' : '#BFC5D5'}
              strokeWidth={isActive ? 1.5 : 1}
              style={{ transition: 'stroke 150ms ease' }}
            />

            {/* Marker dot */}
            <motion.circle
              cx={x}
              initial={{ cy: baselineY, r: 0 }}
              animate={{ cy: y, r: isActive ? 7 : 5 }}
              transition={{
                duration: 0.7,
                delay: 0.15 + i * 0.06,
                ease: [0.16, 1, 0.3, 1],
                r: { duration: 0.15 },
              }}
              fill={dotFill}
              stroke={isActive ? '#FFF' : 'none'}
              strokeWidth={isActive ? 2 : 0}
              style={{ transition: 'fill 150ms ease' }}
            />

            {/* Day-pill (category index) */}
            <motion.circle
              cx={x}
              cy={baselineY + 34}
              r={14}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.06 }}
              fill={isActive ? '#1B2030' : '#EAEDF3'}
              style={{ transition: 'fill 150ms ease' }}
            />
            <motion.text
              x={x}
              y={baselineY + 34}
              textAnchor="middle"
              dominantBaseline="central"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.06 }}
              fill={isActive ? '#F6F4EE' : '#6C7387'}
              fontSize={11}
              fontWeight={600}
              style={{ transition: 'fill 150ms ease' }}
              pointerEvents="none"
            >
              {d.category}
            </motion.text>

            {/* Invisible hit area — full vertical column. Easier to hover than
                the 1px stem. Wraps both bar and day-pill for cohesive UX. */}
            <rect
              x={x - stepX / 2}
              y={0}
              width={stepX}
              height={height}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(d.category)}
              onClick={() => setHovered(d.category)}
              role="button"
              aria-label={`Category ${d.category} — ${d.name}: ${tooltipLabel(d.status, d.margin)}`}
            />
          </g>
        );
      })}

      {/* Tooltip — single instance. Position the wrapping <g> via transform,
          which animates reliably across browsers. The rect + text inside are
          positioned relative to the <g>'s origin. */}
      {(() => {
        const active = data.find((d) => d.category === activeCategory);
        if (!active) return null;
        const idx = data.indexOf(active);
        const x = padX + idx * stepX;
        const y = baselineY - (active.value / 100) * chartH;
        const label = tooltipLabel(active.status, active.margin);
        const w = Math.max(110, label.length * 7);
        return (
          <motion.g
            pointerEvents="none"
            initial={false}
            animate={{ x, y: y - 28 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformBox: 'view-box' }}
          >
            <rect
              x={-w / 2}
              y={-14}
              width={w}
              height={28}
              rx={14}
              fill="#1B2030"
            />
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#F6F4EE"
              fontSize={12}
              fontWeight={600}
              fontFamily="JetBrains Mono, monospace"
            >
              {label}
            </text>
          </motion.g>
        );
      })()}
    </svg>
  );
}
