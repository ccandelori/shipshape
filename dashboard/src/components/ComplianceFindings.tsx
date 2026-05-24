// Inline compliance findings table — surfaces gitleaks scan results.
// One card per scan source with count + summary; expandable findings table.

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, ChevronDown, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import type { ComplianceSummary } from '../data/types';
import { repoLink } from '../lib/repo';

interface Props {
  summary: ComplianceSummary;
}

export function ComplianceFindings({ summary }: Props) {
  const [open, setOpen] = useState(summary.findings.length > 0);
  const totalFindings = summary.findings.length;
  const allClean = totalFindings === 0;

  return (
    <div className="space-y-4">
      {/* Scan summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.scans.map((scan) => {
          const clean = scan.totalFindings === 0;
          const Icon = clean ? ShieldCheck : ShieldAlert;
          return (
            <div
              key={scan.source}
              className={clsx(
                'rounded-tile p-5 ring-1 ring-inset',
                clean
                  ? 'bg-ink-700 text-cream ring-ink-700'
                  : 'bg-coral-100 text-coral-600 ring-coral-100'
              )}
            >
              <div className="flex items-start gap-3">
                <Icon size={20} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div
                    className={clsx(
                      'label-mono',
                      clean ? 'text-cream-ring' : 'text-coral-600/70'
                    )}
                  >
                    {scan.label}
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {scan.totalFindings} {scan.totalFindings === 1 ? 'finding' : 'findings'}
                  </div>
                  <p className="text-xs mt-1 opacity-80 leading-snug">{scan.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!allClean && (
        <div className="surface p-5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center gap-2 text-left"
          >
            <h3 className="text-base font-semibold text-ink-700 flex-1">
              {totalFindings} finding{totalFindings === 1 ? '' : 's'} across {summary.scans.length} scans
            </h3>
            <ChevronDown
              size={16}
              className={clsx('text-ink-400 transition-transform', open && 'rotate-180')}
            />
          </button>

          {open && (
            <div className="mt-4">
              {/* By-rule breakdown */}
              {summary.byRule.length > 0 && (
                <div className="mb-5">
                  <div className="label-mono mb-2">By rule</div>
                  <div className="flex flex-wrap gap-2">
                    {summary.byRule.map((r) => (
                      <span key={r.ruleId} className="pill pill-muted">
                        {r.ruleId} <span className="opacity-60">×{r.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Findings table */}
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm mx-2">
                  <thead className="border-b-2 border-ink-200">
                    <tr className="text-left">
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Scan</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Rule</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500">File</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Lines</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {summary.findings.map((f) => (
                      <tr key={f.fingerprint} className="hover:bg-cream-soft/50 transition-colors">
                        <td className="px-3 py-2.5 align-top">
                          <span className="pill pill-muted text-[10px] uppercase">{f.source}</span>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="font-mono text-xs text-ink-700">{f.ruleId}</div>
                          <div className="text-xs text-ink-400 leading-snug mt-0.5 max-w-md">
                            {f.ruleDescription}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top font-mono text-xs text-ink-600 break-all">
                          {f.file}
                        </td>
                        <td className="px-3 py-2.5 align-top font-mono text-xs text-ink-500">
                          {f.startLine === f.endLine ? f.startLine : `${f.startLine}–${f.endLine}`}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <a
                            href={`${repoLink(f.file)}#L${f.startLine}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-coral-500 hover:text-coral-600"
                          >
                            View
                            <ExternalLink size={10} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
