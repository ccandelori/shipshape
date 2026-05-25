// One radial gauge — ring fills clockwise from 12 o'clock, length encodes
// margin-of-safety as a fraction of full circle. Status drives the fill
// color; the tightest-margin "watch" item gets a coral notch at the end
// of its arc, drawing attention without a third color.

import { motion } from 'framer-motion';
import clsx from 'clsx';
import type { CheckStatus } from '../data/types';

interface Props {
  category: number;
  name: string;
  status: CheckStatus;
  /** 0-100 margin percentage. null = unknown/skip. */
  marginPct: number | null;
  /** True if this is the watch item (tightest passing margin). */
  isWatch?: boolean;
  /** Click to drill into this category's detail. */
  onActivate?: () => void;
  /** Optional hover handler — caller can surface caption text in a shared region. */
  onHover?: (hovered: boolean) => void;
  index?: number;
}

const SIZE = 112;
const STROKE = 9;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

const INK = '#1B2030';
const CORAL = '#FF6E52';
const TRACK = '#E7EAF1';
const SKIP = 'rgba(27, 32, 48, 0.18)';

function fillColor(status: CheckStatus, isWatch: boolean): string {
  if (status === 'fail') return CORAL;
  if (status === 'skip') return SKIP;
  return isWatch ? CORAL : INK;
}

export function RadialDial({
  category,
  name,
  status,
  marginPct,
  isWatch = false,
  onActivate,
  onHover,
  index = 0,
}: Props) {
  // Compute arc length. For fail, show ~5% to hint "barely any room left".
  // For skip, show 0 (track only, no fill).
  const displayPct = (() => {
    if (status === 'fail') return 5;
    if (status === 'skip' || marginPct === null) return 0;
    return Math.max(Math.min(marginPct, 100), 0);
  })();
  const arcLength = (CIRCUMFERENCE * displayPct) / 100;

  // Notch coordinates at the end of the arc (for watch indicator).
  const watchAngle = -Math.PI / 2 + (2 * Math.PI * displayPct) / 100;
  const notchX = CENTER + RADIUS * Math.cos(watchAngle);
  const notchY = CENTER + RADIUS * Math.sin(watchAngle);

  return (
    <motion.button
      type="button"
      onClick={onActivate}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 + index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="group flex flex-col items-center gap-2 px-1 py-2 rounded-tile focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-400 hover:bg-cream-soft transition-colors"
      title={`Open ${name} in Categories tab`}
      aria-label={`${name}: ${
        status === 'skip' || marginPct === null
          ? 'no signal'
          : status === 'fail'
            ? 'breached'
            : `${marginPct.toFixed(1)}% headroom`
      }${isWatch ? ', watch item' : ''}`}
    >
      <div className="relative">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="block"
        >
          {/* Track ring */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={TRACK}
            strokeWidth={STROKE}
            strokeDasharray={status === 'skip' ? '3 5' : undefined}
            opacity={status === 'skip' ? 0.6 : 1}
          />

          {/* Foreground arc — animates from 0 to target length */}
          {status !== 'skip' && (
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={fillColor(status, isWatch)}
              strokeWidth={STROKE}
              strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${CIRCUMFERENCE}` }}
              animate={{ strokeDasharray: `${arcLength} ${CIRCUMFERENCE}` }}
              transition={{
                duration: 1.1,
                delay: 0.15 + index * 0.06,
                ease: [0.16, 1, 0.3, 1],
              }}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          )}

          {/* Watch notch — small filled circle at the arc tip, coral, only
              when this is the watch dial and there's a meaningful arc */}
          {isWatch && status === 'pass' && displayPct > 0 && (
            <motion.circle
              cx={notchX}
              cy={notchY}
              r={3.5}
              fill={CORAL}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 1.0 + index * 0.06 }}
            />
          )}

          {/* Center text — big margin % for pass, status icon for fail/skip */}
          <g pointerEvents="none">
            {status === 'pass' && marginPct !== null && (
              <text
                x={CENTER}
                y={CENTER}
                textAnchor="middle"
                dominantBaseline="central"
                fill={INK}
                fontSize={20}
                fontWeight={700}
                fontFamily="Inter, system-ui, sans-serif"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {marginPct >= 99.5 ? '100' : marginPct.toFixed(0)}
                <tspan fontSize={11} dx={1} dy={-6} fill="#6C7387">
                  %
                </tspan>
              </text>
            )}
            {status === 'fail' && (
              <text
                x={CENTER}
                y={CENTER}
                textAnchor="middle"
                dominantBaseline="central"
                fill={CORAL}
                fontSize={13}
                fontWeight={700}
                letterSpacing="0.05em"
              >
                FAIL
              </text>
            )}
            {status === 'skip' && (
              <text
                x={CENTER}
                y={CENTER}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#A1A3B0"
                fontSize={12}
                fontWeight={600}
                letterSpacing="0.05em"
              >
                SKIP
              </text>
            )}
          </g>
        </svg>
      </div>

      {/* Label below the dial */}
      <div className="text-center -mt-1 px-1">
        <div className="font-mono text-[10px] text-ink-400 uppercase tracking-wider leading-none mb-1">
          Cat {category}
          {isWatch && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-coral-500 normal-case font-sans font-semibold">
              <span className="w-1 h-1 rounded-full bg-coral-500" />
              watch
            </span>
          )}
        </div>
        <div
          className={clsx(
            'text-xs font-semibold leading-tight transition-colors',
            'text-ink-700 group-hover:text-ink-800'
          )}
        >
          {name}
        </div>
      </div>
    </motion.button>
  );
}
