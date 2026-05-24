import { ExternalLink } from 'lucide-react';
import { repoLink } from '../lib/repo';

export function BundleEmbed() {
  return (
    <div className="rounded-tile p-4 bg-cream-soft ring-1 ring-inset ring-ink-100">
      <div className="label-mono mb-3 px-2">Interactive treemaps (rollup-plugin-visualizer)</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TreemapCard
          title="Before"
          subtitle="Baseline — 587 kB entry chunk"
          href={repoLink('orientation/baselines/bundle/bundle-baseline.html')}
        />
        <TreemapCard
          title="After"
          subtitle="Post-remediation — 142 kB entry chunk"
          href={repoLink('orientation/baselines/bundle/after-bundle.html')}
        />
      </div>
      <p className="text-xs text-ink-400 mt-3 px-2">
        Treemaps open in a new tab. The "after" file shows the entry chunk shrunk to a shell with
        route-keyed chunks holding the rest — code splitting in action, no functionality removed.
      </p>
    </div>
  );
}

function TreemapCard({ title, subtitle, href }: { title: string; subtitle: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-tile p-4 bg-cream hover:bg-cream-ring ring-1 ring-inset ring-ink-100 hover:ring-ink-200 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-semibold text-ink-700">{title}</span>
        <ExternalLink size={14} className="text-ink-400 group-hover:text-ink-600" />
      </div>
      <div className="text-sm text-ink-500">{subtitle}</div>
    </a>
  );
}
