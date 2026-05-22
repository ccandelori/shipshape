// Shipshape — markdown report emitter.
// Reads report-template.md and substitutes the placeholders with the run results.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CheckResult, ShipshapeContext } from './types.ts';
import { HERE, REPO_ROOT, durationLine, statusEmoji } from './util.ts';

const TEMPLATE_PATH = path.join(HERE, 'report-template.md');
const REPORT_PATH = path.join(REPO_ROOT, 'orientation/shipshape-report.md');

function escape(s: string): string {
  // Markdown table cells can't contain raw newlines or unescaped pipes.
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildScoreboard(results: CheckResult[]): string {
  return results
    .map(
      (r) =>
        `| ${r.category} | ${escape(r.name)} | ${escape(r.target)} | ${escape(r.actual)} | ${statusEmoji(r.status)} | ${durationLine(r.durationMs)} |`
    )
    .join('\n');
}

function buildSections(results: CheckResult[]): string {
  return results
    .map((r) => {
      const lines: string[] = [];
      lines.push(`## Cat ${r.category} — ${r.name}`);
      lines.push('');
      lines.push(`- **Status:** ${statusEmoji(r.status)}`);
      lines.push(`- **Target:** ${r.target}`);
      lines.push(`- **Actual:** ${r.actual}`);
      lines.push(`- **Evidence:** [\`${r.evidence_path}\`](../${r.evidence_path})`);
      lines.push(`- **Took:** ${durationLine(r.durationMs)}`);
      if (r.notes) lines.push(`- **Notes:** ${r.notes}`);
      lines.push('');
      lines.push('**Reproduce:**');
      lines.push('');
      lines.push('```bash');
      lines.push(r.reproduction);
      lines.push('```');
      return lines.join('\n');
    })
    .join('\n\n');
}

export async function emitReport(
  ctx: ShipshapeContext,
  results: CheckResult[]
): Promise<{ overallPass: boolean; reportPath: string }> {
  const template = await fs.readFile(TEMPLATE_PATH, 'utf8');

  const ordered = [...results].sort((a, b) => a.category - b.category);
  const anyFail = ordered.some((r) => r.status === 'fail');
  const overallPass = !anyFail;
  const overallLabel = anyFail ? 'FAIL' : 'PASS';

  const totalMs = Date.now() - ctx.startedAt.getTime();

  const body = template
    .replace('{{TIMESTAMP}}', ctx.startedAt.toISOString())
    .replace('{{BRANCH}}', ctx.branch)
    .replace('{{SHA}}', ctx.gitSha)
    .replace('{{MODE}}', ctx.mode === 'ci' ? 'ci (lite)' : 'full')
    .replace('{{OVERALL_STATUS}}', overallLabel)
    .replace('{{DURATION}}', durationLine(totalMs))
    .replace('{{SCOREBOARD_ROWS}}', buildScoreboard(ordered))
    .replace('{{PER_CATEGORY_SECTIONS}}', buildSections(ordered));

  await fs.writeFile(REPORT_PATH, body, 'utf8');
  return { overallPass, reportPath: REPORT_PATH };
}
