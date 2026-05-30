import type { WeekContext } from '../context.js';
import { extractText } from '../../utils/document-content.js';

export type AtRiskWeekPreFilterDecision = {
  shouldReason: boolean;
  reason: 'candidate_risk' | 'no_blockers_or_blocked_high_priority_issues';
  evidenceSummary: string[];
};

const blockerPositivePhrases = [
  'blocked on',
  'blocked by',
  'still blocked',
  'remains blocked',
  'currently blocked',
  'blocked again',
  'cannot proceed',
  "can't proceed",
  'waiting on',
  'stuck on',
  'hard blocker',
] as const;

const blockerNegationPhrases = [
  'no blockers',
  'no blocker',
  'not blocked',
  'unblocked',
  'no longer blocked',
  'resolved',
  'cleared',
  'fixed',
  'workaround shipping',
  'workaround shipped',
  'manual workaround',
  'workaround in place',
] as const;

const ongoingRiskPhrases = [
  'still blocked',
  'remains blocked',
  'currently blocked',
  'blocked again',
] as const;

const progressConcernPhrases = [
  'no movement',
  'no progress',
  'unchanged',
  'stalled',
  'slipping',
  'falling behind',
  'waiting on',
] as const;

const resolvedProgressPhrases = [
  'steady progress',
  'good progress',
  'all critical items have movement',
  'all flows green',
  'unblocked',
  'resolved',
] as const;

const loadConcernPhrases = [
  'falling behind',
  'too much',
  'overloaded',
  'over capacity',
  'scope creep',
  'scope increased',
  'cannot keep up',
  "can't keep up",
  'spread thin',
  'at capacity',
] as const;

export function evaluateAtRiskWeekPreFilter(context: WeekContext): AtRiskWeekPreFilterDecision {
  const highPriorityActiveIssues = context.issues.filter(isHighPriorityActiveIssue);
  const ownerHighPriorityActiveIssues = highPriorityActiveIssues.filter((issue) => (
    isAssignedToWeekOwner(issue, context.ownerUserId)
  ));
  const evidenceSummary = [
    ...context.issues.filter(isHighPriorityBlockedIssue).map((issue) => (
      `High-priority blocked issue: ${issue.title}`
    )),
    ...context.standups.filter(hasStandupBlockerText).map((standup) => (
      `Standup blocker: ${extractText(standup.content).trim()}`
    )),
    ...context.sprintIterations.filter(hasIterationBlockerText).map((iteration) => (
      `Iteration blocker: ${iteration.storyTitle}`
    )),
    ...createMissingProgressEvidence(context, ownerHighPriorityActiveIssues),
    ...createPlanlessWeekEvidence(context, highPriorityActiveIssues),
    ...createOverloadEvidence(context, ownerHighPriorityActiveIssues),
  ];

  if (evidenceSummary.length === 0) {
    return {
      shouldReason: false,
      reason: 'no_blockers_or_blocked_high_priority_issues',
      evidenceSummary,
    };
  }

  return {
    shouldReason: true,
    reason: 'candidate_risk',
    evidenceSummary,
  };
}

function isHighPriorityBlockedIssue(issue: WeekContext['issues'][number]): boolean {
  return isHighPriority(issue.priority) && issue.state === 'blocked';
}

function isHighPriorityActiveIssue(issue: WeekContext['issues'][number]): boolean {
  return isHighPriority(issue.priority) && issue.state !== 'done' && issue.state !== 'cancelled';
}

function isAssignedToWeekOwner(issue: WeekContext['issues'][number], ownerUserId: string | null): boolean {
  if (ownerUserId === null) {
    return true;
  }

  return issue.assigneeUserId === ownerUserId;
}

function isHighPriority(priority: string | null): boolean {
  return priority === 'urgent' || priority === 'high' || priority === 'critical';
}

function hasStandupBlockerText(standup: WeekContext['standups'][number]): boolean {
  const text = extractText(standup.content).toLowerCase();
  const hasPositive = blockerPositivePhrases.some((phrase) => text.includes(phrase));

  if (!hasPositive) {
    return false;
  }

  const hasNegation = blockerNegationPhrases.some((phrase) => text.includes(phrase));
  if (!hasNegation) {
    return true;
  }

  return ongoingRiskPhrases.some((phrase) => text.includes(phrase));
}

function hasIterationBlockerText(iteration: WeekContext['sprintIterations'][number]): boolean {
  return typeof iteration.blockersEncountered === 'string' && iteration.blockersEncountered.trim().length > 0;
}

function createMissingProgressEvidence(
  context: WeekContext,
  ownerHighPriorityActiveIssues: WeekContext['issues']
): string[] {
  if (ownerHighPriorityActiveIssues.length === 0) {
    return [];
  }

  if (context.standups.length === 0 && context.sprintIterations.length === 0) {
    return [`Missing progress signal for high-priority assigned work: ${formatIssueTitles(ownerHighPriorityActiveIssues)}`];
  }

  const progressConcernStandups = context.standups.filter((standup) => (
    !hasStandupBlockerText(standup) && hasProgressConcernText(standup)
  ));
  if (progressConcernStandups.length === 0) {
    return [];
  }

  return progressConcernStandups.map((standup) => (
    `Progress concern: ${extractText(standup.content).trim()}`
  ));
}

function createPlanlessWeekEvidence(
  context: WeekContext,
  highPriorityActiveIssues: WeekContext['issues']
): string[] {
  if (context.accountability.weeklyPlan.exists || highPriorityActiveIssues.length === 0) {
    return [];
  }

  return [`Missing weekly plan with high-priority active work: ${formatIssueTitles(highPriorityActiveIssues)}`];
}

function createOverloadEvidence(
  context: WeekContext,
  ownerHighPriorityActiveIssues: WeekContext['issues']
): string[] {
  if (ownerHighPriorityActiveIssues.length < 5) {
    return [];
  }

  const loadConcernStandups = context.standups.filter(hasLoadConcernText);
  if (loadConcernStandups.length === 0) {
    return [];
  }

  return [
    `Owner load risk: ${ownerHighPriorityActiveIssues.length} high-priority active issues assigned to the Week owner`,
    ...loadConcernStandups.map((standup) => `Load concern: ${extractText(standup.content).trim()}`),
  ];
}

function hasProgressConcernText(standup: WeekContext['standups'][number]): boolean {
  const text = extractText(standup.content).toLowerCase();

  return progressConcernPhrases.some((phrase) => text.includes(phrase))
    && !resolvedProgressPhrases.some((phrase) => text.includes(phrase));
}

function hasLoadConcernText(standup: WeekContext['standups'][number]): boolean {
  const text = extractText(standup.content).toLowerCase();

  return loadConcernPhrases.some((phrase) => text.includes(phrase));
}

function formatIssueTitles(issues: WeekContext['issues']): string {
  return issues.map((issue) => issue.title).join(', ');
}
