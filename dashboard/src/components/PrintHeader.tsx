import type { DashboardSnapshot } from '../data/types';
import { formatAbsolute, formatDuration } from '../lib/format';

interface Props {
  snapshot: DashboardSnapshot;
}

// Rendered only in print (toggled via `.print-only` in index.css).
// Replaces the on-screen TopNav with a static report header — title,
// generated date, branch/sha, run duration, and overall status.
export function PrintHeader({ snapshot }: Props) {
  const passing = snapshot.shipshape.results.filter((r) => r.status === 'pass').length;
  const total = snapshot.shipshape.results.length;
  const overall = snapshot.shipshape.overallStatus;

  return (
    <div className="print-only mb-6 pb-4 border-b-2 border-ink-700">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h1 style={{ fontSize: '20pt', fontWeight: 700, margin: 0 }}>
          Ship — Platform Health Report
        </h1>
        <span style={{ fontSize: '10pt', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {overall === 'pass' ? `${passing}/${total} healthy` : overall.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: '9pt', color: '#494F62' }}>
        Generated {formatAbsolute(snapshot.meta.generatedAt)} · Branch{' '}
        <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{snapshot.shipshape.branch}</span> · Commit{' '}
        <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{snapshot.shipshape.sha.slice(0, 12)}</span> ·
        Run took {formatDuration(snapshot.shipshape.durationMs)} · Source{' '}
        <a href={snapshot.repoUrl} style={{ color: '#494F62' }}>
          {snapshot.repoUrl.replace(/^https?:\/\//, '')}
        </a>
      </div>
    </div>
  );
}
