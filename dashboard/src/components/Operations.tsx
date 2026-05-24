import { Wrench, Eye, BookOpen, Server, ChevronRight } from 'lucide-react';
import type { DashboardSnapshot, OperationalArtifact } from '../data/types';
import { repoLink } from '../lib/repo';

const CATEGORY_META = {
  deployment: { Icon: Server, label: 'Deployment', tone: 'bg-ink-700 text-cream' },
  observability: { Icon: Eye, label: 'Observability', tone: 'bg-coral-100 text-coral-600' },
  tooling: { Icon: Wrench, label: 'Tooling', tone: 'bg-sky-100 text-sky-600' },
  handoff: { Icon: BookOpen, label: 'Handoff', tone: 'bg-slate-200 text-slate-700' },
} as const;

interface Props {
  snapshot: DashboardSnapshot;
}

export function Operations({ snapshot }: Props) {
  return (
    <div id="operations" className="surface p-6 md:p-8 scroll-mt-24">
      <header className="flex items-center justify-between mb-5">
        <div>
          <div className="label-mono text-coral-500 mb-1">Operational surface</div>
          <h2 className="text-xl md:text-2xl font-bold text-ink-700 tracking-tight">Reliability tooling</h2>
        </div>
      </header>
      <p className="text-sm text-ink-400 leading-relaxed mb-5 max-w-md">
        Supporting infrastructure behind the numbers above — how the platform is deployed, what is instrumented,
        what runbooks exist.
      </p>

      <div className="divide-y divide-ink-100">
        {snapshot.operations.map((op) => (
          <OperationRow key={op.href} op={op} />
        ))}
      </div>
    </div>
  );
}

function OperationRow({ op }: { op: OperationalArtifact }) {
  const meta = CATEGORY_META[op.category];
  const Icon = meta.Icon;
  const href = repoLink(op.href);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-4 py-4 hover:bg-cream-soft -mx-3 px-3 rounded-tile transition-colors group"
    >
      <div className={`shrink-0 w-10 h-10 rounded-xl grid place-items-center ${meta.tone}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-ink-700 truncate">{op.label}</span>
          <span className="pill pill-muted text-[10px]">{meta.label}</span>
        </div>
        <p className="text-xs text-ink-400 leading-snug line-clamp-2">{op.description}</p>
      </div>
      <ChevronRight size={16} className="text-ink-300 group-hover:text-ink-600 shrink-0" />
    </a>
  );
}
