// Categories tab — sub-nav over 7 stacked CategoryPanels (all collapsible).
// Default: collapsed. "Expand all" / "Collapse all" toggles available above.

import { useState } from 'react';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import type { DashboardSnapshot } from '../data/types';
import { CategoryPanel } from '../components/CategoryPanel';
import { SubNav, type SubNavItem } from '../components/Tabs/SubNav';

import improvementCat1 from '../../data/improvements/cat-1.md?raw';
import improvementCat2 from '../../data/improvements/cat-2.md?raw';
import improvementCat3 from '../../data/improvements/cat-3.md?raw';
import improvementCat4 from '../../data/improvements/cat-4.md?raw';
import improvementCat5 from '../../data/improvements/cat-5.md?raw';
import improvementCat6 from '../../data/improvements/cat-6.md?raw';
import improvementCat7 from '../../data/improvements/cat-7.md?raw';

import auditCat1 from '../../data/audit/cat-1.md?raw';
import auditCat2 from '../../data/audit/cat-2.md?raw';
import auditCat3 from '../../data/audit/cat-3.md?raw';
import auditCat4 from '../../data/audit/cat-4.md?raw';
import auditCat5 from '../../data/audit/cat-5.md?raw';
import auditCat6 from '../../data/audit/cat-6.md?raw';
import auditCat7 from '../../data/audit/cat-7.md?raw';

const IMPROVEMENT_BY_CAT: Record<number, string> = {
  1: improvementCat1,
  2: improvementCat2,
  3: improvementCat3,
  4: improvementCat4,
  5: improvementCat5,
  6: improvementCat6,
  7: improvementCat7,
};

const AUDIT_BY_CAT: Record<number, string> = {
  1: auditCat1,
  2: auditCat2,
  3: auditCat3,
  4: auditCat4,
  5: auditCat5,
  6: auditCat6,
  7: auditCat7,
};

type ExpandMode = 'none' | 'all';

interface Props {
  snapshot: DashboardSnapshot;
}

export function CategoriesTab({ snapshot }: Props) {
  // null = use each panel's own local state. 'all' / 'none' force globally.
  const [forcedMode, setForcedMode] = useState<ExpandMode | null>(null);

  const subnav: SubNavItem[] = snapshot.categoryDetails.map((d) => {
    const result = snapshot.shipshape.results.find((r) => r.category === d.category);
    return {
      id: `cat-${d.category}-panel`,
      label: `Cat ${d.category}`,
      badge: result?.status === 'pass' ? '✓' : result?.status === 'fail' ? '✕' : '−',
    };
  });

  return (
    <div>
      <SubNav items={subnav} />

      {/* Expand-all / Collapse-all toggles */}
      <div className="flex items-center justify-between mb-4 no-print">
        <p className="text-sm text-ink-500">
          Click any category to expand for the full remediation narrative, audit findings, and evidence.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setForcedMode('all')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium text-ink-500 hover:text-ink-700 hover:bg-cream transition-colors ring-1 ring-inset ring-ink-200"
          >
            <ChevronsDown size={12} />
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setForcedMode('none')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium text-ink-500 hover:text-ink-700 hover:bg-cream transition-colors ring-1 ring-inset ring-ink-200"
          >
            <ChevronsUp size={12} />
            Collapse all
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {snapshot.categoryDetails.map((detail) => {
          const result = snapshot.shipshape.results.find((r) => r.category === detail.category);
          if (!result) return null;
          const improvement = IMPROVEMENT_BY_CAT[detail.category];
          const audit = AUDIT_BY_CAT[detail.category];
          if (!improvement) return null;
          return (
            <CategoryPanel
              key={detail.category}
              detail={detail}
              result={result}
              improvementSource={improvement}
              auditSource={audit ?? null}
              forcedOpen={
                forcedMode === 'all' ? true : forcedMode === 'none' ? false : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
