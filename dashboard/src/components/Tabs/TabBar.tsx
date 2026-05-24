import clsx from 'clsx';
import { motion } from 'framer-motion';
import { LayoutDashboard, ListChecks, Database, FileSearch, Settings } from 'lucide-react';
import { TAB_IDS, type TabId } from '../../tabs/types';

export interface TabDef {
  id: TabId;
  label: string;
  Icon: React.ElementType;
  description: string;
}

export const TAB_REGISTRY: Record<TabId, TabDef> = {
  overview: {
    id: 'overview',
    label: 'Overview',
    Icon: LayoutDashboard,
    description: 'At-a-glance health across the seven monitored categories.',
  },
  categories: {
    id: 'categories',
    label: 'Categories',
    Icon: ListChecks,
    description: 'Per-category methodology, remediation narrative, and evidence.',
  },
  evidence: {
    id: 'evidence',
    label: 'Evidence',
    Icon: Database,
    description: 'Raw audit artifacts — benchmarks, query plans, scans.',
  },
  audit: {
    id: 'audit',
    label: 'Audit & Discovery',
    Icon: FileSearch,
    description: 'Executive audit, three things learned, compliance findings.',
  },
  operations: {
    id: 'operations',
    label: 'Operations',
    Icon: Settings,
    description: 'Runbooks, observability, handoff, agent contract, codebase reference.',
  },
};

interface Props {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export function TabBar({ activeTab, onChange }: Props) {
  return (
    <nav
      className="surface mt-6 mb-6 p-1.5 flex items-center gap-1 overflow-x-auto no-print"
      role="tablist"
      aria-label="Dashboard sections"
    >
      {TAB_IDS.map((id) => {
        const tab = TAB_REGISTRY[id];
        const isActive = id === activeTab;
        const Icon = tab.Icon;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tab-panel-${id}`}
            onClick={() => onChange(id)}
            className={clsx(
              'relative flex items-center gap-2 px-4 py-2 rounded-tile text-sm font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'text-cream'
                : 'text-ink-500 hover:text-ink-700 hover:bg-cream-soft'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-tab-bg"
                className="absolute inset-0 bg-ink-700 rounded-tile"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <Icon size={15} className="relative" />
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
