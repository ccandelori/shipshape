// Compact horizontal live-status strip for the Overview's utility row.
// Replaces the boxy 2x2 grid LiveStatus card on the panoramic layout.

import { GitBranch, GitCommit, Clock, Activity, Radio } from 'lucide-react';
import clsx from 'clsx';
import type { DashboardSnapshot } from '../data/types';
import { formatAbsolute, formatRelative, formatDuration } from '../lib/format';

interface Props {
  snapshot: DashboardSnapshot;
  isLive: boolean;
  lastUpdated: string | null;
}

export function LiveStatusStrip({ snapshot, isLive, lastUpdated }: Props) {
  return (
    <div className="surface px-5 md:px-7 py-4 flex items-center gap-x-8 gap-y-3 flex-wrap">
      {/* Left: live/snapshot status with pulsing dot */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span
          className={clsx(
            'inline-flex items-center justify-center w-2.5 h-2.5 rounded-full shrink-0',
            isLive ? 'bg-coral-500 animate-pulse' : 'bg-ink-700/40'
          )}
        />
        <div>
          <div className="text-sm font-semibold text-ink-700 leading-tight">
            {isLive ? 'Live' : 'Snapshot'}
          </div>
          <div className="text-[11px] text-ink-400 leading-tight">
            {isLive ? 'fresh from API' : 'baked at build time'}
          </div>
        </div>
      </div>

      <Divider />

      <Meta icon={GitBranch} label="Branch" value={snapshot.shipshape.branch} mono />
      <Meta icon={GitCommit} label="Commit" value={snapshot.shipshape.sha.slice(0, 12)} mono />
      <Meta
        icon={Clock}
        label="Last run"
        value={formatRelative(snapshot.shipshape.startedAt)}
        sub={formatAbsolute(snapshot.shipshape.startedAt)}
      />
      <Meta
        icon={Activity}
        label="Duration"
        value={formatDuration(snapshot.shipshape.durationMs)}
      />
      <Meta
        icon={Radio}
        label="Archived runs"
        value={String(snapshot.history.runCount)}
        sub={lastUpdated ? `live ${formatRelative(lastUpdated)}` : undefined}
      />
    </div>
  );
}

function Divider() {
  return <span className="hidden md:inline-block w-px h-8 bg-ink-100 shrink-0" />;
}

function Meta({
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
    <div className="shrink-0">
      <div className="flex items-center gap-1.5 text-ink-400">
        <Icon size={11} />
        <span className="label-mono">{label}</span>
      </div>
      <div
        className={clsx(
          'leading-tight mt-0.5',
          mono ? 'font-mono text-sm text-ink-700' : 'text-sm font-semibold text-ink-700'
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-ink-400 mt-0.5">{sub}</div>}
    </div>
  );
}
