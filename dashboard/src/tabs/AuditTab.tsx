// Audit tab — executive audit + discovery + compliance scan.
// Sub-nav scroll-jumps between the three sections.

import type { DashboardSnapshot } from '../data/types';
import { SubNav, type SubNavItem } from '../components/Tabs/SubNav';
import { MarkdownDocument } from '../components/Markdown/MarkdownDocument';
import { ComplianceFindings } from '../components/ComplianceFindings';
import { SectionHeading } from '../components/SectionHeading';

import auditExecMd from '../../data/docs/audit-exec.md?raw';
import discoveryMd from '../../data/docs/discovery.md?raw';
import complianceMd from '../../data/docs/compliance.md?raw';

const SUBNAV: SubNavItem[] = [
  { id: 'audit-exec', label: 'Executive audit' },
  { id: 'audit-discovery', label: 'Discovery' },
  { id: 'audit-compliance', label: 'Compliance' },
];

interface Props {
  snapshot: DashboardSnapshot;
}

export function AuditTab({ snapshot }: Props) {
  return (
    <div>
      <SubNav items={SUBNAV} />
      <div className="space-y-12">
        <section id="audit-exec" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Executive summary"
            title="Audit findings"
            subtitle="The pre-remediation assessment of the Ship platform across the seven monitored categories."
          />
          <div className="surface p-6 md:p-8">
            <MarkdownDocument source={auditExecMd} stripFirstH1 />
          </div>
        </section>

        <section id="audit-discovery" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Three things learned"
            title="Discovery"
            subtitle="Surprises, gotchas, and pattern-level insights captured during the audit + remediation."
          />
          <div className="surface p-6 md:p-8">
            <MarkdownDocument source={discoveryMd} stripFirstH1 />
          </div>
        </section>

        <section id="audit-compliance" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Security & compliance"
            title="Secret-scan results"
            subtitle="gitleaks scans across the full tree and scoped to the remediation commits. Inline findings table below the narrative."
          />
          <div className="surface p-6 md:p-8 mb-4">
            <MarkdownDocument source={complianceMd} stripFirstH1 />
          </div>
          <ComplianceFindings summary={snapshot.compliance} />
        </section>
      </div>
    </div>
  );
}
