// Tiny SVG sparkline — renders a category's margin-of-safety trajectory
// as a smoothed line with status-coded dots at each run. Hover any dot
// for the timestamp + value.

import { useState } from 'react';
import clsx from 'clsx';
import type { TrajectoryPoint } from '../data/types';
import { formatAbsolute } from '../lib/format';

interface Props {
  points: TrajectoryPoint[];
  width?: number;
  height?: number;
  /** Show dots over the line (otherwise just a smooth line). */
  showDots?: boolean;
  className?: string;
}

const PAD = 3;

function statusDotFill(status: TrajectoryPoint['status']): string {
  if (status === 'fail') return '#FF6E52';
  if (status === 'skip') return '#A8AFC2';
  return '#1B2030';
}

export function Sparkline({
  points,
  width = 80,
  height = 24,
  showDots = true,
  className,
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div
        className={clsx('inline-flex items-center text-[10px] text-ink-400 font-mono', className)}
        style={{ width, height }}
      >
        no history
      </div>
    );
  }

  if (points.length === 1) {
    // Single-point: just a dot, no line.
    return (
      <svg width={width} height={height} className={clsx('block', className)}>
        <circle
          cx={width / 2}
          cy={height / 2}
          r={3}
          fill={statusDotFill(points[0]!.status)}
        />
      </svg>
    );
  }

  // Pick range from margins; if all points are null, fall back to a flat line.
  const margins = points.map((p) => p.marginPct);
  const numericMargins = margins.filter((m): m is number => m !== null);
  const minM = numericMargins.length > 0 ? Math.min(...numericMargins) : 0;
  const maxM = numericMargins.length > 0 ? Math.max(...numericMargins) : 100;
  // Add some padding to the range so the line isn't always at the extremes.
  const range = Math.max(maxM - minM, 5);
  const top = Math.min(maxM + range * 0.15, 100);
  const bottom = Math.max(minM - range * 0.15, 0);

  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  function yFor(margin: number | null): number {
    if (margin === null) return height / 2; // skip/fail neutral position
    const t = (margin - bottom) / Math.max(top - bottom, 1);
    return PAD + (1 - t) * innerH;
  }

  const pathPoints = points.map((p, i) => ({
    x: PAD + i * stepX,
    y: yFor(p.marginPct),
    point: p,
  }));

  const pathD = pathPoints
    .map((pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`))
    .join(' ');

  // Area fill: same path but closed at the bottom.
  const areaD = `${pathD} L ${pathPoints[pathPoints.length - 1]!.x} ${height - PAD} L ${pathPoints[0]!.x} ${height - PAD} Z`;

  const hovered = hoverIdx !== null ? pathPoints[hoverIdx] : null;

  return (
    <span className={clsx('inline-block relative', className)} style={{ width, height }}>
      <svg width={width} height={height} className="block overflow-visible">
        <path d={areaD} fill="rgba(27, 32, 48, 0.06)" />
        <path
          d={pathD}
          fill="none"
          stroke="#1B2030"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showDots &&
          pathPoints.map((pt, i) => (
            <g key={i}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={i === pathPoints.length - 1 ? 2.5 : 1.5}
                fill={statusDotFill(pt.point.status)}
              />
              {/* Larger transparent hit area for hover */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={6}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ cursor: 'crosshair' }}
              />
            </g>
          ))}
      </svg>
      {hovered && (
        <span
          className="absolute z-10 px-2 py-1 rounded bg-ink-800 text-cream text-[10px] font-mono whitespace-nowrap shadow-tooltip pointer-events-none"
          style={{
            left: Math.min(Math.max(hovered.x - 60, -40), width - 80),
            top: -34,
          }}
        >
          {hovered.point.marginPct !== null
            ? `${hovered.point.marginPct.toFixed(1)}% · `
            : `${hovered.point.status} · `}
          {formatAbsolute(hovered.point.startedAt)}
        </span>
      )}
    </span>
  );
}
