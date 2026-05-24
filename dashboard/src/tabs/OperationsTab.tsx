// Operations tab — deployment runbook, observability, handoff, agent
// contract, and codebase reference cards.

import type { DashboardSnapshot } from '../data/types';
import { SubNav, type SubNavItem } from '../components/Tabs/SubNav';
import { MarkdownDocument } from '../components/Markdown/MarkdownDocument';
import { SectionHeading } from '../components/SectionHeading';
import { repoLink } from '../lib/repo';
import { ExternalLink, Lock, Network, GitMerge, Code2, Layers } from 'lucide-react';

import deploymentMd from '../../data/docs/deployment.md?raw';
import observabilityMd from '../../data/docs/collab-observability.md?raw';
import handoffMd from '../../data/docs/next-session.md?raw';
import agentsMd from '../../data/docs/agents.md?raw';

const SUBNAV: SubNavItem[] = [
  { id: 'ops-deployment', label: 'Deployment' },
  { id: 'ops-observability', label: 'Observability' },
  { id: 'ops-handoff', label: 'Handoff' },
  { id: 'ops-agents', label: 'Agent contract' },
  { id: 'ops-codebase', label: 'Codebase reference' },
];

interface DeepDiveCard {
  Icon: React.ElementType;
  title: string;
  description: string;
  path: string;
}

const DEEP_DIVES: DeepDiveCard[] = [
  {
    Icon: Lock,
    title: 'Authentication providers',
    description: 'How Ship\'s auth stack composes session cookies, CSRF tokens, and the conditional bypass for Bearer tokens.',
    path: 'orientation/deep-dives/auth-providers.md',
  },
  {
    Icon: Network,
    title: 'Real-time collaboration (WebSockets + Yjs)',
    description: 'WebSocket upgrade routing, Yjs CRDT sync protocol, persistence debouncing, and the failure modes the observability counters watch for.',
    path: 'orientation/deep-dives/real-time-collaboration.md',
  },
  {
    Icon: GitMerge,
    title: 'Request flow & authentication',
    description: 'End-to-end trace of an authenticated request — React component → fetch → Express route → Postgres query → response.',
    path: 'orientation/deep-dives/request-flow-and-auth.md',
  },
  {
    Icon: Code2,
    title: 'TypeScript patterns',
    description: 'The TS idioms used across the monorepo: discriminated unions, branded IDs, exhaustive switches, and the type-safety bypasses we monitor.',
    path: 'orientation/deep-dives/typescript-patterns.md',
  },
  {
    Icon: Layers,
    title: 'Unified document model (overview)',
    description: 'High-level view of the single-table document model: how one table serves wikis, issues, projects, programs, sprints, and people.',
    path: 'orientation/deep-dives/unified-document-model.md',
  },
  {
    Icon: Layers,
    title: 'Unified document model (explained)',
    description: 'Deeper walk through the schema: properties JSONB, document_associations junction, type-specific behaviors, and the JSONB index strategy.',
    path: 'orientation/deep-dives/unified-document-model-explained.md',
  },
];

interface Props {
  snapshot: DashboardSnapshot;
}

export function OperationsTab({ snapshot: _snapshot }: Props) {
  return (
    <div>
      <SubNav items={SUBNAV} />
      <div className="space-y-12">
        <section id="ops-deployment" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Runbook"
            title="Deployment"
            subtitle="How the Ship platform is deployed, where the artifacts live, and how to operate the box."
          />
          <div className="surface p-6 md:p-8">
            <MarkdownDocument source={deploymentMd} stripFirstH1 />
          </div>
        </section>

        <section id="ops-observability" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Instrumentation"
            title="Observability"
            subtitle="The collaboration subsystem's exposed counters (Prometheus + JSON) and what they tell you."
          />
          <div className="surface p-6 md:p-8">
            <MarkdownDocument source={observabilityMd} stripFirstH1 />
          </div>
        </section>

        <section id="ops-handoff" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Session log"
            title="Handoff"
            subtitle="The most recent operational context — what landed, what's in flight, what to watch for."
          />
          <div className="surface p-6 md:p-8">
            <MarkdownDocument source={handoffMd} stripFirstH1 />
          </div>
        </section>

        <section id="ops-agents" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Process"
            title="Agent collaboration contract"
            subtitle="Multi-agent collaboration rules — branch-per-task, parallel subagents, when to ask vs. decide. Operational discipline for AI-assisted development."
          />
          <div className="surface p-6 md:p-8">
            <MarkdownDocument source={agentsMd} stripFirstH1 />
          </div>
        </section>

        <section id="ops-codebase" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Reference reading"
            title="Codebase deep dives"
            subtitle="Architectural explainers for engineers picking up the codebase. Linked out to GitLab — not rendered inline (they're for orientation, not stakeholder review)."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEEP_DIVES.map((d) => {
              const Icon = d.Icon;
              return (
                <a
                  key={d.path}
                  href={repoLink(d.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="surface p-5 hover:shadow-tile-hover transition-shadow group"
                >
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-cream-soft grid place-items-center text-ink-500 ring-1 ring-inset ring-ink-100 shrink-0">
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-ink-700 group-hover:text-ink-800">
                          {d.title}
                        </h3>
                        <ExternalLink size={11} className="text-ink-400 shrink-0" />
                      </div>
                      <p className="text-sm text-ink-500 leading-relaxed">{d.description}</p>
                    </div>
                  </div>
                  <div className="font-mono text-[10px] text-ink-400 mt-2 pl-12">{d.path}</div>
                </a>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
