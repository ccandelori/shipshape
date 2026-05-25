// Cat 4 deep-dive — renders all 5 EXPLAIN ANALYZE flows as an interactive
// tree with a flow selector. Parsed JSON staged at build time by
// scripts/dashboard/parse-explain.ts.

import { ExplainTree } from './ExplainTree';

import flow1 from '../../data/db-plans/flow-1.json';
import flow2 from '../../data/db-plans/flow-2.json';
import flow3 from '../../data/db-plans/flow-3.json';
import flow4 from '../../data/db-plans/flow-4.json';
import flow5 from '../../data/db-plans/flow-5.json';

interface PlanFile {
  title: string;
  capturedAt: string | null;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  root: any;
}

const FLOWS = [
  { id: 'flow-1', label: 'Flow 1 · /my-week landing', plan: flow1 as PlanFile },
  { id: 'flow-2', label: 'Flow 2 · view document', plan: flow2 as PlanFile },
  { id: 'flow-3', label: 'Flow 3 · list issues', plan: flow3 as PlanFile },
  { id: 'flow-4', label: 'Flow 4 · sprint board', plan: flow4 as PlanFile },
  { id: 'flow-5', label: 'Flow 5 · search content', plan: flow5 as PlanFile },
];

export function DbPlans() {
  return <ExplainTree flows={FLOWS} defaultFlowId="flow-3" />;
}
