import { describe, expect, it } from 'vitest';
import {
  createDemoHealthExitCode,
  formatDemoHealthReport,
  parseDemoHealthArgs,
  type DemoHealthReport,
} from './demo-health.js';

describe('FleetGraph demo health script helpers', () => {
  it('parses health and reset modes explicitly', () => {
    expect(parseDemoHealthArgs([])).toEqual({ reset: false });
    expect(parseDemoHealthArgs(['--reset'])).toEqual({ reset: true });
  });

  it('rejects unknown arguments instead of silently ignoring them', () => {
    expect(() => parseDemoHealthArgs(['--wipe'])).toThrow('Unknown FleetGraph demo health argument: --wipe');
  });

  it('returns a failing exit code when any required check fails', () => {
    expect(createDemoHealthExitCode([
      { status: 'pass', name: 'Database', detail: 'Connected' },
      { status: 'warn', name: 'Langfuse', detail: 'Keys are not loaded' },
    ])).toBe(0);

    expect(createDemoHealthExitCode([
      { status: 'pass', name: 'Database', detail: 'Connected' },
      { status: 'fail', name: 'Seed data', detail: 'Missing pending-review finding' },
    ])).toBe(1);
  });

  it('formats checks and reset actions for a dry-run console workflow', () => {
    const report: DemoHealthReport = {
      mode: 'reset',
      resetActions: ['Restored pending-review finding', 'Cleared demo read receipts'],
      checks: [
        { status: 'pass', name: 'Database', detail: 'Connected' },
        { status: 'warn', name: 'OpenAI key', detail: 'OPENAI_API_KEY is not set' },
      ],
    };

    expect(formatDemoHealthReport(report)).toContain('FleetGraph demo reset');
    expect(formatDemoHealthReport(report)).toContain('[PASS] Database - Connected');
    expect(formatDemoHealthReport(report)).toContain('[WARN] OpenAI key - OPENAI_API_KEY is not set');
    expect(formatDemoHealthReport(report)).toContain('- Restored pending-review finding');
  });
});
