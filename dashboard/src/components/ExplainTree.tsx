// Renders a parsed Postgres EXPLAIN ANALYZE plan as an interactive tree.
// Each node: indented row with operator name + actual time + rows + a small
// cost bar (relative to root). Click any node to expand its raw attributes
// (Filter:, Buffers:, Output:, etc.).
//
// Plan JSON staged by scripts/dashboard/parse-explain.ts at build time.

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { CopyButton } from './CopyButton';

interface PlanNode {
  name: string;
  detail: string | null;
  cost: { startup: number; total: number; rows: number; width: number } | null;
  actual: { startupMs: number; totalMs: number; rows: number; loops: number } | null;
  depth: number;
  attrs: string[];
  children: PlanNode[];
}

interface PlanFile {
  title: string;
  capturedAt: string | null;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  root: PlanNode | null;
}

interface Props {
  flows: Array<{ id: string; label: string; plan: PlanFile }>;
  defaultFlowId?: string;
}

export function ExplainTree({ flows, defaultFlowId }: Props) {
  const [activeId, setActiveId] = useState<string>(defaultFlowId ?? flows[0]?.id ?? '');
  const active = flows.find((f) => f.id === activeId) ?? flows[0];

  if (!active) return null;

  const rootTotalMs = active.plan.root?.actual?.totalMs ?? 0;

  return (
    <div className="rounded-tile p-4 bg-cream-soft ring-1 ring-inset ring-ink-100">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="label-mono px-1">EXPLAIN ANALYZE plan tree</div>
        <div className="inline-flex rounded-chip bg-ink-100 p-0.5 ring-1 ring-inset ring-ink-200 no-print">
          {flows.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveId(f.id)}
              className={clsx(
                'px-2.5 py-1 rounded-chip text-[11px] font-medium transition-colors',
                activeId === f.id
                  ? 'bg-ink-700 text-cream'
                  : 'text-ink-500 hover:text-ink-700'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-tile bg-white ring-1 ring-inset ring-ink-100 p-4">
        {/* Plan header */}
        <header className="flex items-baseline justify-between gap-3 pb-3 mb-3 border-b hairline border-b">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-700 leading-snug">{active.plan.title}</h3>
            {active.plan.capturedAt && (
              <div className="text-[11px] text-ink-400 mt-0.5 font-mono">
                captured {active.plan.capturedAt}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-xs text-ink-500">
              planning {active.plan.planningTimeMs?.toFixed(2) ?? '—'} ms
            </div>
            <div className="font-mono text-sm font-semibold text-ink-700 tabular-nums">
              execution {active.plan.executionTimeMs?.toFixed(2) ?? '—'} ms
            </div>
          </div>
        </header>

        {/* Tree body */}
        {active.plan.root ? (
          <div className="space-y-0.5">
            <PlanRow node={active.plan.root} level={0} rootTotalMs={rootTotalMs} />
          </div>
        ) : (
          <div className="text-sm text-ink-400">No plan parsed.</div>
        )}
      </div>
    </div>
  );
}

function PlanRow({
  node,
  level,
  rootTotalMs,
}: {
  node: PlanNode;
  level: number;
  rootTotalMs: number;
}) {
  const [open, setOpen] = useState(false);
  const actualMs = node.actual?.totalMs ?? 0;
  // Cost bar = fraction of root's total time this node's *self* cost claims.
  // Approximation: (node.totalMs − sum of child totalMs) / rootTotalMs.
  const childSum = node.children.reduce((s, c) => s + (c.actual?.totalMs ?? 0), 0);
  const selfMs = Math.max(actualMs - childSum, 0);
  const selfFrac = rootTotalMs > 0 ? selfMs / rootTotalMs : 0;

  const isExpensive = selfFrac > 0.3;
  const isMedium = selfFrac > 0.1 && !isExpensive;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-cream-soft text-left transition-colors group"
        style={{ paddingLeft: 8 + level * 14 }}
      >
        {/* Tree connector */}
        <ChevronRight
          size={11}
          className={clsx(
            'text-ink-400 shrink-0 transition-transform',
            open && 'rotate-90',
            node.attrs.length === 0 && 'opacity-30'
          )}
        />

        {/* Operator name + detail */}
        <div className="flex-1 min-w-0 flex items-baseline gap-2 truncate">
          <span className="font-mono text-xs font-semibold text-ink-700 truncate">{node.name}</span>
          {node.detail && (
            <span className="font-mono text-[10px] text-ink-400 truncate">{node.detail}</span>
          )}
        </div>

        {/* Cost bar */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <div className="w-20 h-1.5 rounded-full bg-ink-100 overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full',
                isExpensive ? 'bg-coral-500' : isMedium ? 'bg-coral-400' : 'bg-ink-500'
              )}
              style={{ width: `${Math.max(selfFrac * 100, 1)}%` }}
            />
          </div>
        </div>

        {/* Actual time + rows */}
        <div className="shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-500 w-28">
          <div className="text-ink-700 font-semibold">{actualMs.toFixed(3)} ms</div>
          <div className="text-[10px]">
            {node.actual?.rows ?? '—'} rows
            {node.actual?.loops && node.actual.loops > 1 ? ` ×${node.actual.loops}` : ''}
          </div>
        </div>
      </button>

      {/* Expanded attrs */}
      {open && node.attrs.length > 0 && (
        <div
          className="rounded bg-ink-800 text-ink-100 mt-1 mb-2 mx-2 p-3 text-[11px] font-mono leading-relaxed"
          style={{ marginLeft: 8 + (level + 1) * 14 }}
        >
          <div className="flex items-center justify-between mb-2 -mt-1">
            <span className="label-mono text-cream-ring">attributes</span>
            <CopyButton text={node.attrs.join('\n')} label="copy" />
          </div>
          {node.attrs.map((a, i) => (
            <div key={i} className="whitespace-pre-wrap break-words text-ink-100/90">
              {a}
            </div>
          ))}
        </div>
      )}

      {/* Children */}
      {node.children.map((c, i) => (
        <PlanRow key={i} node={c} level={level + 1} rootTotalMs={rootTotalMs} />
      ))}
    </div>
  );
}
