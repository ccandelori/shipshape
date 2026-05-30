import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkAppHealth,
  createAppDatabasePairingCheck,
  createDemoHealthExitCode,
  formatDemoHealthReport,
  parseDemoHealthArgs,
  type DemoHealthReport,
} from './demo-health.js';

describe('FleetGraph demo health script helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses health and reset modes explicitly', () => {
    expect(parseDemoHealthArgs([])).toEqual({ reset: false, appUrl: null });
    expect(parseDemoHealthArgs(['--reset'])).toEqual({ reset: true, appUrl: null });
  });

  it('parses optional app URL for browser dry-run links', () => {
    expect(parseDemoHealthArgs(['--', '--app-url', 'https://143.198.163.184.nip.io'])).toEqual({
      reset: false,
      appUrl: 'https://143.198.163.184.nip.io',
    });

    expect(parseDemoHealthArgs(['--app-url', 'https://143.198.163.184.nip.io'])).toEqual({
      reset: false,
      appUrl: 'https://143.198.163.184.nip.io',
    });

    expect(parseDemoHealthArgs([
      '--reset',
      '--app-url',
      'https://143.198.163.184.nip.io/',
    ])).toEqual({
      reset: true,
      appUrl: 'https://143.198.163.184.nip.io',
    });
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

  it('fails app and database pairings that would print cross-environment document links', () => {
    expect(createAppDatabasePairingCheck(
      { DATABASE_URL: 'postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev' },
      'https://143.198.163.184.nip.io'
    )).toMatchObject({
      status: 'fail',
      name: 'App and database pairing',
    });

    expect(createAppDatabasePairingCheck(
      { DATABASE_URL: 'postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev' },
      'http://localhost:5173'
    )).toMatchObject({
      status: 'pass',
      name: 'App and database pairing',
    });

    expect(createAppDatabasePairingCheck(
      {
        DATABASE_URL: 'postgresql://ship:ship_prod_password@127.0.0.1:5432/ship_prod',
        NODE_ENV: 'production',
      },
      'https://143.198.163.184.nip.io'
    )).toMatchObject({
      status: 'pass',
      name: 'App and database pairing',
    });
  });

  it('passes app health when a web root is reachable but /health is not exposed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404 })
    ).mockResolvedValueOnce(
      new Response('<html><body>Ship</body></html>', { status: 200 })
    );

    await expect(checkAppHealth('http://localhost:5173')).resolves.toEqual({
      status: 'pass',
      name: 'App health',
      detail: 'http://localhost:5173 returned HTTP 200; /health is not exposed on this app URL',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:5173/health');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:5173');
  });

  it('fails app health when neither /health nor the web root is reachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404 })
    ).mockResolvedValueOnce(
      new Response('not found', { status: 404 })
    );

    await expect(checkAppHealth('http://localhost:5173')).resolves.toEqual({
      status: 'fail',
      name: 'App health',
      detail: 'http://localhost:5173/health returned HTTP 404 and http://localhost:5173 returned HTTP 404',
    });
  });

  it('formats checks and reset actions for a dry-run console workflow', () => {
    const report: DemoHealthReport = {
      mode: 'reset',
      resetActions: ['Restored pending-review finding', 'Cleared demo read receipts'],
      demoLinks: [
        { label: 'App', url: 'https://143.198.163.184.nip.io/' },
        { label: 'Week chat', url: 'https://143.198.163.184.nip.io/documents/week-1' },
        {
          label: 'Meaty issue for chat: Real-time collaboration merge conflicts under load',
          url: 'https://143.198.163.184.nip.io/documents/issue-1',
        },
      ],
      checks: [
        { status: 'pass', name: 'Database', detail: 'Connected' },
        { status: 'warn', name: 'OpenAI key', detail: 'OPENAI_API_KEY is not set' },
      ],
    };

    expect(formatDemoHealthReport(report)).toContain('FleetGraph demo reset');
    expect(formatDemoHealthReport(report)).toContain('[PASS] Database - Connected');
    expect(formatDemoHealthReport(report)).toContain('[WARN] OpenAI key - OPENAI_API_KEY is not set');
    expect(formatDemoHealthReport(report)).toContain('- Restored pending-review finding');
    expect(formatDemoHealthReport(report)).toContain('Demo links:');
    expect(formatDemoHealthReport(report)).toContain('- App: https://143.198.163.184.nip.io/');
    expect(formatDemoHealthReport(report)).toContain('- Week chat: https://143.198.163.184.nip.io/documents/week-1');
    expect(formatDemoHealthReport(report)).toContain('- Meaty issue for chat: Real-time collaboration merge conflicts under load: https://143.198.163.184.nip.io/documents/issue-1');
  });
});
