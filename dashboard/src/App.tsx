import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { snapshot as bakedSnapshot } from './data/snapshot';
import { TAB_REGISTRY } from './components/Tabs/TabBar';
import type { DashboardSnapshot } from './data/types';
import { TopNav } from './components/TopNav';
import { PrintHeader } from './components/PrintHeader';
import { TabBar } from './components/Tabs/TabBar';
import { OverviewTab } from './tabs/OverviewTab';
import { Footer } from './components/Footer';
import { ShortcutsCheatsheet } from './components/ShortcutsCheatsheet';
import { Loader2 } from 'lucide-react';
import { useLiveSnapshot } from './hooks/useLiveSnapshot';
import { useTabState } from './hooks/useTabState';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import type { TabId } from './tabs/types';

// Lazy-load the content-heavy tabs. Each becomes its own Vite chunk and only
// loads when the user clicks the tab. Initial paint is just OverviewTab.
const CategoriesTab = lazy(() => import('./tabs/CategoriesTab').then((m) => ({ default: m.CategoriesTab })));
const EvidenceTab = lazy(() => import('./tabs/EvidenceTab').then((m) => ({ default: m.EvidenceTab })));
const AuditTab = lazy(() => import('./tabs/AuditTab').then((m) => ({ default: m.AuditTab })));
const OperationsTab = lazy(() => import('./tabs/OperationsTab').then((m) => ({ default: m.OperationsTab })));
const PrintAllReport = lazy(() => import('./components/PrintAllReport').then((m) => ({ default: m.PrintAllReport })));

export default function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(bakedSnapshot);
  const { isLive, lastUpdated, runLive, runState } = useLiveSnapshot(bakedSnapshot, setSnapshot);
  const { activeTab, setActiveTab } = useTabState();
  const [printAllMode, setPrintAllMode] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useKeyboardShortcuts({ setActiveTab, setCheatsheetOpen });

  // Sync the document title with the active tab so browser-history entries
  // and pinned tabs are distinguishable. Overview keeps the base title.
  useEffect(() => {
    const base = 'Ship — Platform Health';
    document.title =
      activeTab === 'overview' ? base : `${TAB_REGISTRY[activeTab].label} · Ship`;
  }, [activeTab]);

  const handleExportFullReport = useCallback(() => {
    setPrintAllMode(true);
  }, []);

  const handlePrintAllDone = useCallback(() => {
    setPrintAllMode(false);
  }, []);

  if (printAllMode) {
    return (
      <div className="min-h-screen py-6 px-4 md:px-6 lg:px-10">
        <div className="max-w-[1600px] mx-auto bg-cream-soft rounded-card shadow-tile p-5 md:p-8 lg:p-10">
          <Suspense fallback={<LoadingPanel label="Assembling full report…" />}>
            <PrintAllReport
              snapshot={snapshot}
              isLive={isLive}
              lastUpdated={lastUpdated}
              onDone={handlePrintAllDone}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-6 px-4 md:px-6 lg:px-10">
      <div className="max-w-[1600px] mx-auto bg-cream-soft rounded-card shadow-tile p-5 md:p-8 lg:p-10">
        <PrintHeader snapshot={snapshot} />
        <div className="no-print">
          <TopNav
            snapshot={snapshot}
            isLive={isLive}
            onRunLive={runLive}
            runState={runState}
            onExportFullReport={handleExportFullReport}
          />
        </div>
        <TabBar activeTab={activeTab} onChange={setActiveTab} />
        <main id={`tab-panel-${activeTab}`} role="tabpanel">
          <Suspense fallback={<LoadingPanel label="Loading…" />}>
            <TabPanel
              tab={activeTab}
              snapshot={snapshot}
              isLive={isLive}
              lastUpdated={lastUpdated}
            />
          </Suspense>
        </main>
        <Footer snapshot={snapshot} />
      </div>
      <ShortcutsCheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="surface p-12 flex flex-col items-center justify-center gap-3 text-ink-500">
      <Loader2 size={28} className="animate-spin text-coral-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function TabPanel({
  tab,
  snapshot,
  isLive,
  lastUpdated,
}: {
  tab: TabId;
  snapshot: DashboardSnapshot;
  isLive: boolean;
  lastUpdated: string | null;
}) {
  switch (tab) {
    case 'overview':
      return <OverviewTab snapshot={snapshot} isLive={isLive} lastUpdated={lastUpdated} />;
    case 'categories':
      return <CategoriesTab snapshot={snapshot} />;
    case 'evidence':
      return <EvidenceTab snapshot={snapshot} />;
    case 'audit':
      return <AuditTab snapshot={snapshot} />;
    case 'operations':
      return <OperationsTab snapshot={snapshot} />;
  }
}
