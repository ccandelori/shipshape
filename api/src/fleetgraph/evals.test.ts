import { describe, expect, it } from 'vitest';
import {
  createFleetGraphEvalExitCode,
  formatFleetGraphEvalReportMarkdown,
  runFleetGraphDeterministicEvalSuite,
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
});
