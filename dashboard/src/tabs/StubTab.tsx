// Placeholder for tabs being built in later phases.
// Replaces itself with the real implementation once the phase ships.

import { Construction } from 'lucide-react';
import { TAB_REGISTRY, type TabDef } from '../components/Tabs/TabBar';
import type { TabId } from './types';

interface Props {
  tabId: TabId;
  phase: number;
}

export function StubTab({ tabId, phase }: Props) {
  const def: TabDef = TAB_REGISTRY[tabId];
  return (
    <div className="surface p-10 text-center max-w-2xl mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-cream-ring grid place-items-center mx-auto mb-4 text-ink-500">
        <Construction size={24} />
      </div>
      <h2 className="text-2xl font-bold text-ink-700 tracking-tight mb-2">{def.label}</h2>
      <p className="text-ink-500 leading-relaxed mb-1">{def.description}</p>
      <p className="text-xs font-mono text-ink-400 mt-4">
        landing in Phase {phase} — see Taskmaster
      </p>
    </div>
  );
}
