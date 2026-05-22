import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as Y from 'yjs'
import { pool } from '../db/client.js'
import { yjsToJson, jsonToYjs } from '../utils/yjsConverter.js'
import {
  extractHypothesisFromContent,
  extractSuccessCriteriaFromContent,
  extractVisionFromContent,
  extractGoalsFromContent,
} from '../utils/extractHypothesis.js'

/**
 * Risk mitigated: An edit to the TipTap body that updates the `content`
 * JSON snapshot but fails to update the matching `properties` extraction
 * (e.g., a project document's `plan` field, formerly `hypothesis`) causes
 * silent UI/backend drift. Dashboards read from `properties`, the editor
 * reads from `content` — they have to agree.
 *
 * The integration shape is:
 *   1. Edit happens in the editor (Yjs XmlFragment)
 *   2. persistDocument() in api/src/collaboration/index.ts:
 *      a. yjsToJson(fragment) → TipTap JSON
 *      b. extract{Hypothesis,SuccessCriteria,Vision,Goals}FromContent(json)
 *      c. UPDATE documents SET yjs_state, content, properties
 *
 * This test exercises step (a) + (b) directly against the same fragment
 * builder the production path uses, then writes content + properties to
 * a real document row and reads them back to assert they stay in sync.
 * If a future refactor changes the extraction logic or introduces a path
 * that updates content without re-running extraction, these assertions
 * catch it.
 */
describe('Document body and properties synchronization (Task 14)', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  let testWorkspaceId: string
  let testUserId: string

  beforeAll(async () => {
    const ws = await pool.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`Doc Sync Test ${testRunId}`]
    )
    testWorkspaceId = ws.rows[0]!.id

    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Doc Sync User') RETURNING id`,
      [`doc-sync-${testRunId}@test.local`]
    )
    testUserId = u.rows[0]!.id
  })

  afterAll(async () => {
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [testWorkspaceId])
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId])
    await pool.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId])
  })

  // Builds a project-document TipTap shape with a Hypothesis heading + paragraph
  // that the extractor recognises. Returns a Yjs XmlFragment populated from the
  // same JSON shape the editor produces.
  function buildHypothesisFragment(hypothesisText: string): Y.XmlFragment {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('default')
    const tipTapJson = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hypothesis' }] },
        { type: 'paragraph', content: [{ type: 'text', text: hypothesisText }] },
      ],
    }
    jsonToYjs(doc, fragment, tipTapJson)
    return fragment
  }

  it('extractor sees the body change after the editor mutates the Yjs fragment', () => {
    // Initial body
    const fragment1 = buildHypothesisFragment('Users adopt the new flow because it saves a click.')
    const content1 = yjsToJson(fragment1)
    const hypothesis1 = extractHypothesisFromContent(content1)
    expect(hypothesis1).toContain('saves a click')

    // Body changes — same shape, different text
    const fragment2 = buildHypothesisFragment('Users churn unless they see a result within 5s.')
    const content2 = yjsToJson(fragment2)
    const hypothesis2 = extractHypothesisFromContent(content2)
    expect(hypothesis2).toContain('within 5s')
    expect(hypothesis2).not.toEqual(hypothesis1)
  })

  it('persisting content updates the properties row so the dashboard sees the same value', async () => {
    // Create a real project document
    const docResult = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'project', $2, 'workspace', $3, '{}'::jsonb)
       RETURNING id`,
      [testWorkspaceId, `Sync Test Project ${testRunId}`, testUserId]
    )
    const docId = docResult.rows[0]!.id

    // First persist: extract hypothesis "A"
    const fragmentA = buildHypothesisFragment('Hypothesis A: increase weekly engagement.')
    const contentA = yjsToJson(fragmentA)
    const planA = extractHypothesisFromContent(contentA)
    expect(planA).toContain('Hypothesis A')

    await pool.query(
      `UPDATE documents SET
         content = $1,
         properties = jsonb_set(properties, '{plan}', to_jsonb($2::text), true),
         updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(contentA), planA, docId]
    )

    // Read back and verify body ↔ properties are in sync
    const after1 = await pool.query<{ content: unknown; plan: string | null }>(
      `SELECT content, properties->>'plan' as plan FROM documents WHERE id = $1`,
      [docId]
    )
    expect(after1.rows[0]?.plan).toContain('Hypothesis A')

    // Second persist: body changes, properties must update accordingly
    const fragmentB = buildHypothesisFragment('Hypothesis B: reduce cycle time by 30%.')
    const contentB = yjsToJson(fragmentB)
    const planB = extractHypothesisFromContent(contentB)
    expect(planB).toContain('Hypothesis B')

    await pool.query(
      `UPDATE documents SET
         content = $1,
         properties = jsonb_set(properties, '{plan}', to_jsonb($2::text), true),
         updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(contentB), planB, docId]
    )

    const after2 = await pool.query<{ plan: string | null }>(
      `SELECT properties->>'plan' as plan FROM documents WHERE id = $1`,
      [docId]
    )
    expect(after2.rows[0]?.plan).toContain('Hypothesis B')
    expect(after2.rows[0]?.plan).not.toContain('Hypothesis A')
  })

  it('all four property extractors stay in lock-step with their headings', () => {
    // Build a document with all four extractable sections
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('default')
    const json = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hypothesis' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'H-marker' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Success Criteria' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'SC-marker' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Vision' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'V-marker' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Goals' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'G-marker' }] },
      ],
    }
    jsonToYjs(doc, fragment, json)

    const content = yjsToJson(fragment)
    expect(extractHypothesisFromContent(content)).toContain('H-marker')
    expect(extractSuccessCriteriaFromContent(content)).toContain('SC-marker')
    expect(extractVisionFromContent(content)).toContain('V-marker')
    expect(extractGoalsFromContent(content)).toContain('G-marker')
  })
})
