import type pg from 'pg';

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
};

type TipTapDocument = {
  type: 'doc';
  content: TipTapNode[];
};

export type IssueCommentSeed = {
  authorName: string;
  content: string;
  daysAgo: number;
};

export type ShipCoreDemoIssueSeed = {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  comments: IssueCommentSeed[];
  state: 'in_progress';
  sprintOffset: 0;
  priority: 'high';
  estimate: number;
  assigneeName: string;
};

export const shipCoreDemoIssues: ShipCoreDemoIssueSeed[] = [
  {
    title: 'Real-time collaboration merge conflicts under load',
    description: 'We are seeing frequent merge conflicts and document state corruption during high-traffic collaboration sessions with 10+ simultaneous editors. The issue was first reported in standup on Monday when the team noticed several users losing changes during a shared planning session.\n\nBob has been digging into the Yjs sync layer and the custom persistence adapter, but we still do not have a confirmed root cause or mitigation. His last Ship update said he was "trying to reproduce with a larger document." There has been no follow-up standup or issue comment since then.\n\nThis is now blocking FleetGraph demo prep because the editor becomes unreliable during the scripted walkthrough. Priority is high because it affects the core value prop of the product, and two customers have already mentioned it in feedback.',
    acceptanceCriteria: [
      'Reproduction notes identify editor count, document size, and persistence timing for the corruption case.',
      'A mitigation is chosen for the demo path: concurrency cap, persistence patch, or documented rollback procedure.',
      'A 10-editor smoke session runs for 15 minutes without lost content or divergent Yjs state.',
      'FleetGraph demo prep has a documented fallback if collaboration becomes unreliable again.',
    ],
    comments: [
      {
        authorName: 'Bob Martinez',
        content: 'I reproduced the corruption with 12 editors on a large Week plan. Updates are arriving while the persistence flush is still replaying older state, so I think the adapter is applying at least one stale payload. I need another pass on whether this is websocket ordering or our persistence write boundary.',
        daysAgo: 2,
      },
      {
        authorName: 'Dev User',
        content: 'For the demo, please post a mitigation by Thursday. A concurrency cap is fine if the adapter fix is not ready, but we need an explicit fallback before the walkthrough.',
        daysAgo: 1,
      },
    ],
    state: 'in_progress',
    sprintOffset: 0,
    priority: 'high',
    estimate: 8,
    assigneeName: 'Bob Martinez',
  },
  {
    title: 'Week planning flow is confusing for first-time users',
    description: 'New users are consistently getting stuck on the "Plan this Week" flow. The current design requires them to create a plan document and link issues, but the UI does not make that relationship obvious.\n\nAlice owns this work. In last week\'s retro she noted that three new users in the test workspace abandoned the flow entirely. She started simplifying the onboarding copy and sketching a small inline wizard, but she has also been pulled into the real-time sync fire drill.\n\nThere has been no meaningful progress update in the last two standups. In the most recent one she wrote, "still context-switching, will get back to this after the sync issues settle." This is starting to affect activation metrics for new workspaces.',
    acceptanceCriteria: [
      'A first-time user can create a Week plan and link at least two issues without leaving the planning flow.',
      'The UI explains the relationship between the plan document and linked issues before the user reaches the empty Week state.',
      'The smallest demoable version is documented if the sync fire drill continues to consume Alice\'s time.',
      'A new-user dry run completes the planning flow without the tester abandoning or asking where issues should be linked.',
    ],
    comments: [
      {
        authorName: 'Alice Chen',
        content: 'I can simplify the copy, but the root issue is that planning and issue linking feel like two separate products. I need a design call on whether the wizard should create the issue links automatically.',
        daysAgo: 2,
      },
      {
        authorName: 'Dev User',
        content: 'Activation impact is clear enough. Please propose the smallest demoable path that gets a blank Week to linked issues without opening three panels.',
        daysAgo: 1,
      },
    ],
    state: 'in_progress',
    sprintOffset: 0,
    priority: 'high',
    estimate: 5,
    assigneeName: 'Alice Chen',
  },
];

export function createIssueContent(description: string, acceptanceCriteria: string[]): TipTapDocument {
  const content: TipTapNode[] = description.split('\n\n').map(createParagraphNode);

  if (acceptanceCriteria.length > 0) {
    content.push(createHeadingNode('Acceptance Criteria', 2));
    content.push(createBulletListNode(acceptanceCriteria));
  }

  return {
    type: 'doc',
    content,
  };
}

export async function seedIssueComment(
  pool: pg.Pool,
  workspaceId: string,
  documentId: string,
  authorId: string,
  content: string,
  daysAgo: number
): Promise<void> {
  const existingComment = await pool.query(
    `SELECT id FROM comments
     WHERE workspace_id = $1 AND document_id = $2 AND author_id = $3 AND content = $4`,
    [workspaceId, documentId, authorId, content]
  );

  if (existingComment.rows[0]) {
    return;
  }

  await pool.query(
    `INSERT INTO comments (document_id, comment_id, parent_id, author_id, workspace_id, content, created_at, updated_at)
     VALUES ($1, gen_random_uuid(), NULL, $2, $3, $4, NOW() - ($5::int * INTERVAL '1 day'), NOW() - ($5::int * INTERVAL '1 day'))`,
    [documentId, authorId, workspaceId, content, daysAgo]
  );
}

function createParagraphNode(text: string): TipTapNode {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

function createHeadingNode(text: string, level: number): TipTapNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function createBulletListNode(items: string[]): TipTapNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [createParagraphNode(item)],
    })),
  };
}
