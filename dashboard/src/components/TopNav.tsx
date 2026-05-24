import { Play, Loader2, ExternalLink, Printer, FileText } from 'lucide-react';
import clsx from 'clsx';
import type { DashboardSnapshot } from '../data/types';
import type { RunState } from '../hooks/useLiveSnapshot';

interface Props {
  snapshot: DashboardSnapshot;
  isLive: boolean;
  onRunLive: () => void;
  runState: RunState;
  onExportFullReport: () => void;
}

const NAV_LINKS = [
  { href: '#scoreboard', label: 'Overview' },
  { href: '#deep-dives', label: 'Detail' },
  { href: '#operations', label: 'Operations' },
];

export function TopNav({ snapshot, isLive, onRunLive, runState, onExportFullReport }: Props) {
  const isRunning = runState.kind === 'starting' || runState.kind === 'running';
  return (
    <nav className="flex items-center justify-between gap-6 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-ink-700 grid place-items-center text-coral-500 font-bold text-lg">
          ◉
        </div>
        <div>
          <div className="font-semibold text-ink-700 leading-tight">SHIP</div>
          <div className="label-mono leading-none">Platform health</div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-1">
        {NAV_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="px-3 py-1.5 text-sm text-ink-500 hover:text-ink-700 transition-colors"
          >
            {l.label}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {isLive && (
          <span className="pill pill-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-coral-500 animate-pulse" />
            LIVE
          </span>
        )}
        <span className="pill pill-outline font-mono">
          {snapshot.shipshape.branch}@{snapshot.shipshape.sha.slice(0, 7)}
        </span>
        <a
          href={snapshot.deployedUrl}
          target="_blank"
          rel="noreferrer"
          className="pill pill-outline hover:bg-cream transition-colors no-print"
          title="Open the deployed application"
        >
          <ExternalLink size={11} />
          App
        </a>
        <button
          onClick={() => window.print()}
          className="pill pill-outline hover:bg-cream transition-colors no-print"
          title="Print or save the current tab as PDF"
        >
          <Printer size={11} />
          Print tab
        </button>
        <button
          onClick={onExportFullReport}
          className="pill pill-outline hover:bg-cream transition-colors no-print"
          title="Export every tab as a single PDF report"
        >
          <FileText size={11} />
          Full report
        </button>
        <button
          onClick={onRunLive}
          disabled={isRunning}
          className={clsx(
            'inline-flex items-center gap-2 px-4 py-2 rounded-chip text-sm font-medium transition-colors no-print',
            isRunning
              ? 'bg-slate-100 text-ink-400 cursor-wait'
              : 'bg-ink-700 text-cream hover:bg-ink-800'
          )}
          aria-label="Run live shipshape check"
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {isRunning ? (runState.kind === 'starting' ? 'starting…' : 'running…') : 'Run check'}
        </button>
      </div>
    </nav>
  );
}
