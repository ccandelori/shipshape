// Overview tab — the at-a-glance dashboard. Hero lollipop on the left,
// category status list on the right, deep-dive expandables below the hero,
// live status + operations link card on the right.

import type { DashboardSnapshot } from '../data/types';
import { HeroCard } from '../components/HeroCard';
import { CategoryList } from '../components/CategoryList';
import { DeepDives } from '../components/DeepDives';
import { Operations } from '../components/Operations';
import { LiveStatus } from '../components/LiveStatus';

interface Props {
  snapshot: DashboardSnapshot;
  isLive: boolean;
  lastUpdated: string | null;
}

export function OverviewTab({ snapshot, isLive, lastUpdated }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
      <div className="lg:col-span-7">
        <HeroCard snapshot={snapshot} />
      </div>
      <div className="lg:col-span-5">
        <CategoryList snapshot={snapshot} />
      </div>
      <div className="lg:col-span-7" id="deep-dives">
        <DeepDives snapshot={snapshot} />
      </div>
      <div className="lg:col-span-5 flex flex-col gap-5 lg:gap-6">
        <LiveStatus snapshot={snapshot} isLive={isLive} lastUpdated={lastUpdated} />
        <Operations snapshot={snapshot} />
      </div>
    </div>
  );
}
