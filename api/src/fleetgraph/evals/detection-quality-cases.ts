import type { WeekContext } from '../context.js';

export type DetectionQualityCase = {
  id: string;
  name: string;
  description: string;
  context: WeekContext;
  expected: {
    preFilterShouldReason: boolean;
    finalShouldProduceFinding: boolean;
    severity?: 'low' | 'medium' | 'high';
    shouldIdentifyOwner?: boolean;
    primaryEvidenceSources?: Array<'issue' | 'standup' | 'iteration' | 'accountability'>;
    recommendedActionKind?: 'notify' | 'draft_comment' | 'create_issue' | null;
    targetLifecycleState?: 'open' | 'pending_review';
    targetApprovalLevel?: 'notify_only' | 'approval_required';
  };
};

function tipTapText(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text }],
    }],
  };
}

const baseDate = new Date('2026-05-28T20:00:00.000Z');

function createBaseWeek(overrides: Partial<WeekContext['week']> = {}): WeekContext['week'] {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    documentType: 'sprint',
    title: 'FleetGraph Quality Eval Week',
    content: tipTapText('Week plan is current.'),
    parentId: null,
    properties: { owner_id: '33333333-3333-4333-8333-333333333333' },
    ticketNumber: null,
    createdAt: baseDate,
    updatedAt: baseDate,
    ...overrides,
  };
}

function createBaseOwner(): string {
  return '33333333-3333-4333-8333-333333333333';
}

function createIssue(overrides: Partial<WeekContext['issues'][number]> = {}): WeekContext['issues'][number] {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    documentType: 'issue',
    title: 'Blocked work item',
    content: tipTapText('Work is blocked.'),
    parentId: null,
    properties: { state: 'blocked', priority: 'high' },
    ticketNumber: 42,
    createdAt: baseDate,
    updatedAt: baseDate,
    state: 'blocked',
    priority: 'high',
    assigneeUserId: createBaseOwner(),
    ...overrides,
  };
}

function createStandup(text: string): WeekContext['standups'][number] {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    documentType: 'standup',
    title: 'Daily standup',
    content: tipTapText(text),
    parentId: '11111111-1111-4111-8111-111111111111',
    properties: {},
    ticketNumber: null,
    createdAt: baseDate,
    updatedAt: baseDate,
    authorUserId: createBaseOwner(),
  };
}

export const detectionQualityCases: DetectionQualityCase[] = [
  // === QUIET CASES (should not produce findings) ===
  {
    id: 'DQ-Q01',
    name: 'Completely clean week',
    description: 'No high-priority issues, no blocker language in standups, recent activity, strong accountability. Should exit quietly with no finding.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [],
      standups: [createStandup('Made good progress on planned items today.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: ['plan-1'] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: false,
      finalShouldProduceFinding: false,
    },
  },
  {
    id: 'DQ-Q02',
    name: 'Active work with no blockers',
    description: 'Several in-progress issues with recent standup updates showing movement. No blocked state or blocker language. Should stay quiet.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({ state: 'in_progress', priority: 'medium', title: 'Feature work' }),
        createIssue({ state: 'in_progress', priority: 'medium', title: 'Refactor' }),
      ],
      standups: [createStandup('Continuing work on the two active items. No blockers.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: false,
      finalShouldProduceFinding: false,
    },
  },
  {
    id: 'DQ-Q03',
    name: 'Low-priority blocked item with recent positive update',
    description: 'One blocked issue but only medium/low priority. Recent standup shows active work on a workaround. Pre-filter should likely suppress.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({
          title: 'Minor reporting tweak blocked',
          state: 'blocked',
          priority: 'medium',
          properties: { state: 'blocked', priority: 'medium' },
        }),
      ],
      standups: [createStandup('Blocked on the reporting change but shipping a manual workaround today.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: false,
      finalShouldProduceFinding: false,
    },
  },
  {
    id: 'DQ-Q04',
    name: '"Block" language but context is resolved',
    description: 'Standup uses the word "block" but the sentence makes clear it was resolved yesterday. Should not trigger.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({ state: 'in_progress', priority: 'high', title: 'API integration' }),
      ],
      standups: [createStandup('Was blocked on the API key yesterday but unblocked it this morning.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: false,
      finalShouldProduceFinding: false,
    },
  },
  {
    id: 'DQ-Q05',
    name: 'High volume but all moving with recent standups',
    description: 'Many high-priority items assigned to the owner, but every one has recent standup activity showing progress. Should not fire.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: Array.from({ length: 6 }, (_, i) =>
        createIssue({
          id: `moving-${i}`,
          title: `Active item ${i + 1}`,
          state: 'in_progress',
          priority: 'high',
          properties: { state: 'in_progress', priority: 'high' },
        })
      ),
      standups: [createStandup('Making steady progress across the board. All critical items have movement this week.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: false,
      finalShouldProduceFinding: false,
    },
  },

  // === RISKY CASES (should produce findings) ===
  {
    id: 'DQ-R01',
    name: 'Classic high-priority blocker with standup signal',
    description: 'One high-priority blocked issue + standup explicitly calling out a blocker. Primary pattern the detector should catch.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({
          title: 'Vendor integration blocked',
          properties: { state: 'blocked', priority: 'high' },
        }),
      ],
      standups: [createStandup('Still blocked on vendor response for the integration. No update yet.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: true,
      finalShouldProduceFinding: true,
      severity: 'high',
      shouldIdentifyOwner: true,
      primaryEvidenceSources: ['standup'],
      recommendedActionKind: 'notify',
      targetLifecycleState: 'open',
      targetApprovalLevel: 'notify_only',
    },
  },
  {
    id: 'DQ-R02',
    name: 'Multiple stalled issues with no recent updates',
    description: 'Several high-priority issues in blocked state. No recent standups. Should trigger on elapsed time + lack of signal.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({ title: 'Payment flow broken', properties: { state: 'blocked', priority: 'high' } }),
        createIssue({ title: 'Reporting dashboard down', properties: { state: 'blocked', priority: 'high' } }),
      ],
      standups: [],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: true,
      finalShouldProduceFinding: true,
      severity: 'high',
      shouldIdentifyOwner: true,
      primaryEvidenceSources: ['issue'],
      recommendedActionKind: 'notify',
      targetLifecycleState: 'open',
      targetApprovalLevel: 'notify_only',
    },
  },
  {
    id: 'DQ-R03',
    name: 'Owner overloaded with no visible progress',
    description: 'Single owner assigned many high-priority issues. Recent standups show falling-behind language. Covers use case 5: overload and scope pressure.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: Array.from({ length: 5 }, (_, i) =>
        createIssue({
          id: `issue-overload-${i}`,
          title: `Critical item ${i + 1}`,
          state: 'in_progress',
          priority: 'high',
          properties: { state: 'in_progress', priority: 'high' },
        })
      ),
      standups: [createStandup('Trying to keep up but falling behind on the critical path items.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: true,
      finalShouldProduceFinding: true,
      severity: 'medium',
      shouldIdentifyOwner: true,
      primaryEvidenceSources: ['issue', 'standup'],
      recommendedActionKind: 'draft_comment',
      targetLifecycleState: 'pending_review',
      targetApprovalLevel: 'approval_required',
    },
  },
  {
    id: 'DQ-R04',
    name: 'Aging technical blocker near week end',
    description: 'Technical blocker that has existed for several days. Week is late. Should be treated as high risk.',
    context: {
      week: createBaseWeek({ title: 'FleetGraph Quality Eval Week (Day 5)' }),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({
          title: 'Database migration failing in staging',
          properties: { state: 'blocked', priority: 'high' },
          createdAt: new Date('2026-05-25T10:00:00.000Z'),
        }),
      ],
      standups: [createStandup('Still fighting the migration. No clear path forward yet.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: true,
      finalShouldProduceFinding: true,
      severity: 'high',
      shouldIdentifyOwner: true,
      primaryEvidenceSources: ['issue'],
      recommendedActionKind: 'notify',
      targetLifecycleState: 'open',
      targetApprovalLevel: 'notify_only',
    },
  },
  {
    id: 'DQ-R05',
    name: 'Missing weekly plan + visible stalling',
    description: 'No weekly plan exists and multiple high items show no recent movement. Covers use case 4: missing weekly plan or hypothesis context.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({ title: 'Onboarding flow broken', properties: { state: 'blocked', priority: 'high' } }),
        createIssue({ title: 'Billing edge case failing', properties: { state: 'blocked', priority: 'high' } }),
      ],
      standups: [createStandup('Haven\'t had time to update the plan. Things are slipping.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: false, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: true,
      finalShouldProduceFinding: true,
      severity: 'high',
      shouldIdentifyOwner: true,
      primaryEvidenceSources: ['issue', 'accountability'],
      recommendedActionKind: 'draft_comment',
      targetLifecycleState: 'pending_review',
      targetApprovalLevel: 'approval_required',
    },
  },
  {
    id: 'DQ-R06',
    name: 'Subtle risk: volume + silence on critical path',
    description: 'No single dramatic blocker, but the critical path items are unchanged while non-critical work continues. Covers use case 3: assigned work with no recent progress signal.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({ id: 'crit-1', title: 'Launch critical path A', state: 'in_progress', priority: 'high', properties: { state: 'in_progress', priority: 'high' } }),
        createIssue({ id: 'crit-2', title: 'Launch critical path B', state: 'in_progress', priority: 'high', properties: { state: 'in_progress', priority: 'high' } }),
        createIssue({ title: 'Nice-to-have polish', state: 'in_progress', priority: 'medium', properties: { state: 'in_progress', priority: 'medium' } }),
      ],
      standups: [
        createStandup('Made progress on the polish item today.'),
        createStandup('Launch critical path items are unchanged while polish continues.'),
      ],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: true,
      finalShouldProduceFinding: true,
      severity: 'medium',
      shouldIdentifyOwner: true,
      primaryEvidenceSources: ['issue'],
      recommendedActionKind: 'notify',
      targetLifecycleState: 'open',
      targetApprovalLevel: 'notify_only',
    },
  },
  {
    id: 'DQ-R07',
    name: 'Iteration blocker with no standup coverage',
    description: 'A sprint iteration explicitly records blockers, but no recent standups mention them. Detector should pick it up via iteration data.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [],
      standups: [createStandup('Focus has been on support tickets this week.')],
      sprintIterations: [
        {
          id: 'iter-1',
          sprintId: '11111111-1111-4111-8111-111111111111',
          workspaceId: '22222222-2222-4222-8222-222222222222',
          storyId: 'story-99',
          storyTitle: 'Critical reporting story',
          status: 'blocked',
          whatAttempted: 'Investigated data pipeline',
          blockersEncountered: 'Waiting on upstream data source access',
          authorUserId: createBaseOwner(),
          createdAt: baseDate,
          updatedAt: baseDate,
        },
      ],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: true,
      finalShouldProduceFinding: true,
      severity: 'high',
      shouldIdentifyOwner: true,
      primaryEvidenceSources: ['iteration'],
      recommendedActionKind: 'notify',
      targetLifecycleState: 'open',
      targetApprovalLevel: 'notify_only',
    },
  },
  {
    id: 'DQ-Q06',
    name: 'Old blocker explicitly marked resolved in latest standup',
    description: 'A previously blocked high-priority issue now has clear resolution language in the most recent standup. Should be treated as quiet.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({
          title: 'Data pipeline outage',
          state: 'in_progress',
          priority: 'high',
          properties: { state: 'in_progress', priority: 'high' },
        }),
      ],
      standups: [createStandup('Finally got the data pipeline unblocked last night. All flows green this morning.')],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: false,
      finalShouldProduceFinding: false,
    },
  },
  {
    id: 'DQ-R08',
    name: 'Critical path items silent for multiple standups',
    description: 'Two launch-critical items have had no meaningful update across the last three standups, while lower-priority work is actively discussed. Strong silence signal.',
    context: {
      week: createBaseWeek(),
      ownerUserId: createBaseOwner(),
      projectId: null,
      programId: null,
      issues: [
        createIssue({ id: 'launch-1', title: 'Launch critical path item A', state: 'in_progress', priority: 'high', properties: { state: 'in_progress', priority: 'high' } }),
        createIssue({ id: 'launch-2', title: 'Launch critical path item B', state: 'in_progress', priority: 'high', properties: { state: 'in_progress', priority: 'high' } }),
        createIssue({ title: 'Marketing page tweak', state: 'in_progress', priority: 'low', properties: { state: 'in_progress', priority: 'low' } }),
      ],
      standups: [
        createStandup('Pushed the marketing page live. Still waiting on data for the launch items.'),
        createStandup('Marketing page is done. Launch items still pending data team.'),
        createStandup('Focus was on support today. Launch items unchanged.'),
      ],
      sprintIterations: [],
      accountability: {
        weeklyPlan: { exists: true, documentIds: [] },
        weeklyRetro: { exists: false, documentIds: [] },
      },
    },
    expected: {
      preFilterShouldReason: true,
      finalShouldProduceFinding: true,
      severity: 'high',
      shouldIdentifyOwner: true,
      primaryEvidenceSources: ['issue'],
      recommendedActionKind: 'notify',
      targetLifecycleState: 'open',
      targetApprovalLevel: 'notify_only',
    },
  },
];

export function getDetectionQualityCases(): DetectionQualityCase[] {
  return detectionQualityCases;
}

export function getDetectionQualityCase(id: string): DetectionQualityCase | undefined {
  return detectionQualityCases.find((c) => c.id === id);
}
