import { expect, test, type Page } from './fixtures/isolated-env';
import type { Route } from '@playwright/test';

type FleetGraphLifecycleState = 'open' | 'approved';
type FleetGraphChatMode = 'success' | 'rate-limit';

interface FleetGraphRealtimePayload {
  type: 'fleetgraph:finding_updated';
  data: {
    findingId: string;
  };
}

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
    __shipEmitRealtimeEvent: (payload: FleetGraphRealtimePayload) => void;
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
  realtimeTriggered: boolean;
  approvedFindingIds: Set<string>;
  approveRequests: FleetGraphApproveRequest[];
}

test.describe('FleetGraph UI', () => {
  test('inbox approves a finding and refreshes after a realtime finding update', async ({ page }) => {
    await installRealtimeEventsMock(page);

    const firstFinding = createFleetGraphFinding({
      id: 'finding-1',
      actionCandidateId: 'action-1',
      title: 'Week 12 delivery is at risk',
      lifecycleState: 'open',
    });
    const secondFinding = createFleetGraphFinding({
      id: 'finding-2',
      actionCandidateId: 'action-2',
      title: 'Week 13 needs owner follow-up',
      lifecycleState: 'open',
    });
    const state = createFleetGraphInboxMockState();
    await installFleetGraphInboxRoutes(page, state, firstFinding, secondFinding);

    await login(page);
    await page.getByRole('button', { name: 'FleetGraph' }).click();

    await expect(page.getByRole('dialog', { name: 'FleetGraph Inbox' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Week 12 delivery is at risk')).toBeVisible({ timeout: 10000 });
    await expect.poll(() => state.getRequests).toBeGreaterThanOrEqual(1);

    state.realtimeTriggered = true;
    await page.evaluate(() => {
      window.__shipEmitRealtimeEvent({
        type: 'fleetgraph:finding_updated',
        data: { findingId: 'finding-2' },
      });
    });

    await expect(page.getByText('Week 13 needs owner follow-up')).toBeVisible({ timeout: 10000 });
    await expect.poll(() => state.getRequests).toBeGreaterThanOrEqual(2);

    const firstFindingCard = page.locator('article').filter({ hasText: 'Week 12 delivery is at risk' });
    await firstFindingCard.getByRole('button', { name: 'Approve finding' }).click();

    await expect.poll(() => state.approveRequests).toHaveLength(1);
    expect(state.approveRequests[0]).toEqual({ action_candidate_id: 'action-1' });
    await expect(firstFindingCard).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Week 13 needs owner follow-up')).toBeVisible();
  });

  test('embedded chat streams assistant output and recovers after a rate-limit failure', async ({ page }) => {
    await installFleetGraphChatFetchMock(page);
    await login(page);
    await page.goto('/issues');

    await page.getByRole('button', { name: 'New Issue', exact: true }).click();
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 });
    await expect(page.locator('.ProseMirror, .tiptap')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Open FleetGraph chat' }).click();
    await expect(page.getByRole('region', { name: 'FleetGraph chat' })).toBeVisible({ timeout: 10000 });

    await page.getByLabel('Ask FleetGraph').fill('What changed this week?');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText('Drafting from FleetGraph context...')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Week 12 is at risk because the partner API is still blocked.')).toBeVisible({ timeout: 10000 });

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
    realtimeTriggered: false,
    approvedFindingIds: new Set<string>(),
    approveRequests: [],
  };
}

async function installFleetGraphInboxRoutes(
  page: Page,
  state: FleetGraphInboxMockState,
  firstFinding: FleetGraphFinding,
  secondFinding: FleetGraphFinding
): Promise<void> {
  await page.route('**/api/fleetgraph/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/api/fleetgraph/findings') {
      state.getRequests += 1;
      const response = buildFleetGraphFindingsResponse(state, firstFinding, secondFinding);
      await fulfillJson(route, 200, response);
      return;
    }

    const approveFindingId = parseApproveFindingId(url.pathname);
    if (method === 'POST' && approveFindingId !== null) {
      const body = parseRouteJsonBody<FleetGraphApproveRequest>(request.postData());
      state.approveRequests.push(body);
      state.approvedFindingIds.add(approveFindingId);
      await fulfillJson(route, 200, {
        ...firstFinding,
        lifecycle_state: 'approved',
        updated_at: '2026-05-26T12:05:00.000Z',
      });
      return;
    }

    throw new Error(`Unhandled FleetGraph route in E2E mock: ${method} ${url.pathname}`);
  });
}

function buildFleetGraphFindingsResponse(
  state: FleetGraphInboxMockState,
  firstFinding: FleetGraphFinding,
  secondFinding: FleetGraphFinding
): FleetGraphFindingListResponse {
  const availableFindings = state.realtimeTriggered
    ? [firstFinding, secondFinding]
    : [firstFinding];
  const items = availableFindings.filter((finding) => !state.approvedFindingIds.has(finding.id));

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

async function installRealtimeEventsMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sockets: FakeRealtimeWebSocket[] = [];

    class FakeRealtimeWebSocket extends EventTarget {
      static readonly CONNECTING: 0 = 0;
      static readonly OPEN: 1 = 1;
      static readonly CLOSING: 2 = 2;
      static readonly CLOSED: 3 = 3;

      readonly url: string;
      readonly protocol = '';
      readonly extensions = '';
      binaryType: BinaryType = 'blob';
      bufferedAmount = 0;
      readyState = FakeRealtimeWebSocket.CONNECTING;
      onopen: WebSocket['onopen'] = null;
      onmessage: WebSocket['onmessage'] = null;
      onerror: WebSocket['onerror'] = null;
      onclose: WebSocket['onclose'] = null;

      constructor(url: string | URL, _protocols?: string | string[]) {
        super();
        this.url = String(url);
        sockets.push(this);
        window.setTimeout(() => {
          this.readyState = FakeRealtimeWebSocket.OPEN;
          const event = new Event('open');
          this.onopen?.call(this, event);
          this.dispatchEvent(event);
        }, 0);
      }

      send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      }

      close(_code?: number, _reason?: string): void {
        this.readyState = FakeRealtimeWebSocket.CLOSED;
        const event = new CloseEvent('close');
        this.onclose?.call(this, event);
        this.dispatchEvent(event);
      }

      emit(data: string): void {
        const event = new MessageEvent('message', { data });
        this.onmessage?.call(this, event);
        this.dispatchEvent(event);
      }
    }

    window.WebSocket = FakeRealtimeWebSocket;
    window.__shipEmitRealtimeEvent = (payload: FleetGraphRealtimePayload) => {
      for (const socket of sockets) {
        socket.emit(JSON.stringify(payload));
      }
    };
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
            controller.enqueue(encoder.encode('event: final\ndata: {"response":"Week 12 is at risk because the partner API is still blocked.","usage":{"modelName":"gpt-4o-mini","inputTokens":100,"outputTokens":12,"totalTokens":112}}\n\n'));
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
