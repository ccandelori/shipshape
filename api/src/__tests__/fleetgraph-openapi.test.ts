import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../openapi/index.js';

describe('FleetGraph OpenAPI contracts', () => {
  const document = generateOpenAPIDocument();

  it('registers FleetGraph inbox schemas', () => {
    expect(document.components?.schemas).toHaveProperty('FleetGraphFinding');
    expect(document.components?.schemas).toHaveProperty('FleetGraphActionCandidate');
    expect(document.components?.schemas).toHaveProperty('FleetGraphFindingListResponse');
    expect(document.components?.schemas).toHaveProperty('FleetGraphApproveFindingRequest');
    expect(document.components?.schemas).toHaveProperty('FleetGraphSnoozeFindingRequest');
    expect(document.components?.schemas).toHaveProperty('FleetGraphResumeActionRequest');
    expect(document.components?.schemas).toHaveProperty('FleetGraphMarkFindingsReadRequest');
  });

  it('documents the FleetGraph chat request and SSE stream contract', () => {
    expect(document.components?.schemas).toHaveProperty('FleetGraphChatRequest');
    expect(document.components?.schemas).toHaveProperty('FleetGraphChatSseStream');

    const chatOperation = requirePostOperation('/fleetgraph/chat');
    const serializedOperation = JSON.stringify(chatOperation);

    expect(serializedOperation).toContain('FleetGraphChatRequest');
    expect(serializedOperation).toContain('text/event-stream');
    expect(serializedOperation).toContain('event: token');
    expect(serializedOperation).toContain('event: final');
    expect(serializedOperation).toContain('X-Accel-Buffering');
    expect(chatOperation.responses).toHaveProperty('429');
  });

  it('registers every FleetGraph inbox route with conflict responses for state transitions', () => {
    const routePaths = [
      '/fleetgraph/findings',
      '/fleetgraph/findings/{id}/approve',
      '/fleetgraph/findings/{id}/reject',
      '/fleetgraph/findings/{id}/dismiss',
      '/fleetgraph/findings/{id}/snooze',
      '/fleetgraph/findings/read',
      '/fleetgraph/actions/{actionId}/resume',
      '/fleetgraph/inbox/opened',
    ];

    for (const routePath of routePaths) {
      expect(document.paths).toHaveProperty(routePath);
    }

    expect(requirePostOperation('/fleetgraph/findings/{id}/approve').responses).toHaveProperty('409');
    expect(requirePostOperation('/fleetgraph/findings/{id}/reject').responses).toHaveProperty('409');
    expect(requirePostOperation('/fleetgraph/findings/{id}/dismiss').responses).toHaveProperty('409');
    expect(requirePostOperation('/fleetgraph/findings/{id}/snooze').responses).toHaveProperty('409');
    expect(requirePostOperation('/fleetgraph/findings/read').responses).toHaveProperty('404');
    expect(requirePostOperation('/fleetgraph/actions/{actionId}/resume').responses).toHaveProperty('409');
  });

  it('documents lifecycle-state filtering on the findings list', () => {
    const getFindingsOperation = document.paths['/fleetgraph/findings']?.get;

    expect(getFindingsOperation).toBeDefined();
    expect(JSON.stringify(getFindingsOperation)).toContain('lifecycle_state');
    expect(JSON.stringify(getFindingsOperation)).toContain('pending_review');
    expect(JSON.stringify(getFindingsOperation)).toContain('created_at desc');
    expect(JSON.stringify(document.components?.schemas?.FleetGraphFindingListResponse)).toContain('unread_lifecycle_counts');
  });

  function requirePostOperation(routePath: string) {
    const operation = document.paths[routePath]?.post;

    if (!operation) {
      throw new Error(`Expected POST operation for ${routePath}`);
    }

    return operation;
  }
});
