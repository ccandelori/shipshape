import { GitMerge, ExternalLink } from 'lucide-react';
import type { DashboardSnapshot } from '../data/types';
import { formatAbsolute } from '../lib/format';
import { repoLink } from '../lib/repo';

interface Props {
  snapshot: DashboardSnapshot;
}

export function Footer({ snapshot }: Props) {
  return (
    <footer className="mt-10 pt-6 border-t hairline border-t flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div className="label-mono mb-1">Ship — Platform Health</div>
        <div className="text-xs text-ink-400">
          v{snapshot.meta.dashboardVersion} · snapshot built{' '}
          <span className="font-mono">{formatAbsolute(snapshot.meta.generatedAt)}</span>
          {snapshot.meta.liveUpdatedAt && (
            <span>
              {' · live '}
              <span className="font-mono">{formatAbsolute(snapshot.meta.liveUpdatedAt)}</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <a
          href={snapshot.repoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-700 transition-colors"
        >
          <GitMerge size={12} />
          Repository
        </a>
        <a
          href={snapshot.deployedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-700 transition-colors"
        >
          <ExternalLink size={12} />
          Application
        </a>
        <a
          href={repoLink('orientation/shipshape-report.md')}
          target="_blank"
          rel="noreferrer"
          className="text-ink-500 hover:text-ink-700 transition-colors"
        >
          Raw report (md)
        </a>
        <a
          href={repoLink('orientation/shipshape-report.json')}
          target="_blank"
          rel="noreferrer"
          className="text-ink-500 hover:text-ink-700 transition-colors"
        >
          Raw report (json)
        </a>
        <a
          href={repoLink('orientation/deployment.md')}
          target="_blank"
          rel="noreferrer"
          className="text-ink-500 hover:text-ink-700 transition-colors"
        >
          Runbook
        </a>
      </div>
    </footer>
  );
}
