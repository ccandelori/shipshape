import { expect, test, type Page } from './fixtures/isolated-env';
import type { Route } from '@playwright/test';

type FleetGraphLifecycleState = 'open' | 'pending_review' | 'approved' | 'executed';
type FleetGraphChatMode = 'success' | 'rate-limit';

interface FleetGraphChatRequestMessage {
  role: string;
  content: string;
}

interface FleetGraphChatRequestBody {
  documentId: string;
  documentType: string;
  question: string;
  conversationHistory: FleetGraphChatRequestMessage[];
}

declare global {
  interface Window {
    __shipFleetGraphChatRequests: FleetGraphChatRequestBody[];
    __shipSetFleetGraphChatMode: (mode: FleetGraphChatMode) => void;
  }
}

interface FleetGraphEvidenceItem {
  source_type: string;
  source_document_id: string | null;
  quote: string;
  observed_at: string | null;
}

interface FleetGraphActionCandidate {
  id: string;
  finding_id: string;
  target_document: {
    id: string;
    document_type: string;
    title: string;
  };
  owner_user: {
    id: string;
    name: string;
    email: string;
  } | null;
  role_reason: string;
  urgency: string;
  evidence: FleetGraphEvidenceItem[];
  recommended_action: {
    kind: string;
    title: string;
    body: string;
  };
  approval_level: string;
  reversibility: string;
}

interface FleetGraphFinding {
  id: string;
  workspace_id: string;
  scoped_document: {
    id: string;
    document_type: string;
    title: string;
  };
  detector_type: string;
  severity: string;
  evidence: FleetGraphEvidenceItem[];
  recipient_user: {
    id: string;
    name: string;
    email: string;
  } | null;
  lifecycle_state: FleetGraphLifecycleState;
  material_change_key: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  action_candidates: FleetGraphActionCandidate[];
}

interface FleetGraphFindingListResponse {
  items: FleetGraphFinding[];
  limit: number;
  hasMore: boolean;
  next_cursor: string | null;
}

interface FleetGraphApproveRequest {
  action_candidate_id?: string;
  edited_action?: {
    kind: string;
    title?: string;
    body: string;
  } | null;
  idempotency_key?: string;
}

interface FleetGraphInboxMockState {
  getRequests: number;
  lifecycleByFindingId: Map<string, FleetGraphLifecycleState>;
  approveRequests: FleetGraphApproveRequest[];
  resumeRequests: string[];
}

test.describe('FleetGraph UI', () => {
  test('inbox reviews and resumes a pending FleetGraph action without console helpers', async ({ page }) => {
    const reviewFinding = createFleetGraphFinding({
      id: 'finding-1',
      actionCandidateId: 'action-1',
      title: 'Week 12 delivery is at risk',
      lifecycleState: 'pending_review',
    });
    const state = createFleetGraphInboxMockState();
    await installFleetGraphInboxRoutes(page, state, [reviewFinding]);

    await login(page);
    await page.getByRole('button', { name: 'FleetGraph' }).click();

    await expect(page.getByRole('dialog', { name: 'FleetGraph Inbox' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No open findings')).toBeVisible({ timeout: 10000 });
    await page.getByRole('tab', { name: 'Needs Review' }).click();
    await expect(page.getByText('Week 12 delivery is at risk')).toBeVisible({ timeout: 10000 });
    await expect.poll(() => state.getRequests).toBeGreaterThanOrEqual(1);

    const firstFindingCard = page.locator('article').filter({ hasText: 'Week 12 delivery is at risk' });
    await firstFindingCard.getByRole('button', { name: 'Approve finding' }).click();

    await expect.poll(() => state.approveRequests).toHaveLength(1);
    expect(state.approveRequests[0]).toEqual({ action_candidate_id: 'action-1' });
    await expect(firstFindingCard).not.toBeVisible({ timeout: 10000 });

    await page.getByRole('tab', { name: 'Approved' }).click();
    await expect(page.getByText('Week 12 delivery is at risk')).toBeVisible({ timeout: 10000 });
    await page.locator('article').filter({ hasText: 'Week 12 delivery is at risk' })
      .getByRole('button', { name: 'Resume approved action' })
      .click();

    await expect.poll(() => state.resumeRequests).toEqual(['action-1']);
    await expect(page.getByText('Week 12 delivery is at risk')).not.toBeVisible({ timeout: 10000 });
  });

  test('embedded chat streams assistant output and recovers after a rate-limit failure', async ({ page }) => {
    await installFleetGraphChatFetchMock(page);
    await login(page);
    await page.goto('/issues');

    await page.getByRole('button', { name: 'New Issue', exact: true }).click();
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 });
    await expect(page.locator('.ProseMirror, .tiptap')).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: 'Open FleetGraph chat' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Ask FleetGraph' }).click();
    await expect(page.getByRole('region', { name: 'FleetGraph chat' })).toBeVisible({ timeout: 10000 });

    await page.getByLabel('Ask FleetGraph').fill('What changed this week?');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText('Drafting from FleetGraph context...')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Week 12 is at risk because the partner API is still blocked.')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Sources')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Current issue' })).toHaveAttribute('href', /\/documents\/[a-f0-9-]+/);
    await page.getByRole('button', { name: 'Ask FleetGraph' }).click();
    await expect(page.getByRole('region', { name: 'FleetGraph chat' })).toBeHidden({ timeout: 10000 });
    await page.getByRole('button', { name: 'Ask FleetGraph' }).click();
    await expect(page.getByText('What changed this week?')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Week 12 is at risk because the partner API is still blocked.')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Current issue' })).toBeVisible({ timeout: 10000 });

    const chatRequests = await page.evaluate(() => window.__shipFleetGraphChatRequests);
    expect(chatRequests[0]).toMatchObject({
      documentType: 'issue',
      question: 'What changed this week?',
      conversationHistory: [],
    });

    await page.evaluate(() => {
      window.__shipSetFleetGraphChatMode('rate-limit');
    });

    await page.getByLabel('Ask FleetGraph').fill('Try again');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'FleetGraph chat rate limit exceeded. Try again in 42 seconds.',
      { timeout: 10000 }
    );
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();

    await page.getByLabel('Ask FleetGraph').fill('Retry after cooldown');
    await expect(page.getByRole('button', { name: 'Send message' })).not.toBeDisabled();
  });
});

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL('/login', { timeout: 10000 });
}

function createFleetGraphInboxMockState(): FleetGraphInboxMockState {
  return {
    getRequests: 0,
    lifecycleByFindingId: new Map<string, FleetGraphLifecycleState>(),
    approveRequests: [],
    resumeRequests: [],
  };
}

async function installFleetGraphInboxRoutes(
  page: Page,
  state: FleetGraphInboxMockState,
  findings: FleetGraphFinding[]
): Promise<void> {
  for (const finding of findings) {
    state.lifecycleByFindingId.set(finding.id, finding.lifecycle_state);
  }

  await page.route('**/api/fleetgraph/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/api/fleetgraph/findings') {
      state.getRequests += 1;
      const response = buildFleetGraphFindingsResponse(state, findings, url.searchParams.get('lifecycle_state'));
      await fulfillJson(route, 200, response);
      return;
    }

    const approveFindingId = parseApproveFindingId(url.pathname);
    if (method === 'POST' && approveFindingId !== null) {
      const body = parseRouteJsonBody<FleetGraphApproveRequest>(request.postData());
      state.approveRequests.push(body);
      state.lifecycleByFindingId.set(approveFindingId, 'approved');
      const finding = findFleetGraphFinding(findings, approveFindingId);
      await fulfillJson(route, 200, {
        ...finding,
        lifecycle_state: 'approved',
        updated_at: '2026-05-26T12:05:00.000Z',
      });
      return;
    }

    const resumeActionId = parseResumeActionId(url.pathname);
    if (method === 'POST' && resumeActionId !== null) {
      state.resumeRequests.push(resumeActionId);
      const finding = findFleetGraphFindingByActionId(findings, resumeActionId);
      state.lifecycleByFindingId.set(finding.id, 'executed');
      await fulfillJson(route, 200, {
        ...finding,
        lifecycle_state: 'executed',
        updated_at: '2026-05-26T12:06:00.000Z',
      });
      return;
    }

    throw new Error(`Unhandled FleetGraph route in E2E mock: ${method} ${url.pathname}`);
  });
}

function buildFleetGraphFindingsResponse(
  state: FleetGraphInboxMockState,
  findings: FleetGraphFinding[],
  lifecycleState: string | null
): FleetGraphFindingListResponse {
  const items = findings
    .map((finding) => ({
      ...finding,
      lifecycle_state: state.lifecycleByFindingId.get(finding.id) ?? finding.lifecycle_state,
    }))
    .filter((finding) => lifecycleState === null || finding.lifecycle_state === lifecycleState);

  return {
    items,
    limit: 20,
    hasMore: false,
    next_cursor: null,
  };
}

function parseApproveFindingId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/fleetgraph\/findings\/([^/]+)\/approve$/);
  return match?.[1] ?? null;
}

function parseResumeActionId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/fleetgraph\/actions\/([^/]+)\/resume$/);
  return match?.[1] ?? null;
}

function findFleetGraphFinding(findings: FleetGraphFinding[], findingId: string): FleetGraphFinding {
  const finding = findings.find((candidate) => candidate.id === findingId);

  if (!finding) {
    throw new Error(`FleetGraph finding not found in mock: ${findingId}`);
  }

  return finding;
}

function findFleetGraphFindingByActionId(findings: FleetGraphFinding[], actionId: string): FleetGraphFinding {
  const finding = findings.find((candidate) => (
    candidate.action_candidates.some((actionCandidate) => actionCandidate.id === actionId)
  ));

  if (!finding) {
    throw new Error(`FleetGraph action not found in mock: ${actionId}`);
  }

  return finding;
}

function parseRouteJsonBody<T>(body: string | null): T {
  if (body === null) {
    throw new Error('Expected FleetGraph route body to be present');
  }

  return JSON.parse(body) as T;
}

async function fulfillJson(route: Route, status: number, body: object): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installFleetGraphChatFetchMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    let mode: FleetGraphChatMode = 'success';

    window.__shipFleetGraphChatRequests = [];
    window.__shipSetFleetGraphChatMode = (nextMode: FleetGraphChatMode) => {
      mode = nextMode;
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requestUrl = resolveFetchUrl(input);
      if (requestUrl.pathname !== '/api/fleetgraph/chat') {
        return originalFetch(input, init);
      }

      const requestBody = parseChatRequestBody(init?.body);
      window.__shipFleetGraphChatRequests.push(requestBody);

      if (mode === 'rate-limit') {
        return new Response(JSON.stringify({
          error: 'FleetGraph chat rate limit exceeded',
          retry_after_seconds: 42,
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('event: token\ndata: {"token":"Drafting from FleetGraph context..."}\n\n'));
          window.setTimeout(() => {
            controller.enqueue(encoder.encode(`event: final\ndata: ${JSON.stringify({
              response: 'Week 12 is at risk because the partner API is still blocked.',
              usage: {
                modelName: 'gpt-4o-mini',
                inputTokens: 100,
                outputTokens: 12,
                totalTokens: 112,
              },
              sources: [
                {
                  label: 'Current issue',
                  documentId: requestBody.documentId,
                  documentType: requestBody.documentType,
                  kind: 'scope',
                },
              ],
            })}\n\n`));
            controller.close();
          }, 500);
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };

    function resolveFetchUrl(input: RequestInfo | URL): URL {
      if (typeof input === 'string') {
        return new URL(input, window.location.origin);
      }
      if (input instanceof URL) {
        return input;
      }
      return new URL(input.url, window.location.origin);
    }

    function parseChatRequestBody(body: BodyInit | null | undefined): FleetGraphChatRequestBody {
      if (typeof body !== 'string') {
        throw new Error('Expected FleetGraph chat request body to be a JSON string');
      }

      return JSON.parse(body) as FleetGraphChatRequestBody;
    }
  });
}

function createFleetGraphFinding(input: {
  id: string;
  actionCandidateId: string;
  title: string;
  lifecycleState: FleetGraphLifecycleState;
}): FleetGraphFinding {
  return {
    id: input.id,
    workspace_id: 'workspace-1',
    scoped_document: {
      id: `${input.id}-document`,
      document_type: 'sprint',
      title: input.title,
    },
    detector_type: 'at_risk_week',
    severity: 'high',
    evidence: [
      {
        source_type: 'standup',
        source_document_id: `${input.id}-standup`,
        quote: 'Partner API remains blocked and the fallback plan is not staffed.',
        observed_at: '2026-05-26T12:00:00.000Z',
      },
    ],
    recipient_user: {
      id: 'user-1',
      name: 'Dev User',
      email: 'dev@ship.local',
    },
    lifecycle_state: input.lifecycleState,
    material_change_key: `${input.id}-material-change`,
    created_at: '2026-05-26T12:00:00.000Z',
    updated_at: '2026-05-26T12:00:00.000Z',
    expires_at: null,
    action_candidates: [
      {
        id: input.actionCandidateId,
        finding_id: input.id,
        target_document: {
          id: `${input.id}-document`,
          document_type: 'sprint',
          title: input.title,
        },
        owner_user: {
          id: 'user-1',
          name: 'Dev User',
          email: 'dev@ship.local',
        },
        role_reason: 'Owns the weekly delivery plan',
        urgency: 'high',
        evidence: [
          {
            source_type: 'issue',
            source_document_id: `${input.id}-issue`,
            quote: 'Critical integration issue is still blocked.',
            observed_at: '2026-05-26T12:00:00.000Z',
          },
        ],
        recommended_action: {
          kind: 'draft_comment',
          title: 'Ask for unblock plan',
          body: 'Ask for the concrete unblock plan before Friday.',
        },
        approval_level: 'approval_required',
        reversibility: 'reversible',
      },
    ],
  };
}
