import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool } from '../../db/client.js';
import {
  createFleetGraphEvalExitCode,
  formatFleetGraphEvalReportMarkdown,
  runFleetGraphDeterministicEvalSuite,
} from '../evals.js';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '../../../..');
const evalReportDir = path.join(repoRoot, 'docs/evals');
const evalReportMarkdownPath = path.join(evalReportDir, 'fleetgraph-v1-eval-report.md');
const evalReportJsonPath = path.join(evalReportDir, 'fleetgraph-v1-eval-report.json');

async function main(): Promise<void> {
  try {
    const report = await runFleetGraphDeterministicEvalSuite({
      generatedAt: new Date().toISOString(),
    });
    const markdown = formatFleetGraphEvalReportMarkdown(report);

    await mkdir(evalReportDir, { recursive: true });
    await writeFile(evalReportMarkdownPath, `${markdown}\n`);
    await writeFile(evalReportJsonPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log(markdown);
    console.log('');
    console.log(`FleetGraph eval report written to ${evalReportMarkdownPath}`);
    console.log(`FleetGraph eval JSON written to ${evalReportJsonPath}`);

    process.exitCode = createFleetGraphEvalExitCode(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FleetGraph eval suite failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
