// Overview tab — panoramic single-column layout.
//
// Structure (top to bottom):
//   1. Remediation Impact ledger — per-category before/after deltas (the thesis)
//   2. Hero card with the 7 radial dials (current headroom per category)
//   3. Compact live-status strip (branch · commit · last run · duration · archived runs)
//
// DeepDives + Operations are intentionally absent on this tab. They live on
// Categories and Operations respectively. The Overview is the at-a-glance read.
//
// See orientation/design-notes/dashboard-overview.md for the alternatives
// considered (B: editorial 2-column with right rail; C: scoreboard-first inverted).

import type { DashboardSnapshot } from '../data/types';
import { RemediationImpact } from '../components/RemediationImpact';
import { HeroCard } from '../components/HeroCard';
import { LiveStatusStrip } from '../components/LiveStatusStrip';

interface Props {
  snapshot: DashboardSnapshot;
  isLive: boolean;
  lastUpdated: string | null;
}

export function OverviewTab({ snapshot, isLive, lastUpdated }: Props) {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <RemediationImpact snapshot={snapshot} />
      <HeroCard snapshot={snapshot} />
      <LiveStatusStrip
        snapshot={snapshot}
        isLive={isLive}
        lastUpdated={lastUpdated}
      />
    </div>
  );
}
