// Evidence tab — browseable card grid of raw audit artifacts grouped by domain.
// Sub-nav scroll-jumps between API / DB / Bundle / Type Safety / A11y / Compliance.

import type { DashboardSnapshot } from '../data/types';
import { SectionHeading } from '../components/SectionHeading';
import { ArtifactCard } from '../components/Evidence/ArtifactCard';
import { SubNav, type SubNavItem } from '../components/Tabs/SubNav';
import { repoLink } from '../lib/repo';
import { ExternalLink } from 'lucide-react';

interface Props {
  snapshot: DashboardSnapshot;
}

const GROUP_FOLDER: Record<string, string> = {
  api: 'orientation/baselines/api-response-time/',
  db: 'orientation/baselines/',
  bundle: 'orientation/baselines/bundle/',
  type: 'orientation/baselines/type-safety/',
  a11y: 'orientation/baselines/accessibility/',
  compliance: 'orientation/compliance/',
};

export function EvidenceTab({ snapshot }: Props) {
  const subnav: SubNavItem[] = snapshot.evidence.groups.map((g) => ({
    id: `evidence-${g.id}`,
    label: g.label,
    badge: String(g.items.length),
  }));

  return (
    <div>
      <SubNav items={subnav} />
      <SectionHeading
        eyebrow="Raw audit evidence"
        title="Browse the artifacts"
        subtitle="Every number on the dashboard traces back to a file in the repository. The cards below preview the top files in each domain; the full folder is one click away on GitLab."
      />
      <div className="space-y-10">
        {snapshot.evidence.groups.map((group) => (
          <section key={group.id} id={`evidence-${group.id}`} className="scroll-mt-24">
            <header className="flex items-baseline justify-between gap-3 mb-4 pb-2 border-b hairline border-b">
              <div>
                <h2 className="text-xl font-bold text-ink-700 tracking-tight">{group.label}</h2>
                <p className="text-sm text-ink-500 leading-snug mt-0.5">{group.description}</p>
              </div>
              {GROUP_FOLDER[group.id] && (
                <a
                  href={repoLink(GROUP_FOLDER[group.id]!)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-700 whitespace-nowrap"
                >
                  <ExternalLink size={11} />
                  View folder
                </a>
              )}
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((item) => (
                <ArtifactCard key={item.path} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
