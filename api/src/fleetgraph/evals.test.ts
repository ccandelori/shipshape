import { describe, expect, it } from 'vitest';
import {
  createFleetGraphEvalExitCode,
  formatFleetGraphEvalReportMarkdown,
  runFleetGraphAllEvalSuites,
  runFleetGraphDeterministicEvalSuite,
  runFleetGraphV2EvalSuite,
  scoreFleetGraphEvalObservations,
  type FleetGraphEvalObservation,
} from './evals.js';

describe('FleetGraph eval scoring', () => {
  it('scores golden observations and renders a submission-ready report', () => {
    const observations: FleetGraphEvalObservation[] = [
      {
        id: 'FG-EVAL-001',
        name: 'Healthy Week exits quietly',
        category: 'proactive',
        assertions: [
          {
            metric: 'branch_path',
            name: 'Branch path',
            expected: 'prefilter-exit',
            observed: 'prefilter-exit',
          },
          {
            metric: 'finding_presence',
            name: 'Finding presence',
            expected: 'none',
            observed: 'none',
          },
        ],
      },
      {
        id: 'FG-EVAL-002',
        name: 'Blocked Week produces an action',
        category: 'proactive',
        assertions: [
          {
            metric: 'branch_path',
            name: 'Branch path',
            expected: 'output',
            observed: 'prefilter-exit',
          },
        ],
      },
    ];

    const report = scoreFleetGraphEvalObservations({
      suiteName: 'FleetGraph V1 deterministic evals',
      generatedAt: '2026-05-28T22:00:00.000Z',
      observations,
    });

    expect(report.summary).toEqual({
      totalCases: 2,
      passedCases: 1,
      failedCases: 1,
      totalAssertions: 3,
      passedAssertions: 2,
      failedAssertions: 1,
      passRate: 0.6667,
    });
    expect(report.status).toBe('fail');
    expect(report.cases[0]!.status).toBe('pass');
    expect(report.cases[1]!.status).toBe('fail');
    expect(createFleetGraphEvalExitCode(report)).toBe(1);

    const markdown = formatFleetGraphEvalReportMarkdown(report);
    expect(markdown).toContain('# FleetGraph V1 deterministic evals');
    expect(markdown).toContain('| Total cases | 2 |');
    expect(markdown).toContain('| Pass rate | 66.67% |');
    expect(markdown).toContain('| FG-EVAL-002 | Blocked Week produces an action | proactive | fail | 0/1 |');
  });

  it('runs the deterministic V1 suite with all golden cases passing', async () => {
    const report = await runFleetGraphDeterministicEvalSuite({
      generatedAt: '2026-05-28T22:05:00.000Z',
    });

    expect(report.status).toBe('pass');
    expect(report.summary).toMatchObject({
      totalCases: 8,
      passedCases: 8,
      failedCases: 0,
    });
    expect(report.cases.map((result) => result.id)).toEqual([
      'FG-EVAL-001',
      'FG-EVAL-002',
      'FG-EVAL-003',
      'FG-EVAL-004',
      'FG-EVAL-005',
      'FG-EVAL-006',
      'FG-EVAL-007',
      'FG-EVAL-008',
    ]);
    expect(report.cases.find((result) => result.id === 'FG-EVAL-003')).toMatchObject({
      category: 'chat',
      status: 'pass',
    });
    expect(report.cases.find((result) => result.id === 'FG-EVAL-006')).toMatchObject({
      category: 'policy',
      status: 'pass',
    });
  });

  it('runs the deterministic V2 suite with deeper guard, observability, and chat controls passing', async () => {
    const report = await runFleetGraphV2EvalSuite({
      generatedAt: '2026-05-28T22:10:00.000Z',
    });

    expect(report.suiteName).toBe('FleetGraph V2 deterministic evals');
    expect(report.status).toBe('pass');
    expect(report.summary).toMatchObject({
      totalCases: 8,
      passedCases: 8,
      failedCases: 0,
    });
    expect(report.cases.map((result) => result.id)).toEqual([
      'FG-EVAL-009',
      'FG-EVAL-010',
      'FG-EVAL-011',
      'FG-EVAL-012',
      'FG-EVAL-013',
      'FG-EVAL-014',
      'FG-EVAL-015',
      'FG-EVAL-016',
    ]);
    expect(report.cases.find((result) => result.id === 'FG-EVAL-010')).toMatchObject({
      category: 'proactive',
      status: 'pass',
    });
    expect(report.cases.find((result) => result.id === 'FG-EVAL-012')).toMatchObject({
      category: 'observability',
      status: 'pass',
    });
    expect(report.cases.find((result) => result.id === 'FG-EVAL-015')).toMatchObject({
      category: 'chat',
      status: 'pass',
    });
  });

  it('runs all deterministic eval suites in submission order', async () => {
    const reports = await runFleetGraphAllEvalSuites({
      generatedAt: '2026-05-28T22:15:00.000Z',
    });

    expect(reports.map((report) => report.suiteName)).toEqual([
      'FleetGraph V1 deterministic evals',
      'FleetGraph V2 deterministic evals',
    ]);
    expect(reports.every((report) => report.status === 'pass')).toBe(true);
    expect(reports.reduce((sum, report) => sum + report.summary.totalCases, 0)).toBe(16);
  });
});
