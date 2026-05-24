import { GitBranch, GitCommit, Clock, Activity } from 'lucide-react';
import type { DashboardSnapshot } from '../data/types';
import { formatAbsolute, formatRelative, formatDuration } from '../lib/format';

interface Props {
  snapshot: DashboardSnapshot;
  isLive: boolean;
  lastUpdated: string | null;
}

export function LiveStatus({ snapshot, isLive, lastUpdated }: Props) {
  return (
    <div className="surface p-6 md:p-8 relative overflow-hidden">
      {/* Decorative wavy dots — echoes Twisty's Unlock Premium tile */}
      <div className="absolute -right-12 -bottom-10 opacity-25 pointer-events-none">
        <DotsPattern />
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 label-mono mb-3">
          <Activity size={11} />
          Status
        </div>
        <div className="text-xl font-bold text-ink-700 tracking-tight leading-tight">
          {isLive ? 'Live data — fresh from the API' : 'Snapshot — frozen at build time'}
        </div>
        <p className="text-sm text-ink-400 mt-1 max-w-sm leading-relaxed">
          {isLive
            ? 'Showing the most recent shipshape run from the deployed instance.'
            : 'Run a fresh check (top-right) to refresh against the current branch.'}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <MetaRow icon={GitBranch} label="Branch" value={snapshot.shipshape.branch} mono />
          <MetaRow icon={GitCommit} label="Commit" value={snapshot.shipshape.sha.slice(0, 12)} mono />
          <MetaRow
            icon={Clock}
            label="Last run"
            value={formatRelative(snapshot.shipshape.startedAt)}
            sub={formatAbsolute(snapshot.shipshape.startedAt)}
          />
          <MetaRow
            icon={Activity}
            label="Duration"
            value={formatDuration(snapshot.shipshape.durationMs)}
            sub={lastUpdated ? `live ${formatRelative(lastUpdated)}` : 'snapshot data'}
          />
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  sub,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-tile bg-cream-soft p-3">
      <div className="flex items-center gap-1.5 text-ink-400 mb-1">
        <Icon size={11} />
        <span className="label-mono">{label}</span>
      </div>
      <div className={mono ? 'font-mono text-sm text-ink-700' : 'text-sm font-semibold text-ink-700'}>
        {value}
      </div>
      {sub && <div className="text-xs text-ink-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function DotsPattern() {
  // 12x12 grid of small circles forming a quarter-spiral feel
  const dots: Array<{ cx: number; cy: number; r: number; opacity: number }> = [];
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 14; col++) {
      const dist = Math.sqrt(row * row + col * col);
      const opacity = Math.max(0, 1 - dist / 14);
      if (opacity > 0.1) {
        dots.push({
          cx: col * 14 + 6,
          cy: row * 14 + 6,
          r: 1.5 + opacity * 1.5,
          opacity: opacity * 0.6,
        });
      }
    }
  }
  return (
    <svg width="220" height="220" viewBox="0 0 220 220">
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill="#1B2030" opacity={d.opacity} />
      ))}
    </svg>
  );
}
