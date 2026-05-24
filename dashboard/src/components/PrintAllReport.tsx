// Full-report print mode — renders all five tabs sequentially with a TOC
// at the top. Triggered by the "Export full report" button in TopNav.
//
// Each major section gets a page-break-before to land at the top of a page.

import { useEffect, useRef } from 'react';
import type { DashboardSnapshot } from '../data/types';
import { OverviewTab } from '../tabs/OverviewTab';
import { CategoriesTab } from '../tabs/CategoriesTab';
import { EvidenceTab } from '../tabs/EvidenceTab';
import { AuditTab } from '../tabs/AuditTab';
import { OperationsTab } from '../tabs/OperationsTab';
import { PrintHeader } from './PrintHeader';

interface Props {
  snapshot: DashboardSnapshot;
  isLive: boolean;
  lastUpdated: string | null;
  onDone: () => void;
}

interface Section {
  id: string;
  label: string;
  description: string;
}

const SECTIONS: Section[] = [
  { id: 'print-overview', label: 'Overview', description: 'At-a-glance scoreboard, margin of safety, recent run.' },
  { id: 'print-categories', label: 'Per-category detail', description: 'Methodology + remediation narrative + audit findings for each of the seven monitored categories.' },
  { id: 'print-evidence', label: 'Evidence', description: 'Raw audit artifacts: benchmarks, query plans, bundle analysis, accessibility scans, compliance results.' },
  { id: 'print-audit', label: 'Audit & discovery', description: 'Executive audit findings, three things learned, and security scan results.' },
  { id: 'print-operations', label: 'Operations', description: 'Deployment runbook, observability, handoff, agent contract, and codebase reference.' },
];

export function PrintAllReport({ snapshot, isLive, lastUpdated, onDone }: Props) {
  const triggeredRef = useRef(false);

  // Trigger window.print after the DOM has mounted with the full content,
  // then reset back to the regular dashboard via the afterprint event.
  useEffect(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;

    const cleanup = (): void => onDone();
    window.addEventListener('afterprint', cleanup, { once: true });

    // Defer a bit so layout settles before the print dialog opens.
    const timer = setTimeout(() => {
      window.print();
    }, 250);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', cleanup);
    };
  }, [onDone]);

  return (
    <div className="print-all-report">
      <PrintHeader snapshot={snapshot} />

      <section className="surface p-6 md:p-8 mb-8 page-break-after">
        <h2 className="text-2xl font-bold text-ink-700 mb-4">Table of contents</h2>
        <ol className="space-y-3 list-decimal list-inside text-ink-600 marker:font-mono marker:text-coral-500">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <span className="font-semibold text-ink-700">{s.label}</span>
              <span className="text-ink-500"> — {s.description}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="print-overview" className="report-section">
        <ReportSectionHeader index={1} label="Overview" />
        <OverviewTab snapshot={snapshot} isLive={isLive} lastUpdated={lastUpdated} />
      </section>

      <section id="print-categories" className="report-section">
        <ReportSectionHeader index={2} label="Per-category detail" />
        <CategoriesTab snapshot={snapshot} />
      </section>

      <section id="print-evidence" className="report-section">
        <ReportSectionHeader index={3} label="Evidence" />
        <EvidenceTab snapshot={snapshot} />
      </section>

      <section id="print-audit" className="report-section">
        <ReportSectionHeader index={4} label="Audit & Discovery" />
        <AuditTab snapshot={snapshot} />
      </section>

      <section id="print-operations" className="report-section">
        <ReportSectionHeader index={5} label="Operations" />
        <OperationsTab snapshot={snapshot} />
      </section>
    </div>
  );
}

function ReportSectionHeader({ index, label }: { index: number; label: string }) {
  return (
    <div className="mb-6 pb-3 border-b-2 border-ink-700">
      <div className="label-mono text-coral-500">Section {index}</div>
      <h2 className="text-3xl font-bold text-ink-700 tracking-tight mt-1">{label}</h2>
    </div>
  );
}
