import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { pool } from '../db/client.js'
import { isTipTapDoc, yjsToJson } from '../utils/yjsConverter.js'
import { WS_CLOSE_SESSION_EXPIRED } from '../collaboration/index.js'

/**
 * Phase 2 critical-path regression coverage.
 *
 * Each test in this file pins behavior that is BOTH (a) a Phase 1 critical
 * audit finding and (b) was fixed in Phase 2. The `// Mitigates:` lines call
 * out the specific audit finding so a future regression has a clear paper
 * trail back to "this is why this test exists."
 *
 * These tests are intentionally narrow — they do not exhaustively re-test
 * the underlying components (those have their own suites). They exist so
 * that if someone deletes the guard, a CI run catches it.
 */
describe('Phase 2 critical-path regressions', () => {
  // --------------------------------------------------------------------------
  // Mitigates: C-1 (yjsToJson silent NULL persist).
  // Audit finding: api/src/utils/yjsConverter.ts returned `any`, allowing a
  // future bug that drops a return statement to silently produce `undefined`
  // → pg coerces to SQL NULL → REST reads see empty docs while yjs_state
  // survives. The fix narrowed yjsToJson's return to TipTapDoc and added an
  // isTipTapDoc guard at the persist site in api/src/collaboration/index.ts.
  //
  // What this test protects: the contract that yjsToJson NEVER returns a
  // non-TipTap shape. If someone reintroduces `any` or adds a code path that
  // can return undefined, the type system catches it AND this runtime test
  // catches it. Together they form the regression net.
  // --------------------------------------------------------------------------
  it('yjsToJson always returns a valid TipTap doc (mitigates C-1 silent-NULL persist)', () => {
    const empty = new Y.Doc()
    const emptyResult = yjsToJson(empty.getXmlFragment('default'))
    expect(isTipTapDoc(emptyResult)).toBe(true)
    expect(emptyResult.type).toBe('doc')
    expect(Array.isArray(emptyResult.content)).toBe(true)

    const populated = new Y.Doc()
    populated.transact(() => {
      const para = new Y.XmlElement('paragraph')
      populated.getXmlFragment('default').push([para])
      const text = new Y.XmlText()
      para.push([text])
      text.insert(0, 'regression text')
    })
    const populatedResult = yjsToJson(populated.getXmlFragment('default'))
    expect(isTipTapDoc(populatedResult)).toBe(true)
    expect(populatedResult.content.length).toBeGreaterThan(0)
  })

  // --------------------------------------------------------------------------
  // Mitigates: C-2 (WebSocket session validated only at HTTP upgrade).
  // Audit finding: a destroyed session kept persisting edits via the WS
  // connection until the browser closed (security + data integrity). The fix
  // added a 60s periodic tick that closes any WS whose session is gone or
  // expired, using application-defined close code 4401 so the client can
  // distinguish "session expired" from a network blip.
  //
  // What this test protects: the close code constant. If someone moves it
  // (e.g., to a different module) or changes the value, the contract with the
  // frontend SessionTimeoutModal handler breaks silently. Pin the value.
  // --------------------------------------------------------------------------
  it('WS_CLOSE_SESSION_EXPIRED is 4401 (mitigates C-2 WS session expiry contract)', () => {
    expect(WS_CLOSE_SESSION_EXPIRED).toBe(4401)
    // App-defined WebSocket close codes must be in the 4000-4999 range
    // per RFC 6455 §7.4.2. Asserting both ends catches a future "make it 401
    // to match HTTP" refactor that would violate the WS spec.
    expect(WS_CLOSE_SESSION_EXPIRED).toBeGreaterThanOrEqual(4000)
    expect(WS_CLOSE_SESSION_EXPIRED).toBeLessThanOrEqual(4999)
  })

  // --------------------------------------------------------------------------
  // Mitigates: DB-1 (JSONB hot-path expression indexes — migration 038).
  // Audit finding: 4 JSONB property predicates (issue.state, issue.assignee_id,
  // sprint.sprint_number, project.owner_id) had no expression index; the
  // dashboard "my active issues" EXPLAIN showed 88% of rows being filtered
  // AFTER an undifferentiated document_type index scan. Migration 038 added
  // the 4 partial expression indexes.
  //
  // What this test protects: the indexes were applied to the live dev DB.
  // If someone drops one (DROP INDEX in a future migration without thinking
  // through hot paths) or the migration silently fails on a fresh seed, this
  // test catches it at CI time instead of in a production performance regression.
  // --------------------------------------------------------------------------
  it('JSONB hot-path indexes exist in the documents table (mitigates DB-1)', async () => {
    const result = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'documents'
         AND indexname = ANY($1::text[])`,
      [[
        'idx_documents_issue_state',
        'idx_documents_issue_assignee_id',
        'idx_documents_sprint_number',
        'idx_documents_project_owner_id',
      ]]
    )

    const names = new Set(result.rows.map((r) => r.indexname))
    expect(names.has('idx_documents_issue_state'),
      'idx_documents_issue_state must exist — see migration 038').toBe(true)
    expect(names.has('idx_documents_issue_assignee_id'),
      'idx_documents_issue_assignee_id must exist — see migration 038').toBe(true)
    expect(names.has('idx_documents_sprint_number'),
      'idx_documents_sprint_number must exist — see migration 038').toBe(true)
    expect(names.has('idx_documents_project_owner_id'),
      'idx_documents_project_owner_id must exist — see migration 038').toBe(true)
  })
})
