import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool } from '../../db/client.js';
import {
  createFleetGraphEvalExitCode,
  formatFleetGraphEvalReportMarkdown,
  runFleetGraphAllEvalSuites,
  type FleetGraphEvalReport,
} from '../evals.js';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '../../../..');
const evalReportDir = path.join(repoRoot, 'docs/evals');
const reportTargets = [
  {
    markdownPath: path.join(evalReportDir, 'fleetgraph-v1-eval-report.md'),
    jsonPath: path.join(evalReportDir, 'fleetgraph-v1-eval-report.json'),
  },
  {
    markdownPath: path.join(evalReportDir, 'fleetgraph-v2-eval-report.md'),
    jsonPath: path.join(evalReportDir, 'fleetgraph-v2-eval-report.json'),
  },
] as const;

async function main(): Promise<void> {
  try {
    const reports = await runFleetGraphAllEvalSuites({
      generatedAt: new Date().toISOString(),
    });

    await mkdir(evalReportDir, { recursive: true });

    await Promise.all(reports.map((report, index) => writeEvalReport(report, reportTargets[index]!)));

    for (const [index, report] of reports.entries()) {
      console.log(formatFleetGraphEvalReportMarkdown(report));
      console.log('');
      console.log(`FleetGraph eval report written to ${reportTargets[index]!.markdownPath}`);
      console.log(`FleetGraph eval JSON written to ${reportTargets[index]!.jsonPath}`);
      console.log('');
    }

    process.exitCode = reports.some((report) => createFleetGraphEvalExitCode(report) !== 0) ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FleetGraph eval suite failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

async function writeEvalReport(
  report: FleetGraphEvalReport,
  target: { markdownPath: string; jsonPath: string }
): Promise<void> {
  await writeFile(target.markdownPath, `${formatFleetGraphEvalReportMarkdown(report)}\n`);
  await writeFile(target.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
